/**
 * LEITOR DO TXT DO LCDPR, ORIENTADO À TABELA DE LEIAUTE (leiaute.ts).
 *
 * O que este arquivo faz, linha a linha:
 * 1. separa os campos pelo "|";
 * 2. identifica o registro (0000, Q100...) e confere a ordem dos blocos;
 * 3. confere cada campo contra a tabela (obrigatório, numérico, tamanho, códigos);
 * 4. monta os objetos do modelo (modelo.ts) para as validações e os cálculos.
 *
 * Validações que cruzam registros (ex.: Q100 x Q200) ficam em validacoes.ts.
 * O leitor é tolerante: registra o problema e segue em frente, para que um
 * erro numa linha não impeça a análise do resto do arquivo.
 */
import { lerCentavos } from '../domain/dinheiro';
import { lerData, type DataLcdpr } from '../domain/datas';
import { ehCnpjAlfanumerico } from '../domain/documentos';
import { dividirLinhas, type Codificacao } from './encoding';
import { ehRegistroConhecido, LEIAUTE, type CodigoRegistro, type DefinicaoRegistro } from './leiaute';
import type { ArquivoLcdpr, Ocorrencia } from './modelo';

export interface ResultadoLeitura {
  arquivo: ArquivoLcdpr;
  ocorrencias: Ocorrencia[];
}

/** Acesso aos campos de uma linha pelo NOME oficial (evita "campo 7" mágico no código). */
class Linha {
  constructor(
    readonly numero: number,
    readonly def: DefinicaoRegistro,
    private readonly valores: readonly string[],
  ) {}
  /** Valor do campo já sem espaços nas pontas. */
  txt(nome: string): string {
    const i = this.def.campos.findIndex((c) => c.nome === nome);
    if (i < 0) throw new Error(`Campo ${nome} não existe no registro ${this.def.reg}`);
    return (this.valores[i] ?? '').trim();
  }
}

const SINAL: Record<string, 1 | -1> = { P: 1, N: -1 };

/** Campos que guardam CPF ou CNPJ (aceitam o CNPJ alfanumérico com alerta). */
const CAMPOS_CPF_CNPJ = new Set(['ID_PARTIC', 'ID_CONTRAPARTE', 'IDENT_CPF_CNPJ']);

/** Converte percentual "05000" (2 decimais implícitos) em centésimos: 5000 = 50,00%. */
function lerPercentual(texto: string): number | null {
  return /^\d+$/.test(texto) ? Number(texto) : null;
}

export function lerLcdpr(texto: string, nomeArquivo: string, codificacao: Codificacao): ResultadoLeitura {
  const ocorrencias: Ocorrencia[] = [];
  const add = (o: Ocorrencia): void => {
    ocorrencias.push(o);
  };

  const todas = dividirLinhas(texto);
  // Linhas em branco DEPOIS do 9999 (comum quando o arquivo passa por um editor):
  // um único alerta, e elas não entram na contagem do QTD_LIN.
  let fimUtil = todas.length;
  while (fimUtil > 0 && todas[fimUtil - 1]!.trim() === '') fimUtil--;
  const linhas = todas.slice(0, fimUtil);
  if (fimUtil < todas.length && fimUtil > 0) {
    add({
      severidade: 'alerta', categoria: 'Estrutura', regra: 'LINHA-VAZIA-FINAL', linha: fimUtil + 1, registro: null, campo: null,
      problema: `${todas.length - fimUtil === 1 ? 'Há 1 linha em branco' : `Há ${todas.length - fimUtil} linhas em branco`} depois da última linha do arquivo.`,
      comoCorrigir: 'Apague as linhas em branco do fim do arquivo. O painel não as contou no QTD_LIN, mas o PVA da Receita pode rejeitar o arquivo.',
    });
  }
  const arquivo: ArquivoLcdpr = {
    nomeArquivo,
    codificacao,
    totalLinhas: linhas.length,
    abertura: null,
    anoBase: null,
    formaApuracao: null,
    cadastro: null,
    imoveis: [],
    terceiros: [],
    contas: [],
    lancamentos: [],
    resumos: [],
    encerramento: null,
  };

  const contagem = new Map<CodigoRegistro, number>();
  /** Código do último 0040 lido: o 0045 é "filho" e deve vir logo depois do seu 0040. */
  let ultimo0040: string | null = null;
  let maiorOrdem = -1;
  let registroDaMaiorOrdem = '';

  linhas.forEach((conteudo, i) => {
    const numero = i + 1;

    // --- Linha em branco -----------------------------------------------------
    if (conteudo.trim() === '') {
      add({
        severidade: 'alerta', categoria: 'Estrutura', regra: 'LINHA-VAZIA', linha: numero, registro: null, campo: null,
        problema: 'Linha em branco no meio do arquivo.',
        comoCorrigir: 'Remova a linha em branco. O PVA da Receita pode rejeitar o arquivo.',
      });
      return;
    }

    let partes = conteudo.split('|');

    // --- "|" no início (o Manual diz que a linha começa pelo código do registro)
    if (partes[0] === '' && partes.length > 1) {
      add({
        severidade: 'alerta', categoria: 'Estrutura', regra: 'PIPE-INICIAL', linha: numero, registro: partes[1] ?? null, campo: null,
        problema: 'A linha começa com "|". Pelo Manual, ela deve começar direto pelo código do registro.',
        comoCorrigir: 'Remova o "|" do início das linhas no sistema gerador.',
      });
      partes = partes.slice(1);
    }

    const reg = (partes[0] ?? '').trim();
    if (!ehRegistroConhecido(reg)) {
      add({
        severidade: 'erro', categoria: 'Estrutura', regra: 'REG-DESCONHECIDO', linha: numero, registro: reg || null, campo: null,
        problema: `Registro "${reg}" não existe no leiaute 1.3 do LCDPR.`,
        comoCorrigir: 'Os registros válidos são 0000, 0010, 0030, 0040, 0045, 0050, Q100, Q200 e 9999. Corrija ou remova a linha.',
      });
      return;
    }
    const def = LEIAUTE[reg];
    contagem.set(reg, (contagem.get(reg) ?? 0) + 1);

    // --- Ordem dos blocos -------------------------------------------------------
    if (def.ordem < maiorOrdem) {
      add({
        severidade: 'erro', categoria: 'Estrutura', regra: 'ORDEM', linha: numero, registro: reg, campo: null,
        problema: `Registro ${reg} aparece depois do ${registroDaMaiorOrdem}, fora da ordem do leiaute.`,
        comoCorrigir: 'A ordem obrigatória é 0000, 0010, 0030, 0040/0045, 0050, Q100, Q200, 9999.',
      });
    } else {
      maiorOrdem = def.ordem;
      registroDaMaiorOrdem = reg;
    }

    // --- Quantidade de campos ----------------------------------------------------
    const esperado = def.campos.length;
    if (partes.length === esperado + 1 && partes[partes.length - 1] === '') {
      add({
        severidade: 'alerta', categoria: 'Estrutura', regra: 'PIPE-FINAL', linha: numero, registro: reg, campo: null,
        problema: 'A linha termina com "|". Pelo Manual, o último campo não leva "|" depois dele.',
        comoCorrigir: 'Remova o "|" do fim das linhas no sistema gerador.',
      });
      partes = partes.slice(0, -1);
    }
    if (partes.length !== esperado) {
      add({
        severidade: 'erro', categoria: 'Estrutura', regra: 'QTD-CAMPOS', linha: numero, registro: reg, campo: null,
        problema: `O registro ${reg} tem ${partes.length} campos; o leiaute exige ${esperado}.`,
        comoCorrigir: 'Verifique se há "|" a mais ou a menos (por exemplo, um "|" digitado dentro do histórico). A linha não foi considerada nos cálculos.',
      });
      return;
    }

    // --- Conferência de cada campo contra a tabela ------------------------------------
    let campoComErroGrave = false;
    def.campos.forEach((c, idx) => {
      const bruto = partes[idx] ?? '';
      const v = bruto.trim();
      const base = { categoria: 'Campo' as const, linha: numero, registro: reg, campo: c.nome };

      if (c.tipo === 'N' && v !== bruto && v !== '') {
        add({
          ...base, severidade: 'alerta', regra: 'CAMPO-ESPACOS',
          problema: `O campo numérico ${c.nome} tem espaços em branco ("${bruto}").`,
          comoCorrigir: 'Campos numéricos devem ter só algarismos. O painel desconsiderou os espaços, mas corrija na origem.',
        });
      }
      if (v === '') {
        if (c.obrigatorio === 'S') {
          add({
            ...base, severidade: 'erro', regra: 'CAMPO-OBRIG',
            problema: `Campo obrigatório ${c.nome} (${c.descricao}) está vazio.`,
            comoCorrigir: `Preencha ${c.nome} no cadastro de origem e gere o arquivo novamente.`,
          });
          campoComErroGrave = true;
        }
        return;
      }
      if (c.tipo === 'N' && CAMPOS_CPF_CNPJ.has(c.nome) && ehCnpjAlfanumerico(v)) {
        // CNPJ alfanumérico (IN RFB nº 2.229/2024, emitido a partir de julho de 2026):
        // o leiaute 1.3 do LCDPR define o campo como numérico, mas o documento é
        // válido. O lançamento continua nos cálculos; a pessoa confere se o PVA aceita.
        add({
          ...base, severidade: 'alerta', regra: 'CNPJ-ALFANUMERICO',
          problema: `O campo ${c.nome} traz um CNPJ alfanumérico (${v}), com dígito verificador válido. O leiaute 1.3 do LCDPR prevê só algarismos.`,
          comoCorrigir: 'O CNPJ alfanumérico existe desde julho de 2026 (IN RFB nº 2.229/2024). Confira no site da Receita se o PVA e o leiaute vigentes do LCDPR já o aceitam antes de transmitir; o painel manteve o lançamento nos cálculos.',
        });
        return;
      }
      if (c.tipo === 'N' && !/^\d+$/.test(v)) {
        add({
          ...base, severidade: 'erro', regra: 'CAMPO-NUMERICO',
          problema: `O campo ${c.nome} deve conter só algarismos, mas contém "${v}".`,
          comoCorrigir: 'Retire pontos, vírgulas, traços, barras e sinais. Valores usam 2 decimais implícitos (R$ 1.255,42 = 125542).',
        });
        campoComErroGrave = true;
        return;
      }
      if (c.tamanhosExatos && !c.tamanhosExatos.includes(v.length)) {
        add({
          ...base, severidade: 'erro', regra: 'CAMPO-TAMANHO',
          problema: `O campo ${c.nome} tem ${v.length} caracteres; o leiaute exige ${c.tamanhosExatos.join(' ou ')}.`,
          comoCorrigir: 'Complete com zeros à esquerda e sem máscara (ex.: código de imóvel "001", data "05032025").',
        });
        campoComErroGrave = true;
        return;
      }
      if (v.length > c.tamanho) {
        add({
          ...base, severidade: 'erro', regra: 'CAMPO-TAMANHO',
          problema: `O campo ${c.nome} tem ${v.length} caracteres; o máximo é ${c.tamanho}.`,
          comoCorrigir: 'Reduza o conteúdo do campo no sistema de origem.',
        });
        return;
      }
      if (c.valores && !c.valores.includes(v)) {
        add({
          ...base, severidade: 'erro', regra: 'CAMPO-CODIGO',
          problema: `Valor "${v}" não é aceito em ${c.nome}. Valores válidos: ${c.valores.join(', ')}.`,
          comoCorrigir: `Use um dos códigos da tabela do Manual para ${c.descricao.toLowerCase()}.`,
        });
        campoComErroGrave = true;
        return;
      }
      // Caracteres de controle (ASCII 0 a 31) são proibidos pelo Manual.
      if (/[\u0000-\u001f]/.test(v)) {
        add({
          ...base, severidade: 'erro', regra: 'CAMPO-CARACTERE',
          problema: `O campo ${c.nome} contém caractere de controle não imprimível.`,
          comoCorrigir: 'Remova tabulações e caracteres invisíveis do texto na origem.',
        });
      }
    });

    const l = new Linha(numero, def, partes);
    const data = (nome: string): DataLcdpr | null => {
      const v = l.txt(nome);
      if (v === '') return null;
      const d = lerData(v);
      if (!d) {
        add({
          severidade: 'erro', categoria: 'Campo', regra: 'CAMPO-DATA', linha: numero, registro: reg, campo: nome,
          problema: `"${v}" não é uma data válida (formato DDMMAAAA).`,
          comoCorrigir: 'Informe dia, mês e ano existentes, sem barras (ex.: 31012025).',
        });
      }
      return d;
    };

    // --- Montagem dos objetos do modelo ------------------------------------------------
    switch (reg) {
      case '0000': {
        const dtIni = data('DT_INI');
        arquivo.abertura = {
          linha: numero,
          codVersao: l.txt('COD_VER'),
          cpf: l.txt('CPF'),
          nome: l.txt('NOME'),
          indSitIniPer: l.txt('IND_SIT_INI_PER'),
          sitEspecial: l.txt('SIT_ESPECIAL'),
          dtSitEsp: data('DT_SIT_ESP'),
          dtIni,
          dtFin: data('DT_FIN'),
        };
        arquivo.anoBase = dtIni?.ano ?? null;
        break;
      }
      case '0010':
        arquivo.formaApuracao = l.txt('FORMA_APUR') || null;
        break;
      case '0030':
        arquivo.cadastro = { linha: numero, uf: l.txt('UF'), codMun: l.txt('COD_MUN') };
        break;
      case '0040':
        ultimo0040 = l.txt('COD_IMOVEL');
        arquivo.imoveis.push({
          linha: numero,
          codigo: l.txt('COD_IMOVEL'),
          pais: l.txt('PAIS'),
          moeda: l.txt('MOEDA'),
          cadItr: l.txt('CAD_ITR'),
          caepf: l.txt('CAEPF'),
          inscricaoEstadual: l.txt('INSCR_ESTADUAL'),
          nome: l.txt('NOME_IMOVEL'),
          uf: l.txt('UF'),
          codMun: l.txt('COD_MUN'),
          cep: l.txt('CEP'),
          tipoExploracao: l.txt('TIPO_EXPLORACAO'),
          participacao: lerPercentual(l.txt('PARTICIPACAO')),
        });
        break;
      case '0045':
        if (l.txt('COD_IMOVEL') !== ultimo0040) {
          add({
            severidade: 'alerta', categoria: 'Estrutura', regra: 'HIERARQUIA-0045', linha: numero, registro: reg, campo: 'COD_IMOVEL',
            problema: ultimo0040 === null
              ? 'Registro 0045 antes de qualquer 0040.'
              : `O 0045 do imóvel ${l.txt('COD_IMOVEL')} vem depois do 0040 do imóvel ${ultimo0040}.`,
            comoCorrigir: 'O 0045 é registro "filho" do 0040: os terceiros de cada imóvel devem vir logo abaixo do 0040 daquele imóvel (Manual, hierarquia dos registros).',
          });
        }
        arquivo.terceiros.push({
          linha: numero,
          codImovel: l.txt('COD_IMOVEL'),
          tipoContraparte: l.txt('TIPO_CONTRAPARTE'),
          id: l.txt('ID_CONTRAPARTE'),
          nome: l.txt('NOME_CONTRAPARTE'),
          percentual: lerPercentual(l.txt('PERC_CONTRAPARTE')),
        });
        break;
      case '0050':
        arquivo.contas.push({
          linha: numero,
          codigo: l.txt('COD_CONTA'),
          pais: l.txt('PAIS_CTA'),
          banco: l.txt('BANCO'),
          nomeBanco: l.txt('NOME_BANCO'),
          agencia: l.txt('AGENCIA'),
          numConta: l.txt('NUM_CONTA'),
        });
        break;
      case 'Q100': {
        const d = data('DATA');
        const entrada = lerCentavos(l.txt('VL_ENTRADA'));
        const saida = lerCentavos(l.txt('VL_SAIDA'));
        const saldo = lerCentavos(l.txt('SLD_FIN'));
        const sinal = SINAL[l.txt('NAT_SLD_FIN')];
        // Só entra nos cálculos o lançamento com data e valores legíveis.
        if (d && entrada !== null && saida !== null && saldo !== null && sinal && !campoComErroGrave) {
          arquivo.lancamentos.push({
            linha: numero,
            data: d,
            codImovel: l.txt('COD_IMOVEL'),
            codConta: l.txt('COD_CONTA'),
            numDoc: l.txt('NUM_DOC'),
            tipoDoc: l.txt('TIPO_DOC'),
            historico: l.txt('HIST'),
            idPartic: l.txt('ID_PARTIC'),
            tipoLanc: l.txt('TIPO_LANC'),
            entrada,
            saida,
            saldo: sinal * saldo,
          });
        } else if (!campoComErroGrave) {
          add({
            severidade: 'erro', categoria: 'Campo', regra: 'LANC-ILEGIVEL', linha: numero, registro: reg, campo: null,
            problema: 'Lançamento com data, valor ou natureza do saldo ilegível.',
            comoCorrigir: 'Corrija os campos apontados nesta linha. O lançamento ficou fora dos cálculos.',
          });
        }
        break;
      }
      case 'Q200': {
        const v = l.txt('MES');
        const mes = /^\d{6}$/.test(v) && Number(v.slice(0, 2)) >= 1 && Number(v.slice(0, 2)) <= 12
          ? `${v.slice(2)}-${v.slice(0, 2)}`
          : null;
        if (!mes && v !== '') {
          add({
            severidade: 'erro', categoria: 'Campo', regra: 'CAMPO-DATA', linha: numero, registro: reg, campo: 'MES',
            problema: `"${v}" não é um mês válido (formato MMAAAA).`,
            comoCorrigir: 'Informe mês e ano sem barras (ex.: 032025).',
          });
        }
        const entrada = lerCentavos(l.txt('VL_ENTRADA'));
        const saida = lerCentavos(l.txt('VL_SAIDA'));
        const saldo = lerCentavos(l.txt('SLD_FIN'));
        const sinal = SINAL[l.txt('NAT_SLD_FIN')];
        if (mes && entrada !== null && saida !== null && saldo !== null && sinal) {
          arquivo.resumos.push({ linha: numero, mes, entrada, saida, saldo: sinal * saldo });
        }
        break;
      }
      case '9999': {
        const q = l.txt('QTD_LIN');
        arquivo.encerramento = {
          linha: numero,
          nomeContador: l.txt('IDENT_NOM'),
          idContador: l.txt('IDENT_CPF_CNPJ'),
          crc: l.txt('IND_CRC'),
          qtdLinhas: /^\d+$/.test(q) ? Number(q) : null,
        };
        break;
      }
    }
  });

  // --- Presença e quantidade de cada registro --------------------------------------------
  for (const def of Object.values(LEIAUTE)) {
    const n = contagem.get(def.reg) ?? 0;
    if (n < def.minimo) {
      add({
        severidade: 'erro', categoria: 'Estrutura', regra: 'REG-AUSENTE', linha: null, registro: def.reg, campo: null,
        problema: `Registro obrigatório ${def.reg} (${def.descricao}) não foi encontrado.`,
        comoCorrigir: `Gere o arquivo novamente garantindo o registro ${def.reg}.`,
      });
    }
    if (def.maximo !== null && n > def.maximo) {
      add({
        severidade: 'erro', categoria: 'Estrutura', regra: 'REG-REPETIDO', linha: null, registro: def.reg, campo: null,
        problema: `O registro ${def.reg} aparece ${n} vezes; o leiaute permite ${def.maximo}.`,
        comoCorrigir: 'Mantenha um único registro e remova os demais. Pode ser junção de dois arquivos num só.',
      });
    }
  }

  return { arquivo, ocorrencias };
}

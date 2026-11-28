/**
 * VALIDAÇÕES QUE CRUZAM REGISTROS (aba "Saúde do Arquivo").
 *
 * Organizadas em quatro grupos, na mesma ordem do relatório:
 *   1. Estrutura  - quantidade de linhas informada no 9999.
 *   2. Integridade - cadastros referenciados, período, CPF/CNPJ, regras do 0000/0040/0045.
 *   3. Conciliação - saldo lançamento a lançamento, Q100 x Q200 por mês, saldo do Q200.
 *   4. Riscos      - pontos de atenção de auditoria (não são erros de leiaute).
 *
 * Fonte das regras: Manual de Preenchimento do LCDPR (leiaute 1.3). As regras
 * de "Risco" são critérios de auditoria do painel, não exigências da Receita,
 * e por isso nunca são classificadas como "erro".
 */
import { formatarReais, type Centavos } from '../domain/dinheiro';
import { diaNaoUtil, formatarDataIso, formatarMesIso } from '../domain/datas';
import { cpfOuCnpjValido, cpfValido, formatarCpfCnpj } from '../domain/documentos';
import { CONTA_ESPECIE, CONTA_NAO_BANCARIA, IMOVEL_RATEIO, TIPO_LANC } from './leiaute';

/** COD_VER do leiaute 1.3 do LCDPR (o conferido em leiaute.ts). */
const VERSAO_LEIAUTE = '0013';
import type { ArquivoLcdpr, Lancamento, Ocorrencia } from './modelo';

type Add = (o: Ocorrencia) => void;

/** Percentual em centésimos → "50,00%". */
const pct = (centesimos: number): string =>
  `${(centesimos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Lançamento de receita (tipo 1 ou 3) ou despesa (tipo 2). */
const ehReceita = (l: Lancamento): boolean => l.tipoLanc === '1' || l.tipoLanc === '3';

export function validarArquivo(a: ArquivoLcdpr): Ocorrencia[] {
  const ocorrencias: Ocorrencia[] = [];
  const add: Add = (o) => {
    ocorrencias.push(o);
  };
  validarEstrutura(a, add);
  validarIntegridade(a, add);
  validarConciliacao(a, add);
  validarRiscos(a, add);
  return ocorrencias;
}

// ===========================================================================
// 1. ESTRUTURA
// ===========================================================================
function validarEstrutura(a: ArquivoLcdpr, add: Add): void {
  const enc = a.encerramento;
  if (enc && enc.qtdLinhas !== null && enc.qtdLinhas !== a.totalLinhas) {
    add({
      severidade: 'erro', categoria: 'Estrutura', regra: 'QTD-LINHAS', linha: enc.linha, registro: '9999', campo: 'QTD_LIN',
      problema: `O 9999 informa ${enc.qtdLinhas} linhas, mas o arquivo tem ${a.totalLinhas}.`,
      comoCorrigir: 'QTD_LIN deve contar todas as linhas do arquivo, do 0000 ao próprio 9999. Diferença costuma indicar arquivo editado à mão ou cortado.',
    });
  }
  if (a.lancamentos.length === 0 && a.resumos.length === 0) {
    add({
      severidade: 'alerta', categoria: 'Estrutura', regra: 'SEM-LANCAMENTOS', linha: null, registro: 'Q100', campo: null,
      problema: 'O arquivo não tem lançamentos (Q100) válidos.',
      comoCorrigir: 'Confirme se o período realmente não teve movimento ou se a escrituração foi gerada vazia.',
    });
  }
}

// ===========================================================================
// 2. INTEGRIDADE
// ===========================================================================
function validarIntegridade(a: ArquivoLcdpr, add: Add): void {
  const ab = a.abertura;

  // ---- 0000: identificação e período --------------------------------------------
  if (ab) {
    if (ab.cpf && !cpfValido(ab.cpf)) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'CPF-DV', linha: ab.linha, registro: '0000', campo: 'CPF',
        problema: `CPF do produtor ${formatarCpfCnpj(ab.cpf)} com dígito verificador inválido.`,
        comoCorrigir: 'Corrija o CPF no cadastro do produtor.',
      });
    }
    if (ab.dtIni && ab.dtFin) {
      if (ab.dtIni.iso > ab.dtFin.iso) {
        add({
          severidade: 'erro', categoria: 'Integridade', regra: 'PERIODO', linha: ab.linha, registro: '0000', campo: 'DT_FIN',
          problema: 'A data final do período é anterior à data inicial.',
          comoCorrigir: 'Revise DT_INI e DT_FIN.',
        });
      }
      if (ab.dtIni.ano !== ab.dtFin.ano) {
        add({
          severidade: 'erro', categoria: 'Integridade', regra: 'PERIODO', linha: ab.linha, registro: '0000', campo: 'DT_FIN',
          problema: `O período abrange dois anos (${ab.dtIni.ano} e ${ab.dtFin.ano}). O LCDPR é anual.`,
          comoCorrigir: 'Gere um arquivo por ano-calendário.',
        });
      }
      if (ab.indSitIniPer === '0' && !(ab.dtIni.mes === 1 && ab.dtIni.dia === 1)) {
        add({
          severidade: 'alerta', categoria: 'Integridade', regra: 'PERIODO', linha: ab.linha, registro: '0000', campo: 'DT_INI',
          problema: `Situação inicial "0 - regular" exige início em 01/01, mas DT_INI é ${formatarDataIso(ab.dtIni.iso)}.`,
          comoCorrigir: 'Use IND_SIT_INI_PER 1 (abertura) ou 2 (início de obrigatoriedade), ou corrija a data inicial.',
        });
      }
      if (ab.sitEspecial === '0' && !(ab.dtFin.mes === 12 && ab.dtFin.dia === 31)) {
        // Sem situação especial, um período que termina antes de 31/12 é uma PRÉVIA
        // (acompanhamento do ano em andamento): útil para planejar, mas não é o
        // arquivo a transmitir, que precisa cobrir o ano-calendário inteiro.
        add({
          severidade: 'alerta', categoria: 'Integridade', regra: 'PREVIA', linha: ab.linha, registro: '0000', campo: 'DT_FIN',
          problema: `Prévia: o arquivo vai até ${formatarDataIso(ab.dtFin.iso)}. Serve para acompanhar e planejar o ano, mas não deve ser transmitido assim: sem situação especial, o LCDPR cobre o ano inteiro (até 31/12).`,
          comoCorrigir: `Para transmitir, gere o arquivo final com DT_FIN 31/12/${ab.dtFin.ano} e os lançamentos até dezembro. Se houve falecimento, espólio ou saída do País, informe a situação especial no 0000.`,
        });
      }
    }
    // DT_SIT_ESP acompanha a situação especial: com falecimento ou saída definitiva
    // do País, a data do evento define o fim do período (erro se faltar); no espólio,
    // alerta. Data preenchida sem situação especial também é inconsistência.
    if (ab.sitEspecial && ab.sitEspecial !== '0' && !ab.dtSitEsp) {
      const evento = { '1': 'falecimento', '2': 'espólio', '3': 'saída definitiva do País' }[ab.sitEspecial] ?? `código ${ab.sitEspecial}`;
      add({
        severidade: ab.sitEspecial === '2' ? 'alerta' : 'erro', categoria: 'Integridade', regra: 'SIT-ESPECIAL', linha: ab.linha, registro: '0000', campo: 'DT_SIT_ESP',
        problema: `Situação especial "${evento}" sem a data do evento (DT_SIT_ESP).`,
        comoCorrigir: 'Informe DT_SIT_ESP com a data da situação especial (Manual, registro 0000).',
      });
    }
    if (ab.sitEspecial === '0' && ab.dtSitEsp) {
      add({
        severidade: 'alerta', categoria: 'Integridade', regra: 'SIT-ESPECIAL', linha: ab.linha, registro: '0000', campo: 'DT_SIT_ESP',
        problema: `DT_SIT_ESP preenchida (${formatarDataIso(ab.dtSitEsp.iso)}) sem situação especial (SIT_ESPECIAL = 0).`,
        comoCorrigir: 'Deixe DT_SIT_ESP vazia quando não houver situação especial, ou informe o código correto em SIT_ESPECIAL.',
      });
    }
    if (ab.sitEspecial && ab.sitEspecial !== '0' && ab.dtSitEsp && ab.dtFin && ab.dtSitEsp.iso > ab.dtFin.iso) {
      add({
        severidade: 'alerta', categoria: 'Integridade', regra: 'SIT-ESPECIAL', linha: ab.linha, registro: '0000', campo: 'DT_SIT_ESP',
        problema: `A data da situação especial (${formatarDataIso(ab.dtSitEsp.iso)}) é posterior ao fim do período (${formatarDataIso(ab.dtFin.iso)}).`,
        comoCorrigir: 'Confira DT_SIT_ESP e DT_FIN: o período escriturado não deve passar da data do evento.',
      });
    }
    // Versão do leiaute: o painel confere a tabela do leiaute 1.3 (COD_VER "0013").
    if (ab.codVersao && ab.codVersao !== VERSAO_LEIAUTE) {
      add({
        severidade: 'alerta', categoria: 'Estrutura', regra: 'VERSAO-LEIAUTE', linha: ab.linha, registro: '0000', campo: 'COD_VER',
        problema: `O arquivo informa a versão de leiaute "${ab.codVersao}"; o painel confere pela versão 1.3 ("${VERSAO_LEIAUTE}").`,
        comoCorrigir: 'Confira no site da Receita a versão vigente do leiaute do LCDPR e se o sistema gerador está atualizado.',
      });
    }
  }

  // ---- 0010: opção pelos 20% só com resultado positivo (Lei nº 8.023/1990, art. 5º) ----
  if (a.formaApuracao === '2' && a.lancamentos.length > 0) {
    const resultado = a.lancamentos.reduce((s, l) => s + (ehReceita(l) ? l.entrada - l.saida : l.tipoLanc === '2' ? l.entrada - l.saida : 0), 0);
    if (resultado <= 0) {
      add({
        severidade: 'alerta', categoria: 'Integridade', regra: 'FORMA-APURACAO', linha: null, registro: '0010', campo: 'FORMA_APUR',
        problema: `Forma de apuração "2" (20% da receita bruta) com resultado do ano ${resultado === 0 ? 'nulo' : `negativo (${formatarReais(resultado)})`}.`,
        comoCorrigir: 'A opção pelos 20% só limita resultado POSITIVO (Lei nº 8.023/1990, art. 5º). Com prejuízo, apure pelo Livro Caixa (forma 1) para não perder o prejuízo a compensar (art. 14 e art. 16, parágrafo único).',
      });
    }
  }

  // ---- 0040: imóveis ------------------------------------------------------------
  const imoveis = new Map<string, number>();
  for (const im of a.imoveis) {
    if (imoveis.has(im.codigo)) {
      add({
        severidade: 'alerta', categoria: 'Integridade', regra: 'IMOVEL-DUPLICADO', linha: im.linha, registro: '0040', campo: 'COD_IMOVEL',
        problema: `Código de imóvel ${im.codigo} repetido (primeiro na linha ${imoveis.get(im.codigo)}).`,
        comoCorrigir: 'Cada 0040 deve ter código próprio. Se a exploração mudou no ano, o Manual pede um novo 0040 com novo código.',
      });
    } else {
      imoveis.set(im.codigo, im.linha);
    }
    if (im.pais === 'BR') {
      for (const [campo, valor] of [['CAD_ITR', im.cadItr], ['UF', im.uf], ['COD_MUN', im.codMun], ['CEP', im.cep]] as const) {
        if (!valor) {
          add({
            severidade: 'erro', categoria: 'Integridade', regra: 'IMOVEL-BR', linha: im.linha, registro: '0040', campo,
            problema: `Imóvel ${im.codigo} no Brasil sem ${campo}.`,
            comoCorrigir: `Para imóvel no Brasil, ${campo} é obrigatório (Manual, registro 0040).`,
          });
        }
      }
    }
    if (im.participacao !== null && im.participacao > 10000) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'PARTICIPACAO', linha: im.linha, registro: '0040', campo: 'PARTICIPACAO',
        problema: `Participação de ${pct(im.participacao)} no imóvel ${im.codigo}, acima de 100%.`,
        comoCorrigir: 'Informe o percentual com 2 decimais implícitos (100% = 10000).',
      });
    }
    if (im.participacao === 0) {
      add({
        severidade: 'alerta', categoria: 'Integridade', regra: 'PARTICIPACAO', linha: im.linha, registro: '0040', campo: 'PARTICIPACAO',
        problema: `Participação de 0% no imóvel ${im.codigo}.`,
        comoCorrigir: 'Confirme o percentual de participação do produtor no imóvel.',
      });
    }
    // Manual 3.2: 0045 é obrigatório se participação < 100% ou exploração diferente de "1".
    const precisaTerceiro = (im.participacao !== null && im.participacao < 10000) || (im.tipoExploracao !== '' && im.tipoExploracao !== '1');
    if (precisaTerceiro && !a.terceiros.some((t) => t.codImovel === im.codigo)) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'TERCEIRO-AUSENTE', linha: im.linha, registro: '0040', campo: null,
        problema: `Imóvel ${im.codigo} com participação de ${im.participacao !== null ? pct(im.participacao) : '?'} ou exploração não individual, mas sem nenhum 0045.`,
        comoCorrigir: 'Cadastre no 0045 os condôminos, parceiros, arrendadores ou comodantes do imóvel.',
      });
    }
  }

  // ---- Condomínio: a soma das partes não passa de 100% ----------------------------------
  for (const im of a.imoveis) {
    if (im.tipoExploracao !== '2' || im.participacao === null) continue;
    const condominos = a.terceiros.filter((t) => t.codImovel === im.codigo && t.tipoContraparte === '1' && t.percentual !== null);
    const soma = im.participacao + condominos.reduce((s, t) => s + (t.percentual ?? 0), 0);
    if (condominos.length > 0 && soma > 10000) {
      add({
        severidade: 'alerta', categoria: 'Integridade', regra: 'SOMA-PARTICIPACAO', linha: im.linha, registro: '0040', campo: 'PARTICIPACAO',
        problema: `No condomínio do imóvel ${im.codigo}, a participação do produtor (${pct(im.participacao)}) mais a dos condôminos do 0045 soma ${pct(soma)}, acima de 100%.`,
        comoCorrigir: 'Confira os percentuais do contrato ou da matrícula: cada condômino escritura só a sua parte (Lei nº 8.023/1990, art. 13).',
      });
    }
  }

  // ---- 0045: terceiros -------------------------------------------------------------
  for (const t of a.terceiros) {
    if (!imoveis.has(t.codImovel)) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'TERCEIRO-IMOVEL', linha: t.linha, registro: '0045', campo: 'COD_IMOVEL',
        problema: `Terceiro vinculado ao imóvel ${t.codImovel}, que não existe no 0040.`,
        comoCorrigir: 'Use o código de um imóvel cadastrado no 0040.',
      });
    }
    if (t.id && !cpfOuCnpjValido(t.id)) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'CPF-DV', linha: t.linha, registro: '0045', campo: 'ID_CONTRAPARTE',
        problema: `CPF/CNPJ ${formatarCpfCnpj(t.id)} da contraparte com dígito verificador inválido.`,
        comoCorrigir: 'Corrija o documento no cadastro do terceiro.',
      });
    }
    if (t.percentual !== null && t.percentual > 10000) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'PARTICIPACAO', linha: t.linha, registro: '0045', campo: 'PERC_CONTRAPARTE',
        problema: `Percentual da contraparte de ${pct(t.percentual)}, acima de 100%.`,
        comoCorrigir: 'Informe o percentual com 2 decimais implícitos (100% = 10000).',
      });
    }
  }

  // ---- 0050: contas ---------------------------------------------------------------
  const contas = new Set<string>();
  for (const c of a.contas) {
    if (contas.has(c.codigo)) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'CONTA-DUPLICADA', linha: c.linha, registro: '0050', campo: 'COD_CONTA',
        problema: `Código de conta ${c.codigo} repetido.`,
        comoCorrigir: 'Cada conta bancária deve ter código próprio no 0050.',
      });
    }
    contas.add(c.codigo);
    if (c.codigo === CONTA_ESPECIE || c.codigo === CONTA_NAO_BANCARIA) {
      add({
        severidade: 'alerta', categoria: 'Integridade', regra: 'CONTA-RESERVADA', linha: c.linha, registro: '0050', campo: 'COD_CONTA',
        problema: `O código ${c.codigo} é reservado pelo Manual (000 = espécie; 999 = valor que não passou por conta) e não deveria ser usado para conta bancária.`,
        comoCorrigir: 'Renumere a conta bancária.',
      });
    }
    if ((c.pais === 'BR' || c.pais === 'BRA') && !c.banco) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'CONTA-BANCO', linha: c.linha, registro: '0050', campo: 'BANCO',
        problema: `Conta ${c.codigo} no Brasil sem código do banco.`,
        comoCorrigir: 'Informe o código de compensação do banco (ex.: 001, 237, 341).',
      });
    }
  }

  // ---- Q100: referências, período, documentos e coerência --------------------------------
  const ini = ab?.dtIni?.iso;
  const fin = ab?.dtFin?.iso;
  for (const l of a.lancamentos) {
    const base = { categoria: 'Integridade' as const, linha: l.linha, registro: 'Q100' };
    if (l.codImovel === IMOVEL_RATEIO) {
      add({
        ...base, severidade: 'info', regra: 'IMOVEL-RATEIO', campo: 'COD_IMOVEL',
        problema: 'Lançamento com imóvel "000" (despesa comum a vários imóveis em condomínio ou parceria).',
        comoCorrigir: 'Permitido pelo Manual. Confirme que o histórico explica o rateio.',
      });
    } else if (!imoveis.has(l.codImovel)) {
      add({
        ...base, severidade: 'erro', regra: 'REF-IMOVEL', campo: 'COD_IMOVEL',
        problema: `Imóvel ${l.codImovel} não está cadastrado no 0040.`,
        comoCorrigir: 'Cadastre o imóvel no 0040 ou corrija o código no lançamento.',
      });
    }
    if (l.codConta !== CONTA_ESPECIE && l.codConta !== CONTA_NAO_BANCARIA && !contas.has(l.codConta)) {
      add({
        ...base, severidade: 'erro', regra: 'REF-CONTA', campo: 'COD_CONTA',
        problema: `Conta ${l.codConta} não está cadastrada no 0050.`,
        comoCorrigir: 'Cadastre a conta no 0050 ou use 000 (espécie) / 999 (sem trânsito por conta).',
      });
    }
    if ((ini && l.data.iso < ini) || (fin && l.data.iso > fin)) {
      add({
        ...base, severidade: 'erro', regra: 'DATA-PERIODO', campo: 'DATA',
        problema: `Data ${formatarDataIso(l.data.iso)} fora do período do arquivo.`,
        comoCorrigir: 'Lance no arquivo do ano correto ou corrija a data.',
      });
    }
    if (l.idPartic && !cpfOuCnpjValido(l.idPartic)) {
      add({
        ...base, severidade: 'erro', regra: 'CPF-DV', campo: 'ID_PARTIC',
        problema: `CPF/CNPJ do participante ${formatarCpfCnpj(l.idPartic)} com dígito verificador inválido.`,
        comoCorrigir: 'Corrija o documento no cadastro do cliente/fornecedor.',
      });
    }
    if (l.entrada > 0 && l.saida > 0) {
      add({
        ...base, severidade: 'alerta', regra: 'VALOR-DUPLO', campo: 'VL_ENTRADA',
        problema: 'Lançamento com entrada e saída ao mesmo tempo.',
        comoCorrigir: 'Separe em dois lançamentos: um de receita e um de despesa.',
      });
    } else if (l.entrada === 0 && l.saida === 0) {
      add({
        ...base, severidade: 'alerta', regra: 'VALOR-ZERO', campo: 'VL_ENTRADA',
        problema: 'Lançamento com entrada e saída zeradas.',
        comoCorrigir: 'Remova o lançamento ou informe o valor.',
      });
    } else if (ehReceita(l) && l.saida > 0) {
      add({
        ...base, severidade: 'alerta', regra: 'TIPO-VALOR', campo: 'TIPO_LANC',
        problema: `Lançamento de receita (tipo ${l.tipoLanc}) com valor de saída de ${formatarReais(l.saida)}.`,
        comoCorrigir: 'Receitas são informadas em VL_ENTRADA. Confirme o tipo de lançamento.',
      });
    } else if (l.tipoLanc === '2' && l.entrada > 0) {
      add({
        ...base, severidade: 'alerta', regra: 'TIPO-VALOR', campo: 'TIPO_LANC',
        problema: `Lançamento de despesa (tipo 2) com valor de entrada de ${formatarReais(l.entrada)}.`,
        comoCorrigir: 'Despesas são informadas em VL_SAIDA. Estorno de despesa? Confirme o tratamento.',
      });
    }
  }

  // ---- Q200: período e repetição ------------------------------------------------------
  const meses = new Set<string>();
  const iniMes = ini?.slice(0, 7);
  const finMes = fin?.slice(0, 7);
  for (const r of a.resumos) {
    if (meses.has(r.mes)) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'Q200-REPETIDO', linha: r.linha, registro: 'Q200', campo: 'MES',
        problema: `Mês ${formatarMesIso(r.mes)} informado mais de uma vez no Q200.`,
        comoCorrigir: 'Deve haver um único Q200 por mês.',
      });
    }
    meses.add(r.mes);
    if ((iniMes && r.mes < iniMes) || (finMes && r.mes > finMes)) {
      add({
        severidade: 'erro', categoria: 'Integridade', regra: 'DATA-PERIODO', linha: r.linha, registro: 'Q200', campo: 'MES',
        problema: `Mês ${formatarMesIso(r.mes)} fora do período do arquivo.`,
        comoCorrigir: 'Revise o resumo mensal.',
      });
    }
  }

  // ---- 9999: contador -------------------------------------------------------------------
  const enc = a.encerramento;
  if (enc?.idContador && !cpfOuCnpjValido(enc.idContador)) {
    add({
      severidade: 'erro', categoria: 'Integridade', regra: 'CPF-DV', linha: enc.linha, registro: '9999', campo: 'IDENT_CPF_CNPJ',
      problema: `CPF/CNPJ do contador ${formatarCpfCnpj(enc.idContador)} com dígito verificador inválido.`,
      comoCorrigir: 'Corrija o documento do responsável no sistema gerador.',
    });
  }
}

// ===========================================================================
// 3. CONCILIAÇÃO
// ===========================================================================
function validarConciliacao(a: ArquivoLcdpr, add: Add): void {
  // ---- 3.1 Saldo lançamento a lançamento ------------------------------------------
  // Manual: saldo inicial zero no início do ano; cada Q100 traz o saldo após ele.
  // Comparamos cada saldo com "saldo anterior informado + entrada - saída". Assim
  // cada divergência aponta a linha exata, sem contaminar as seguintes.
  let anterior: Centavos = 0;
  let divergencias = 0;
  for (const l of a.lancamentos) {
    const esperado = anterior + l.entrada - l.saida;
    if (l.saldo !== esperado) {
      divergencias++;
      const tipo3SemEfeito = l.tipoLanc === '3' && l.saldo === anterior;
      add({
        severidade: tipo3SemEfeito ? 'alerta' : 'erro',
        categoria: 'Conciliação', regra: 'SALDO-LANC', linha: l.linha, registro: 'Q100', campo: 'SLD_FIN',
        problema: tipo3SemEfeito
          ? `Lançamento tipo 3 (adiantamento recebido em ano anterior) não alterou o saldo: entrada de ${formatarReais(l.entrada)} ficou fora do caixa.`
          : `Saldo informado ${formatarReais(l.saldo)}; esperado ${formatarReais(esperado)} (saldo anterior ${formatarReais(anterior)} + entrada ${formatarReais(l.entrada)} − saída ${formatarReais(l.saida)}). Diferença de ${formatarReais(l.saldo - esperado)}.`,
        comoCorrigir: tipo3SemEfeito
          ? 'O Manual não detalha se o tipo 3 movimenta o saldo. Confirme o tratamento adotado pelo sistema gerador e mantenha-o consistente em todos os lançamentos tipo 3.'
          : 'Recalcule o saldo no sistema de origem. Lançamentos fora de ordem cronológica ou excluídos depois de gerado o arquivo causam esta diferença.',
      });
    }
    anterior = l.saldo;
  }
  if (divergencias > 0) {
    const ultimo = a.lancamentos[a.lancamentos.length - 1];
    const recalculado = a.lancamentos.reduce((s, l) => s + l.entrada - l.saida, 0);
    add({
      severidade: 'info', categoria: 'Conciliação', regra: 'SALDO-RESUMO', linha: null, registro: 'Q100', campo: 'SLD_FIN',
      problema: `${divergencias} lançamento(s) com saldo divergente. Saldo final recalculado do zero: ${formatarReais(recalculado)}; informado no último lançamento: ${formatarReais(ultimo?.saldo ?? 0)}.`,
      comoCorrigir: 'Corrija as linhas apontadas acima; o saldo final deve ser igual a receitas menos despesas do ano.',
    });
  }

  // ---- 3.2 Ordem cronológica ------------------------------------------------------
  for (let i = 1; i < a.lancamentos.length; i++) {
    const atual = a.lancamentos[i];
    const ant = a.lancamentos[i - 1];
    if (atual && ant && atual.data.iso < ant.data.iso) {
      add({
        severidade: 'alerta', categoria: 'Conciliação', regra: 'ORDEM-DATA', linha: atual.linha, registro: 'Q100', campo: 'DATA',
        problema: `Lançamento de ${formatarDataIso(atual.data.iso)} vem depois de um de ${formatarDataIso(ant.data.iso)}.`,
        comoCorrigir: 'Ordene os lançamentos por data. O saldo intermediário depende da ordem.',
      });
    }
  }

  // ---- 3.3 Q100 somado por mês x Q200 -----------------------------------------------
  interface Totais { entrada: Centavos; saida: Centavos; ultimoSaldo: Centavos }
  const porMes = new Map<string, Totais>();
  for (const l of a.lancamentos) {
    const chave = l.data.iso.slice(0, 7);
    const t = porMes.get(chave) ?? { entrada: 0, saida: 0, ultimoSaldo: 0 };
    t.entrada += l.entrada;
    t.saida += l.saida;
    t.ultimoSaldo = l.saldo;
    porMes.set(chave, t);
  }
  const resumos = new Map(a.resumos.map((r) => [r.mes, r]));

  for (const [mes, t] of porMes) {
    const r = resumos.get(mes);
    const m = formatarMesIso(mes);
    if (!r) {
      add({
        severidade: 'erro', categoria: 'Conciliação', regra: 'Q200-AUSENTE', linha: null, registro: 'Q200', campo: 'MES',
        problema: `Há lançamentos em ${m}, mas não há Q200 para o mês.`,
        comoCorrigir: 'Gere o resumo mensal (Q200) para todos os meses com movimento.',
      });
      continue;
    }
    if (r.entrada !== t.entrada) {
      add({
        severidade: 'erro', categoria: 'Conciliação', regra: 'Q100-Q200', linha: r.linha, registro: 'Q200', campo: 'VL_ENTRADA',
        problema: `${m}: Q200 informa entradas de ${formatarReais(r.entrada)}; a soma dos Q100 é ${formatarReais(t.entrada)} (diferença ${formatarReais(r.entrada - t.entrada)}).`,
        comoCorrigir: 'O Q200 deve totalizar os Q100 do mês. Gere o arquivo novamente após conferir os lançamentos do mês.',
      });
    }
    if (r.saida !== t.saida) {
      add({
        severidade: 'erro', categoria: 'Conciliação', regra: 'Q100-Q200', linha: r.linha, registro: 'Q200', campo: 'VL_SAIDA',
        problema: `${m}: Q200 informa saídas de ${formatarReais(r.saida)}; a soma dos Q100 é ${formatarReais(t.saida)} (diferença ${formatarReais(r.saida - t.saida)}).`,
        comoCorrigir: 'O Q200 deve totalizar os Q100 do mês. Gere o arquivo novamente após conferir os lançamentos do mês.',
      });
    }
    if (r.saldo !== t.ultimoSaldo) {
      add({
        severidade: 'erro', categoria: 'Conciliação', regra: 'Q200-SALDO-Q100', linha: r.linha, registro: 'Q200', campo: 'SLD_FIN',
        problema: `${m}: saldo do Q200 ${formatarReais(r.saldo)} difere do saldo do último lançamento do mês ${formatarReais(t.ultimoSaldo)}.`,
        comoCorrigir: 'O saldo do mês deve ser igual ao saldo após o último Q100 do mês.',
      });
    }
  }
  for (const r of a.resumos) {
    if (!porMes.has(r.mes) && (r.entrada !== 0 || r.saida !== 0)) {
      add({
        severidade: 'erro', categoria: 'Conciliação', regra: 'Q100-Q200', linha: r.linha, registro: 'Q200', campo: null,
        problema: `${formatarMesIso(r.mes)}: Q200 com movimento, mas sem nenhum lançamento Q100 no mês.`,
        comoCorrigir: 'Verifique se os lançamentos do mês foram excluídos ou lançados em outro mês.',
      });
    }
  }

  // ---- 3.4 Saldo acumulado do Q200 ---------------------------------------------------
  let acumulado: Centavos = 0;
  for (const r of [...a.resumos].sort((x, y) => x.mes.localeCompare(y.mes))) {
    acumulado += r.entrada - r.saida;
    if (r.saldo !== acumulado) {
      add({
        severidade: 'erro', categoria: 'Conciliação', regra: 'Q200-ACUMULADO', linha: r.linha, registro: 'Q200', campo: 'SLD_FIN',
        problema: `${formatarMesIso(r.mes)}: saldo acumulado informado ${formatarReais(r.saldo)}; recalculado ${formatarReais(acumulado)}.`,
        comoCorrigir: 'O saldo do Q200 é o saldo do mês somado ao saldo final do mês anterior (Manual, Q200).',
      });
      acumulado = r.saldo; // segue a partir do informado para apontar só o mês que diverge
    }
  }
}

// ===========================================================================
// 4. RISCOS (critérios de auditoria do painel)
// ===========================================================================

/** Palavras que, sozinhas, não explicam o lançamento. */
const HISTORICOS_GENERICOS = new Set([
  'DIVERSOS', 'DIVERSAS', 'DESPESA', 'DESPESAS', 'PAGAMENTO', 'PAGAMENTOS', 'PGTO', 'PAGTO', 'RECEBIMENTO',
  'RECEITA', 'RECEITAS', 'OUTROS', 'OUTRAS', 'ACERTO', 'AJUSTE', 'TRANSFERENCIA', 'TRANSF', 'VALOR',
  'LANCAMENTO', 'NF', 'NOTA', 'NOTA FISCAL', 'DEPOSITO', 'SAQUE', 'COMPRA', 'COMPRAS', 'VENDA', 'VENDAS',
  'SERVICO', 'SERVICOS', 'CREDITO', 'DEBITO', 'PIX', 'TED', 'DOC', 'BOLETO',
]);

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quartil por interpolação linear de uma lista já ordenada. */
function quantil(ordenado: readonly number[], q: number): number {
  const pos = (ordenado.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const a = ordenado[base] ?? 0;
  const b = ordenado[base + 1] ?? a;
  return a + resto * (b - a);
}

/** Valor redondo "alto": a partir de R$ 10.000,00 e múltiplo exato de R$ 1.000,00 (em centavos). */
const VALOR_REDONDO_MINIMO = 1_000_000;
const VALOR_REDONDO_MULTIPLO = 100_000;

/**
 * RECEITA QUE PODE NÃO SER DA ATIVIDADE RURAL (por palavras do histórico).
 *
 * O resultado da atividade rural só inclui a venda do que o próprio produtor
 * explora (Lei nº 8.023/1990, art. 2º; RIR/2018, arts. 50 e seguintes;
 * IN SRF nº 83/2001, art. 5º). Três casos comuns de receita lançada errado:
 * - ARRENDAMENTO/ALUGUEL recebido: aluguel ou arrendamento de máquinas, equipamentos
 *   e pastagens não é atividade rural (IN SRF nº 83/2001, art. 4º, V). Terra
 *   arrendada a terceiro rende aluguel ao arrendador, tributado como rendimento
 *   de aluguel (carnê-leão e declaração), fora do Livro Caixa. Parceria com
 *   partilha de riscos é atividade rural: por isso o texto pede para conferir o contrato.
 * - VENDA DE TERRA NUA: não é receita rural; o lucro é ganho de capital
 *   (IN SRF nº 83/2001, art. 9º, § 2º).
 * - VENDA DE BEM DO IMOBILIZADO (máquina, veículo, benfeitoria): é receita rural
 *   SÓ se o bem era usado exclusivamente na atividade (IN SRF nº 83/2001, art. 5º,
 *   § 2º, III); bem de uso particular gera ganho de capital.
 */
const PALAVRAS_ARRENDAMENTO = /\b(ARRENDAMENT\w*|ALUGUE(L|IS)|LOCACA\w*|LOCACOES|ARRENDO)\b/;
// O bem tem de vir logo depois de "venda de/da/do" (senão "Venda de soja - Fazenda X" seria apontado).
const VENDA_DE = '\\b(VENDA|ALIENACAO|ALIENACOES)( PARCIAL)? (DE|DA|DO|DAS|DOS)( PARTE (DE|DA|DO))?( UMA| UM)? ';
const PALAVRAS_TERRA = new RegExp(`${VENDA_DE}(TERRA|TERRAS|IMOVEL|IMOVEIS|FAZENDA|SITIO|CHACARA|GLEBA|AREA|LOTE|HECTARES?)\\b`);
const PALAVRAS_IMOBILIZADO = new RegExp(`${VENDA_DE}${/(TRATOR(ES)?|MAQUINAS?|COLHEITADEIRAS?|IMPLEMENTOS?|PLANTADEIRAS?|PULVERIZADOR(ES)?|CAMINHA(O|OES)|CAMINHONETES?|CAMIONETES?|VEICULOS?|CARROS?|MOTOS?|EQUIPAMENTOS?|BENFEITORIAS?|GALPA(O|OES)|SILOS?|PIVO|MOTOR(ES)?|CARRETAS?|GRADES?)\b/.source}`);
const BASE_ATIVIDADE = 'Lei nº 8.023/1990, art. 2º; RIR/2018 (Decreto nº 9.580/2018), arts. 50 a 61';

interface ReceitaSuspeita {
  regra: string;
  problema: (l: Lancamento) => string;
  comoCorrigir: string;
}

export function receitaNaoRural(historico: string): ReceitaSuspeita | null {
  const h = normalizar(historico);
  if (PALAVRAS_ARRENDAMENTO.test(h) && !/\bPARCERIA\b/.test(h)) {
    return {
      regra: 'RECEITA-ARRENDAMENTO',
      problema: (l) => `Receita de ${formatarReais(l.entrada)} com histórico de arrendamento/aluguel: "${l.historico}". Arrendamento ou aluguel recebido não é receita da atividade rural.`,
      comoCorrigir: `Retire do LCDPR e declare como rendimento de aluguel (carnê-leão mensal e ficha de rendimentos tributáveis). Aluguel ou arrendamento de máquinas, equipamentos agrícolas e pastagens está fora da atividade rural (IN SRF nº 83/2001, art. 4º, V). Se for PARCERIA (partilha de riscos e da produção), é atividade rural: confira o contrato e ajuste o histórico. Base: ${BASE_ATIVIDADE}.`,
    };
  }
  if (PALAVRAS_TERRA.test(h)) {
    return {
      regra: 'RECEITA-TERRA-NUA',
      problema: (l) => `Receita de ${formatarReais(l.entrada)} com histórico de venda de terra/imóvel: "${l.historico}". A venda da terra nua não é receita da atividade rural.`,
      comoCorrigir: `Retire o valor da terra nua do LCDPR e apure o ganho de capital (GCAP), com o imposto pago até o último dia útil do mês seguinte (IN SRF nº 83/2001, art. 9º, § 2º). Benfeitorias, culturas e pastagens vendidas junto podem ser receita rural: separe os valores pelo contrato. Base: ${BASE_ATIVIDADE}.`,
    };
  }
  if (PALAVRAS_IMOBILIZADO.test(h)) {
    return {
      regra: 'RECEITA-IMOBILIZADO',
      problema: (l) => `Receita de ${formatarReais(l.entrada)} com histórico de venda de bem do imobilizado: "${l.historico}". Só é receita rural se o bem era usado exclusivamente na atividade.`,
      comoCorrigir: `Confirme o uso do bem. Bem usado exclusivamente na atividade rural: a venda é receita rural (IN SRF nº 83/2001, art. 5º, § 2º, III), comprovada por documento com nome, CPF/CNPJ e endereço do comprador (art. 6º, parágrafo único). Veículo ou bem de uso particular: retire do LCDPR e apure ganho de capital. Base: ${BASE_ATIVIDADE}.`,
    };
  }
  return null;
}

function validarRiscos(a: ArquivoLcdpr, add: Add): void {
  const lancs = a.lancamentos;

  for (const l of lancs) {
    const base = { categoria: 'Risco' as const, linha: l.linha, registro: 'Q100' };

    // ---- Sem documento ----
    if (!l.numDoc) {
      const despesa = l.tipoLanc === '2';
      add({
        ...base, severidade: 'alerta', regra: 'SEM-DOCUMENTO', campo: 'NUM_DOC',
        problema: `${despesa ? 'Despesa' : 'Lançamento'} de ${formatarReais(l.entrada || l.saida)} sem número de documento.`,
        comoCorrigir: despesa
          ? 'NUM_DOC não é obrigatório no leiaute, mas a despesa precisa ser comprovada por documento idôneo (nota fiscal, fatura, recibo, contrato, folha de pagamento) que identifique o beneficiário, o valor e a data; sem ele, a despesa pode ser glosada (IN SRF nº 83/2001, arts. 10 e 22, § 1º). Informe o número do documento.'
          : 'NUM_DOC não é obrigatório no leiaute, mas a receita deve ser comprovada por documento usual da atividade (nota fiscal de produtor, nota fiscal de entrada), conforme a IN SRF nº 83/2001, art. 6º. Informe o número sempre que houver documento.',
      });
    }

    // ---- Receita lançada como rural que pode não ser ----
    if (ehReceita(l) && l.entrada > 0) {
      const naoRural = receitaNaoRural(l.historico);
      if (naoRural) add({ ...base, severidade: 'alerta', regra: naoRural.regra, campo: 'HIST', problema: naoRural.problema(l), comoCorrigir: naoRural.comoCorrigir });
    }

    // ---- Valor redondo alto ----
    const valor = l.entrada || l.saida;
    if (valor >= VALOR_REDONDO_MINIMO && valor % VALOR_REDONDO_MULTIPLO === 0) {
      add({
        ...base, severidade: 'info', regra: 'VALOR-REDONDO', campo: l.entrada ? 'VL_ENTRADA' : 'VL_SAIDA',
        problema: `Valor redondo alto: ${formatarReais(valor)} (múltiplo exato de R$ 1.000,00).`,
        comoCorrigir: 'Operações reais com nota fiscal raramente dão valor exato. Valor redondo costuma ser adiantamento, transferência entre contas, retirada ou estimativa. Confira se há documento que comprove a operação e se ela é mesmo da atividade rural.',
      });
    }

    // ---- Histórico genérico ----
    const h = normalizar(l.historico);
    if (h.length < 4 || HISTORICOS_GENERICOS.has(h)) {
      add({
        ...base, severidade: 'alerta', regra: 'HIST-GENERICO', campo: 'HIST',
        problema: `Histórico genérico: "${l.historico}".`,
        comoCorrigir: 'Descreva a operação (o quê, quantidade, referência). Histórico vago dificulta comprovar a natureza rural da receita ou despesa.',
      });
    }

    // ---- Fim de semana / feriado ----
    const naoUtil = diaNaoUtil(l.data);
    if (naoUtil) {
      add({
        ...base, severidade: 'info', regra: 'DIA-NAO-UTIL', campo: 'DATA',
        problema: `Lançamento em ${formatarDataIso(l.data.iso)} (${naoUtil}).`,
        comoCorrigir: 'Pode ser legítimo (PIX, cartão). Confira se a data é a do efetivo pagamento ou recebimento.',
      });
    }
  }

  // ---- Valores atípicos por natureza (tipo de lançamento) ----
  // Critério: Tukey sobre o logaritmo do valor (valores do agro são muito
  // assimétricos), limite = Q3 + 2 x IQR. Só com 20 ou mais lançamentos do tipo.
  for (const tipo of Object.keys(TIPO_LANC)) {
    const doTipo = lancs.filter((l) => l.tipoLanc === tipo && (l.entrada || l.saida) > 0);
    if (doTipo.length < 20) continue;
    const logs = doTipo.map((l) => Math.log10(l.entrada || l.saida)).sort((x, y) => x - y);
    const q1 = quantil(logs, 0.25);
    const q3 = quantil(logs, 0.75);
    const limite = q3 + 2 * (q3 - q1);
    const mediana = Math.round(10 ** quantil(logs, 0.5));
    for (const l of doTipo) {
      const v = l.entrada || l.saida;
      if (Math.log10(v) > limite) {
        add({
          severidade: 'info', categoria: 'Risco', regra: 'VALOR-ATIPICO', linha: l.linha, registro: 'Q100', campo: l.entrada ? 'VL_ENTRADA' : 'VL_SAIDA',
          problema: `Valor atípico para "${TIPO_LANC[tipo]}": ${formatarReais(v)} (valor típico deste tipo: ${formatarReais(mediana)}).`,
          comoCorrigir: 'Confira o documento. Valores muito acima do padrão concentram o risco de questionamento e de erro de digitação.',
        });
      }
    }
  }

  // ---- Concentração em poucos participantes ----
  for (const [rotulo, filtro] of [
    ['receitas', ehReceita],
    ['despesas', (l: Lancamento) => l.tipoLanc === '2'],
  ] as const) {
    const grupo = lancs.filter(filtro);
    const total = grupo.reduce((s, l) => s + l.entrada + l.saida, 0);
    if (total === 0 || grupo.length < 5) continue;
    const porPartic = new Map<string, number>();
    for (const l of grupo) porPartic.set(l.idPartic, (porPartic.get(l.idPartic) ?? 0) + l.entrada + l.saida);
    const [maior] = [...porPartic.entries()].sort((x, y) => y[1] - x[1]);
    if (maior && maior[1] / total > 0.5) {
      const participacao = Math.round((maior[1] / total) * 10000);
      add({
        severidade: 'info', categoria: 'Risco', regra: 'CONCENTRACAO', linha: null, registro: 'Q100', campo: 'ID_PARTIC',
        problema: `${pct(participacao)} das ${rotulo} (${formatarReais(maior[1])}) estão concentradas em um único participante (${formatarCpfCnpj(maior[0])}).`,
        comoCorrigir: 'É comum no agro (venda para uma única trading), mas aumenta a dependência e o impacto de um erro de cadastro. Confirme o CPF/CNPJ e os contratos.',
      });
    }
  }

  // ---- Duplicidade provável: mesma data, mesmo valor e mesmo participante (documento diferente ou vazio) ----
  // Complementa a regra abaixo (mesmo documento): pega o lançamento repetido com outro número ou sem número.
  const porParticipante = new Map<string, Lancamento>();
  for (const l of lancs) {
    if (!l.idPartic) continue;
    const chave = `${l.data.iso}|${l.entrada}|${l.saida}|${l.idPartic}`;
    const primeira = porParticipante.get(chave);
    if (primeira && primeira.numDoc.toUpperCase() !== l.numDoc.toUpperCase()) {
      add({
        severidade: 'alerta', categoria: 'Risco', regra: 'DUPLICIDADE-PARTICIPANTE', linha: l.linha, registro: 'Q100', campo: 'ID_PARTIC',
        problema: `Possível duplicidade: mesma data, mesmo valor (${formatarReais(l.entrada || l.saida)}) e mesmo participante (${formatarCpfCnpj(l.idPartic)}) da linha ${primeira.linha}, com documento ${l.numDoc ? `"${l.numDoc}"` : 'vazio'}${primeira.numDoc ? ` (lá: "${primeira.numDoc}")` : ''}.`,
        comoCorrigir: 'Pode ser legítimo (duas notas iguais no mesmo dia), mas é o padrão típico de lançamento em dobro. Confira os documentos; se for repetição, exclua um e gere o arquivo novamente.',
      });
    } else if (!primeira) {
      porParticipante.set(chave, l);
    }
  }

  // ---- Duplicidade provável: mesma data, mesmo valor e mesmo documento ----
  const vistos = new Map<string, number>();
  for (const l of lancs) {
    if (!l.numDoc) continue;
    const chave = `${l.data.iso}|${l.entrada}|${l.saida}|${l.numDoc.toUpperCase()}`;
    const primeira = vistos.get(chave);
    if (primeira !== undefined) {
      add({
        severidade: 'alerta', categoria: 'Risco', regra: 'DUPLICIDADE', linha: l.linha, registro: 'Q100', campo: 'NUM_DOC',
        problema: `Provável duplicidade: mesma data, valor (${formatarReais(l.entrada || l.saida)}) e documento "${l.numDoc}" da linha ${primeira}.`,
        comoCorrigir: 'Confirme se são duas operações distintas (ex.: parcelas). Se for lançamento em dobro, exclua um e gere o arquivo novamente.',
      });
    } else {
      vistos.set(chave, l.linha);
    }
  }
}

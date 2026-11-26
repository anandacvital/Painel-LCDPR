/**
 * DO LCDPR PARA A DIRPF: valores da ficha "Atividade Rural" de um produtor.
 *
 * Por que existe: a contadora digita na declaração (programa IRPF) os mesmos
 * números que já estão no Livro Caixa. Esta ficha monta esses números do jeito
 * que o programa pede, para conferir campo a campo antes de transmitir:
 *  - Identificação dos imóveis (do registro 0040);
 *  - Receitas e despesas MÊS A MÊS (regime de caixa, Lei nº 8.023/1990, art. 4º);
 *  - Apuração do resultado: resultado, prejuízo anterior compensado, opção pelos
 *    20% da receita bruta (art. 5º) e prejuízo que fica para o ano seguinte (art. 14).
 *
 * Regras:
 *  - Só o REALIZADO do arquivo (nunca projeção): a declaração é do ano fechado.
 *  - Um CPF por ficha: cada condômino/parceiro declara a sua parte (art. 13).
 *  - Prejuízo anterior: encadeado pelos anos carregados + o saldo informado pela
 *    pessoa na aba Planejamento (o mesmo número usado lá).
 *  - Nada aqui substitui o programa da Receita: os nomes dos campos podem mudar
 *    de um ano para outro; o painel aponta os valores, a pessoa confere.
 *
 * Tudo em centavos inteiros (ver dinheiro.ts).
 */
import type { Centavos } from './dinheiro';
import { mensal, valorReceita } from './agregacoes';
import { planejarProdutor } from './planejamento';
import { receitaNaoRural } from '../parser/validacoes';
import type { ArquivoLcdpr } from '../parser/modelo';

/**
 * Condição de exploração na DIRPF a partir do TIPO_EXPLORACAO do 0040.
 * O "1 = exploração individual" do LCDPR não diz se o imóvel é próprio:
 * a DIRPF pergunta a condição (proprietário, arrendatário...), por isso vai como sugestão.
 */
const CONDICAO_DIRPF: Record<string, { condicao: string; conferir: boolean }> = {
  '1': { condicao: 'Proprietário', conferir: true },
  '2': { condicao: 'Condômino', conferir: false },
  '3': { condicao: 'Arrendatário', conferir: false },
  '4': { condicao: 'Parceiro', conferir: false },
  '5': { condicao: 'Comodatário', conferir: false },
  '6': { condicao: 'Outros', conferir: true },
};

const TIPO_EXPLORACAO_LCDPR: Record<string, string> = {
  '1': 'exploração individual',
  '2': 'condomínio',
  '3': 'imóvel arrendado',
  '4': 'parceria',
  '5': 'comodato',
  '6': 'outros',
};

export interface ImovelDirpf {
  codigo: string;
  nome: string;
  /** NIRF/CIB do 0040 (CAD_ITR). */
  nirf: string;
  caepf: string;
  uf: string;
  codMun: string;
  /** Percentual em centésimos (10000 = 100,00%). null = não informado. */
  participacao: number | null;
  condicao: string;
  /** true quando a condição é só uma sugestão (o LCDPR não traz a informação exata). */
  condicaoConferir: boolean;
  tipoExploracaoLcdpr: string;
}

export interface MesDirpf {
  /** "AAAA-MM" */
  mes: string;
  receitaBruta: Centavos;
  despesas: Centavos;
}

/** Receita que talvez não seja rural (palavras do histórico): conferir antes de declarar. */
export interface ReceitaParaConferir {
  linha: number;
  data: string;
  valor: Centavos;
  historico: string;
  regra: string;
}

export interface FichaDirpf {
  cpf: string;
  nome: string;
  anoCalendario: number;
  /** Exercício da declaração = ano seguinte ao ano-calendário. */
  exercicio: number;
  /** Arquivo termina antes de 31/12: a ficha NÃO serve para a declaração ainda. */
  previa: { fim: string } | null;
  imoveis: ImovelDirpf[];
  meses: MesDirpf[];
  receitaBruta: Centavos;
  despesas: Centavos;
  /** Resultado I = receita bruta − despesas de custeio e investimentos. */
  resultado: Centavos;
  /** Saldo de prejuízo de anos anteriores no início do ano. */
  prejuizoAnterior: Centavos;
  /** Anos sem arquivo no painel entre o primeiro carregado e este (o saldo pode estar incompleto). */
  lacunasPrejuizo: number[];
  /** Pelo resultado real (Livro Caixa). */
  real: { prejuizoCompensado: Centavos; resultadoTributavel: Centavos; prejuizoACompensar: Centavos; imposto: Centavos };
  /** Pela opção dos 20% da receita bruta (só cabe com resultado positivo). */
  vinteporcento: { cabivel: boolean; resultadoTributavel: Centavos; prejuizoACompensar: Centavos; prejuizoPerdido: Centavos; imposto: Centavos };
  /** Opção de menor imposto estimado (a decisão é da pessoa, no programa). */
  opcaoSugerida: 'real' | 'vinteporcento';
  /** Receita de lançamentos tipo 3 (adiantamentos de anos anteriores entregues neste ano). */
  receitasTipo3: Centavos;
  receitasParaConferir: ReceitaParaConferir[];
  avisos: string[];
}

const dataBR = (iso: string): string => iso.split('-').reverse().join('/');

/**
 * Monta a ficha de UM produtor.
 * @param arquivos arquivos carregados DESTE produtor (qualquer ano; os anteriores formam o prejuízo)
 * @param ano ano-calendário da declaração
 * @param prejuizoInicial prejuízo acumulado ANTES do primeiro ano carregado (informado pela pessoa)
 */
export function montarFicha(arquivos: readonly ArquivoLcdpr[], ano: number, prejuizoInicial: Centavos = 0): FichaDirpf | null {
  const doAno = arquivos.find((a) => a.anoBase === ano);
  const plano = planejarProdutor(arquivos, ano, { prejuizoInicial, usarProjecao: false });
  if (!doAno || !plano) return null;
  const r = plano.irpf;

  const imoveis: ImovelDirpf[] = doAno.imoveis.map((i) => {
    const c = CONDICAO_DIRPF[i.tipoExploracao] ?? { condicao: 'Outros', conferir: true };
    return {
      codigo: i.codigo,
      nome: i.nome,
      nirf: i.cadItr,
      caepf: i.caepf,
      uf: i.uf,
      codMun: i.codMun,
      participacao: i.participacao,
      condicao: c.condicao,
      condicaoConferir: c.conferir,
      tipoExploracaoLcdpr: TIPO_EXPLORACAO_LCDPR[i.tipoExploracao] ?? i.tipoExploracao,
    };
  });

  const meses = mensal(doAno.lancamentos, ano).map((m) => ({ mes: m.mes, receitaBruta: m.receitas, despesas: m.despesas }));
  const receitasTipo3 = doAno.lancamentos.filter((l) => l.tipoLanc === '3').reduce((s, l) => s + valorReceita(l), 0);
  const receitasParaConferir: ReceitaParaConferir[] = doAno.lancamentos.flatMap((l) => {
    if ((l.tipoLanc !== '1' && l.tipoLanc !== '3') || l.entrada <= 0) return [];
    const s = receitaNaoRural(l.historico);
    return s ? [{ linha: l.linha, data: l.data.iso, valor: l.entrada, historico: l.historico, regra: s.regra }] : [];
  });

  const real = {
    prejuizoCompensado: r.real.prejuizoCompensado,
    resultadoTributavel: r.real.base,
    prejuizoACompensar: r.real.prejuizoRemanescente,
    imposto: r.real.impostoEstimado,
  };
  const vinteporcento = {
    cabivel: r.presumido.cabivel,
    resultadoTributavel: r.presumido.base,
    // Quem opta pelos 20% perde todo o prejuízo (Lei nº 8.023/1990, art. 16, parágrafo único).
    prejuizoACompensar: 0,
    prejuizoPerdido: r.presumido.prejuizoPerdido,
    imposto: r.presumido.impostoEstimado,
  };
  const opcaoSugerida = r.maisVantajosa === 'presumido' ? 'vinteporcento' : 'real';

  const avisos: string[] = [];
  if (plano.previa) {
    avisos.push(`O arquivo vai só até ${dataBR(plano.previa.fim)}: é uma prévia. Não use estes valores na declaração; carregue o LCDPR do ano completo.`);
  }
  if (plano.prejuizo.lacunas.length) {
    avisos.push(`Faltam no painel os arquivos de ${plano.prejuizo.lacunas.join(', ')}: o prejuízo anterior pode estar incompleto. Confira com a declaração do ano passado (ficha Atividade Rural, prejuízo a compensar).`);
  }
  if (receitasParaConferir.length) {
    avisos.push(`${receitasParaConferir.length} receita(s) com histórico de arrendamento, aluguel ou venda de terra/bem: confira antes de declarar. Se não forem da atividade rural, saem da ficha e vão para aluguéis ou ganho de capital (o Validador explica cada uma).`);
  }
  if (receitasTipo3 > 0) {
    avisos.push('Há receita de adiantamento de ano anterior entregue neste ano (tipo 3): ela entra na receita deste ano, o da entrega (Perguntas e Respostas do LCDPR, pergunta 31). Confira se não foi declarada também no ano do recebimento.');
  }
  if (imoveis.some((i) => i.condicaoConferir)) {
    avisos.push('A condição de exploração "Proprietário" é sugestão: o LCDPR diz "exploração individual", que também vale para imóvel de terceiros sem contrato. Confira cada imóvel.');
  }
  avisos.push('A área (ha) dos imóveis, a movimentação do rebanho, os bens e as dívidas da atividade rural não estão no LCDPR: preencha pelas outras fontes (matrícula/CCIR, controle do rebanho, inventário de bens e contratos).');

  return {
    cpf: plano.cpf,
    nome: plano.nome,
    anoCalendario: ano,
    exercicio: ano + 1,
    previa: plano.previa ? { fim: plano.previa.fim } : null,
    imoveis,
    meses,
    receitaBruta: r.receitaBruta,
    despesas: r.despesas,
    resultado: r.resultado,
    prejuizoAnterior: plano.prejuizo.saldoNoInicio,
    lacunasPrejuizo: plano.prejuizo.lacunas,
    real,
    vinteporcento,
    opcaoSugerida,
    receitasTipo3,
    receitasParaConferir,
    avisos,
  };
}

/** Base legal citada na tela e no relatório da ficha. */
export const BASE_LEGAL_DIRPF: readonly { item: string; base: string }[] = [
  { item: 'Receitas e despesas pelo regime de caixa, mês a mês', base: 'Lei nº 8.023/1990, art. 4º; IN SRF nº 83/2001, arts. 5º a 10' },
  { item: 'Opção pelos 20% da receita bruta', base: 'Lei nº 8.023/1990, art. 5º; IN SRF nº 83/2001, art. 11, § 5º' },
  { item: 'Compensação do prejuízo, sem limite de 30%', base: 'Lei nº 8.023/1990, art. 14; IN SRF nº 83/2001, art. 11, §§ 1º e 2º' },
  { item: 'Quem opta pelos 20% perde o prejuízo acumulado', base: 'Lei nº 8.023/1990, art. 16, parágrafo único' },
  { item: 'Cada condômino ou parceiro declara a sua parte', base: 'Lei nº 8.023/1990, art. 13; Perguntas e Respostas do LCDPR, perguntas 47 e 52' },
];

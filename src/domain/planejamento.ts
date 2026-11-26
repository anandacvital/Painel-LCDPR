/**
 * PLANEJAMENTO DO IRPF DA ATIVIDADE RURAL, POR PRODUTOR (CPF).
 *
 * O IRPF é de cada pessoa: condôminos e parceiros tributam separadamente, cada
 * um sobre a sua parte (Lei nº 8.023/1990, art. 13). Por isso o planejamento é
 * feito produtor a produtor, sempre com o arquivo de cada CPF, nunca com a soma
 * consolidada dos produtores.
 *
 * Para cada produtor e ano:
 * 1. Prejuízo a compensar: começa no saldo informado pela usuária (anos que não
 *    estão no painel) e é encadeado pelos arquivos carregados, supondo apuração
 *    pelo RESULTADO REAL nos anos anteriores (quem optou pelos 20% perdeu o saldo:
 *    art. 16, parágrafo único; nesse caso a usuária informa saldo zero).
 * 2. Base do ano: realizado, ou PROJEÇÃO até dezembro quando o arquivo é uma
 *    prévia (projetarAno, pelo perfil do ano anterior).
 * 3. Real x 20% (calcularIrpf), ponto de equilíbrio e simulação "e se".
 * 4. Obrigatoriedade do LCDPR pela receita bruta.
 */
import { mensal, totalizar } from './agregacoes';
import { formatarReais, type Centavos } from './dinheiro';
import {
  calcularIrpf,
  impostoProgressivo,
  pontoEquilibrio,
  projetarAno,
  simular,
  tabelaDoAno,
  type EntradaIrpf,
  type Projecao,
  type ResultadoIrpf,
  type ResultadoSimulacao,
} from './irpf';
import type { ArquivoLcdpr } from '../parser/modelo';

/**
 * Limite de receita bruta da atividade rural acima do qual o LCDPR é obrigatório:
 * IN SRF nº 83/2001, art. 23-A, na redação da IN RFB nº 1.903/2019 (R$ 4.800.000,00).
 * Abaixo do limite a entrega é opcional (§ 4º). Prazo: o da DIRPF do ano (§ 3º).
 */
export const LIMITE_OBRIGATORIEDADE_LCDPR: Centavos = 480_000_000;

export interface Previa {
  /** Data final do arquivo (AAAA-MM-DD). */
  fim: string;
  /** Mês da data final (1 a 12). */
  ateMes: number;
}

/** Prévia: arquivo sem situação especial com data final antes de 31/12 (a mais tardia entre os arquivos). */
export function detectarPrevia(arquivos: readonly ArquivoLcdpr[]): Previa | null {
  const finais = arquivos
    .filter((a) => (a.abertura?.sitEspecial || '0') === '0')
    .map((a) => a.abertura?.dtFin)
    .filter((d): d is NonNullable<typeof d> => !!d && !(d.mes === 12 && d.dia === 31));
  if (finais.length === 0) return null;
  const fim = finais.map((d) => d.iso).sort().at(-1)!;
  return { fim, ateMes: Number(fim.slice(5, 7)) };
}

/** Meses COMPLETOS da prévia: se o arquivo termina no meio do mês, aquele mês ainda não fechou. */
export function mesesFechados(p: Previa): number {
  const [ano, mes, dia] = p.fim.split('-').map(Number) as [number, number, number];
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia === ultimoDia ? mes : mes - 1;
}

// ---------------------------------------------------------------------------
// Prejuízo a compensar (Lei nº 8.023/1990, art. 14)
// ---------------------------------------------------------------------------

export interface LinhaPrejuizo {
  ano: number;
  saldoInicial: Centavos;
  resultado: Centavos;
  /** Prejuízo usado para abater o resultado positivo do ano. */
  compensado: Centavos;
  /** Prejuízo gerado no próprio ano (resultado negativo). */
  gerado: Centavos;
  saldoFinal: Centavos;
}

export interface CadeiaPrejuizo {
  linhas: LinhaPrejuizo[];
  /** Saldo disponível no início do ano planejado. */
  saldoNoInicio: Centavos;
  /** Anos entre o primeiro carregado e o planejado que NÃO estão no painel. */
  lacunas: number[];
}

/**
 * Encadeia o saldo de prejuízo pelos anos ANTERIORES ao planejado, supondo
 * apuração pelo resultado real nesses anos.
 */
export function encadearPrejuizo(resultados: readonly { ano: number; resultado: Centavos }[], saldoInicial: Centavos, anoPlanejado: number): CadeiaPrejuizo {
  const anteriores = [...resultados].filter((r) => r.ano < anoPlanejado).sort((a, b) => a.ano - b.ano);
  let saldo = Math.max(0, saldoInicial);
  const linhas: LinhaPrejuizo[] = [];
  for (const r of anteriores) {
    const compensado = r.resultado > 0 ? Math.min(saldo, r.resultado) : 0;
    const gerado = r.resultado < 0 ? -r.resultado : 0;
    const saldoFinal = saldo - compensado + gerado;
    linhas.push({ ano: r.ano, saldoInicial: saldo, resultado: r.resultado, compensado, gerado, saldoFinal });
    saldo = saldoFinal;
  }
  const lacunas: number[] = [];
  if (anteriores.length > 0) {
    for (let a = anteriores[0]!.ano + 1; a < anoPlanejado; a++) {
      if (!anteriores.some((r) => r.ano === a)) lacunas.push(a);
    }
  }
  return { linhas, saldoNoInicio: saldo, lacunas };
}

// ---------------------------------------------------------------------------
// Plano de um produtor
// ---------------------------------------------------------------------------

export interface OpcoesPlano {
  /** Prejuízo acumulado ANTES do primeiro ano carregado no painel (informado pela usuária). */
  prejuizoInicial?: Centavos;
  /** Na prévia: true = usar a projeção até dezembro (padrão); false = só o realizado. */
  usarProjecao?: boolean;
  anteciparDespesas?: Centavos;
  postergarReceitas?: Centavos;
}

export interface PlanoProdutor {
  cpf: string;
  nome: string;
  ano: number;
  previa: Previa | null;
  /** Totais realizados no arquivo do ano. */
  realizado: { receitas: Centavos; despesas: Centavos; resultado: Centavos };
  /** Projeção até dezembro (só na prévia). */
  projecao: Projecao | null;
  /** O que entrou no cálculo: realizado ou projetado. */
  usaProjecao: boolean;
  entrada: EntradaIrpf;
  irpf: ResultadoIrpf;
  /** Despesa a mais que faz o resultado real empatar com os 20%. */
  equilibrio: Centavos;
  simulacao: ResultadoSimulacao;
  prejuizo: CadeiaPrejuizo;
  tabela: { anoTabela: number; exata: boolean };
  obrigatoriedade: { receitaBruta: Centavos; obrigado: boolean };
}

/**
 * @param arquivos todos os arquivos carregados DESTE produtor (qualquer ano)
 * @param ano ano-calendário planejado
 */
export function planejarProdutor(arquivos: readonly ArquivoLcdpr[], ano: number, o: OpcoesPlano = {}): PlanoProdutor | null {
  const doAno = arquivos.find((a) => a.anoBase === ano);
  if (!doAno) return null;
  const cpf = doAno.abertura?.cpf ?? '';
  const nome = doAno.abertura?.nome || doAno.nomeArquivo;

  const t = totalizar(doAno.lancamentos);
  const previa = detectarPrevia([doAno]);

  // Projeção até dezembro, pelo perfil do ano anterior quando ele está carregado e completo.
  let projecao: Projecao | null = null;
  if (previa) {
    const anterior = arquivos.find((a) => a.anoBase === ano - 1 && !detectarPrevia([a]));
    projecao = projetarAno(mensal(doAno.lancamentos, ano), mesesFechados(previa), anterior ? mensal(anterior.lancamentos, ano - 1) : undefined);
  }
  const usaProjecao = projecao !== null && (o.usarProjecao ?? true);
  const receitaBruta = usaProjecao ? projecao!.receitaBruta : t.receitas;
  const despesas = usaProjecao ? projecao!.despesas : t.despesas;

  // Prejuízo: anos anteriores carregados, cada um pelo seu resultado realizado.
  const resultados = arquivos
    .filter((a) => a.anoBase !== null && a.anoBase < ano)
    .map((a) => ({ ano: a.anoBase!, resultado: totalizar(a.lancamentos).resultado }));
  const prejuizo = encadearPrejuizo(resultados, o.prejuizoInicial ?? 0, ano);

  const entrada: EntradaIrpf = { receitaBruta, despesas, prejuizoAnterior: prejuizo.saldoNoInicio, ano };
  const { anoTabela, exata } = tabelaDoAno(ano);
  return {
    cpf,
    nome,
    ano,
    previa,
    realizado: { receitas: t.receitas, despesas: t.despesas, resultado: t.resultado },
    projecao,
    usaProjecao,
    entrada,
    irpf: calcularIrpf(entrada),
    equilibrio: pontoEquilibrio(entrada),
    simulacao: simular(entrada, { anteciparDespesas: o.anteciparDespesas ?? 0, postergarReceitas: o.postergarReceitas ?? 0 }),
    prejuizo,
    tabela: { anoTabela, exata },
    obrigatoriedade: { receitaBruta, obrigado: receitaBruta > LIMITE_OBRIGATORIEDADE_LCDPR },
  };
}

/** Frase de ponto de equilíbrio / efeito de antecipar despesas (tela e relatório). */
export function textoEquilibrio(p: PlanoProdutor): string {
  const r = p.irpf;
  if (r.resultado <= 0) return 'Com resultado negativo, antecipar despesas só aumenta o prejuízo a compensar no futuro; não há imposto a reduzir neste ano.';
  if (p.equilibrio > 0) {
    return `A opção pelos 20% é a melhor hoje. Antecipar despesas NÃO reduz o imposto até o resultado real cair abaixo de 20% da receita: seria preciso pagar mais ${formatarReais(p.equilibrio)} de despesas até 31/12 só para empatar. Abaixo disso, o dinheiro gasto não traz economia de IRPF.`;
  }
  if (r.real.base === 0) return 'O prejuízo compensado já zera a base pelo resultado real: antecipar despesas não reduz o imposto deste ano (só aumenta o prejuízo para os próximos).';
  // Real já é o melhor: quanto cada R$ 10 mil de despesa a mais reduz o imposto.
  const passo = 1_000_000;
  const economia = impostoProgressivo(r.real.base, p.ano) - impostoProgressivo(Math.max(0, r.real.base - passo), p.ano);
  return `O resultado real já é a melhor opção. Cada ${formatarReais(passo)} de despesa necessária paga até 31/12 reduz cerca de ${formatarReais(economia)} de imposto estimado.`;
}

/** Imposto estimado da opção mais vantajosa (o que a pessoa pagaria escolhendo bem). */
export function melhorImposto(r: ResultadoIrpf): Centavos {
  return r.maisVantajosa === 'presumido' ? r.presumido.impostoEstimado : r.real.impostoEstimado;
}

// ---------------------------------------------------------------------------
// Cuidados (checklist com base legal)
// ---------------------------------------------------------------------------

export const CUIDADOS: readonly { titulo: string; texto: string; base: string }[] = [
  {
    titulo: 'Regime de caixa',
    texto: 'Só conta o que foi efetivamente recebido ou pago até 31/12. Nota emitida em dezembro e paga em janeiro é despesa do ano seguinte.',
    base: 'Lei nº 8.023/1990, art. 4º',
  },
  {
    titulo: 'Investimento é despesa no pagamento',
    texto: 'Máquinas, benfeitorias, formação de culturas e reprodutores entram como despesa no mês em que forem pagos, desde que destinados à atividade rural.',
    base: 'Lei nº 8.023/1990, art. 4º, § 2º',
  },
  {
    titulo: 'Documentação em nome do produtor',
    texto: 'Despesa sem nota fiscal ou recibo em nome do produtor (ou do condomínio, com o rateio) não se sustenta numa fiscalização. Guarde os comprovantes pelo prazo decadencial.',
    base: 'Lei nº 8.023/1990, art. 4º; IN SRF nº 83/2001',
  },
  {
    titulo: 'Opção pelos 20% da receita bruta',
    texto: 'Só vale para resultado positivo e é feita na declaração do ano. Quem opta perde TODO o prejuízo acumulado de anos anteriores.',
    base: 'Lei nº 8.023/1990, art. 5º e art. 16, parágrafo único',
  },
  {
    titulo: 'Compensação de prejuízo',
    texto: 'O prejuízo da atividade rural da pessoa física pode ser compensado com resultados positivos dos anos seguintes, sem o limite de 30% das empresas.',
    base: 'Lei nº 8.023/1990, art. 14',
  },
  {
    titulo: 'Condomínio e parceria',
    texto: 'Cada condômino ou parceiro escritura e tributa só a sua parte. Antecipar uma despesa comum exige o rateio pelos percentuais do contrato.',
    base: 'Lei nº 8.023/1990, art. 13; Perguntas e Respostas do LCDPR, perguntas 47 e 52',
  },
  {
    titulo: 'Adiantamento de venda futura',
    texto: 'Receita de produto entregue com adiantamento recebido em ano anterior é receita do ano da entrega (tipo 3 no LCDPR). Mudar a data de entrega muda o ano da receita, se o contrato permitir.',
    base: 'Perguntas e Respostas do LCDPR, pergunta 31',
  },
  {
    titulo: 'Substância econômica',
    texto: 'Antecipar compras ou adiar vendas só para pagar menos imposto, sem motivo econômico real (preço, prazo, necessidade da safra), pode ser desconsiderado pela Receita.',
    base: 'CTN, art. 116, parágrafo único',
  },
  {
    titulo: 'Tributação mínima de altas rendas',
    texto: 'A partir do ano-calendário 2026, quem recebe mais de R$ 600 mil no ano (somando todos os rendimentos, inclusive o resultado rural e rendimentos isentos) pode ter imposto adicional. O painel não calcula: confira na declaração completa.',
    base: 'Lei nº 9.250/1995, art. 16-A, incluído pela Lei nº 15.270/2025',
  },
  {
    titulo: 'Obrigatoriedade do LCDPR',
    texto: 'Obrigatório com receita bruta da atividade rural acima de R$ 4,8 milhões no ano; abaixo disso a entrega é opcional. Prazo: o mesmo da declaração do IRPF.',
    base: 'IN SRF nº 83/2001, art. 23-A, na redação da IN RFB nº 1.903/2019',
  },
];

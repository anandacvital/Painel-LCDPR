/**
 * INDICADORES DE GESTÃO E ALERTAS ACIONÁVEIS DO PAINEL.
 *
 * Tudo aqui é visão GERENCIAL (para o produtor decidir), calculada só com o que
 * o LCDPR traz. Nada aqui é exigência da Receita.
 *
 * - Filtro cruzado: clicar num mês, imóvel, participante ou natureza filtra o
 *   painel inteiro. Cada gráfico ignora o filtro da PRÓPRIA dimensão (como no
 *   Power BI), para continuar mostrando as outras opções, com a escolhida em destaque.
 * - Capital de giro: o pior ponto do caixa acumulado da atividade no período.
 * - Concentração de compradores: quanto da receita depende de poucos clientes.
 * - Despesas por natureza: ver naturezas.ts (classificação inferida).
 * - Alertas: frases curtas com uma ação (filtrar ou abrir uma aba).
 */
import { valorDespesa, valorReceita, type TotalMensal, type Totais } from './agregacoes';
import { nomeMes } from './destaques';
import { formatarReais, type Centavos } from './dinheiro';
import { LIMITE_OBRIGATORIEDADE_LCDPR } from './planejamento';
import { NOMES_CURTOS_NATUREZA, type Natureza, type OrigemNatureza } from './naturezas';
import { frenteA, somarMeses } from './periodo';
import type { Lancamento } from '../parser/modelo';

// ===========================================================================
// FILTRO CRUZADO
// ===========================================================================
export type Dimensao = 'mes' | 'imovel' | 'participante' | 'natureza';

/** Valores: mês "AAAA-MM"; imóvel "cpf|código"; participante CPF/CNPJ; natureza (naturezas.ts). */
export type FiltroCruzado = Partial<Record<Dimensao, string>>;

export const DIMENSOES: readonly Dimensao[] = ['mes', 'imovel', 'participante', 'natureza'];

/** Lançamento como o Painel usa: com o produtor e a natureza (só despesas têm). */
export interface LancamentoGestao extends Lancamento {
  cpf: string;
  natureza: Natureza | null;
  origemNatureza: OrigemNatureza | null;
}

export const filtroAtivo = (f: FiltroCruzado): boolean => DIMENSOES.some((d) => !!f[d]);

/**
 * Aplica o filtro. `exceto` ignora uma dimensão (o gráfico daquela dimensão
 * continua mostrando todas as barras, com a escolhida em destaque).
 */
export function aplicarFiltro<L extends LancamentoGestao>(lista: readonly L[], f: FiltroCruzado, exceto?: Dimensao): L[] {
  const usa = (d: Dimensao): string | undefined => (d === exceto ? undefined : f[d]);
  const mes = usa('mes');
  const imovel = usa('imovel');
  const participante = usa('participante');
  const natureza = usa('natureza');
  if (!mes && !imovel && !participante && !natureza) return [...lista];
  return lista.filter((l) =>
    (!mes || l.data.iso.startsWith(mes))
    && (!imovel || `${l.cpf}|${l.codImovel}` === imovel)
    && (!participante || l.idPartic === participante)
    && (!natureza || l.natureza === natureza));
}

/** O mesmo filtro 12 meses antes (para comparar com o período anterior). */
export function filtroAnterior(f: FiltroCruzado): FiltroCruzado {
  return f.mes ? { ...f, mes: somarMeses(f.mes, -12) } : { ...f };
}

// ===========================================================================
// CAPITAL DE GIRO
// ===========================================================================
export interface CapitalDeGiro {
  /** Quanto faltou no pior momento (positivo; 0 se o caixa nunca ficou negativo). */
  necessidade: Centavos;
  /** Mês do pior ponto ("AAAA-MM"), ou null. */
  mesPior: string | null;
  /** Meses em que o acumulado ficou negativo. */
  mesesNegativos: string[];
  /** Primeiro mês em que o acumulado voltou a ficar ≥ 0 depois do pior ponto (null se não voltou). */
  recuperacao: string | null;
}

/**
 * Necessidade de capital de giro da ATIVIDADE: o caixa acumulado começa em zero
 * no primeiro mês do período e soma receitas − despesas mês a mês. O pior ponto
 * negativo é quanto a atividade precisou de dinheiro de fora (saldo anterior,
 * crédito de custeio, recursos próprios). Não considera saldo inicial nem
 * financiamentos, que o LCDPR não traz como receita.
 */
export function capitalDeGiro(meses: readonly TotalMensal[]): CapitalDeGiro {
  let pior: TotalMensal | null = null;
  for (const m of meses) if (m.acumulado < 0 && (!pior || m.acumulado < pior.acumulado)) pior = m;
  const mesesNegativos = meses.filter((m) => m.acumulado < 0).map((m) => m.mes);
  let recuperacao: string | null = null;
  if (pior) {
    const depois = meses.slice(meses.indexOf(pior) + 1);
    recuperacao = depois.find((m) => m.acumulado >= 0)?.mes ?? null;
  }
  return { necessidade: pior ? -pior.acumulado : 0, mesPior: pior?.mes ?? null, mesesNegativos, recuperacao };
}

// ===========================================================================
// CONCENTRAÇÃO DE COMPRADORES
// ===========================================================================
export interface Concentracao {
  compradores: number;
  /** Maior comprador (CPF/CNPJ) e a parte dele na receita (fração). */
  maior: { id: string; valor: Centavos; parte: number } | null;
  /** Parte dos 3 maiores. */
  top3: number;
  /**
   * Índice Herfindahl-Hirschman (0 a 10.000): soma dos quadrados das partes em %.
   * Faixas de referência usuais em análise de concentração: < 1.500 baixa,
   * 1.500 a 2.500 moderada, > 2.500 alta.
   */
  hhi: number;
  nivel: 'baixa' | 'moderada' | 'alta' | 'sem-receita';
}

export function concentracaoCompradores(lancamentos: readonly Lancamento[]): Concentracao {
  const porComprador = new Map<string, number>();
  for (const l of lancamentos) {
    const r = valorReceita(l);
    if (r !== 0) porComprador.set(l.idPartic, (porComprador.get(l.idPartic) ?? 0) + r);
  }
  const lista = [...porComprador.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = lista.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return { compradores: 0, maior: null, top3: 0, hhi: 0, nivel: 'sem-receita' };
  const hhi = Math.round(lista.reduce((s, [, v]) => s + ((v / total) * 100) ** 2, 0));
  const [id, valor] = lista[0]!;
  return {
    compradores: lista.length,
    maior: { id, valor, parte: valor / total },
    top3: lista.slice(0, 3).reduce((s, [, v]) => s + v, 0) / total,
    hhi,
    nivel: hhi > 2500 ? 'alta' : hhi >= 1500 ? 'moderada' : 'baixa',
  };
}

// ===========================================================================
// DESPESAS POR NATUREZA
// ===========================================================================
export interface TotalNatureza {
  natureza: Natureza;
  valor: Centavos;
  /** Fração do total de despesas. */
  parte: number;
  /** Parte deste valor que veio de dedução pelo participante ou de nenhuma regra (menos confiável). */
  inferidoFraco: Centavos;
}

export function despesasPorNatureza(lancamentos: readonly LancamentoGestao[]): TotalNatureza[] {
  const m = new Map<Natureza, { valor: number; fraco: number }>();
  for (const l of lancamentos) {
    if (!l.natureza) continue;
    const v = valorDespesa(l);
    const g = m.get(l.natureza) ?? { valor: 0, fraco: 0 };
    g.valor += v;
    if (l.origemNatureza === 'participante' || l.origemNatureza === 'sem-regra') g.fraco += v;
    m.set(l.natureza, g);
  }
  const total = [...m.values()].reduce((s, g) => s + Math.max(0, g.valor), 0);
  return [...m.entries()]
    .map(([natureza, g]) => ({ natureza, valor: g.valor, parte: total > 0 ? Math.max(0, g.valor) / total : 0, inferidoFraco: g.fraco }))
    .filter((g) => g.valor !== 0)
    .sort((a, b) => (a.natureza === 'outras' ? 1 : b.natureza === 'outras' ? -1 : b.valor - a.valor));
}

// ===========================================================================
// ALERTAS ACIONÁVEIS
// ===========================================================================
export type NivelAlerta = 'risco' | 'atencao' | 'oportunidade' | 'info';

export type AcaoAlerta =
  | { tipo: 'filtro'; rotulo: string; filtro: FiltroCruzado }
  | { tipo: 'aba'; rotulo: string; aba: 'executiva' | 'fluxo' | 'receitas' | 'imoveis' | 'comparativo' | 'planejamento' | 'detalhamento' };

export interface Alerta {
  id: string;
  nivel: NivelAlerta;
  titulo: string;
  texto: string;
  acao?: AcaoAlerta;
}

export interface EntradaAlertas {
  meses: readonly TotalMensal[];
  totais: Totais;
  anterior: { totais: Totais; naturezas: readonly TotalNatureza[] } | null;
  /** "ano anterior", "safra anterior"... */
  vs: string;
  lancamentos: readonly LancamentoGestao[];
  naturezas: readonly TotalNatureza[];
  /** Imóveis com nome e resultado (sem o código 000 de rateio). */
  imoveis: readonly { chave: string; nome: string; resultado: Centavos; receitas: Centavos }[];
  /** Ano civil (para obrigatoriedade e planejamento); null em safra ou período livre. */
  anoCivil: { ano: number; previaAteMes: number | null } | null;
  formatarDoc: (id: string) => string;
  /** Nome do produtor pelo CPF (alertas por produtor, como a obrigatoriedade do LCDPR). */
  nomeProdutor?: (cpf: string) => string;
}

const ORDEM_NIVEL: Record<NivelAlerta, number> = { risco: 0, atencao: 1, oportunidade: 2, info: 3 };
const pct = (f: number): string => `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Alertas em ordem de importância (risco primeiro). */
export function gerarAlertas(e: EntradaAlertas): Alerta[] {
  const a: Alerta[] = [];

  // 1. Caixa da atividade negativo: precisa de capital de giro.
  const cg = capitalDeGiro(e.meses);
  if (cg.necessidade > 0 && cg.mesPior) {
    const de = nomeMes(cg.mesesNegativos[0]!);
    const ate = nomeMes(cg.mesesNegativos.at(-1)!);
    a.push({
      id: 'capital-giro',
      nivel: 'risco',
      titulo: `A atividade precisou de ${formatarReais(cg.necessidade)} de capital de giro`,
      texto: `O caixa acumulado ficou negativo ${cg.mesesNegativos.length === 1 ? `em ${de}` : `de ${de} a ${ate}`}, com o pior ponto em ${nomeMes(cg.mesPior)}. ${cg.recuperacao ? `Voltou ao positivo em ${nomeMes(cg.recuperacao)}.` : 'Não voltou ao positivo no período.'} Programe crédito de custeio ou reserva para esse intervalo.`,
      acao: { tipo: 'aba', rotulo: 'Ver fluxo de caixa', aba: 'fluxo' },
    });
  }

  // 2. Receita concentrada em um comprador.
  const c = concentracaoCompradores(e.lancamentos);
  if (c.maior && (c.maior.parte > 0.5 || c.nivel === 'alta') && c.compradores > 0) {
    a.push({
      id: 'concentracao',
      nivel: 'atencao',
      titulo: `${pct(c.maior.parte)} da receita veio de um só comprador`,
      texto: `${e.formatarDoc(c.maior.id)} comprou ${formatarReais(c.maior.valor)}. Dependência alta: atraso ou perda desse comprador afeta o caixa. Avalie diversificar ou garantir contrato.`,
      acao: { tipo: 'filtro', rotulo: 'Filtrar este comprador', filtro: { participante: c.maior.id } },
    });
  }

  // 3. Imóvel com resultado negativo (quando há mais de um com movimento).
  const imoveis = e.imoveis.filter((i) => i.receitas !== 0 || i.resultado !== 0);
  if (imoveis.length > 1) {
    const pior = [...imoveis].sort((x, y) => x.resultado - y.resultado)[0]!;
    if (pior.resultado < 0) {
      a.push({
        id: `imovel-${pior.chave}`,
        nivel: 'atencao',
        titulo: `${pior.nome} teve resultado negativo (${formatarReais(pior.resultado)})`,
        texto: pior.receitas > 0
          ? 'As despesas do imóvel superaram as receitas dele. Confira se a receita foi lançada no imóvel certo ou se o custo está alto.'
          : 'O imóvel só tem despesas no período. Pode ser formação de lavoura ou pasto (receita futura) ou receita lançada em outro imóvel.',
        acao: { tipo: 'filtro', rotulo: 'Filtrar este imóvel', filtro: { imovel: pior.chave } },
      });
    }
  }

  // 4. Natureza de despesa que mais cresceu frente ao período anterior.
  if (e.anterior) {
    const crescimentos = e.naturezas
      .filter((n) => n.natureza !== 'outras')
      .map((n) => {
        const antes = e.anterior!.naturezas.find((x) => x.natureza === n.natureza)?.valor ?? 0;
        return { n, antes, dif: n.valor - antes, taxa: antes > 0 ? (n.valor - antes) / antes : null };
      })
      .filter((x) => x.taxa !== null && x.taxa > 0.3 && x.dif >= 5_000_000)
      .sort((x, y) => y.dif - x.dif);
    const maior = crescimentos[0];
    if (maior) {
      a.push({
        id: `natureza-${maior.n.natureza}`,
        nivel: 'atencao',
        titulo: `${NOMES_CURTOS_NATUREZA[maior.n.natureza]} subiu ${pct(maior.taxa!)} frente ${frenteA(e.vs)}`,
        texto: `Passou de ${formatarReais(maior.antes)} para ${formatarReais(maior.n.valor)} (+${formatarReais(maior.dif)}). Veja se foi preço, volume ou compra antecipada.`,
        acao: { tipo: 'filtro', rotulo: 'Filtrar esta natureza', filtro: { natureza: maior.n.natureza } },
      });
    }
  }

  // 5. Margem caiu muito.
  const margem = e.totais.margem;
  const margemAntes = e.anterior?.totais.margem;
  if (margem !== null && margemAntes !== null && margemAntes !== undefined && margemAntes - margem > 0.05) {
    a.push({
      id: 'margem',
      nivel: 'atencao',
      titulo: `Margem caiu ${((margemAntes - margem) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos frente ${frenteA(e.vs)}`,
      texto: `De ${pct(margemAntes)} para ${pct(margem)}: a despesa cresceu mais que a receita. As despesas por natureza mostram onde.`,
      acao: { tipo: 'aba', rotulo: 'Ver receitas e despesas', aba: 'receitas' },
    });
  }

  // 6. Comprovação fraca: recibo, "outros" ou sem número de documento.
  const despesas = e.lancamentos.filter((l) => l.tipoLanc === '2');
  const totalDesp = despesas.reduce((s, l) => s + valorDespesa(l), 0);
  const fraca = despesas.filter((l) => l.tipoDoc === '3' || l.tipoDoc === '6' || !l.numDoc.trim()).reduce((s, l) => s + valorDespesa(l), 0);
  if (totalDesp > 0 && fraca / totalDesp > 0.15) {
    a.push({
      id: 'comprovacao',
      nivel: 'atencao',
      titulo: `${pct(fraca / totalDesp)} das despesas têm comprovação fraca`,
      texto: `${formatarReais(fraca)} em recibos, "outros" ou sem número de documento. Numa fiscalização, a despesa sem nota fiscal é a primeira a ser glosada. Peça nota fiscal aos fornecedores.`,
      acao: { tipo: 'aba', rotulo: 'Ver no detalhamento', aba: 'detalhamento' },
    });
  }

  // 7. Ano civil: obrigatoriedade do LCDPR e janela de planejamento.
  if (e.anoCivil) {
    // A obrigatoriedade é de CADA produtor (CPF), nunca da soma consolidada.
    const meses = e.anoCivil.previaAteMes ?? 12;
    const porCpf = new Map<string, Centavos>();
    for (const l of e.lancamentos) porCpf.set(l.cpf, (porCpf.get(l.cpf) ?? 0) + valorReceita(l));
    const candidatos = [...porCpf.entries()]
      .map(([cpf, receita]) => ({ cpf, receita, projetada: Math.round((receita / meses) * 12) }))
      .filter((x) => x.projetada >= LIMITE_OBRIGATORIEDADE_LCDPR * 0.8)
      .sort((x, y) => y.projetada - x.projetada);
    const maior = candidatos[0];
    if (maior) {
      const quem = porCpf.size > 1 ? `${e.nomeProdutor?.(maior.cpf) ?? e.formatarDoc(maior.cpf)}: receita` : 'Receita';
      const acima = maior.receita > LIMITE_OBRIGATORIEDADE_LCDPR;
      const valor = e.anoCivil.previaAteMes && !acima ? maior.projetada : maior.receita;
      a.push({
        id: 'obrigatoriedade',
        nivel: 'atencao',
        titulo: acima ? 'Receita acima do limite: o LCDPR é obrigatório' : 'Receita perto do limite que obriga o LCDPR',
        texto: `${quem} ${e.anoCivil.previaAteMes && !acima ? 'projetada para o ano' : 'do ano'} de ${formatarReais(valor)}. Acima de R$ 4.800.000,00 de receita bruta no ano o LCDPR é obrigatório para o produtor, no prazo da declaração do IRPF (IN SRF nº 83/2001, art. 23-A).${candidatos.length > 1 ? ` Outros ${candidatos.length - 1} produtor(es) também estão perto ou acima do limite.` : ''}`,
        acao: { tipo: 'aba', rotulo: 'Ver no Planejamento IRPF', aba: 'planejamento' },
      });
    }
    if (e.anoCivil.previaAteMes && e.anoCivil.previaAteMes < 12) {
      const faltam = 12 - e.anoCivil.previaAteMes;
      a.push({
        id: 'planejamento',
        nivel: 'oportunidade',
        titulo: `Ainda dá tempo de planejar o IRPF de ${e.anoCivil.ano}`,
        texto: `${faltam === 1 ? 'Falta 1 mês' : `Faltam ${faltam} meses`} para fechar o ano. Simule antecipar despesas ou postergar receitas antes de 31/12.`,
        acao: { tipo: 'aba', rotulo: 'Abrir o Planejamento IRPF', aba: 'planejamento' },
      });
    }
  }

  // 8. Muitas despesas sem natureza identificada.
  const outras = e.naturezas.find((n) => n.natureza === 'outras');
  if (outras && outras.parte > 0.2) {
    a.push({
      id: 'naturezas',
      nivel: 'info',
      titulo: `${pct(outras.parte)} das despesas estão sem natureza identificada`,
      texto: 'O histórico não permitiu classificar. Ajuste a classificação na Visão Executiva para os indicadores ficarem mais precisos.',
      acao: { tipo: 'filtro', rotulo: 'Filtrar essas despesas', filtro: { natureza: 'outras' } },
    });
  }

  return a.sort((x, y) => ORDEM_NIVEL[x.nivel] - ORDEM_NIVEL[y.nivel]);
}

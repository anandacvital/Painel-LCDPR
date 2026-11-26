/**
 * DESPESAS POR NATUREZA (classificação INFERIDA pelo painel).
 *
 * O LCDPR não tem campo de "natureza da despesa": só histórico livre, tipo de
 * documento e participante. Para a visão de gestão (quanto vai para insumos,
 * mão de obra, combustível...), o painel deduz a natureza em quatro passos,
 * nesta ordem de prioridade:
 *
 * 1. AJUSTE da pessoa: se ela reclassificou um histórico, vale o que ela escolheu.
 * 2. DOCUMENTO: folha de pagamento (TIPO_DOC 5) é mão de obra.
 * 3. HISTÓRICO: palavras-chave (ex.: "diesel" = combustível e energia).
 * 4. PARTICIPANTE: se o histórico não diz nada, usa a natureza mais comum das
 *    outras despesas do mesmo CPF/CNPJ (o mesmo fornecedor costuma vender a mesma coisa).
 *
 * O que sobrar fica em "Outras / não identificadas", e a tela mostra quanto é,
 * para a pessoa ajustar. Isso é classificação GERENCIAL, não fiscal: não muda
 * receita, despesa, resultado nem IRPF. (Para o IRPF, custeio e investimento são
 * dedutíveis no ano do pagamento: Lei nº 8.023/1990, art. 4º.)
 */
import { valorDespesa } from './agregacoes';
import { normalizar } from './filtros';
import type { Lancamento } from '../parser/modelo';

export type Natureza =
  | 'insumos'
  | 'animais'
  | 'mao-de-obra'
  | 'combustivel-energia'
  | 'arrendamento'
  | 'manutencao-servicos'
  | 'investimento'
  | 'outras';

export const NOMES_NATUREZA: Readonly<Record<Natureza, string>> = {
  insumos: 'Insumos (sementes, adubo, defensivos, ração, sanidade)',
  animais: 'Compra de animais',
  'mao-de-obra': 'Mão de obra e encargos',
  'combustivel-energia': 'Combustível e energia',
  arrendamento: 'Arrendamento e parceria',
  'manutencao-servicos': 'Manutenção, frete e serviços',
  investimento: 'Investimentos (máquinas, benfeitorias, pastagem)',
  outras: 'Outras / não identificadas',
};

/** Nome curto para gráficos e filtros. */
export const NOMES_CURTOS_NATUREZA: Readonly<Record<Natureza, string>> = {
  insumos: 'Insumos',
  animais: 'Compra de animais',
  'mao-de-obra': 'Mão de obra',
  'combustivel-energia': 'Combustível e energia',
  arrendamento: 'Arrendamento',
  'manutencao-servicos': 'Manutenção e serviços',
  investimento: 'Investimentos',
  outras: 'Outras',
};

export const NATUREZAS = Object.keys(NOMES_NATUREZA) as Natureza[];

/** De onde veio a classificação (a tela mostra, para a pessoa saber o quanto confiar). */
export type OrigemNatureza = 'ajuste' | 'documento' | 'historico' | 'participante' | 'sem-regra';

export interface Classificacao {
  natureza: Natureza;
  origem: OrigemNatureza;
}

/**
 * Palavras-chave por natureza, na ORDEM em que são testadas (a primeira que
 * casar vence). Investimento vem antes de serviços para "Reforma de pastagem
 * ... e serviço" não cair em serviços; por isso investimento só reconhece
 * máquina quando há "compra de"/"aquisição de" (senão "Manutenção de tratores"
 * viraria investimento). Texto já sem acento e em minúsculas.
 */
const REGRAS: readonly [Natureza, RegExp][] = [
  ['arrendamento', /arrendament|parceria rural|aluguel d[ae] (terra|pasto|area)|\bpasto alugado/],
  ['mao-de-obra', /salari|folha|ferias|13o|decimo terceiro|rescis|\binss\b|\bfgts\b|diarist|empreit|mao de obra|pro.labore|funrural sobre folha/],
  ['investimento', /aquisicao de (trator|maquina|implemento|colheitadeira|terra|imovel|veiculo)|compra de (trator|maquina|implemento|colheitadeira|plantadeira|pulverizador|veiculo|caminhao)|construc|benfeitori|galpao|\bcerca|curral|\bpoco\b|barragem|reforma de pastagem|formacao de pastagem|pastagem|investimento/],
  ['manutencao-servicos', /manutenc|consert|reparo|revisao|\bpecas?\b|pneu|oficina|frete|transport|armazenagem|secagem|servico|assistencia tecnica|agronomo|honorari|contabil|seguro|taxa|tarifa/],
  ['animais', /bezerr|novilh|garrot|\bboi\b|bois\b|vaca|touro|matriz|reprodutor|leitao|leitoes|pintinh|alevin|compra de gado|reposicao de (gado|rebanho|animais)/],
  ['insumos', /sement|adubo|fertiliz|calcario|gesso agricola|defensiv|herbicid|fungicid|inseticid|agrotox|racao|suplement|sal mineral|silagem|vacina|medicament|veterinar|insumo|muda|embalage/],
  ['combustivel-energia', /diesel|oleo combust|combustiv|gasolina|etanol|lubrificant|energia|eletric|\bgas\b/],
];

/** Chave que agrupa históricos "iguais" (sem números, acentos, pontuação e caixa). */
export const chaveHistorico = (historico: string): string =>
  normalizar(historico).replace(/\d+/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Só pelo texto do histórico (passo 3). */
export function naturezaPorHistorico(historico: string): Natureza | null {
  const t = chaveHistorico(historico);
  for (const [natureza, regra] of REGRAS) if (regra.test(t)) return natureza;
  return null;
}

export type AjustesNatureza = Readonly<Record<string, Natureza>>;

/**
 * Classifica cada lançamento da lista (receitas recebem null). O resultado vem
 * na MESMA ORDEM da lista de entrada.
 */
export function classificarDespesas(lancamentos: readonly Lancamento[], ajustes: AjustesNatureza = {}): (Classificacao | null)[] {
  const ehDespesa = (l: Lancamento): boolean => l.tipoLanc === '2';
  const primeira: (Classificacao | null)[] = lancamentos.map((l) => {
    if (!ehDespesa(l)) return null;
    const ajuste = ajustes[chaveHistorico(l.historico)];
    if (ajuste) return { natureza: ajuste, origem: 'ajuste' };
    if (l.tipoDoc === '5') return { natureza: 'mao-de-obra', origem: 'documento' };
    const n = naturezaPorHistorico(l.historico);
    return n ? { natureza: n, origem: 'historico' } : { natureza: 'outras', origem: 'sem-regra' };
  });

  // Passo 4: natureza mais comum (em valor) de cada participante, entre as já identificadas.
  const porParticipante = new Map<string, Map<Natureza, number>>();
  lancamentos.forEach((l, i) => {
    const c = primeira[i];
    if (!c || c.origem === 'sem-regra' || !l.idPartic) return;
    const m = porParticipante.get(l.idPartic) ?? new Map<Natureza, number>();
    m.set(c.natureza, (m.get(c.natureza) ?? 0) + Math.abs(valorDespesa(l)));
    porParticipante.set(l.idPartic, m);
  });
  return primeira.map((c, i) => {
    if (!c || c.origem !== 'sem-regra') return c;
    const m = porParticipante.get(lancamentos[i]!.idPartic);
    if (!m || m.size === 0) return c;
    const [natureza] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]!;
    return { natureza, origem: 'participante' };
  });
}

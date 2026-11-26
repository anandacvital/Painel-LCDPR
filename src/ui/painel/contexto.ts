/**
 * "VISÃO": o recorte de dados que o Painel do Livro Caixa está mostrando,
 * conforme o seletor do cabeçalho (todos os produtores ou um só) e o ano.
 *
 * Todas as abas recebem a mesma Visão, então os números sempre conferem entre si.
 */
import { mensal, totalizar, type TotalMensal, type Totais } from '../../domain/agregacoes';
import { consolidar, type CriterioConsolidacao, type ResultadoConsolidacao } from '../../domain/consolidacao';
import type { ArquivoLcdpr, Lancamento, ResultadoAnalise, Semaforo } from '../../parser/modelo';

export const TODOS = 'todos';

export interface LancamentoVisao extends Lancamento {
  cpf: string;
  produtor: string;
}

export interface Visao {
  rotulo: string;
  ano: number;
  individual: boolean;
  arquivos: ArquivoLcdpr[];
  lancamentos: LancamentoVisao[];
  meses: TotalMensal[];
  totais: Totais;
  /**
   * Mesmo recorte no ano anterior, quando houver arquivo carregado. Se o ano
   * atual é uma prévia, o anterior é cortado no MESMO PERÍODO (ex.: jan a out),
   * para a comparação ser justa.
   */
  anterior: { totais: Totais; meses: TotalMensal[] } | null;
  /**
   * Prévia do ano em andamento: algum arquivo termina antes de 31/12 sem
   * situação especial. `fim` é a maior data final (AAAA-MM-DD) e `ateMes` o mês dela.
   */
  previa: { fim: string; ateMes: number } | null;
  consolidacao: ResultadoConsolidacao | null;
  semaforo: Semaforo;
}

const PIOR: Record<Semaforo, number> = { verde: 0, amarelo: 1, vermelho: 2 };

function recortar(analises: readonly ResultadoAnalise[], produtor: string, ano: number, criterio: CriterioConsolidacao) {
  const doAno = analises.filter((r) => r.arquivo.anoBase === ano && (produtor === TODOS || r.arquivo.abertura?.cpf === produtor));
  if (doAno.length === 0) return null;
  const arquivos = doAno.map((r) => r.arquivo);
  if (produtor !== TODOS) {
    const a = arquivos[0]!;
    const cpf = a.abertura?.cpf ?? '';
    const nome = a.abertura?.nome ?? a.nomeArquivo;
    return { doAno, arquivos, consolidacao: null, lancamentos: a.lancamentos.map((l) => ({ ...l, cpf, produtor: nome })) };
  }
  const c = consolidar(arquivos, ano, criterio);
  return { doAno, arquivos, consolidacao: c, lancamentos: c.lancamentos };
}

/** Detecta prévia: arquivo sem situação especial com data final antes de 31/12. */
export function detectarPrevia(arquivos: readonly ArquivoLcdpr[]): { fim: string; ateMes: number } | null {
  const finais = arquivos
    .filter((a) => (a.abertura?.sitEspecial || '0') === '0')
    .map((a) => a.abertura?.dtFin)
    .filter((d): d is NonNullable<typeof d> => !!d && !(d.mes === 12 && d.dia === 31));
  if (finais.length === 0) return null;
  const fim = finais.map((d) => d.iso).sort().at(-1)!;
  return { fim, ateMes: Number(fim.slice(5, 7)) };
}

export function montarVisao(
  analises: readonly ResultadoAnalise[],
  produtor: string,
  ano: number,
  criterio: CriterioConsolidacao,
): Visao | null {
  const atual = recortar(analises, produtor, ano, criterio);
  if (!atual) return null;
  // Em "todos os produtores", o ano anterior considera só os produtores que têm
  // arquivo no ano atual (senão um produtor sem arquivo no ano distorce a variação).
  const cpfsAtuais = new Set(atual.arquivos.map((a) => a.abertura?.cpf));
  const ant = recortar(analises.filter((r) => cpfsAtuais.has(r.arquivo.abertura?.cpf)), produtor, ano - 1, criterio);
  const previa = detectarPrevia(atual.arquivos);
  // Na prévia, o ano anterior entra só até o mesmo dia e mês (comparação justa).
  const diaMes = previa?.fim.slice(5);
  const antLanc = ant ? (diaMes ? ant.lancamentos.filter((l) => l.data.iso.slice(5) <= diaMes) : ant.lancamentos) : null;
  const nomes = atual.arquivos.map((a) => a.abertura?.nome ?? a.nomeArquivo);
  return {
    rotulo: produtor === TODOS ? (nomes.length === 1 ? nomes[0]! : `Todos os produtores (${nomes.length})`) : nomes[0]!,
    ano,
    individual: produtor !== TODOS || nomes.length === 1,
    arquivos: atual.arquivos,
    lancamentos: atual.lancamentos,
    // Na prévia, os meses param no último mês do arquivo (os seguintes ainda não aconteceram).
    meses: mensal(atual.lancamentos, ano).slice(0, previa?.ateMes ?? 12),
    totais: totalizar(atual.lancamentos),
    anterior: antLanc ? { totais: totalizar(antLanc), meses: mensal(antLanc, ano - 1) } : null,
    previa,
    consolidacao: atual.consolidacao,
    semaforo: atual.doAno.reduce<Semaforo>((pior, r) => (PIOR[r.saude.semaforo] > PIOR[pior] ? r.saude.semaforo : pior), 'verde'),
  };
}

/** Nome do imóvel a partir do código e do produtor (o código é só único dentro de cada arquivo). */
export function nomeImovel(v: Visao, cpf: string, codigo: string): string {
  if (codigo === '000') return 'Despesas comuns (rateio)';
  const a = v.arquivos.find((x) => x.abertura?.cpf === cpf);
  return a?.imoveis.find((i) => i.codigo === codigo)?.nome || `Imóvel ${codigo}`;
}

/** Nome da conta bancária a partir do código. */
export function nomeConta(v: Visao, cpf: string, codigo: string): string {
  if (codigo === '000') return 'Espécie';
  if (codigo === '999') return 'Sem trânsito por conta';
  const a = v.arquivos.find((x) => x.abertura?.cpf === cpf);
  const c = a?.contas.find((x) => x.codigo === codigo);
  return c ? `${c.nomeBanco} · ag. ${c.agencia}` : `Conta ${codigo}`;
}

/** Explica a prévia em uma frase (tela e relatório impresso). */
export function avisoPrevia(v: Visao): string {
  if (!v.previa) return '';
  const [a, m, d] = v.previa.fim.split('-');
  return `Lançamentos até ${d}/${m}/${a}. As variações comparam com o mesmo período de ${v.ano - 1} (01/01 a ${d}/${m}), e o IRPF estimado considera só esse período. Este arquivo não deve ser transmitido: o LCDPR final precisa ir até 31/12.`;
}

/** Texto da comparação: "ano anterior" ou, na prévia, "mesmo período de AAAA". */
export function textoComparacao(v: Visao): string {
  return v.previa ? `mesmo período de ${v.ano - 1}` : 'ano anterior';
}

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
  /** Mesmo recorte no ano anterior, quando houver arquivo carregado. */
  anterior: { totais: Totais; meses: TotalMensal[] } | null;
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

export function montarVisao(
  analises: readonly ResultadoAnalise[],
  produtor: string,
  ano: number,
  criterio: CriterioConsolidacao,
): Visao | null {
  const atual = recortar(analises, produtor, ano, criterio);
  if (!atual) return null;
  const ant = recortar(analises, produtor, ano - 1, criterio);
  const nomes = atual.arquivos.map((a) => a.abertura?.nome ?? a.nomeArquivo);
  return {
    rotulo: produtor === TODOS ? (nomes.length === 1 ? nomes[0]! : `Todos os produtores (${nomes.length})`) : nomes[0]!,
    ano,
    individual: produtor !== TODOS || nomes.length === 1,
    arquivos: atual.arquivos,
    lancamentos: atual.lancamentos,
    meses: mensal(atual.lancamentos, ano),
    totais: totalizar(atual.lancamentos),
    anterior: ant ? { totais: totalizar(ant.lancamentos), meses: mensal(ant.lancamentos, ano - 1) } : null,
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

/**
 * Peças reaproveitadas pelas abas do Painel: cartões de KPI e moldura de gráfico.
 */
import { formatarReais, type Centavos } from '../../domain/dinheiro';
import { variacao } from '../../domain/destaques';
import { esc } from '../html';

export type Tom = 'neutro' | 'positivo' | 'negativo' | 'agro' | 'despesa';

/** Variação "▲ 12,3% vs. ano anterior" com texto (não depende só da cor). */
function blocoVariacao(atual: number, anterior: number | null | undefined, maiorEhMelhor: boolean, emPontos = false): string {
  if (emPontos) {
    // Para percentuais (margem): diferença em pontos percentuais, não "variação de uma variação".
    if (anterior === null || anterior === undefined) return '<span class="kpi-var">sem ano anterior para comparar</span>';
    const dif = atual - anterior;
    const bom = dif >= 0 === maiorEhMelhor;
    const txt = `${dif >= 0 ? '▲ alta' : '▼ queda'} de ${(Math.abs(dif) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p. vs. ano anterior`;
    return `<span class="kpi-var ${bom ? 'var-boa' : 'var-ruim'}">${txt}</span>`;
  }
  const v = variacao(atual, anterior);
  if (v === null) return '<span class="kpi-var">sem ano anterior para comparar</span>';
  const subiu = v >= 0;
  const bom = subiu === maiorEhMelhor;
  const txt = `${subiu ? '▲ alta' : '▼ queda'} de ${(Math.abs(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. ano anterior`;
  return `<span class="kpi-var ${bom ? 'var-boa' : 'var-ruim'}">${txt}</span>`;
}

export function cartaoKpi(opcoes: {
  rotulo: string;
  valor: Centavos | null;
  texto?: string;
  tom?: Tom;
  anterior?: number | null;
  maiorEhMelhor?: boolean;
  /** Para valores que não são reais (ex.: margem em %). */
  formatado?: string;
  atualComparavel?: number | undefined;
  /** Comparar em pontos percentuais (para margens). */
  emPontos?: boolean;
}): string {
  const tom = opcoes.tom ?? 'neutro';
  const valor = opcoes.formatado ?? (opcoes.valor === null ? '—' : formatarReais(opcoes.valor));
  const comparar = opcoes.atualComparavel ?? opcoes.valor;
  const variacaoHtml = opcoes.anterior !== undefined && comparar !== null
    ? blocoVariacao(comparar, opcoes.anterior, opcoes.maiorEhMelhor ?? true, opcoes.emPontos)
    : '';
  return `
    <div class="kpi-painel card tom-${tom}">
      <span class="kpi-painel-rotulo">${esc(opcoes.rotulo)}</span>
      <span class="kpi-painel-valor num">${esc(valor)}</span>
      ${variacaoHtml}
      ${opcoes.texto ? `<span class="kpi-painel-texto">${esc(opcoes.texto)}</span>` : ''}
    </div>`;
}

/** Card com título-conclusão e área do gráfico. */
export function molduraGrafico(id: string, titulo: string, subtitulo = '', altura = 320): string {
  return `
    <section class="card grafico-card">
      <h3>${esc(titulo)}</h3>
      ${subtitulo ? `<p class="ajuda">${esc(subtitulo)}</p>` : ''}
      <div class="grafico" id="${id}" data-grafico style="height:${altura}px" role="img" aria-label="${esc(titulo)}"></div>
    </section>`;
}

export const pctTexto = (fracao: number | null): string =>
  fracao === null ? '—' : `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

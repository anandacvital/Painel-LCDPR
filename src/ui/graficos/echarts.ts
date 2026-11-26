/**
 * ECHARTS: importação "sob medida" (só os gráficos e componentes usados), para o
 * site carregar mais rápido, e o tema visual do Grupo Paraná.
 *
 * Renderização em SVG: fica nítida em qualquer zoom e na impressão/PDF (Fase 5).
 */
import * as echarts from 'echarts/core';
import { BarChart, LineChart, TreemapChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { formatarReais } from '../../domain/dinheiro';

echarts.use([BarChart, LineChart, TreemapChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, AriaComponent, SVGRenderer]);

/** Cores dos gráficos, iguais aos tokens CSS (tokens.css). */
export const COR = {
  navy: '#0B2347',
  azul1: '#1B4F9C',
  azul2: '#2B6CC4',
  azul3: '#4A8FD8',
  fundo: '#EBF3FB',
  receita: '#2D6A4F',
  negativo: '#C0001D',
  despesa: '#1B4F9C',
  grade: '#D6E2F0',
  texto: '#0B2347',
  textoSuave: '#4A5A73',
} as const;

const FONTE = "'DM Sans', system-ui, sans-serif";
const FONTE_NUM = "'DM Mono', ui-monospace, monospace";

/** Eixo de valores em reais de forma compacta: 1.200.000 → "1,2 mi". */
export function reaisCompacto(centavos: number): string {
  const v = centavos / 100;
  const abs = Math.abs(v);
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (abs >= 1e6) return `${fmt(v / 1e6)} mi`;
  if (abs >= 1e3) return `${fmt(v / 1e3)} mil`;
  return fmt(v);
}

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Opções comuns a todos os gráficos (fonte, tooltip, acessibilidade). */
export function base(): echarts.EChartsCoreOption {
  return {
    aria: { enabled: true, decal: { show: false } },
    textStyle: { fontFamily: FONTE, color: COR.texto },
    animationDuration: 500,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: COR.grade,
      textStyle: { color: COR.texto, fontFamily: FONTE },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? formatarReais(v) : String(v)),
    },
    legend: { bottom: 0, icon: 'roundRect', textStyle: { color: COR.textoSuave } },
    grid: { left: 8, right: 16, top: 16, bottom: 40, containLabel: true },
  };
}

export const eixoValor = () => ({
  type: 'value' as const,
  axisLabel: { formatter: reaisCompacto, color: COR.textoSuave, fontFamily: FONTE_NUM },
  splitLine: { lineStyle: { color: COR.grade } },
});

export const eixoMeses = () => ({
  type: 'category' as const,
  data: MESES_CURTOS,
  axisTick: { show: false },
  axisLine: { lineStyle: { color: COR.grade } },
  axisLabel: { color: COR.textoSuave },
});

const ativos = new Set<echarts.ECharts>();

/** Cria (ou recria) um gráfico no elemento, ajustando o tamanho quando a janela muda. */
export function desenharGrafico(el: HTMLElement, opcao: echarts.EChartsCoreOption): echarts.ECharts {
  echarts.getInstanceByDom(el)?.dispose();
  const g = echarts.init(el, undefined, { renderer: 'svg' });
  g.setOption({ ...base(), ...opcao });
  ativos.add(g);
  return g;
}

/** Libera os gráficos de uma área antes de redesenhá-la (evita vazamento de memória). */
export function liberarGraficos(raiz: HTMLElement): void {
  raiz.querySelectorAll<HTMLElement>('[data-grafico]').forEach((el) => {
    const g = echarts.getInstanceByDom(el);
    if (g) {
      ativos.delete(g);
      g.dispose();
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => ativos.forEach((g) => g.resize()));
}

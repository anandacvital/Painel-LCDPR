/**
 * Tooltips dos gráficos sempre em reais no padrão brasileiro, mesmo quando o
 * gráfico traz o próprio `tooltip` (antes ele substituía o formatador comum).
 */
import { describe, expect, it } from 'vitest';
import { opcoesFinais } from '../src/ui/graficos/echarts';

type Tooltip = { trigger?: string; axisPointer?: unknown; valueFormatter?: (v: unknown) => string; formatter?: unknown };

describe('opcoesFinais (tooltip em pt-BR)', () => {
  it('gráfico com tooltip próprio mantém o formatador em reais', () => {
    const t = opcoesFinais({ tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } } }).tooltip as Tooltip;
    expect(t.axisPointer).toEqual({ type: 'shadow' });
    // 1.407.944.656 centavos = R$ 14.079.446,56 (não "1,407,944,656").
    expect(t.valueFormatter!(1_407_944_656).replace(/\s/g, ' ')).toBe('R$ 14.079.446,56');
  });

  it('formatador próprio do gráfico (ex.: %) continua valendo', () => {
    const proprio = (x: unknown) => `${String(x)}%`;
    const t = opcoesFinais({ tooltip: { valueFormatter: proprio } }).tooltip as Tooltip;
    expect(t.valueFormatter).toBe(proprio);
  });

  it('gráfico sem tooltip usa o comum', () => {
    const t = opcoesFinais({ series: [] }).tooltip as Tooltip;
    expect(t.trigger).toBe('axis');
    expect(typeof t.valueFormatter).toBe('function');
  });
});

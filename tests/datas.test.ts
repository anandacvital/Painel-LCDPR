import { describe, expect, it } from 'vitest';
import { diaNaoUtil, feriadosNacionais, lerData, lerMes } from '../src/domain/datas';

describe('datas do LCDPR', () => {
  it('lê DDMMAAAA e rejeita datas inexistentes', () => {
    expect(lerData('05032025')?.iso).toBe('2025-03-05');
    expect(lerData('31022025')).toBeNull();
    expect(lerData('29022024')?.iso).toBe('2024-02-29');
    expect(lerData('2025-03-05')).toBeNull();
  });
  it('lê MMAAAA', () => {
    expect(lerMes('032025')).toBe('2025-03');
    expect(lerMes('132025')).toBeNull();
  });
  it('calcula feriados móveis de 2025 (Páscoa em 20/04)', () => {
    const f = feriadosNacionais(2025);
    expect(f.get('2025-04-18')).toBe('Sexta-feira Santa');
    expect(f.get('2025-03-04')).toContain('Carnaval');
    expect(f.get('2025-06-19')).toContain('Corpus Christi');
    expect(f.get('2025-11-20')).toContain('Consciência Negra');
    expect(feriadosNacionais(2023).has('2023-11-20')).toBe(false);
  });
  it('identifica fim de semana e feriado', () => {
    expect(diaNaoUtil(lerData('07092025')!)).toBe('Independência');
    expect(diaNaoUtil(lerData('06092025')!)).toBe('Sábado');
    expect(diaNaoUtil(lerData('08092025')!)).toBeNull();
  });
});

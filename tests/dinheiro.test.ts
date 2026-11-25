import { describe, expect, it } from 'vitest';
import { formatarReais, lerCentavos } from '../src/domain/dinheiro';

describe('lerCentavos', () => {
  it('interpreta 2 decimais implícitos', () => {
    expect(lerCentavos('123456')).toBe(123456);
  });
  it('aceita zeros à esquerda', () => {
    expect(lerCentavos('0000000000000012345')).toBe(12345);
  });
  it('aceita zero', () => {
    expect(lerCentavos('0')).toBe(0);
  });
  it('rejeita separadores e texto', () => {
    expect(lerCentavos('1.234,56')).toBeNull();
    expect(lerCentavos('')).toBeNull();
    expect(lerCentavos('-100')).toBeNull();
  });
  it('soma sem erro de arredondamento', () => {
    // Em reais: 0,10 + 0,20 deve ser exatamente 0,30
    const soma = (lerCentavos('10') ?? 0) + (lerCentavos('20') ?? 0);
    expect(soma).toBe(30);
  });
});

describe('formatarReais', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatarReais(123456789)).toBe('R$ 1.234.567,89');
  });
  it('formata centavos e negativos', () => {
    expect(formatarReais(5)).toBe('R$ 0,05');
    expect(formatarReais(-150000)).toBe('-R$ 1.500,00');
  });
});

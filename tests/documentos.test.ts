import { describe, expect, it } from 'vitest';
import { cnpjValido, completarCnpj, completarCpf, cpfOuCnpjValido, cpfValido, formatarCpfCnpj } from '../src/domain/documentos';

describe('CPF e CNPJ', () => {
  it('aceita CPF com DV correto', () => {
    // O CPF de exemplo do Manual (111.111.111-91) é ilustrativo e não tem DV válido.
    expect(cpfValido('11111111191')).toBe(false);
    expect(cpfValido(completarCpf('123456789'))).toBe(true);
    expect(completarCpf('123456789')).toBe('12345678909');
  });
  it('rejeita CPF com DV errado ou dígitos todos iguais', () => {
    expect(cpfValido('12345678900')).toBe(false);
    expect(cpfValido('00000000000')).toBe(false);
  });
  it('valida CNPJ', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000180')).toBe(false);
    expect(completarCnpj('112223330001')).toBe('11222333000181');
  });
  it('escolhe a regra pelo tamanho', () => {
    expect(cpfOuCnpjValido('12345678909')).toBe(true);
    expect(cpfOuCnpjValido('11222333000181')).toBe(true);
    expect(cpfOuCnpjValido('123')).toBe(false);
  });
  it('formata para exibição', () => {
    expect(formatarCpfCnpj('12345678909')).toBe('123.456.789-09');
    expect(formatarCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});

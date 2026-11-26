/**
 * Validação de CPF e CNPJ pelo dígito verificador (DV).
 *
 * O DV é calculado pelo "módulo 11" (regra pública da Receita Federal).
 * Validar o DV pega erros de digitação, mas NÃO garante que o documento
 * exista ou esteja regular: isso só a consulta na Receita confirma.
 */

const soDigitos = (s: string): string => s.replace(/\D/g, '');

/** Calcula um dígito verificador pelo módulo 11 com os pesos informados. */
function digitoModulo11(numeros: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(numeros[i]) * (pesos[i] ?? 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // 000.000.000-00, 111..., etc.
  const d1 = digitoModulo11(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoModulo11(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${d1}${d2}`);
}

export function cnpjValido(valor: string): boolean {
  const cnpj = soDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const d1 = digitoModulo11(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoModulo11(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** Valida conforme o tamanho: 11 dígitos = CPF; 14 = CNPJ. */
export function cpfOuCnpjValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

/** Completa 9 dígitos-base com os 2 DVs de CPF. Usado para gerar CPFs fictícios nos testes. */
export function completarCpf(base9: string): string {
  const d1 = digitoModulo11(base9, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoModulo11(`${base9}${d1}`, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base9}${d1}${d2}`;
}

/** Completa 12 dígitos-base com os 2 DVs de CNPJ. Usado para gerar CNPJs fictícios nos testes. */
export function completarCnpj(base12: string): string {
  const d1 = digitoModulo11(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoModulo11(`${base12}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${d1}${d2}`;
}

/** Mascara para exibição: 12345678909 → 123.456.789-09; 14 dígitos → 12.345.678/0001-95. */
export function formatarCpfCnpj(valor: string): string {
  const d = soDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return valor;
}

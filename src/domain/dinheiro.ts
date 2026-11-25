/**
 * Dinheiro em CENTAVOS INTEIROS.
 *
 * Por quê: o computador erra contas com decimais (0,1 + 0,2 = 0,30000000000000004).
 * Somando milhares de lançamentos, esse erro aparece no resultado. Guardando tudo
 * em centavos inteiros (R$ 1.234,56 = 123456), as somas são exatas.
 *
 * O LCDPR já informa os valores assim: "2 decimais implícitos, sem separador"
 * (ex.: "123456" significa R$ 1.234,56), então a conversão é direta.
 */

/** Valor monetário em centavos (número inteiro). */
export type Centavos = number;

/**
 * Converte o texto de um campo de valor do LCDPR em centavos.
 * Aceita zeros à esquerda ("0000000000000012345" → 12345).
 * Retorna `null` se o texto não for um número inteiro válido (o validador
 * da Fase 1 transforma isso em um erro com linha e campo).
 */
export function lerCentavos(texto: string): Centavos | null {
  const limpo = texto.trim();
  if (!/^\d+$/.test(limpo)) return null;
  const valor = Number(limpo);
  // Acima deste limite o JavaScript perde precisão em inteiros
  // (≈ R$ 90 trilhões: na prática, só acontece com arquivo corrompido).
  if (!Number.isSafeInteger(valor)) return null;
  return valor;
}

const formatoBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata centavos no padrão brasileiro: 123456789 → "R$ 1.234.567,89". */
export function formatarReais(centavos: Centavos): string {
  // Intl usa espaço não separável após "R$"; trocamos por espaço comum
  // para facilitar comparação em testes e exportação para CSV.
  return formatoBRL.format(centavos / 100).replace(/ /g, ' ');
}

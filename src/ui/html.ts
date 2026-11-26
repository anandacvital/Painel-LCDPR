/**
 * Utilitários de HTML.
 *
 * `esc` é OBRIGATÓRIO para qualquer texto que venha do TXT (nomes, históricos):
 * impede que um conteúdo malicioso no arquivo vire código na página.
 */
export function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Baixa um texto como arquivo, gerado no próprio navegador (nada é enviado). */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const numeroBR = (n: number): string => n.toLocaleString('pt-BR');

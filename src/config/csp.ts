/**
 * POLÍTICA DE SEGURANÇA (CSP) injetada no HTML do site publicado.
 *
 * Sem o Google Drive configurado, a página NÃO pode abrir conexão nenhuma
 * (connect-src 'none'): é a garantia técnica de que o TXT nunca sai do computador.
 *
 * Com o Google Drive configurado, a página passa a poder falar SÓ com os
 * endereços do Google necessários para: (1) a janela de login (accounts.google.com),
 * (2) a janela de escolha de arquivos (apis.google.com e docs.google.com) e
 * (3) o download do arquivo escolhido (www.googleapis.com) e (4) o "sair do
 * Google" (oauth2.googleapis.com). Qualquer outro
 * destino continua bloqueado pelo navegador. O TXT vem do Drive PARA o navegador;
 * o painel não tem código que envie dados de volta.
 */

/** Endereços do Google liberados quando o Drive está configurado (lista curta e explícita). */
export const ORIGENS_GOOGLE = {
  script: ['https://apis.google.com', 'https://accounts.google.com/gsi/client'],
  estilo: ['https://accounts.google.com/gsi/style'],
  quadro: ['https://docs.google.com', 'https://drive.google.com', 'https://accounts.google.com/gsi/'],
  conexao: ['https://www.googleapis.com', 'https://accounts.google.com/gsi/', 'https://oauth2.googleapis.com'],
} as const;

export function montarCsp(comGoogleDrive: boolean): string {
  const g = comGoogleDrive ? ORIGENS_GOOGLE : { script: [], estilo: [], quadro: [], conexao: [] };
  const junta = (...partes: readonly string[]): string => partes.join(' ');
  const regras = [
    "default-src 'self'",
    junta("script-src 'self'", ...g.script),
    "worker-src 'self' blob:",
    junta("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", ...g.estilo),
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    comGoogleDrive ? junta('connect-src', ...g.conexao) : "connect-src 'none'",
    ...(comGoogleDrive ? [junta('frame-src', ...g.quadro)] : []),
    "form-action 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  return regras.join('; ');
}

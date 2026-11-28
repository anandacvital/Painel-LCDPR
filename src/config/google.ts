/**
 * CONFIGURAÇÃO DO GOOGLE DRIVE (opcional).
 *
 * O botão "Importar do Google Drive" só aparece quando as TRÊS chaves abaixo
 * estão configuradas. Elas vêm de variáveis de ambiente no momento do build:
 * - no site publicado: "Variables" do repositório no GitHub (ver deploy.yml);
 * - no computador (npm run dev): arquivo `.env.local`, que o .gitignore bloqueia.
 *
 * Nenhuma das três é senha: o Google foi feito para que elas fiquem visíveis no
 * código do site. A proteção é a RESTRIÇÃO que se configura no Google Cloud
 * (só funcionam a partir do endereço do painel). Ver docs/google-drive.md.
 */

export interface ConfigGoogle {
  /** ID do cliente OAuth (termina em .apps.googleusercontent.com). */
  clientId: string;
  /** Chave de API (restrita ao endereço do painel e à Picker API). */
  apiKey: string;
  /** Número do projeto no Google Cloud (só dígitos): o Picker usa para liberar o arquivo escolhido. */
  numeroProjeto: string;
}

/** Nomes das variáveis (o prefixo VITE_ é exigido pelo Vite para chegar ao navegador). */
export const VARIAVEIS_GOOGLE = {
  clientId: 'VITE_GOOGLE_CLIENT_ID',
  apiKey: 'VITE_GOOGLE_API_KEY',
  numeroProjeto: 'VITE_GOOGLE_NUMERO_PROJETO',
} as const;

export type ResultadoConfigGoogle =
  | { estado: 'desligado' }
  | { estado: 'ok'; config: ConfigGoogle }
  | { estado: 'invalido'; problemas: string[] };

/**
 * Lê e confere as chaves. Três resultados possíveis:
 * - nenhuma preenchida: recurso desligado (o painel funciona como sempre);
 * - todas corretas: recurso ligado;
 * - algumas faltando ou com formato errado: o build FALHA com a explicação,
 *   para o erro aparecer na hora e não como um botão que não funciona.
 */
export function lerConfigGoogle(env: Record<string, string | undefined>): ResultadoConfigGoogle {
  const clientId = (env[VARIAVEIS_GOOGLE.clientId] ?? '').trim();
  const apiKey = (env[VARIAVEIS_GOOGLE.apiKey] ?? '').trim();
  const numeroProjeto = (env[VARIAVEIS_GOOGLE.numeroProjeto] ?? '').trim();
  if (!clientId && !apiKey && !numeroProjeto) return { estado: 'desligado' };

  const problemas: string[] = [];
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    problemas.push(`${VARIAVEIS_GOOGLE.clientId}: deve ser o "ID do cliente", que termina em .apps.googleusercontent.com`);
  }
  if (!/^[\w-]{20,}$/.test(apiKey)) {
    problemas.push(`${VARIAVEIS_GOOGLE.apiKey}: deve ser a chave de API (começa com "AIza", sem espaços)`);
  }
  if (!/^\d{6,}$/.test(numeroProjeto)) {
    problemas.push(`${VARIAVEIS_GOOGLE.numeroProjeto}: deve ser o NÚMERO do projeto (só dígitos), não o nome nem o ID`);
  }
  return problemas.length ? { estado: 'invalido', problemas } : { estado: 'ok', config: { clientId, apiKey, numeroProjeto } };
}

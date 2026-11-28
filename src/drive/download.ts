/**
 * DOWNLOAD de um arquivo escolhido no Google Drive, direto para o navegador.
 *
 * Recebe o "documento" que o seletor do Google (Picker) devolve, confere se dá
 * para usar e baixa o conteúdo pela API do Drive (www.googleapis.com) com o
 * token de acesso da pessoa. O resultado é um `File` comum, igual ao de quem
 * arrasta o TXT do computador: daí em diante o fluxo é o mesmo (Worker → parser).
 *
 * Separado da parte que abre janelas do Google para poder ser testado sem navegador.
 */

/** O que o Picker informa sobre cada arquivo escolhido (só os campos que usamos). */
export interface DocumentoDrive {
  id: string;
  nome: string;
  mimeType: string;
  /** Tamanho em bytes, quando o Drive informa. */
  tamanho?: number;
}

/** Limite de segurança: um LCDPR muito grande tem poucos MB; acima disso provavelmente não é o arquivo certo. */
export const TAMANHO_MAXIMO = 200 * 1024 * 1024;

/**
 * Motivo para recusar o arquivo ANTES de baixar (ou null se pode baixar).
 * Documentos nativos do Google (Docs, Planilhas) não têm "arquivo" para baixar
 * e não são TXT do LCDPR.
 */
export function motivoRecusa(doc: DocumentoDrive): string | null {
  if (doc.mimeType.startsWith('application/vnd.google-apps.')) {
    return `${doc.nome} é um documento do Google (Docs/Planilhas), não um arquivo TXT`;
  }
  if (!/\.txt$/i.test(doc.nome) && doc.mimeType !== 'text/plain') {
    return `${doc.nome} não parece um TXT do LCDPR (escolha o arquivo .txt gerado pelo sistema)`;
  }
  if (doc.tamanho !== undefined && doc.tamanho > TAMANHO_MAXIMO) {
    return `${doc.nome} tem mais de 200 MB, grande demais para um LCDPR`;
  }
  return null;
}

/** Explica em português o erro devolvido pela API do Drive. */
export function mensagemErroHttp(status: number, nome: string): string {
  if (status === 401) return `o acesso ao Google expirou ao baixar ${nome}; clique de novo em "Importar do Google Drive"`;
  if (status === 403) return `o Google recusou o acesso a ${nome} (verifique se você tem permissão de leitura ou se o administrador bloqueou o download)`;
  if (status === 404) return `${nome} não foi encontrado no Drive (pode ter sido apagado ou movido)`;
  if (status === 429) return `o Google pediu para esperar um pouco antes de baixar ${nome}; tente de novo em 1 minuto`;
  return `o Google respondeu com erro ${status} ao baixar ${nome}`;
}

/**
 * Baixa o conteúdo. `supportsAllDrives` permite arquivos de Drives compartilhados
 * (os "Drives da equipe" do Workspace). `buscar` é o fetch do navegador; nos testes
 * entra um simulado.
 */
export async function baixarDoDrive(
  doc: DocumentoDrive,
  token: string,
  buscar: typeof fetch = fetch,
): Promise<File> {
  const recusa = motivoRecusa(doc);
  if (recusa) throw new Error(recusa);
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media&supportsAllDrives=true`;
  let resposta: Response;
  try {
    resposta = await buscar(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    throw new Error(`sem conexão com o Google ao baixar ${doc.nome}`);
  }
  if (!resposta.ok) throw new Error(mensagemErroHttp(resposta.status, doc.nome));
  const bytes = await resposta.arrayBuffer();
  if (bytes.byteLength > TAMANHO_MAXIMO) throw new Error(`${doc.nome} tem mais de 200 MB, grande demais para um LCDPR`);
  // Mantém os bytes como vieram: a detecção de UTF-8 x ISO-8859-1 continua no parser.
  return new File([bytes], doc.nome, { type: 'text/plain' });
}

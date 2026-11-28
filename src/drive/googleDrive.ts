/**
 * IMPORTAR DO GOOGLE DRIVE: login, janela de escolha e download, tudo no navegador.
 *
 * Como funciona (sem servidor nosso no meio):
 * 1. a pessoa clica em "Importar do Google Drive";
 * 2. só então o painel carrega as bibliotecas oficiais do Google (nada é
 *    carregado do Google enquanto o botão não é usado);
 * 3. abre a janela de login do Google pedindo o escopo `drive.file`: o painel
 *    só enxerga os arquivos que a pessoa ESCOLHER, nunca o Drive inteiro;
 * 4. abre o seletor de arquivos do Google (Picker);
 * 5. cada TXT escolhido é baixado do Drive direto para a memória do navegador
 *    (`download.ts`) e segue o mesmo caminho do arquivo arrastado.
 *
 * O token de acesso fica só na memória da aba (some ao fechar ou recarregar)
 * e é revogado no botão "Apagar dados deste computador".
 */
import type { ConfigGoogle } from '../config/google';
import { baixarDoDrive, type DocumentoDrive } from './download';

/** Permissão pedida: só os arquivos abertos pelo painel (não exige verificação do app pelo Google). */
export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive.file';

const URL_GIS = 'https://accounts.google.com/gsi/client';
const URL_GAPI = 'https://apis.google.com/js/api.js';

let token: { valor: string; expiraEm: number } | null = null;
let carregamento: Promise<void> | null = null;

/** Insere um <script> uma única vez e espera carregar. */
function carregarScript(url: string): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
    if (existente?.dataset.carregado === 'sim') return resolver();
    const s = existente ?? document.createElement('script');
    s.addEventListener('load', () => {
      s.dataset.carregado = 'sim';
      resolver();
    });
    s.addEventListener('error', () => rejeitar(new Error('não foi possível carregar as bibliotecas do Google (verifique a internet ou um bloqueador de anúncios)')));
    if (!existente) {
      s.src = url;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

/**
 * Carrega as bibliotecas do Google (uma vez). Chamado ao passar o mouse no botão,
 * para que no clique a janela de login abra na hora (navegadores bloqueiam
 * janelas abertas muito depois do clique).
 */
export function prepararGoogle(): Promise<void> {
  carregamento ??= (async () => {
    await Promise.all([carregarScript(URL_GIS), carregarScript(URL_GAPI)]);
    await new Promise<void>((resolver, rejeitar) => {
      window.gapi!.load('picker', {
        callback: resolver,
        onerror: () => rejeitar(new Error('não foi possível carregar o seletor de arquivos do Google')),
        timeout: 15000,
        ontimeout: () => rejeitar(new Error('o Google demorou demais para responder; tente de novo')),
      });
    });
  })().catch((e: unknown) => {
    carregamento = null; // deixa tentar de novo no próximo clique
    throw e;
  });
  return carregamento;
}

/** Pede (ou reaproveita) o token de acesso. Abre a janela de login do Google quando precisa. */
function obterToken(config: ConfigGoogle): Promise<string> {
  if (token && Date.now() < token.expiraEm) return Promise.resolve(token.valor);
  return new Promise((resolver, rejeitar) => {
    const cliente = window.google!.accounts!.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: ESCOPO_DRIVE,
      callback: (r) => {
        if (!r.access_token) {
          rejeitar(new Error(r.error === 'access_denied' ? 'o acesso ao Google Drive não foi autorizado' : `o Google recusou o login (${r.error_description ?? r.error ?? 'motivo não informado'})`));
          return;
        }
        // Renova 1 minuto antes de expirar, para não falhar no meio de um download.
        const segundos = Number(r.expires_in ?? 3600);
        token = { valor: r.access_token, expiraEm: Date.now() + (segundos - 60) * 1000 };
        resolver(r.access_token);
      },
      error_callback: (e) => {
        rejeitar(new Error(e.type === 'popup_closed' ? 'a janela de login do Google foi fechada' : e.type === 'popup_failed_to_open' ? 'o navegador bloqueou a janela de login do Google (permita pop-ups para este site e tente de novo)' : `falha no login do Google (${e.message ?? e.type ?? 'erro'})`));
      },
    });
    cliente.requestAccessToken({ prompt: '' });
  });
}

/** Abre o seletor de arquivos e devolve os escolhidos (lista vazia se a pessoa cancelar). */
function escolherArquivos(config: ConfigGoogle, valorToken: string): Promise<DocumentoDrive[]> {
  const p = window.google!.picker!;
  return new Promise((resolver) => {
    // Aba 1: só TXT (o mais comum). Aba 2: todos os arquivos, caso o Drive tenha
    // registrado o TXT com outro tipo. Aba 3: Drives compartilhados da equipe.
    const soTxt = new p.DocsView(p.ViewId.DOCS).setMimeTypes('text/plain').setIncludeFolders(true).setSelectFolderEnabled(false).setMode(p.DocsViewMode.LIST);
    const todos = new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setMode(p.DocsViewMode.LIST);
    const compartilhados = new p.DocsView(p.ViewId.DOCS).setEnableDrives(true).setIncludeFolders(true).setSelectFolderEnabled(false).setMode(p.DocsViewMode.LIST);
    new p.PickerBuilder()
      .setAppId(config.numeroProjeto)
      .setOAuthToken(valorToken)
      .setDeveloperKey(config.apiKey)
      .addView(soTxt)
      .addView(todos)
      .addView(compartilhados)
      .enableFeature(p.Feature.MULTISELECT_ENABLED)
      .enableFeature(p.Feature.SUPPORT_DRIVES)
      .setLocale('pt-BR')
      .setTitle('Escolha os arquivos TXT do LCDPR')
      .setOrigin(window.location.origin)
      .setCallback((r) => {
        if (r.action === p.Action.PICKED) {
          resolver(
            (r.docs ?? []).map((d) => {
              const doc: DocumentoDrive = { id: d.id, nome: d.name, mimeType: d.mimeType };
              const tamanho = Number(d.sizeBytes);
              if (Number.isFinite(tamanho) && d.sizeBytes !== undefined) doc.tamanho = tamanho;
              return doc;
            }),
          );
        } else if (r.action === p.Action.CANCEL) {
          resolver([]);
        }
      })
      .build()
      .setVisible(true);
  });
}

export interface ResultadoImportacao {
  arquivos: File[];
  falhas: string[];
}

/**
 * Fluxo completo do botão. `aoProgredir` recebe mensagens para a linha de status.
 * Erros de um arquivo não impedem os outros (vão para `falhas`).
 */
export async function importarDoDrive(config: ConfigGoogle, aoProgredir: (texto: string) => void): Promise<ResultadoImportacao> {
  aoProgredir('Conectando ao Google Drive...');
  await prepararGoogle();
  const valorToken = await obterToken(config);
  aoProgredir('Escolha os arquivos na janela do Google Drive...');
  const docs = await escolherArquivos(config, valorToken);
  const arquivos: File[] = [];
  const falhas: string[] = [];
  let i = 0;
  for (const doc of docs) {
    i++;
    aoProgredir(`Baixando ${doc.nome} do Google Drive (${i} de ${docs.length})...`);
    try {
      arquivos.push(await baixarDoDrive(doc, valorToken));
    } catch (e) {
      falhas.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { arquivos, falhas };
}

/** Esquece e revoga o acesso ao Google (usado em "Apagar dados deste computador"). */
export function desconectarGoogle(): void {
  if (token) window.google?.accounts?.oauth2.revoke(token.valor);
  token = null;
}

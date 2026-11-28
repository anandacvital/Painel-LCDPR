/**
 * Importar do Google Drive: configuração, política de segurança (CSP) e download.
 * Nada aqui fala com o Google de verdade: o download usa um fetch simulado.
 */
import { describe, expect, it } from 'vitest';
import { lerConfigGoogle } from '../src/config/google';
import { montarCsp } from '../src/config/csp';
import { baixarDoDrive, motivoRecusa, type DocumentoDrive } from '../src/drive/download';

const CHAVES = {
  VITE_GOOGLE_CLIENT_ID: '123456789012-abcdefghijk.apps.googleusercontent.com',
  VITE_GOOGLE_API_KEY: 'AIzaSyFICTICIA_0123456789abcdefghij',
  VITE_GOOGLE_NUMERO_PROJETO: '123456789012',
};

describe('configuração do Google Drive', () => {
  it('sem nenhuma chave, o recurso fica desligado', () => {
    expect(lerConfigGoogle({})).toEqual({ estado: 'desligado' });
    expect(lerConfigGoogle({ VITE_GOOGLE_CLIENT_ID: '  ', VITE_GOOGLE_API_KEY: '' })).toEqual({ estado: 'desligado' });
  });

  it('com as três chaves corretas, liga', () => {
    const r = lerConfigGoogle({ ...CHAVES, VITE_GOOGLE_API_KEY: ` ${CHAVES.VITE_GOOGLE_API_KEY} ` });
    expect(r).toEqual({ estado: 'ok', config: { clientId: CHAVES.VITE_GOOGLE_CLIENT_ID, apiKey: CHAVES.VITE_GOOGLE_API_KEY, numeroProjeto: CHAVES.VITE_GOOGLE_NUMERO_PROJETO } });
  });

  it('configuração pela metade ou trocada é barrada com explicação', () => {
    const faltando = lerConfigGoogle({ VITE_GOOGLE_CLIENT_ID: CHAVES.VITE_GOOGLE_CLIENT_ID });
    expect(faltando.estado).toBe('invalido');
    if (faltando.estado === 'invalido') expect(faltando.problemas).toHaveLength(2);
    // Erro comum: colar o ID do projeto (texto) no lugar do NÚMERO do projeto.
    const trocado = lerConfigGoogle({ ...CHAVES, VITE_GOOGLE_NUMERO_PROJETO: 'painel-lcdpr-123' });
    expect(trocado.estado).toBe('invalido');
    if (trocado.estado === 'invalido') expect(trocado.problemas[0]).toContain('NÚMERO do projeto');
  });
});

describe('política de segurança (CSP)', () => {
  it('sem o Google, continua proibindo qualquer conexão (igual a antes)', () => {
    const csp = montarCsp(false);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('google.com');
    expect(csp).not.toContain('googleapis.com/');
    expect(csp).toBe(
      "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'self'; object-src 'none'",
    );
  });

  it('com o Google, libera só os endereços do Google (nenhum curinga)', () => {
    const csp = montarCsp(true);
    const conexao = csp.split('; ').find((r) => r.startsWith('connect-src'))!;
    expect(conexao).toBe('connect-src https://www.googleapis.com https://accounts.google.com/gsi/ https://oauth2.googleapis.com');
    expect(csp).not.toContain('*');
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain('frame-src https://docs.google.com');
  });
});

describe('download do Drive', () => {
  const doc: DocumentoDrive = { id: 'abc/123', nome: 'LCDPR_2025.txt', mimeType: 'text/plain', tamanho: 10 };

  it('recusa documentos do Google e arquivos que não são TXT', () => {
    expect(motivoRecusa({ ...doc, mimeType: 'application/vnd.google-apps.spreadsheet', nome: 'Planilha' })).toContain('documento do Google');
    expect(motivoRecusa({ ...doc, nome: 'extrato.pdf', mimeType: 'application/pdf' })).toContain('não parece um TXT');
    expect(motivoRecusa({ ...doc, tamanho: 500 * 1024 * 1024 })).toContain('200 MB');
    // TXT gravado pelo Drive com tipo genérico continua aceito pelo nome.
    expect(motivoRecusa({ ...doc, mimeType: 'application/octet-stream' })).toBeNull();
  });

  it('baixa os bytes sem alterar (o encoding é decidido pelo parser) e usa o token', async () => {
    const bytes = new Uint8Array([0x30, 0x30, 0x30, 0x30, 0x7c, 0xc7]); // "0000|" + Ç em ISO-8859-1
    let urlPedida = '';
    let autorizacao = '';
    const buscar = (async (url: string, init?: RequestInit) => {
      urlPedida = url;
      autorizacao = new Headers(init?.headers).get('Authorization') ?? '';
      return new Response(bytes, { status: 200 });
    }) as typeof fetch;
    const arquivo = await baixarDoDrive(doc, 'TOKEN', buscar);
    expect(urlPedida).toBe('https://www.googleapis.com/drive/v3/files/abc%2F123?alt=media&supportsAllDrives=true');
    expect(autorizacao).toBe('Bearer TOKEN');
    expect(arquivo.name).toBe('LCDPR_2025.txt');
    expect(new Uint8Array(await arquivo.arrayBuffer())).toEqual(bytes);
  });

  it('explica em português os erros do Google', async () => {
    const com = (status: number) => (async () => new Response('', { status })) as typeof fetch;
    await expect(baixarDoDrive(doc, 'T', com(403))).rejects.toThrow('recusou o acesso');
    await expect(baixarDoDrive(doc, 'T', com(404))).rejects.toThrow('não foi encontrado');
    await expect(baixarDoDrive(doc, 'T', com(401))).rejects.toThrow('expirou');
    const semRede = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(baixarDoDrive(doc, 'T', semRede)).rejects.toThrow('sem conexão');
  });
});

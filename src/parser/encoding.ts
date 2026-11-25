/**
 * Leitura do TXT com detecção de codificação (encoding).
 *
 * Arquivos gerados em sistemas Windows costumam vir em ISO-8859-1 (Latin-1).
 * Se lermos esse arquivo como UTF-8, acentos viram "�" (caractere de
 * substituição). Regra do projeto:
 *   1. tenta ler como UTF-8;
 *   2. se aparecer "�", relê como ISO-8859-1.
 */

export type Codificacao = 'utf-8' | 'iso-8859-1';

export interface TextoDecodificado {
  texto: string;
  codificacao: Codificacao;
}

const CARACTERE_SUBSTITUICAO = '�';

export function decodificarLcdpr(bytes: ArrayBuffer | Uint8Array): TextoDecodificado {
  const dados = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let texto = new TextDecoder('utf-8').decode(dados);
  let codificacao: Codificacao = 'utf-8';
  if (texto.includes(CARACTERE_SUBSTITUICAO)) {
    // "latin1" é o rótulo que o padrão WHATWG usa para ISO-8859-1.
    texto = new TextDecoder('latin1').decode(dados);
    codificacao = 'iso-8859-1';
  }
  // Remove BOM (marca invisível que alguns editores põem no início).
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  return { texto, codificacao };
}

/** Separa em linhas aceitando quebra Windows (CRLF) e Unix (LF); ignora a última linha vazia. */
export function dividirLinhas(texto: string): string[] {
  const linhas = texto.split(/\r?\n/);
  if (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas;
}

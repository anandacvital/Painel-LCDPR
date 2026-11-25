import { describe, expect, it } from 'vitest';
import { decodificarLcdpr, dividirLinhas } from '../src/parser/encoding';

describe('decodificarLcdpr', () => {
  it('lê UTF-8 com acento', () => {
    const bytes = new TextEncoder().encode('0040|001|FAZENDA SÃO JOÃO');
    const r = decodificarLcdpr(bytes);
    expect(r.codificacao).toBe('utf-8');
    expect(r.texto).toContain('SÃO JOÃO');
  });

  it('cai para ISO-8859-1 quando UTF-8 gera caractere inválido', () => {
    // "SÃO" em ISO-8859-1: S=0x53, Ã=0xC3, O=0x4F (0xC3 sozinho é inválido em UTF-8)
    const bytes = new Uint8Array([0x53, 0xc3, 0x4f]);
    const r = decodificarLcdpr(bytes);
    expect(r.codificacao).toBe('iso-8859-1');
    expect(r.texto).toBe('SÃO');
  });

  it('remove BOM do início', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x30]);
    expect(decodificarLcdpr(bytes).texto).toBe('0');
  });
});

describe('dividirLinhas', () => {
  it('aceita CRLF e LF e ignora a linha vazia final', () => {
    expect(dividirLinhas('a\r\nb\nc\r\n')).toEqual(['a', 'b', 'c']);
  });
});

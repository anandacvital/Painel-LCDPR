/** Confere os arquivos de exemplo versionados em tests/fixtures/. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analisarBytes } from '../src/parser/analisar';

const ler = (nome: string) => analisarBytes(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url)), nome);

describe('fixtures sintéticas', () => {
  it('arquivo íntegro: sem erros nem alertas, lido como ISO-8859-1', () => {
    const r = ler('lcdpr-sintetico-2025.txt');
    expect(r.arquivo.codificacao).toBe('iso-8859-1');
    expect(r.saude.erros).toBe(0);
    expect(r.saude.alertas).toBe(0);
    expect(r.arquivo.lancamentos).toHaveLength(300);
  });

  it('arquivo com problemas: aponta cada problema injetado', () => {
    const r = ler('lcdpr-sintetico-com-problemas-2025.txt');
    const regras = new Set(r.ocorrencias.map((o) => o.regra));
    for (const regra of ['SEM-DOCUMENTO', 'HIST-GENERICO', 'CPF-DV', 'REF-IMOVEL', 'SALDO-LANC', 'Q100-Q200', 'QTD-LINHAS']) {
      expect(regras, regra).toContain(regra);
    }
    expect(r.saude.semaforo).toBe('vermelho');
  });
});

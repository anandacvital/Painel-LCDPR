import { describe, expect, it } from 'vitest';
import { celulaCsv, csvOcorrencias } from '../src/report/csv';

describe('CSV', () => {
  it('protege contra fórmula (CSV injection)', () => {
    expect(celulaCsv('=SOMA(A1)')).toBe("'=SOMA(A1)");
    expect(celulaCsv('-10')).toBe("'-10");
    expect(celulaCsv('@x')).toBe("'@x");
  });
  it('escapa ponto e vírgula e aspas', () => {
    expect(celulaCsv('a;b')).toBe('"a;b"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
  });
  it('gera com BOM, cabeçalho e linha', () => {
    const csv = csvOcorrencias('x.txt', [
      { severidade: 'erro', categoria: 'Campo', regra: 'R', linha: 3, registro: 'Q100', campo: 'HIST', problema: 'p', comoCorrigir: 'c' },
    ]);
    expect(csv.startsWith('﻿Arquivo;Severidade')).toBe(true);
    expect(csv).toContain('x.txt;Erro;Campo;R;3;Q100;HIST;p;c');
  });
});

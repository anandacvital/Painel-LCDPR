/**
 * O "LCDPR de exemplo" (tests/fixtures/exemplo-lcdpr-*.txt) é o arquivo que a
 * usuária baixa para testar o painel antes de usar um arquivo real. Ele precisa
 * passar limpo no Validador e ter resultado positivo (para a aba de IRPF).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { totalizar } from '../src/domain/agregacoes';
import { gerarExemplo } from './fixtures/gerador-exemplo';
import { EXEMPLOS } from '../scripts/exemplos';

describe('LCDPR de exemplo', () => {
  for (const ex of EXEMPLOS) {
    const r = analisarBytes(readFileSync(new URL(`./fixtures/${ex.arquivo}`, import.meta.url)), ex.arquivo);

    it(`${ex.arquivo}: está atualizado com o gerador`, () => {
      const texto = gerarExemplo(ex.opcoes).texto;
      expect(readFileSync(new URL(`./fixtures/${ex.arquivo}`, import.meta.url), 'latin1')).toBe(texto);
    });

    it(`${ex.arquivo}: passa no Validador sem erros nem alertas`, () => {
      const relevantes = r.ocorrencias.filter((o) => o.severidade !== 'info').map((o) => `${o.regra} L${o.linha}: ${o.problema}`);
      expect(relevantes).toEqual([]);
      expect(r.saude.semaforo).toBe('verde');
      expect(r.arquivo.anoBase).toBe(ex.opcoes.ano);
    });

    it(`${ex.arquivo}: tem resultado positivo`, () => {
      const t = totalizar(r.arquivo.lancamentos);
      expect(t.resultado).toBeGreaterThan(0);
    });
  }
});

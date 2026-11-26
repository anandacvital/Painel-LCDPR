/**
 * Os "LCDPR de exemplo" (tests/fixtures/exemplo-*.txt) são os arquivos que a
 * usuária baixa para testar o painel antes de usar um arquivo real. Precisam
 * passar limpos no Validador (a prévia de 2026 só com o alerta de prévia) e
 * ter o resultado esperado (positivo ou prejuízo, para a aba de IRPF).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { totalizar } from '../src/domain/agregacoes';
import { diagnosticarVinculo } from '../src/domain/consolidacao';
import { EXEMPLOS } from '../scripts/exemplos';

const ler = (arquivo: string) => analisarBytes(readFileSync(new URL(`./fixtures/${arquivo}`, import.meta.url)), arquivo);

describe('LCDPR de exemplo', () => {
  for (const ex of EXEMPLOS) {
    const r = ler(ex.arquivo);

    it(`${ex.arquivo}: está atualizado com o gerador`, () => {
      expect(readFileSync(new URL(`./fixtures/${ex.arquivo}`, import.meta.url), 'latin1')).toBe(ex.gerar());
    });

    it(`${ex.arquivo}: passa no Validador ${ex.esperado.previa ? 'só com o alerta de prévia' : 'sem erros nem alertas'}`, () => {
      const relevantes = r.ocorrencias.filter((o) => o.severidade !== 'info').map((o) => o.regra);
      expect(relevantes).toEqual(ex.esperado.previa ? ['PREVIA'] : []);
      expect(r.saude.semaforo).toBe(ex.esperado.previa ? 'amarelo' : 'verde');
      expect(r.arquivo.anoBase).toBe(ex.ano);
    });

    it(`${ex.arquivo}: tem resultado ${ex.esperado.resultado}`, () => {
      const t = totalizar(r.arquivo.lancamentos);
      if (ex.esperado.resultado === 'positivo') expect(t.resultado).toBeGreaterThan(0);
      else expect(t.resultado).toBeLessThan(0);
    });
  }

  it('a prévia de 2026 termina em 31/10 e não tem lançamento depois de outubro', () => {
    const r = ler('exemplo-lcdpr-2026-previa-ate-outubro.txt');
    expect(r.arquivo.abertura?.dtFin?.iso).toBe('2026-10-31');
    expect(r.arquivo.lancamentos.every((l) => l.data.iso <= '2026-10-31')).toBe(true);
  });

  for (const ano of [2024, 2025]) {
    it(`${ano}: os dois produtores são condôminos e o painel diagnostica "parcela" (somar é o correto)`, () => {
      const v = diagnosticarVinculo(ler(`exemplo-lcdpr-${ano}.txt`).arquivo, ler(`exemplo-condomino-lcdpr-${ano}.txt`).arquivo);
      expect(v).not.toBeNull();
      expect(v!.espelhados).toBeGreaterThan(10);
      expect(v!.diagnostico).toBe('parcela');
    });
  }
});

describe('Painel com a prévia de 2026', () => {
  it('compara com o mesmo período de 2025 (até 31/10), não com o ano inteiro', async () => {
    const { montarVisao, textoComparacao } = await import('../src/ui/painel/contexto');
    const analises = ['exemplo-lcdpr-2025.txt', 'exemplo-lcdpr-2026-previa-ate-outubro.txt'].map(ler);
    const v = montarVisao(analises, 'todos', 2026, 'somar')!;
    expect(v.previa).toEqual({ fim: '2026-10-31', ateMes: 10 });
    expect(textoComparacao(v)).toBe('mesmo período de 2025');
    const ate31out = analises[0]!.arquivo.lancamentos.filter((l) => l.data.iso <= '2025-10-31');
    expect(v.anterior!.totais.quantidade).toBe(ate31out.length);
    expect(v.anterior!.totais.quantidade).toBeLessThan(analises[0]!.arquivo.lancamentos.length);
    // O ano completo não é prévia.
    expect(montarVisao(analises, 'todos', 2025, 'somar')!.previa).toBeNull();
  });
});

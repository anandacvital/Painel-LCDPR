import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes, analisarTexto } from '../src/parser/analisar';
import { htmlRelatorioExecutivo, htmlRelatorioValidador } from '../src/report/impressao';
import { montarVisao } from '../src/ui/painel/contexto';
import { formatarReais } from '../src/domain/dinheiro';
import { gerarLcdpr, montarTexto } from './fixtures/gerador';

const ler = (nome: string) => analisarBytes(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url)), nome);

describe('relatórios para impressão', () => {
  it('Validador: traz cabeçalho, conclusão e TODAS as ocorrências', () => {
    const r = ler('lcdpr-sintetico-com-problemas-2025.txt');
    const html = htmlRelatorioValidador(r);
    expect(html).toContain('Relatório do Validador');
    expect(html).toContain('erros precisam de correção');
    expect(html).toContain('Emitido em');
    const secao = html.split("rel-ocorrencias")[1]!;
    expect(secao.match(/<tr>\s*<td><span class="rel-sev/g)?.length).toBe(r.ocorrencias.length);
  });

  it('Executivo: totais conferem com a Visão', () => {
    const analises = [ler('exemplo-lcdpr-2024.txt'), ler('exemplo-lcdpr-2025.txt')];
    const v = montarVisao(analises, 'todos', 2025, 'somar')!;
    const html = htmlRelatorioExecutivo(v);
    expect(html).toContain('Relatório Executivo do Livro Caixa');
    expect(html).toContain(formatarReais(v.totais.receitas));
    expect(html).toContain(formatarReais(v.totais.resultado));
    expect(html).toContain('vs. ano anterior');
  });

  it('escapa texto vindo do TXT (sem HTML injetado no relatório)', () => {
    const { linhas } = gerarLcdpr({ semente: 7, lancamentosPorMes: 2 });
    const i = linhas.findIndex((l) => l.startsWith('0000|'));
    const p = linhas[i]!.split('|');
    p[4] = '<img src=x onerror=alert(1)>';
    linhas[i] = p.join('|');
    const r = analisarTexto(montarTexto(linhas), 'x.txt');
    expect(htmlRelatorioValidador(r)).not.toContain('<img');
  });
});

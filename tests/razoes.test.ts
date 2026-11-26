import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { htmlDetalhamento, htmlRazao } from '../src/report/razoes';
import { montarVisao } from '../src/ui/painel/contexto';
import { formatarReais } from '../src/domain/dinheiro';

const ler = (nome: string) => analisarBytes(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url)), nome);
const v = montarVisao([ler('exemplo-lcdpr-2025.txt')], 'todos', 2025, 'somar')!;
/** Linhas de lançamento (as do corpo das tabelas de razão). */
const linhasLanc = (html: string): number => html.split('<table class="rel-tabela rel-razao">').slice(1)
  .reduce((s, t) => s + (t.split('<tbody>')[1]!.split('</tbody>')[0]!.match(/<tr>/g)?.length ?? 0), 0);
const totEnt = v.lancamentos.reduce((s, l) => s + l.entrada, 0);
const totSai = v.lancamentos.reduce((s, l) => s + l.saida, 0);

describe('relatórios detalhados', () => {
  for (const tipo of ['livro', 'imovel', 'conta', 'participante'] as const) {
    it(`${tipo}: traz cada lançamento uma única vez e o total confere`, () => {
      const html = htmlRazao(v, tipo);
      expect(linhasLanc(html)).toBe(v.lancamentos.length);
      expect(html).toContain(formatarReais(totEnt));
      expect(html).toContain(formatarReais(totSai));
      expect(html).toContain('Emitido em');
    });
  }

  it('Livro Caixa: mostra o saldo do arquivo e os 12 meses no resumo', () => {
    const html = htmlRazao(v, 'livro');
    expect(html).toContain('Saldo (arquivo)');
    expect(html).toContain('dezembro');
    const ultimo = [...v.lancamentos].sort((a, b) => a.data.iso.localeCompare(b.data.iso) || a.linha - b.linha).at(-1)!;
    expect(html).toContain(formatarReais(ultimo.saldo));
  });

  it('Razão por conta: saldo calculado da conta fecha com entradas − saídas da conta', () => {
    const html = htmlRazao(v, 'conta');
    const conta = v.lancamentos.filter((l) => l.codConta === '001');
    expect(html).toContain(formatarReais(conta.reduce((s, l) => s + l.entrada - l.saida, 0)));
  });

  it('Detalhamento: imprime só os filtrados e descreve os filtros', () => {
    const lista = v.lancamentos.filter((l) => /diesel/i.test(l.historico));
    const html = htmlDetalhamento(v, lista, ['Busca: "diesel"']);
    expect(linhasLanc(html)).toBe(12);
    expect(html).toContain('Busca: &quot;diesel&quot;');
  });
});

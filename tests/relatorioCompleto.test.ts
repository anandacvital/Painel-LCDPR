/**
 * Relatório completo: todas as abas do Painel menos o Detalhamento (pedido da Ananda, 28/11/2026).
 * Testa o "esqueleto" do HTML; os gráficos são desenhados no navegador.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarBytes } from '../src/parser/analisar';
import { montarVisao } from '../src/ui/painel/contexto';
import { planejarProdutor } from '../src/domain/planejamento';
import { htmlRelatorioCompleto } from '../src/report/completo';
import { novoEstadoPlano } from '../src/ui/painel/planejamento';

const ler = (nome: string) => analisarBytes(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url)), nome);
const analises = ['exemplo-lcdpr-2024.txt', 'exemplo-lcdpr-2025.txt', 'exemplo-condomino-lcdpr-2025.txt'].map(ler);

function dados(separado: boolean) {
  const v = montarVisao(analises, 'todos', 2025, 'somar')!;
  const visoes = separado
    ? v.arquivos.map((a) => montarVisao(analises, a.abertura!.cpf, 2025, 'somar')!)
    : [v];
  const planos = v.arquivos.map((a) => planejarProdutor(analises.map((r) => r.arquivo).filter((x) => x.abertura?.cpf === a.abertura?.cpf), 2025)!);
  return { visoes, visaoAno: v, analises, planos, simulacao: novoEstadoPlano() };
}

describe('relatório completo', () => {
  it('tem todas as abas menos o Detalhamento, cada uma em página nova', () => {
    const html = htmlRelatorioCompleto(dados(false));
    for (const aba of ['executiva', 'fluxo', 'receitas', 'imoveis', 'comparativo']) expect(html).toContain(`data-aba-impressa="${aba}"`);
    expect(html).toContain('Planejamento IRPF');
    expect(html).toContain('Resultado real x 20% da receita bruta');
    expect(html).not.toContain('Detalhamento</h2>');
    // 6 títulos de seção (4 abas + Comparativo + Planejamento) → 5 quebras de página.
    expect(html.match(/rel-titulo-aba rel-nova-pagina/g)).toHaveLength(5);
  });

  it('modo separado: as abas por período se repetem para cada produtor', () => {
    const html = htmlRelatorioCompleto(dados(true));
    expect(html.match(/data-aba-impressa="executiva"/g)).toHaveLength(2);
    expect(html.match(/data-aba-impressa="comparativo"/g)).toHaveLength(1);
  });
});

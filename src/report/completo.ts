/**
 * RELATÓRIO COMPLETO DO PAINEL (pedido da Ananda, 28/11/2026).
 *
 * Junta num só PDF todas as abas do Painel do Livro Caixa, MENOS o Detalhamento
 * (que é a lista de lançamentos; para ele já existem o Livro Caixa e as razões):
 *   1. Visão Executiva   2. Fluxo de Caixa   3. Receitas & Despesas   4. Imóveis
 *   5. Comparativo       6. Planejamento IRPF
 *
 * Como funciona: as abas 1 a 5 são desenhadas pelas MESMAS funções da tela
 * (abasGraficas.ts), dentro da área de impressão, com as mesmas cores e o mesmo
 * filtro. Assim o relatório nunca fica diferente do que se vê no painel. Botões,
 * campos e "clique para filtrar" são escondidos pelo CSS (.painel-impresso).
 * O Planejamento usa o texto do relatório de planejamento (os campos digitados
 * na aba, como o prejuízo inicial, entram como valores).
 *
 * Regras que valem como na tela:
 *  - Visão Executiva, Fluxo, Receitas & Despesas e Imóveis: período e filtro escolhidos.
 *    No modo "separado", uma sequência dessas abas por produtor, cada um em página nova.
 *  - Comparativo e Planejamento IRPF: sempre o ano civil inteiro, sem filtro (o IRPF é anual e por CPF).
 */
import { esc } from '../ui/html';
import { abaComparativo, abaFluxoCaixa, abaImoveis, abaReceitasDespesas, abaVisaoExecutiva } from '../ui/painel/abasGraficas';
import type { Visao } from '../ui/painel/contexto';
import type { AcoesPainel } from '../ui/painel/gestao';
import type { ResultadoAnalise } from '../parser/modelo';
import type { PlanoProdutor } from '../domain/planejamento';
import { cabecalho, camposVisao, imprimir, nomeDocumento, RODAPE } from './impressao';
import { corpoPlanejamento, type DadosSimulacao } from './planejamento';

/** No papel não há cliques: ações vazias. */
const SEM_ACOES: AcoesPainel = { filtrar: () => {}, abrirAba: () => {}, ajustarNatureza: () => {} };

type AbaPorVisao = 'executiva' | 'fluxo' | 'receitas' | 'imoveis';
const ABAS_VISAO: readonly [AbaPorVisao, string][] = [
  ['executiva', 'Visão Executiva'],
  ['fluxo', 'Fluxo de Caixa'],
  ['receitas', 'Receitas & Despesas'],
  ['imoveis', 'Imóveis'],
];
const DESENHAR: Record<AbaPorVisao, (raiz: HTMLElement, v: Visao) => void> = {
  executiva: (r, v) => abaVisaoExecutiva(r, v, SEM_ACOES),
  fluxo: (r, v) => abaFluxoCaixa(r, v, SEM_ACOES),
  receitas: (r, v) => abaReceitasDespesas(r, v, SEM_ACOES),
  imoveis: (r, v) => abaImoveis(r, v, SEM_ACOES),
};

export interface DadosCompleto {
  /** Uma Visão (unificado) ou uma por produtor (separado), com período e filtro. */
  visoes: readonly Visao[];
  /** Visão do ano civil inteiro, sem filtro (Comparativo e Planejamento). */
  visaoAno: Visao;
  analises: readonly ResultadoAnalise[];
  planos: readonly PlanoProdutor[];
  simulacao: DadosSimulacao;
}

/** Título de seção (com `novaPagina`, começa em página nova). */
const titulo = (texto: string, sub: string, novaPagina: boolean): string =>
  `<h2 class="rel-titulo-aba ${novaPagina ? 'rel-nova-pagina' : ''}">${esc(texto)}${sub ? ` <small>${esc(sub)}</small>` : ''}</h2>`;

/** HTML com as "caixas" vazias de cada aba (os gráficos são desenhados depois, em `desenharCompleto`). */
export function htmlRelatorioCompleto(d: DadosCompleto): string {
  const varios = d.visoes.length > 1;
  let primeira = true;
  const nova = (): boolean => {
    const n = !primeira;
    primeira = false;
    return n;
  };
  // Quebra de página só no começo de cada produtor, do Comparativo e do Planejamento.
  // Dentro de um produtor as abas seguem em sequência (antes cada aba abria página nova
  // e sobravam meias páginas em branco).
  const porVisao = d.visoes
    .map((v, i) => {
      const quebra = nova();
      return ABAS_VISAO.map(([aba, nome], j) => `
        ${titulo(nome, varios ? v.rotulo : '', j === 0 && quebra)}
        <div class="painel-impresso" data-aba-impressa="${aba}" data-visao="${i}"></div>`).join('');
    })
    .join('');
  const ano = d.visaoAno.ano;
  return `
    ${cabecalho('Relatório Completo do Livro Caixa', camposVisao(d.visoes[0]!, [
      ['Conteúdo', 'Visão Executiva, Fluxo de Caixa, Receitas & Despesas, Imóveis, Comparativo e Planejamento IRPF'],
      ...(varios ? [['Produtores', 'um bloco por produtor (relatório separado)'] as [string, string]] : []),
    ]))}
    ${porVisao}
    ${titulo('Comparativo', `anos civis inteiros, sem filtro, todos os produtores carregados`, nova())}
    <div class="painel-impresso" data-aba-impressa="comparativo"></div>
    ${titulo('Planejamento IRPF', `ano civil ${ano} inteiro, sem filtro, por CPF`, nova())}
    <div class="relatorio-planejamento">${corpoPlanejamento(d.planos, d.simulacao)}</div>
    ${RODAPE}`;
}

/** Desenha as abas (HTML e gráficos) dentro das caixas da área de impressão. */
export function desenharCompleto(area: HTMLElement, d: DadosCompleto): void {
  area.querySelectorAll<HTMLElement>('[data-aba-impressa]').forEach((caixa) => {
    const aba = caixa.dataset.abaImpressa!;
    if (aba === 'comparativo') {
      abaComparativo(caixa, d.analises, d.visaoAno.ano);
      return;
    }
    const v = d.visoes[Number(caixa.dataset.visao ?? 0)];
    if (v) DESENHAR[aba as AbaPorVisao](caixa, v);
  });
  // No papel não dá para clicar e abrir: blocos recolhidos (ex.: "Tabela mensal") saem abertos.
  area.querySelectorAll<HTMLDetailsElement>('.painel-impresso details:not(.ajuste-naturezas)').forEach((d) => { d.open = true; });
  // Botões que são TEXTO (ex.: nome do mês na tabela mensal) viram texto simples;
  // os botões de ação ("Filtrar...", "Ver o mês...") somem.
  area.querySelectorAll<HTMLButtonElement>('.painel-impresso button').forEach((b) => {
    if (b.closest('td, th')) b.replaceWith(document.createTextNode(b.textContent ?? ''));
    else b.remove();
  });
  // Instruções de clique não fazem sentido no papel.
  area.querySelectorAll<HTMLElement>('.painel-impresso .ajuda').forEach((p) => {
    p.textContent = (p.textContent ?? '').replace(/\s*Clique[^.]*\./g, '').trim();
    if (!p.textContent) p.remove();
  });
  // Título da aba nunca sozinho no pé da página: título + primeiro bloco da aba
  // ficam juntos numa caixa que não se divide (o navegador ignora "break-after: avoid"
  // quando o bloco seguinte também não pode ser dividido).
  area.querySelectorAll<HTMLElement>('.painel-impresso').forEach((caixa) => {
    const titulo = caixa.previousElementSibling;
    const primeiro = caixa.firstElementChild;
    if (!titulo?.classList.contains('rel-titulo-aba') || !primeiro) return;
    const junto = document.createElement('div');
    junto.className = 'rel-inicio-aba';
    // A quebra de página do título passa para a caixa (filho no início de caixa "não dividir" pode perder a quebra).
    if (titulo.classList.contains('rel-nova-pagina')) {
      titulo.classList.remove('rel-nova-pagina');
      junto.classList.add('rel-nova-pagina');
    }
    caixa.insertBefore(junto, primeiro);
    junto.append(titulo, primeiro);
  });
}

export function imprimirCompleto(d: DadosCompleto): void {
  if (!d.visoes.length) return;
  imprimir(htmlRelatorioCompleto(d), nomeDocumento('relatorio-completo-lcdpr', d.visoes), (area) => desenharCompleto(area, d));
}

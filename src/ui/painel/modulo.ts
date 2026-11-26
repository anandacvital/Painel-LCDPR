/**
 * MÓDULO "PAINEL DO LIVRO CAIXA": a visão gráfica dos arquivos já transmitidos.
 *
 * Monta a barra de seleção (produtor, ano, critério de consolidação), o
 * indicador de saúde dos arquivos, a navegação por abas e o conteúdo da aba.
 * Todas as abas recebem a mesma Visão (contexto.ts), então os números
 * conferem entre si.
 */
import { DESCRICAO_CRITERIO, type CriterioConsolidacao } from '../../domain/consolidacao';
import { formatarCpfCnpj } from '../../domain/documentos';
import type { ResultadoAnalise, Semaforo } from '../../parser/modelo';
import { liberarGraficos } from '../graficos/echarts';
import { esc } from '../html';
import { iconeAlerta } from '../icones';
import { abaComparativo, abaFluxoCaixa, abaImoveis, abaReceitasDespesas, abaVisaoExecutiva } from './abasGraficas';
import { montarVisao, TODOS } from './contexto';
import { abaDetalhamento } from './detalhamento';

export type AbaPainel = 'executiva' | 'fluxo' | 'receitas' | 'imoveis' | 'comparativo' | 'detalhamento';

const ABAS: readonly [AbaPainel, string][] = [
  ['executiva', 'Visão Executiva'],
  ['fluxo', 'Fluxo de Caixa'],
  ['receitas', 'Receitas & Despesas'],
  ['imoveis', 'Imóveis'],
  ['comparativo', 'Comparativo'],
  ['detalhamento', 'Detalhamento'],
];

export interface EstadoPainel {
  produtor: string;
  ano: number | null;
  criterio: CriterioConsolidacao;
  aba: AbaPainel;
}

const SAUDE: Record<Semaforo, string> = {
  verde: 'Arquivos sem erros nem alertas',
  amarelo: 'Há alertas no Validador: os números podem ter ressalvas',
  vermelho: 'Há erros no Validador: confira antes de tomar decisões',
};

export function novoEstadoPainel(): EstadoPainel {
  return { produtor: TODOS, ano: null, criterio: 'somar', aba: 'executiva' };
}

/**
 * Desenha o Painel. `irParaValidador` é chamado pelo link do indicador de saúde.
 */
export function montarPainel(raiz: HTMLElement, analises: readonly ResultadoAnalise[], estado: EstadoPainel, irParaValidador: () => void): void {
  liberarGraficos(raiz);
  if (analises.length === 0) {
    raiz.innerHTML = '<section class="card vazio-painel"><h2>Nenhum arquivo carregado</h2><p>Arraste acima um ou mais TXT do LCDPR. O Painel mostra receitas, despesas, caixa e imóveis de forma visual.</p></section>';
    return;
  }

  // Produtores e anos disponíveis.
  const produtores = new Map<string, string>();
  for (const r of analises) {
    const ab = r.arquivo.abertura;
    if (ab?.cpf) produtores.set(ab.cpf, ab.nome || r.arquivo.nomeArquivo);
  }
  if (estado.produtor !== TODOS && !produtores.has(estado.produtor)) estado.produtor = TODOS;
  const anos = [...new Set(analises
    .filter((r) => estado.produtor === TODOS || r.arquivo.abertura?.cpf === estado.produtor)
    .map((r) => r.arquivo.anoBase)
    .filter((a): a is number => a !== null))].sort((a, b) => b - a);
  if (estado.ano === null || !anos.includes(estado.ano)) estado.ano = anos[0] ?? null;
  const ano = estado.ano;

  const visao = ano === null ? null : montarVisao(analises, estado.produtor, ano, estado.criterio);
  const variosProdutores = (visao?.arquivos.length ?? 0) > 1;

  const opcoesProdutor = [
    `<option value="${TODOS}">Todos os produtores (${produtores.size})</option>`,
    ...[...produtores.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([cpf, nome]) => `<option value="${esc(cpf)}" ${cpf === estado.produtor ? 'selected' : ''}>${esc(nome)} · ${esc(formatarCpfCnpj(cpf))}</option>`),
  ].join('');

  const avisos = visao?.consolidacao?.avisos ?? [];
  raiz.innerHTML = `
    <section class="card barra-painel" aria-label="O que o painel está mostrando">
      <label>Produtor<select data-sel="produtor">${opcoesProdutor}</select></label>
      <label>Ano-base<select data-sel="ano">${anos.map((a) => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      ${variosProdutores ? `
        <label class="criterio">Como consolidar
          <select data-sel="criterio">
            ${(Object.keys(DESCRICAO_CRITERIO) as CriterioConsolidacao[]).map((c) => `<option value="${c}" ${c === estado.criterio ? 'selected' : ''}>${esc(DESCRICAO_CRITERIO[c])}</option>`).join('')}
          </select>
        </label>` : ''}
      ${visao ? `
        <button type="button" class="indicador-saude semaforo semaforo-${visao.semaforo}" data-validador title="Abrir o Validador">
          ${esc(SAUDE[visao.semaforo])}<span class="botao-link">ver no Validador</span>
        </button>` : ''}
    </section>
    ${avisos.length ? `<section class="avisos-consolidacao" role="note">${iconeAlerta}<ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></section>` : ''}
    <nav class="abas-painel" role="tablist" aria-label="Abas do Painel">
      ${ABAS.map(([id, rotulo]) => `<button type="button" role="tab" id="tab-${id}" aria-controls="conteudo-painel" aria-selected="${id === estado.aba}" tabindex="${id === estado.aba ? 0 : -1}" data-aba="${id}">${rotulo}</button>`).join('')}
    </nav>
    <section id="conteudo-painel" class="conteudo-painel" role="tabpanel" aria-labelledby="tab-${estado.aba}"></section>
  `;

  const conteudo = raiz.querySelector<HTMLElement>('#conteudo-painel')!;
  if (!visao) {
    conteudo.innerHTML = '<section class="card"><p>Os arquivos carregados não têm ano-base identificado (registro 0000). Confira no Validador.</p></section>';
  } else {
    const desenhar: Record<AbaPainel, () => void> = {
      executiva: () => abaVisaoExecutiva(conteudo, visao),
      fluxo: () => abaFluxoCaixa(conteudo, visao),
      receitas: () => abaReceitasDespesas(conteudo, visao),
      imoveis: () => abaImoveis(conteudo, visao),
      comparativo: () => abaComparativo(conteudo, analises, visao.ano),
      detalhamento: () => abaDetalhamento(conteudo, visao),
    };
    desenhar[estado.aba]();
  }

  const redesenhar = (): void => montarPainel(raiz, analises, estado, irParaValidador);
  raiz.querySelectorAll<HTMLSelectElement>('select[data-sel]').forEach((s) => {
    s.addEventListener('change', () => {
      if (s.dataset.sel === 'produtor') estado.produtor = s.value;
      if (s.dataset.sel === 'ano') estado.ano = Number(s.value);
      if (s.dataset.sel === 'criterio') estado.criterio = s.value as CriterioConsolidacao;
      redesenhar();
    });
  });
  const botoes = [...raiz.querySelectorAll<HTMLButtonElement>('button[data-aba]')];
  botoes.forEach((b, i) => {
    b.addEventListener('click', () => {
      estado.aba = b.dataset.aba as AbaPainel;
      redesenhar();
      raiz.querySelector<HTMLButtonElement>(`#tab-${estado.aba}`)?.focus();
    });
    // Setas do teclado navegam entre as abas (padrão de acessibilidade).
    b.addEventListener('keydown', (e) => {
      const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!passo) return;
      e.preventDefault();
      botoes[(i + passo + botoes.length) % botoes.length]!.click();
    });
  });
  raiz.querySelector<HTMLButtonElement>('[data-validador]')?.addEventListener('click', irParaValidador);
}

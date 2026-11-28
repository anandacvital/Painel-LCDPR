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
import { DIMENSOES, filtroAtivo, gerarAlertas, type Alerta, type Dimensao, type FiltroCruzado } from '../../domain/gestao';
import type { Natureza } from '../../domain/naturezas';
import {
  chaveMes,
  MAXIMO_MESES_LIVRE,
  mesCurtoAno,
  mesesEntre,
  nomeSafra,
  periodoAno,
  periodoSafra,
  somarMeses,
  type Periodo,
  type TipoPeriodo,
} from '../../domain/periodo';
import type { ResultadoAnalise, Semaforo } from '../../parser/modelo';
import { liberarGraficos } from '../graficos/echarts';
import { esc } from '../html';
import { iconeAlerta, iconeFechar, iconeImpressora, iconeInfo } from '../icones';
import { imprimirExecutivo } from '../../report/impressao';
import { imprimirRazao, TITULO_RAZAO, type TipoRazao } from '../../report/razoes';
import { abaComparativo, abaFluxoCaixa, abaImoveis, abaReceitasDespesas, abaVisaoExecutiva } from './abasGraficas';
import { detectarPrevia, montarVisao, rotuloFiltro, textoComparacao, TODOS, type Visao } from './contexto';
import { dadosAlertas, type AcoesPainel } from './gestao';
import { abaDetalhamento } from './detalhamento';
import { abaPlanejamento, montarFichas, montarPlanos, novoEstadoPlano, type EstadoPlano } from './planejamento';
import { imprimirDirpf } from '../../report/dirpf';
import { imprimirCompleto } from '../../report/completo';

export type AbaPainel = 'executiva' | 'fluxo' | 'receitas' | 'imoveis' | 'comparativo' | 'planejamento' | 'detalhamento';

const ABAS: readonly [AbaPainel, string][] = [
  ['executiva', 'Visão Executiva'],
  ['fluxo', 'Fluxo de Caixa'],
  ['receitas', 'Receitas & Despesas'],
  ['imoveis', 'Imóveis'],
  ['comparativo', 'Comparativo'],
  ['planejamento', 'Planejamento IRPF'],
  ['detalhamento', 'Detalhamento'],
];

export type ModoRelatorio = 'unificado' | 'separado';

/** Escolha de período no cabeçalho. */
export interface EstadoPeriodo {
  tipo: TipoPeriodo;
  /** Mês em que a safra começa (7 = julho: safra jul a jun). */
  mesInicioSafra: number;
  /** Ano em que a safra escolhida começa. */
  safra: number | null;
  /** Período livre: "AAAA-MM". */
  de: string | null;
  ate: string | null;
}

export interface EstadoPainel {
  produtor: string;
  /** Ano civil escolhido (também usado pelo Planejamento IRPF e pelo Comparativo). */
  ano: number | null;
  periodo: EstadoPeriodo;
  criterio: CriterioConsolidacao;
  aba: AbaPainel;
  /** Filtro cruzado: clique em mês, imóvel, participante ou natureza. */
  filtro: FiltroCruzado;
  /** Reclassificações de natureza feitas pela pessoa (chave = histórico normalizado). */
  ajustes: Record<string, Natureza>;
  /** Chamado quando os ajustes mudam (o app salva, se "Manter" estiver ligado). */
  aoMudarAjustes?: (ajustes: Record<string, Natureza>) => void;
  /** Quadro de alertas aberto ou recolhido. */
  alertasAbertos: boolean;
  /** Mês escolhido para imprimir o Livro Caixa ("" = período todo). */
  mesLivro: string;
  /** Com vários produtores: um relatório só (unificado) ou um por produtor (separado). */
  modoRelatorio: ModoRelatorio;
  /** Valores digitados na aba Planejamento IRPF (ficam ao trocar de aba). */
  plano: EstadoPlano;
}

const SAUDE: Record<Semaforo, string> = {
  verde: 'Arquivos sem erros nem alertas',
  amarelo: 'Há alertas no Validador: os números podem ter ressalvas',
  vermelho: 'Há erros no Validador: confira antes de tomar decisões',
};

export function novoEstadoPainel(): EstadoPainel {
  return {
    produtor: TODOS,
    ano: null,
    periodo: { tipo: 'ano', mesInicioSafra: 7, safra: null, de: null, ate: null },
    criterio: 'somar',
    aba: 'executiva',
    filtro: {},
    ajustes: {},
    alertasAbertos: true,
    mesLivro: '',
    modoRelatorio: 'unificado',
    plano: novoEstadoPlano(),
  };
}

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Primeiro e último mês com arquivo carregado (do produtor escolhido). */
function cobertura(analises: readonly ResultadoAnalise[], produtor: string): [string, string] | null {
  const ini: string[] = [];
  const fim: string[] = [];
  for (const r of analises) {
    const a = r.arquivo;
    if (produtor !== TODOS && a.abertura?.cpf !== produtor) continue;
    const i = a.abertura?.dtIni?.iso.slice(0, 7) ?? (a.anoBase ? chaveMes(a.anoBase, 1) : null);
    const f = a.abertura?.dtFin?.iso.slice(0, 7) ?? (a.anoBase ? chaveMes(a.anoBase, 12) : null);
    if (i) ini.push(i);
    if (f) fim.push(f);
  }
  return ini.length && fim.length ? [ini.sort()[0]!, fim.sort().at(-1)!] : null;
}

/** Safras que começam dentro do intervalo carregado (a última pode estar incompleta). */
function safrasDisponiveis(cob: [string, string], mesInicio: number): Periodo[] {
  const lista: Periodo[] = [];
  for (let a = Number(cob[0].slice(0, 4)) - 1; a <= Number(cob[1].slice(0, 4)); a++) {
    const p = periodoSafra(a, mesInicio);
    if (p.inicio >= cob[0] && p.inicio <= cob[1]) lista.push(p);
  }
  return lista;
}

/** Período efetivo a partir do estado (corrigindo escolhas que não existem mais). */
function resolverPeriodo(estado: EstadoPainel, ano: number, cob: [string, string] | null): Periodo {
  const e = estado.periodo;
  if (e.tipo === 'safra' && cob) {
    const safras = safrasDisponiveis(cob, e.mesInicioSafra);
    if (safras.length) {
      // Padrão: a safra completa mais recente (a última pode estar em andamento).
      const padrao = [...safras].reverse().find((p) => p.fim <= cob[1]) ?? safras.at(-1)!;
      const atual = safras.find((p) => Number(p.inicio.slice(0, 4)) === e.safra) ?? padrao;
      e.safra = Number(atual.inicio.slice(0, 4));
      return atual;
    }
  }
  if (e.tipo === 'livre' && cob) {
    let de = e.de && e.de >= cob[0] && e.de <= cob[1] ? e.de : chaveMes(ano, 1);
    let ate = e.ate && e.ate >= cob[0] && e.ate <= cob[1] ? e.ate : cob[1] < chaveMes(ano, 12) ? cob[1] : chaveMes(ano, 12);
    if (de > ate) [de, ate] = [ate, de];
    const meses = mesesEntre(de, ate);
    if (meses.length > MAXIMO_MESES_LIVRE) ate = somarMeses(de, MAXIMO_MESES_LIVRE - 1);
    e.de = de;
    e.ate = ate;
    return { tipo: 'livre', inicio: de, fim: ate };
  }
  return periodoAno(ano);
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
  const cob = cobertura(analises, estado.produtor);
  const periodo = ano === null ? null : resolverPeriodo(estado, ano, cob);

  // Ano com arquivo parcial (termina antes de 31/12): aparece como "(prévia)" no seletor.
  const anoEhPrevia = (a: number): boolean => detectarPrevia(analises.filter((r) => r.arquivo.anoBase === a).map((r) => r.arquivo)) !== null;
  const opcoesVisao = { criterio: estado.criterio, ajustes: estado.ajustes };
  const visao = ano === null || !periodo ? null : montarVisao(analises, estado.produtor, ano, { ...opcoesVisao, periodo, filtro: estado.filtro });
  // Planejamento IRPF e Comparativo: sempre o ano civil inteiro, sem filtro (o IRPF é anual e por CPF).
  const visaoAno = ano === null ? null : periodo?.tipo === 'ano' && !filtroAtivo(estado.filtro) ? visao : montarVisao(analises, estado.produtor, ano, opcoesVisao);
  const variosProdutores = (visao?.arquivos.length ?? 0) > 1;

  const opcoesProdutor = [
    `<option value="${TODOS}">Todos os produtores (${produtores.size})</option>`,
    ...[...produtores.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([cpf, nome]) => `<option value="${esc(cpf)}" ${cpf === estado.produtor ? 'selected' : ''}>${esc(nome)} · ${esc(formatarCpfCnpj(cpf))}</option>`),
  ].join('');

  const avisos = [...(visao?.avisosConsolidacao ?? []), ...(visao?.avisosPeriodo ?? [])];
  const alertas = visao ? gerarAlertas(dadosAlertas(visao)) : [];
  const mesesLivro = visao ? [...new Set(visao.lancamentos.map((l) => l.data.iso.slice(0, 7)))].sort() : [];
  if (estado.mesLivro && !mesesLivro.includes(estado.mesLivro)) estado.mesLivro = '';

  raiz.innerHTML = `
    <section class="card barra-painel" aria-label="O que o painel está mostrando">
      <label>Produtor<select data-sel="produtor">${opcoesProdutor}</select></label>
      ${seletorPeriodo(estado, anos, anoEhPrevia, cob)}
      ${variosProdutores ? `
        <label class="criterio">Como consolidar
          <select data-sel="criterio">
            ${(Object.keys(DESCRICAO_CRITERIO) as CriterioConsolidacao[]).map((c) => `<option value="${c}" ${c === estado.criterio ? 'selected' : ''}>${esc(DESCRICAO_CRITERIO[c])}</option>`).join('')}
          </select>
        </label>` : ''}
      ${visao ? `
        <button type="button" class="indicador-saude semaforo semaforo-${visao.semaforo}" data-validador title="Abrir o Validador">
          ${esc(SAUDE[visao.semaforo])}<span class="botao-link">ver no Validador</span>
        </button>
        <details class="menu-imprimir">
          <summary class="botao botao-imprimir">${iconeImpressora}Imprimir relatórios</summary>
          <div class="menu-imprimir-opcoes" role="menu">
            ${variosProdutores ? `
              <fieldset class="modo-relatorio">
                <legend>Vários produtores</legend>
                <label><input type="radio" name="modo-relatorio" value="unificado" ${estado.modoRelatorio === 'unificado' ? 'checked' : ''} data-modo-relatorio> Unificado <small>um relatório, com o produtor em cada lançamento</small></label>
                <label><input type="radio" name="modo-relatorio" value="separado" ${estado.modoRelatorio === 'separado' ? 'checked' : ''} data-modo-relatorio> Separado <small>um relatório por produtor, cada um em nova página</small></label>
              </fieldset>` : ''}
            <button type="button" role="menuitem" data-imprimir="completo"><strong>Relatório completo</strong><small>todas as abas, menos o Detalhamento</small></button>
            <button type="button" role="menuitem" data-imprimir="executivo"><strong>Relatório executivo</strong><small>indicadores, gráficos e destaques</small></button>
            <div class="item-livro">
              <button type="button" role="menuitem" data-razao="livro"><strong>${TITULO_RAZAO.livro}</strong><small>lançamentos, saldo e totais por mês</small></button>
              <label>Mês
                <select data-mes-livro>
                  <option value="">${esc(visao.termos.todo.replace(/^(o|a) /, '').replace(/^./, (c) => c.toUpperCase()))}</option>
                  ${mesesLivro.map((m) => `<option value="${m}" ${m === estado.mesLivro ? 'selected' : ''}>${esc(NOMES_MES[Number(m.slice(5, 7)) - 1]!)}/${m.slice(0, 4)}</option>`).join('')}
                </select>
              </label>
            </div>
            <button type="button" role="menuitem" data-razao="imovel"><strong>${TITULO_RAZAO.imovel}</strong><small>lançamentos e subtotal de cada imóvel</small></button>
            <button type="button" role="menuitem" data-razao="conta"><strong>${TITULO_RAZAO.conta}</strong><small>para conferir com o extrato</small></button>
            <button type="button" role="menuitem" data-razao="participante"><strong>${TITULO_RAZAO.participante}</strong><small>cada cliente e fornecedor, com % do total</small></button>
            <button type="button" role="menuitem" data-imprimir="dirpf"><strong>Ficha Atividade Rural da DIRPF</strong><small>ano civil ${ano}, um produtor por página, sem filtro</small></button>
            ${filtroAtivo(estado.filtro) ? '<p class="ajuda">Os relatórios saem com o filtro aplicado no Painel (exceto a ficha da DIRPF).</p>' : ''}
            <p class="ajuda dica-cor">Saiu sem cor? Na janela de impressão, em "Cor" escolha <strong>Colorido</strong> e, em "Mais definições", marque <strong>Gráficos de plano de fundo</strong>.</p>
          </div>
        </details>` : ''}
    </section>
    ${avisos.length ? `<section class="avisos-consolidacao" role="note">${iconeAlerta}<ul>${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></section>` : ''}
    ${visao ? blocoFiltros(visao) : ''}
    ${visao && alertas.length ? blocoAlertas(alertas, estado.alertasAbertos, textoComparacao(visao)) : ''}
    <nav class="abas-painel" role="tablist" aria-label="Abas do Painel">
      ${ABAS.map(([id, rotulo]) => `<button type="button" role="tab" id="tab-${id}" aria-controls="conteudo-painel" aria-selected="${id === estado.aba}" tabindex="${id === estado.aba ? 0 : -1}" data-aba="${id}">${rotulo}</button>`).join('')}
    </nav>
    <section id="conteudo-painel" class="conteudo-painel" role="tabpanel" aria-labelledby="tab-${estado.aba}"></section>
  `;

  const redesenhar = (): void => montarPainel(raiz, analises, estado, irParaValidador);
  const acoes: AcoesPainel = {
    filtrar: (d, valor) => {
      // Clicar de novo no que já está escolhido tira o filtro (liga/desliga).
      if (valor === null || estado.filtro[d] === valor) delete estado.filtro[d];
      else estado.filtro[d] = valor;
      redesenhar();
    },
    abrirAba: (aba) => {
      estado.aba = aba;
      redesenhar();
      raiz.querySelector<HTMLElement>('#conteudo-painel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    ajustarNatureza: (chave, natureza) => {
      if (natureza) estado.ajustes[chave] = natureza;
      else delete estado.ajustes[chave];
      estado.aoMudarAjustes?.(estado.ajustes);
      redesenhar();
    },
  };

  const conteudo = raiz.querySelector<HTMLElement>('#conteudo-painel')!;
  if (!visao || !visaoAno) {
    conteudo.innerHTML = '<section class="card"><p>Os arquivos carregados não têm ano-base identificado (registro 0000). Confira no Validador.</p></section>';
  } else {
    const soAnoCivil = (texto: string): string =>
      periodo?.tipo !== 'ano' || filtroAtivo(estado.filtro)
        ? `<p class="nota-ano-civil">${iconeInfo}${esc(texto)}</p>`
        : '';
    const desenhar: Record<AbaPainel, () => void> = {
      executiva: () => abaVisaoExecutiva(conteudo, visao, acoes),
      fluxo: () => abaFluxoCaixa(conteudo, visao, acoes),
      receitas: () => abaReceitasDespesas(conteudo, visao, acoes),
      imoveis: () => abaImoveis(conteudo, visao, acoes),
      comparativo: () => {
        abaComparativo(conteudo, analises, visaoAno.ano);
        conteudo.insertAdjacentHTML('afterbegin', soAnoCivil(`O Comparativo usa sempre os anos civis inteiros, sem o período e os filtros escolhidos acima.`));
      },
      planejamento: () => {
        abaPlanejamento(conteudo, analises, visaoAno, estado.plano);
        conteudo.insertAdjacentHTML('afterbegin', soAnoCivil(`O IRPF é anual e por CPF: o Planejamento usa o ano civil ${visaoAno.ano} inteiro, sem o período e os filtros escolhidos acima.`));
      },
      detalhamento: () => abaDetalhamento(conteudo, visao),
    };
    desenhar[estado.aba]();
  }

  raiz.querySelectorAll<HTMLSelectElement | HTMLInputElement>('[data-sel]').forEach((s) => {
    s.addEventListener('change', () => {
      const p = estado.periodo;
      const sel = s.dataset.sel;
      if (sel === 'produtor') estado.produtor = s.value;
      if (sel === 'ano') estado.ano = Number(s.value);
      if (sel === 'criterio') estado.criterio = s.value as CriterioConsolidacao;
      if (sel === 'tipo-periodo') p.tipo = s.value as TipoPeriodo;
      if (sel === 'safra') p.safra = Number(s.value);
      if (sel === 'inicio-safra') p.mesInicioSafra = Number(s.value);
      if (sel === 'de' && /^\d{4}-\d{2}$/.test(s.value)) p.de = s.value;
      if (sel === 'ate' && /^\d{4}-\d{2}$/.test(s.value)) p.ate = s.value;
      // Mudou o recorte: o filtro cruzado anterior pode não existir mais.
      if (sel === 'produtor' || sel === 'ano' || sel === 'tipo-periodo' || sel === 'safra' || sel === 'inicio-safra') estado.filtro = {};
      redesenhar();
    });
  });
  raiz.querySelectorAll<HTMLButtonElement>('[data-tirar-filtro]').forEach((b) => {
    b.addEventListener('click', () => acoes.filtrar(b.dataset.tirarFiltro as Dimensao, null));
  });
  raiz.querySelector<HTMLButtonElement>('[data-limpar-filtros]')?.addEventListener('click', () => {
    estado.filtro = {};
    redesenhar();
  });
  raiz.querySelector<HTMLDetailsElement>('.quadro-alertas')?.addEventListener('toggle', (e) => {
    estado.alertasAbertos = (e.currentTarget as HTMLDetailsElement).open;
  });
  raiz.querySelectorAll<HTMLButtonElement>('[data-alerta]').forEach((b) => {
    b.addEventListener('click', () => {
      const al = alertas.find((x) => x.id === b.dataset.alerta)?.acao;
      if (!al) return;
      if (al.tipo === 'aba') acoes.abrirAba(al.aba);
      else {
        estado.filtro = { ...al.filtro };
        redesenhar();
      }
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
  if (visao && periodo) {
    const menu = raiz.querySelector<HTMLDetailsElement>('.menu-imprimir');
    raiz.querySelectorAll<HTMLInputElement>('[data-modo-relatorio]').forEach((r) => {
      r.addEventListener('change', () => { if (r.checked) estado.modoRelatorio = r.value as ModoRelatorio; });
    });
    raiz.querySelector<HTMLSelectElement>('[data-mes-livro]')?.addEventListener('change', (e) => {
      estado.mesLivro = (e.currentTarget as HTMLSelectElement).value;
    });
    // Relatório "separado": uma Visão por produtor, com o mesmo período e filtro.
    const visoesParaImprimir = (): Visao[] => {
      if (!variosProdutores || estado.modoRelatorio === 'unificado' || ano === null) return [visao];
      return visao.arquivos
        .map((a) => montarVisao(analises, a.abertura?.cpf ?? '', ano, { ...opcoesVisao, periodo, filtro: estado.filtro }))
        .filter((x): x is Visao => x !== null)
        .sort((x, y) => x.rotulo.localeCompare(y.rotulo, 'pt-BR'));
    };
    raiz.querySelector<HTMLButtonElement>('[data-imprimir="executivo"]')?.addEventListener('click', () => {
      if (menu) menu.open = false;
      imprimirExecutivo(visoesParaImprimir());
    });
    // Completo: as abas do Painel (menos Detalhamento) num só PDF.
    raiz.querySelector<HTMLButtonElement>('[data-imprimir="completo"]')?.addEventListener('click', () => {
      if (menu) menu.open = false;
      if (!visaoAno) return;
      imprimirCompleto({
        visoes: visoesParaImprimir(),
        visaoAno,
        analises,
        planos: montarPlanos(analises, visaoAno, estado.plano),
        simulacao: estado.plano,
      });
    });
    // DIRPF: sempre o ano civil inteiro, por CPF (o IRPF é anual e de cada pessoa).
    raiz.querySelector<HTMLButtonElement>('[data-imprimir="dirpf"]')?.addEventListener('click', () => {
      if (menu) menu.open = false;
      if (visaoAno) imprimirDirpf(montarFichas(analises, visaoAno, estado.plano));
    });
    raiz.querySelectorAll<HTMLButtonElement>('[data-razao]').forEach((b) => {
      b.addEventListener('click', () => {
        if (menu) menu.open = false;
        const tipo = b.dataset.razao as TipoRazao;
        imprimirRazao(visoesParaImprimir(), tipo, tipo === 'livro' && estado.mesLivro ? { mes: estado.mesLivro } : {});
      });
    });
  }
}

/** Seletor de período: ano civil, safra ou período livre. */
function seletorPeriodo(estado: EstadoPainel, anos: readonly number[], anoEhPrevia: (a: number) => boolean, cob: [string, string] | null): string {
  const p = estado.periodo;
  const tipo = `
    <label>Período
      <select data-sel="tipo-periodo">
        <option value="ano" ${p.tipo === 'ano' ? 'selected' : ''}>Ano civil</option>
        <option value="safra" ${p.tipo === 'safra' ? 'selected' : ''}>Safra</option>
        <option value="livre" ${p.tipo === 'livre' ? 'selected' : ''}>Escolher meses</option>
      </select>
    </label>`;
  if (p.tipo === 'safra' && cob) {
    const safras = safrasDisponiveis(cob, p.mesInicioSafra);
    return `${tipo}
      <label>Safra começa em
        <select data-sel="inicio-safra">${NOMES_MES.map((n, i) => `<option value="${i + 1}" ${i + 1 === p.mesInicioSafra ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label>Safra
        <select data-sel="safra">${safras.map((s) => `<option value="${s.inicio.slice(0, 4)}" ${Number(s.inicio.slice(0, 4)) === p.safra ? 'selected' : ''}>${nomeSafra(s)} (${mesCurtoAno(s.inicio)} a ${mesCurtoAno(s.fim)})${s.fim > cob[1] ? ' · incompleta' : ''}</option>`).join('')}</select>
      </label>`;
  }
  if (p.tipo === 'livre' && cob) {
    return `${tipo}
      <label>De<input type="month" data-sel="de" value="${esc(p.de ?? '')}" min="${cob[0]}" max="${cob[1]}" /></label>
      <label>Até<input type="month" data-sel="ate" value="${esc(p.ate ?? '')}" min="${cob[0]}" max="${cob[1]}" /></label>`;
  }
  return `${tipo}
    <label>Ano-base<select data-sel="ano">${anos.map((a) => `<option value="${a}" ${a === estado.ano ? 'selected' : ''}>${a}${anoEhPrevia(a) ? ' (prévia)' : ''}</option>`).join('')}</select></label>`;
}

/** Faixa "Filtrando por…" com um botão para tirar cada filtro e outro para limpar tudo. */
function blocoFiltros(v: Visao): string {
  const ativos = DIMENSOES.filter((d) => v.filtro[d]);
  if (ativos.length === 0) {
    return '<p class="dica-filtro">Dica: clique em um mês, imóvel, cliente, fornecedor ou natureza de despesa nos gráficos para filtrar o painel inteiro.</p>';
  }
  return `
    <section class="faixa-filtros" aria-label="Filtros aplicados">
      <span class="faixa-filtros-rotulo">Filtrando:</span>
      ${ativos.map((d) => `<button type="button" class="chip-filtro" data-tirar-filtro="${d}" title="Tirar este filtro">${esc(rotuloFiltro(v, d, v.filtro[d]!))}${iconeFechar}</button>`).join('')}
      <button type="button" class="botao-sec" data-limpar-filtros>Limpar filtros</button>
      <span class="faixa-filtros-total">${v.lancamentos.length.toLocaleString('pt-BR')} de ${v.base.length.toLocaleString('pt-BR')} lançamentos</span>
    </section>`;
}

const ROTULO_NIVEL: Record<Alerta['nivel'], string> = { risco: 'Risco', atencao: 'Atenção', oportunidade: 'Oportunidade', info: 'Informação' };

/** Alertas acionáveis: cada um com um botão que filtra o painel ou abre a aba certa. */
function blocoAlertas(alertas: readonly Alerta[], aberto: boolean, vs: string): string {
  const riscos = alertas.filter((a) => a.nivel === 'risco').length;
  return `
    <details class="quadro-alertas card" ${aberto ? 'open' : ''}>
      <summary><h2>${iconeAlerta}O que pede atenção agora</h2><span class="contagem-alertas">${alertas.length} ${alertas.length === 1 ? 'alerta' : 'alertas'}${riscos ? ` · ${riscos} de risco` : ''}</span></summary>
      <ul class="lista-alertas">
        ${alertas.map((a) => `
          <li class="alerta alerta-${a.nivel}">
            <span class="selo-nivel">${ROTULO_NIVEL[a.nivel]}</span>
            <div><strong>${esc(a.titulo)}</strong><p>${esc(a.texto)}</p></div>
            ${a.acao ? `<button type="button" class="botao-sec" data-alerta="${esc(a.id)}">${esc(a.acao.rotulo)}</button>` : ''}
          </li>`).join('')}
      </ul>
      <p class="ajuda">Alertas do painel calculados sobre o período inteiro, sem o filtro (comparação com ${vs.startsWith('safra') ? 'a' : 'o'} ${esc(vs)}). São sinais de gestão, não exigências da Receita.</p>
    </details>`;
}

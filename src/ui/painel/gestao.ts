/**
 * INDICADORES DE GESTÃO NA VISÃO EXECUTIVA E PONTE COM OS ALERTAS.
 *
 * - Capital de giro, concentração de compradores e despesas por natureza.
 * - "Ajustar classificação": a pessoa troca a natureza de um histórico e o
 *   painel inteiro recalcula (o ajuste vale para todos os lançamentos com o
 *   mesmo histórico, sem contar números como competência ou nº da nota).
 *
 * A lógica dos números fica em domain/gestao.ts e domain/naturezas.ts (testada);
 * aqui só a tela.
 */
import { agruparPor, mensalPeriodo, totalizar, valorDespesa } from '../../domain/agregacoes';
import { nomeMes } from '../../domain/destaques';
import { formatarReais } from '../../domain/dinheiro';
import { formatarCpfCnpj } from '../../domain/documentos';
import {
  capitalDeGiro,
  concentracaoCompradores,
  despesasPorNatureza,
  type Dimensao,
  type EntradaAlertas,
} from '../../domain/gestao';
import { chaveHistorico, NATUREZAS, NOMES_CURTOS_NATUREZA, NOMES_NATUREZA, type Natureza, type OrigemNatureza } from '../../domain/naturezas';
import type { ECharts } from 'echarts/core';
import { COR, desenharGrafico, eixoValor } from '../graficos/echarts';
import { esc } from '../html';
import { pctTexto } from './componentes';
import { nomeImovel, textoComparacao, type Visao } from './contexto';
import type { AbaPainel } from './modulo';

/** O que as abas podem pedir ao Painel (filtrar, abrir outra aba, reclassificar). */
export interface AcoesPainel {
  /** Liga o filtro (ou desliga, se já estava com esse valor). `null` tira o filtro da dimensão. */
  filtrar: (d: Dimensao, valor: string | null) => void;
  abrirAba: (aba: AbaPainel) => void;
  ajustarNatureza: (chave: string, natureza: Natureza | null) => void;
}

/** Monta a entrada dos alertas a partir da Visão, SEM o filtro cruzado. */
export function dadosAlertas(v: Visao): EntradaAlertas {
  const imoveis = agruparPor(v.base, (l) => `${l.cpf}|${l.codImovel}`)
    .filter((g) => !g.chave.endsWith('|000'))
    .map((g) => {
      const [cpf, cod] = g.chave.split('|') as [string, string];
      return { chave: g.chave, nome: `${v.individual ? '' : `${v.arquivos.find((a) => a.abertura?.cpf === cpf)?.abertura?.nome ?? ''} · `}${nomeImovel(v, cpf, cod)}`, resultado: g.resultado, receitas: g.receitas };
    });
  return {
    meses: mensalPeriodo(v.base, v.meses.map((m) => m.mes)),
    totais: totalizar(v.base),
    anterior: v.anterior ? { totais: totalizar(v.anterior.base), naturezas: despesasPorNatureza(v.anterior.base) } : null,
    vs: textoComparacao(v),
    lancamentos: v.base,
    naturezas: despesasPorNatureza(v.base),
    imoveis,
    anoCivil: v.periodo.tipo === 'ano' ? { ano: v.ano, previaAteMes: v.previa?.ateMes ?? null } : null,
    formatarDoc: formatarCpfCnpj,
  };
}

const ORIGEM: Record<OrigemNatureza, string> = {
  ajuste: 'ajustado por você',
  documento: 'pelo documento (folha)',
  historico: 'pelo histórico',
  participante: 'pelo participante',
  'sem-regra': 'não identificado',
};

/** Seção "Indicadores de gestão" (HTML). Os gráficos são desenhados por `desenharGestao`. */
export function htmlGestao(v: Visao): string {
  const cg = capitalDeGiro(v.meses);
  const conc = concentracaoCompradores(v.lancamentos);
  const naturezas = despesasPorNatureza(v.recorte('natureza'));
  const outras = naturezas.find((n) => n.natureza === 'outras');
  const fraco = naturezas.reduce((s, n) => s + n.inferidoFraco, 0);
  const totalDesp = naturezas.reduce((s, n) => s + Math.max(0, n.valor), 0);
  const t = v.termos;

  const textoCg = cg.necessidade > 0 && cg.mesPior
    ? `Pior ponto em ${nomeMes(cg.mesPior)}/${cg.mesPior.slice(0, 4)}. ${cg.recuperacao ? `Voltou ao positivo em ${nomeMes(cg.recuperacao)}.` : `Não voltou ao positivo ${t.no}.`}`
    : `O caixa da atividade ficou positivo em todos os meses ${t.do}.`;
  const nivel = { baixa: 'baixa', moderada: 'moderada', alta: 'alta', 'sem-receita': '—' }[conc.nivel];

  // Históricos agrupados para o ajuste (período inteiro, sem filtro: o ajuste vale para tudo).
  const grupos = new Map<string, { exemplo: string; valor: number; qtd: number; natureza: Natureza; origem: OrigemNatureza }>();
  for (const l of v.base) {
    if (!l.natureza || !l.origemNatureza) continue;
    const k = chaveHistorico(l.historico);
    const g = grupos.get(k) ?? { exemplo: l.historico, valor: 0, qtd: 0, natureza: l.natureza, origem: l.origemNatureza };
    g.valor += valorDespesa(l);
    g.qtd += 1;
    grupos.set(k, g);
  }
  const linhasAjuste = [...grupos.entries()].sort((a, b) => {
    // Primeiro o que é menos confiável (não identificado, pelo participante), depois por valor.
    const peso = (o: OrigemNatureza): number => (o === 'sem-regra' ? 0 : o === 'participante' ? 1 : 2);
    return peso(a[1].origem) - peso(b[1].origem) || b[1].valor - a[1].valor;
  });

  return `
    <section class="secao-gestao" aria-labelledby="titulo-gestao">
      <h3 id="titulo-gestao" class="titulo-secao">Indicadores de gestão</h3>
      <div class="grade-gestao">
        <article class="card cartao-gestao ${cg.necessidade > 0 ? 'tom-negativo' : 'tom-positivo'}">
          <span class="kpi-painel-rotulo">Necessidade de capital de giro</span>
          <span class="kpi-painel-valor num">${formatarReais(cg.necessidade)}</span>
          <p>${esc(textoCg)}</p>
          <p class="ajuda">Caixa acumulado da atividade a partir de zero em ${esc(nomeMes(v.periodo.inicio))}/${v.periodo.inicio.slice(0, 4)}. Não inclui saldo anterior, financiamentos nem gastos pessoais.${v.periodo.tipo !== 'safra' ? ' Na visão de Safra, mostra quanto a safra exigiu antes da colheita.' : ''}</p>
          ${cg.mesPior ? `<button type="button" class="botao-link" data-filtrar-mes="${cg.mesPior}">Ver o mês do pior ponto</button>` : ''}
        </article>
        <article class="card cartao-gestao ${conc.nivel === 'alta' ? 'tom-negativo' : ''}">
          <span class="kpi-painel-rotulo">Concentração de compradores</span>
          <span class="kpi-painel-valor num">${conc.maior ? pctTexto(conc.maior.parte) : '—'}</span>
          <p>${conc.maior
            ? `da receita veio do maior comprador (${esc(formatarCpfCnpj(conc.maior.id))}). Os 3 maiores somam ${pctTexto(conc.top3)}, entre ${conc.compradores} ${conc.compradores === 1 ? 'comprador' : 'compradores'}.`
            : `Sem receitas ${esc(t.no)}.`}</p>
          <p class="ajuda">Concentração ${esc(nivel)} (índice HHI ${conc.hhi.toLocaleString('pt-BR')}: até 1.500 baixa, acima de 2.500 alta). Quanto mais alta, mais o caixa depende de poucos compradores.</p>
          ${conc.maior ? `<button type="button" class="botao-link" data-filtrar-participante="${esc(conc.maior.id)}">Filtrar o maior comprador</button>` : ''}
        </article>
      </div>
      <section class="card grafico-card">
        <h3>${naturezas.length && naturezas[0]!.natureza !== 'outras'
          ? esc(`${NOMES_CURTOS_NATUREZA[naturezas[0]!.natureza]} é a maior despesa: ${pctTexto(naturezas[0]!.parte)} do total`)
          : 'Despesas por natureza'}</h3>
        <p class="ajuda">Natureza <strong>inferida</strong> pelo painel a partir do histórico, do tipo de documento e do participante (o LCDPR não tem esse campo). É uma visão gerencial: não muda receita, despesa, resultado nem IRPF. Clique numa barra para filtrar.</p>
        <div class="grafico" id="g-naturezas" data-grafico style="height:${Math.max(200, naturezas.length * 40 + 40)}px" role="img" aria-label="Despesas por natureza"></div>
        ${totalDesp > 0 && (outras || fraco > 0) ? `<p class="ajuda">${outras ? `${pctTexto(outras.parte)} sem natureza identificada. ` : ''}${fraco > 0 ? `${pctTexto(fraco / totalDesp)} foi deduzido pelo participante ou não identificado: confira abaixo.` : ''}</p>` : ''}
        <details class="ajuste-naturezas">
          <summary>Ajustar a classificação (${linhasAjuste.length} históricos)</summary>
          <p class="ajuda">Troque a natureza de um histórico e o painel recalcula. Vale para todos os lançamentos com o mesmo texto (números como competência e nº da nota são ignorados). Os ajustes ficam guardados neste navegador só com "Manter as análises neste computador" ligado.</p>
          <div class="tabela-rolagem">
            <table class="tabela tabela-compacta">
              <thead><tr><th>Histórico</th><th class="num">Lanç.</th><th class="num">Valor</th><th>Como foi classificado</th><th>Natureza</th></tr></thead>
              <tbody>
                ${linhasAjuste.map(([chave, g]) => `
                  <tr>
                    <td>${esc(g.exemplo)}</td>
                    <td class="num">${g.qtd.toLocaleString('pt-BR')}</td>
                    <td class="num">${formatarReais(g.valor)}</td>
                    <td><span class="origem origem-${g.origem}">${ORIGEM[g.origem]}</span></td>
                    <td>
                      <select data-ajuste="${esc(chave)}" aria-label="Natureza de ${esc(g.exemplo)}">
                        ${NATUREZAS.map((n) => `<option value="${n}" ${n === g.natureza ? 'selected' : ''}>${esc(NOMES_NATUREZA[n])}</option>`).join('')}
                      </select>
                      ${g.origem === 'ajuste' ? `<button type="button" class="botao-link" data-desfazer-ajuste="${esc(chave)}">desfazer</button>` : ''}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </section>`;
}

/** Desenha o gráfico de naturezas e liga os botões da seção. */
export function desenharGestao(raiz: HTMLElement, v: Visao, acoes: AcoesPainel): void {
  const naturezas = despesasPorNatureza(v.recorte('natureza'));
  const escolhida = v.filtro.natureza;
  const el = raiz.querySelector<HTMLElement>('#g-naturezas');
  if (el) {
    const g = desenharGrafico(el, {
      legend: { show: false },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      xAxis: eixoValor(),
      yAxis: { type: 'category', inverse: true, data: naturezas.map((n) => NOMES_CURTOS_NATUREZA[n.natureza]), axisTick: { show: false }, axisLabel: { color: COR.textoSuave } },
      series: [{
        name: 'Despesas', type: 'bar', cursor: 'pointer',
        data: naturezas.map((n) => ({
          value: n.valor,
          itemStyle: { color: n.natureza === 'outras' ? COR.despesaClara : COR.despesa, opacity: escolhida && escolhida !== n.natureza ? 0.3 : 1 },
        })),
        label: { show: true, position: 'right', formatter: (p: { dataIndex: number }) => pctTexto(naturezas[p.dataIndex]?.parte ?? 0), color: COR.textoSuave },
        itemStyle: { borderRadius: [0, 4, 4, 0] },
      }],
    });
    aoClicar(g, (i) => { const n = naturezas[i]; if (n) acoes.filtrar('natureza', n.natureza); });
  }
  raiz.querySelector<HTMLButtonElement>('[data-filtrar-mes]')?.addEventListener('click', (e) => acoes.filtrar('mes', (e.currentTarget as HTMLElement).dataset.filtrarMes!));
  raiz.querySelector<HTMLButtonElement>('[data-filtrar-participante]')?.addEventListener('click', (e) => acoes.filtrar('participante', (e.currentTarget as HTMLElement).dataset.filtrarParticipante!));
  raiz.querySelectorAll<HTMLSelectElement>('[data-ajuste]').forEach((s) => {
    s.addEventListener('change', () => acoes.ajustarNatureza(s.dataset.ajuste!, s.value as Natureza));
  });
  raiz.querySelectorAll<HTMLButtonElement>('[data-desfazer-ajuste]').forEach((b) => {
    b.addEventListener('click', () => acoes.ajustarNatureza(b.dataset.desfazerAjuste!, null));
  });
}

/**
 * Clique num gráfico: chama `fn` com o índice da categoria clicada. Funciona
 * clicando na barra/ponto E na área da categoria (mais fácil no celular).
 */
export function aoClicar(g: ECharts, fn: (indice: number) => void): void {
  g.on('click', (p) => {
    const i = (p as { dataIndex?: number }).dataIndex;
    if (typeof i === 'number') fn(i);
  });
}

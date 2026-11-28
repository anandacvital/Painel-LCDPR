/**
 * RELATÓRIOS PARA IMPRESSÃO (A4) — e "Salvar como PDF" pelo próprio navegador.
 *
 * Por que imprimir pelo navegador (window.print) e não gerar o PDF com uma
 * biblioteca? Porque assim nada sai do computador, não há dependência nova e
 * o PDF sai com texto selecionável e gráficos vetoriais (ECharts em SVG).
 *
 * Como funciona:
 * 1. o relatório é montado numa área própria (#area-impressao), com largura de
 *    uma folha A4 (fora da tela, para os gráficos terem tamanho certo);
 * 2. o CSS de impressão (styles/impressao.css) esconde o resto da página e
 *    mostra só essa área;
 * 3. depois da impressão, a área é esvaziada (o relatório não fica na memória).
 *
 * Dois relatórios:
 * - VALIDADOR: conclusão, identificação, contagens, resumo por regra e TODAS as
 *   ocorrências com linha, campo e como corrigir;
 * - EXECUTIVO (Painel do Livro Caixa): indicadores, destaques, gráficos e tabelas
 *   para decisão.
 */
import { agruparPor } from '../domain/agregacoes';
import { formatarDataIso } from '../domain/datas';
import { destaquesExecutivos, nomeMes, tituloImoveis, tituloReceitasDespesas } from '../domain/destaques';
import { formatarReais } from '../domain/dinheiro';
import { formatarCpfCnpj } from '../domain/documentos';
import { AVISO_ESTIMATIVA } from '../domain/irpf';
import { variacao } from '../domain/destaques';
import { FORMA_APUR, TIPO_EXPLORACAO } from '../parser/leiaute';
import type { ResultadoAnalise, Severidade } from '../parser/modelo';
import { COR, desenharGrafico, eixoMeses, eixoValor, liberarGraficos, reaisCompacto } from '../ui/graficos/echarts';
import { esc, numeroBR } from '../ui/html';
import { DESCRICAO_CRITERIO } from '../domain/consolidacao';
import { avisoPrevia, filtrosDescritos, nomeImovel, TEXTO_OPCAO, textoComparacao, type Visao } from '../ui/painel/contexto';
import { capitalDeGiro, concentracaoCompradores, despesasPorNatureza } from '../domain/gestao';
import { NOMES_CURTOS_NATUREZA } from '../domain/naturezas';
import { rotulosEixo } from '../domain/periodo';
import { agruparPorRegra, conclusaoSaude, ROTULO } from '../ui/saudeArquivo';

const pct = (f: number | null): string => (f === null ? '—' : `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

/** "26/11/2026 às 14:32" */
function dataEmissao(agora = new Date()): string {
  const d = agora.toLocaleDateString('pt-BR');
  const h = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${d} às ${h}`;
}

/** Cabeçalho comum: título do relatório + quem, CPF, ano-base e emissão. */
export function cabecalho(titulo: string, campos: [string, string][]): string {
  return `
    <header class="rel-cabecalho">
      <div class="rel-marca">Painel LCDPR · Grupo Paraná</div>
      <h1>${esc(titulo)}</h1>
      <dl class="rel-ident">
        ${campos.map(([r, v]) => `<div><dt>${esc(r)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        <div><dt>Emitido em</dt><dd>${esc(dataEmissao())}</dd></div>
      </dl>
    </header>`;
}

export const RODAPE = `
  <footer class="rel-rodape">
    Documento gerado no navegador a partir do arquivo LCDPR; nenhum dado foi enviado pela internet.
    Contém informações fiscais sigilosas: guarde e compartilhe com cuidado.
    <span class="rel-versao">Painel LCDPR, versão ${__VERSAO__}.</span>
  </footer>`;

// ===========================================================================
// RELATÓRIO DO VALIDADOR
// ===========================================================================
export function htmlRelatorioValidador(r: ResultadoAnalise): string {
  const a = r.arquivo;
  const ab = a.abertura;
  const grupos = agruparPorRegra(r.ocorrencias);
  const peso: Record<Severidade, number> = { erro: 0, alerta: 1, info: 2 };
  const ocorrencias = [...r.ocorrencias].sort((x, y) => peso[x.severidade] - peso[y.severidade] || (x.linha ?? 0) - (y.linha ?? 0));

  return `
    ${cabecalho('Relatório do Validador', [
      ['Produtor', ab?.nome ?? '—'],
      ['CPF', ab ? formatarCpfCnpj(ab.cpf) : '—'],
      ['Ano-base', String(a.anoBase ?? '—')],
      ['Arquivo', a.nomeArquivo],
    ])}

    <section class="rel-bloco">
      <h2 class="rel-conclusao rel-${r.saude.semaforo}">${esc(conclusaoSaude(r))}</h2>
      <div class="rel-kpis">
        <div class="rel-kpi rel-kpi-erro"><span>Erros</span><strong>${numeroBR(r.saude.erros)}</strong><small>impedem a transmissão ou distorcem os números</small></div>
        <div class="rel-kpi rel-kpi-alerta"><span>Alertas</span><strong>${numeroBR(r.saude.alertas)}</strong><small>revisar antes de entregar</small></div>
        <div class="rel-kpi rel-kpi-info"><span>Informações</span><strong>${numeroBR(r.saude.infos)}</strong><small>contexto, sem ação obrigatória</small></div>
      </div>
      <table class="rel-tabela rel-tabela-ident">
        <tbody>
          <tr><th>Período</th><td>${ab?.dtIni && ab.dtFin ? `${formatarDataIso(ab.dtIni.iso)} a ${formatarDataIso(ab.dtFin.iso)}` : '—'}</td>
              <th>Forma de apuração</th><td>${esc(a.formaApuracao ? (FORMA_APUR[a.formaApuracao] ?? a.formaApuracao) : '—')}</td></tr>
          <tr><th>Lançamentos (Q100)</th><td class="num">${numeroBR(a.lancamentos.length)}</td>
              <th>Imóveis / contas</th><td class="num">${a.imoveis.length} / ${a.contas.length}</td></tr>
          <tr><th>Linhas do arquivo</th><td class="num">${numeroBR(a.totalLinhas)}</td>
              <th>Codificação</th><td>${esc(a.codificacao.toUpperCase())}</td></tr>
        </tbody>
      </table>
    </section>

    ${grupos.length === 0 ? '<p class="rel-ok">Nenhuma ocorrência: o arquivo passou em todas as verificações.</p>' : `
    <section class="rel-bloco">
      <h2>Resumo por regra</h2>
      <table class="rel-tabela">
        <thead><tr><th>Severidade</th><th>Categoria</th><th>Exemplo</th><th class="num">Qtd.</th></tr></thead>
        <tbody>${grupos.map((g) => `
          <tr><td><span class="rel-sev rel-sev-${g.severidade}">${ROTULO[g.severidade]}</span></td><td>${esc(g.categoria)}</td><td>${esc(g.exemplo)}</td><td class="num">${numeroBR(g.quantidade)}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section class="rel-bloco rel-quebra">
      <h2>Ocorrências (${numeroBR(ocorrencias.length)}), da mais grave para a mais leve</h2>
      <table class="rel-tabela rel-ocorrencias">
        <thead><tr><th>Severidade</th><th class="num">Linha</th><th>Registro / campo</th><th>Problema</th><th>Como corrigir</th></tr></thead>
        <tbody>${ocorrencias.map((o) => `
          <tr>
            <td><span class="rel-sev rel-sev-${o.severidade}">${ROTULO[o.severidade]}</span></td>
            <td class="num">${o.linha ?? '—'}</td>
            <td>${esc(o.registro ?? '—')}${o.campo ? `<br><small>${esc(o.campo)}</small>` : ''}</td>
            <td>${esc(o.problema)}</td>
            <td>${esc(o.comoCorrigir)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`}
    ${RODAPE}`;
}

// ===========================================================================
// RELATÓRIO EXECUTIVO (PAINEL DO LIVRO CAIXA)
// ===========================================================================

/**
 * Identificação comum dos relatórios do Painel: o NOME de cada produtor (não só
 * "Todos os produtores"), CPFs, período, filtros e critério de consolidação.
 */
export function camposVisao(v: Visao, extra: [string, string][] = []): [string, string][] {
  const nomes = v.arquivos.map((x) => x.abertura?.nome ?? x.nomeArquivo);
  const cpfs = [...new Set(v.arquivos.map((x) => x.abertura?.cpf).filter((c): c is string => !!c))];
  const filtros = filtrosDescritos(v);
  const periodo = v.periodo.tipo === 'ano'
    ? `Ano civil ${v.ano}${v.previa ? ` (prévia até ${v.previa.fim.split('-').reverse().join('/')})` : ''}`
    : v.rotuloPeriodo;
  return [
    [nomes.length > 1 ? `Produtores (${nomes.length})` : 'Produtor', nomes.length > 1 ? nomes.join(' · ') : v.rotulo],
    [cpfs.length > 1 ? 'CPFs' : 'CPF', cpfs.map(formatarCpfCnpj).join(', ') || '—'],
    ['Período', periodo],
    ...(v.consolidacao && v.arquivos.length > 1 ? [['Consolidação', DESCRICAO_CRITERIO[v.consolidacao.criterio]] as [string, string]] : []),
    ...(filtros.length ? [['Filtros aplicados', filtros.join(' · ')] as [string, string]] : []),
    ...extra,
  ];
}

/** Mês por extenso; com o ano quando o período passa de um ano civil. */
const mesRel = (v: Visao, chave: string): string => (v.periodo.tipo === 'ano' ? nomeMes(chave) : `${nomeMes(chave)}/${chave.slice(0, 4)}`);
function linhaVariacao(atual: number, anterior: number | undefined, maiorEhMelhor = true, vs = 'ano anterior'): string {
  const v = variacao(atual, anterior);
  if (v === null) return '';
  const bom = v >= 0 === maiorEhMelhor;
  return `<small class="${bom ? 'rel-boa' : 'rel-ruim'}">${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v))} vs. ${esc(vs)}</small>`;
}

export function htmlRelatorioExecutivo(v: Visao, prefixo = 'rel'): string {
  const t = v.totais;
  const a = v.anterior?.totais;
  const irpf = v.irpf?.atual ?? null;
  const destaques = destaquesExecutivos(t, v.meses, a, textoComparacao(v));
  const cg = capitalDeGiro(v.meses);
  const conc = concentracaoCompradores(v.lancamentos);
  const naturezas = despesasPorNatureza(v.lancamentos);

  const participantes = agruparPor(v.lancamentos, (l) => l.idPartic);
  const clientes = participantes.filter((g) => g.receitas > 0).sort((x, y) => y.receitas - x.receitas).slice(0, 5);
  const fornecedores = participantes.filter((g) => g.despesas > 0).sort((x, y) => y.despesas - x.despesas).slice(0, 5);
  const imoveis = agruparPor(v.lancamentos, (l) => `${l.cpf}|${l.codImovel}`).map((g) => {
    const [cpf, cod] = g.chave.split('|') as [string, string];
    const cad = v.arquivos.find((x) => x.abertura?.cpf === cpf)?.imoveis.find((i) => i.codigo === cod);
    return { ...g, nome: nomeImovel(v, cpf, cod), exploracao: cad ? (TIPO_EXPLORACAO[cad.tipoExploracao] ?? '—') : '—', participacao: cad?.participacao ?? null };
  }).sort((x, y) => y.resultado - x.resultado);
  const avisos = [...v.avisosConsolidacao, ...v.avisosPeriodo];
  const vs = textoComparacao(v);

  const tabelaTop = (titulo: string, lista: typeof clientes, campo: 'receitas' | 'despesas', total: number) => `
    <div>
      <h3>${esc(titulo)}</h3>
      <table class="rel-tabela">
        <thead><tr><th>CPF/CNPJ</th><th class="num">Valor</th><th class="num">% do total</th></tr></thead>
        <tbody>${lista.length ? lista.map((g) => `<tr><td class="num">${esc(formatarCpfCnpj(g.chave))}</td><td class="num">${formatarReais(g[campo])}</td><td class="num">${pct(total > 0 ? g[campo] / total : null)}</td></tr>`).join('') : '<tr><td colspan="3">Sem movimento.</td></tr>'}</tbody>
      </table>
    </div>`;

  return `
    ${cabecalho('Relatório Executivo do Livro Caixa', camposVisao(v))}

    ${v.previa ? `<div class="rel-avisos rel-bloco"><strong>Prévia do ano em andamento.</strong> ${esc(avisoPrevia(v))}</div>` : ''}
    <section class="rel-bloco">
      <div class="rel-kpis rel-kpis-5">
        <div class="rel-kpi rel-kpi-receita"><span>Receita bruta</span><strong>${formatarReais(t.receitas)}</strong>${linhaVariacao(t.receitas, a?.receitas, true, vs)}</div>
        <div class="rel-kpi rel-kpi-despesa"><span>Despesas</span><strong>${formatarReais(t.despesas)}</strong>${linhaVariacao(t.despesas, a?.despesas, false, vs)}</div>
        <div class="rel-kpi ${t.resultado < 0 ? 'rel-kpi-despesa' : 'rel-kpi-receita'}"><span>Resultado</span><strong>${formatarReais(t.resultado)}</strong>${linhaVariacao(t.resultado, a?.resultado, true, vs)}</div>
        <div class="rel-kpi"><span>Margem</span><strong>${pct(t.margem)}</strong></div>
        ${irpf
          ? `<div class="rel-kpi rel-kpi-irpf"><span>IRPF estimado</span><strong>${formatarReais(irpf.imposto)}</strong><small>${TEXTO_OPCAO[irpf.opcao]}${filtrosDescritos(v).length ? '; ano todo, sem o filtro' : ''}</small></div>`
          : '<div class="rel-kpi rel-kpi-irpf"><span>IRPF estimado</span><strong>—</strong><small>só no ano civil (o IRPF é anual)</small></div>'}
      </div>
      ${irpf ? `<p class="rel-nota">${esc(AVISO_ESTIMATIVA)}</p>` : ''}
      ${avisos.length ? `<div class="rel-avisos"><strong>Atenção na consolidação:</strong><ul>${avisos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    </section>

    <section class="rel-bloco">
      <h2>Destaques ${esc(v.termos.do)}</h2>
      <ol class="rel-destaques">${destaques.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>
    </section>

    <section class="rel-bloco rel-sem-quebra">
      <h2>Indicadores de gestão</h2>
      <div class="rel-kpis rel-kpis-gestao">
        <div class="rel-kpi ${cg.necessidade > 0 ? 'rel-kpi-despesa' : 'rel-kpi-receita'}"><span>Necessidade de capital de giro</span><strong>${formatarReais(cg.necessidade)}</strong><small>${cg.mesPior ? `pior ponto em ${esc(mesRel(v, cg.mesPior))}${cg.recuperacao ? `; positivo de novo em ${esc(mesRel(v, cg.recuperacao))}` : ''}` : 'caixa da atividade positivo em todos os meses'}</small></div>
        <div class="rel-kpi ${conc.nivel === 'alta' ? 'rel-kpi-despesa' : ''}"><span>Maior comprador</span><strong>${conc.maior ? pct(conc.maior.parte) : '—'}</strong><small>${conc.maior ? `da receita (${esc(formatarCpfCnpj(conc.maior.id))}); 3 maiores: ${pct(conc.top3)}; concentração ${conc.nivel}` : 'sem receitas'}</small></div>
      </div>
      <p class="rel-nota">Capital de giro: pior ponto do caixa acumulado da atividade a partir de zero no início do período (sem saldo anterior nem financiamentos). Concentração pelo índice HHI (até 1.500 baixa; acima de 2.500 alta).</p>
      ${naturezas.length ? `
      <h3>Despesas por natureza (classificação inferida pelo painel)</h3>
      <table class="rel-tabela rel-compacta rel-naturezas">
        <thead><tr><th>Natureza</th><th class="num">Valor</th><th class="num">% das despesas</th><th class="rel-col-barra"></th></tr></thead>
        <tbody>${naturezas.map((n) => `<tr><td>${esc(NOMES_CURTOS_NATUREZA[n.natureza])}</td><td class="num">${formatarReais(n.valor)}</td><td class="num">${pct(n.parte)}</td><td class="rel-col-barra"><span class="rel-barra" style="width:${Math.round(n.parte * 100)}%"></span></td></tr>`).join('')}</tbody>
      </table>
      <p class="rel-nota">Natureza deduzida do histórico, do tipo de documento e do participante (o LCDPR não tem esse campo). Visão gerencial: não altera receita, despesa, resultado nem IRPF.</p>` : ''}
    </section>

    <section class="rel-bloco rel-sem-quebra">
      <h2>${esc(tituloReceitasDespesas(v.meses, v.termos))}</h2>
      <p class="rel-legenda">Barras: receitas (verde) e despesas (vermelho) do mês. Linha: resultado acumulado ${esc(v.termos.no)}.</p>
      <div class="rel-grafico" id="${prefixo}-g-mensal" data-grafico style="height:260px"></div>
    </section>

    <section class="rel-bloco rel-sem-quebra">
      <h2>Mês a mês</h2>
      <table class="rel-tabela rel-compacta">
        <thead><tr><th>Mês</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Acumulado</th></tr></thead>
        <tbody>${v.meses.map((m) => `<tr><td>${esc(mesRel(v, m.mes))}</td><td class="num rel-pos">${formatarReais(m.receitas)}</td><td class="num rel-neg">${formatarReais(m.despesas)}</td><td class="num ${m.resultado < 0 ? 'rel-neg' : ''}">${formatarReais(m.resultado)}</td><td class="num ${m.acumulado < 0 ? 'rel-neg' : ''}">${formatarReais(m.acumulado)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><th class="num rel-pos">${formatarReais(t.receitas)}</th><th class="num rel-neg">${formatarReais(t.despesas)}</th><th class="num">${formatarReais(t.resultado)}</th><th></th></tr></tfoot>
      </table>
    </section>

    <section class="rel-bloco rel-sem-quebra">
      <h2>${esc(tituloImoveis(imoveis))}</h2>
      <div class="rel-grafico" id="${prefixo}-g-imoveis" data-grafico style="height:${Math.max(140, imoveis.length * 36 + 50)}px"></div>
      <table class="rel-tabela rel-compacta">
        <thead><tr><th>Imóvel</th><th>Exploração</th><th class="num">Part.</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th></tr></thead>
        <tbody>${imoveis.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.exploracao)}</td><td class="num">${i.participacao !== null ? pct(i.participacao / 10000) : '—'}</td><td class="num">${formatarReais(i.receitas)}</td><td class="num">${formatarReais(i.despesas)}</td><td class="num ${i.resultado < 0 ? 'rel-neg' : ''}">${formatarReais(i.resultado)}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    <section class="rel-bloco rel-sem-quebra">
      <h2>Concentração de clientes e fornecedores</h2>
      <div class="rel-duas">
        ${tabelaTop('5 maiores clientes (receitas)', clientes, 'receitas', t.receitas)}
        ${tabelaTop('5 maiores fornecedores (despesas)', fornecedores, 'despesas', t.despesas)}
      </div>
    </section>
    ${RODAPE}`;
}

/** Desenha os gráficos do relatório executivo (depois que o HTML está na página). */
function desenharGraficosExecutivo(raiz: HTMLElement, v: Visao, prefixo = 'rel'): void {
  const semAnimacao = { animation: false };
  const mensal = raiz.querySelector<HTMLElement>(`#${prefixo}-g-mensal`);
  if (mensal) {
    desenharGrafico(mensal, {
      ...semAnimacao,
      grid: { left: 8, right: 12, top: 10, bottom: 30, containLabel: true },
      xAxis: eixoMeses(rotulosEixo(v.meses.map((m) => m.mes))),
      yAxis: eixoValor(),
      series: [
        { name: 'Receitas', type: 'bar', data: v.meses.map((m) => m.receitas), itemStyle: { color: COR.receita } },
        { name: 'Despesas', type: 'bar', data: v.meses.map((m) => m.despesas), itemStyle: { color: COR.despesa } },
        { name: 'Resultado acumulado', type: 'line', data: v.meses.map((m) => m.acumulado), lineStyle: { width: 2.5, color: COR.navy }, itemStyle: { color: COR.navy }, symbolSize: 5 },
      ],
    });
  }
  const imoveisEl = raiz.querySelector<HTMLElement>(`#${prefixo}-g-imoveis`);
  if (imoveisEl) {
    const grupos = agruparPor(v.lancamentos, (l) => `${l.cpf}|${l.codImovel}`)
      .map((g) => { const [cpf, cod] = g.chave.split('|') as [string, string]; return { nome: nomeImovel(v, cpf, cod), resultado: g.resultado }; })
      .sort((x, y) => y.resultado - x.resultado);
    desenharGrafico(imoveisEl, {
      ...semAnimacao,
      legend: { show: false },
      grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
      xAxis: { ...eixoValor(), show: false },
      yAxis: { type: 'category', inverse: true, data: grupos.map((g) => g.nome), axisTick: { show: false }, axisLabel: { color: COR.texto, width: 200, overflow: 'truncate' } },
      series: [{
        type: 'bar', name: 'Resultado', barMaxWidth: 22,
        data: grupos.map((g) => ({ value: g.resultado, itemStyle: { color: g.resultado < 0 ? COR.despesa : COR.receita } })),
        label: { show: true, position: 'right', formatter: (p: { value: number }) => reaisCompacto(p.value), color: COR.texto },
      }],
    });
  }
}

// ===========================================================================
// IMPRESSÃO
// ===========================================================================
function areaImpressao(): HTMLElement {
  let area = document.getElementById('area-impressao');
  if (!area) {
    area = document.createElement('div');
    area.id = 'area-impressao';
    area.setAttribute('aria-hidden', 'true');
    document.body.appendChild(area);
  }
  return area;
}

export function imprimir(html: string, tituloDocumento: string, depois?: (area: HTMLElement) => void): void {
  const area = areaImpressao();
  liberarGraficos(area);
  area.innerHTML = `<article class="relatorio">${html}</article>`;
  depois?.(area);
  // O título da página vira o nome sugerido do PDF ("Salvar como PDF").
  const tituloAnterior = document.title;
  document.title = tituloDocumento;
  const limpar = (): void => {
    document.title = tituloAnterior;
    liberarGraficos(area);
    area.innerHTML = '';
    window.removeEventListener('afterprint', limpar);
  };
  window.addEventListener('afterprint', limpar);
  // Espera o navegador DESENHAR os gráficos antes de abrir a impressão. Sem isso o
  // PDF saía com os eixos e sem as barras/linhas (o desenho ainda não tinha acontecido;
  // problema relatado pela Ananda em 28/11/2026). Dois quadros + uma pausa curta.
  const temGraficos = area.querySelector('[data-grafico]') !== null;
  if (!temGraficos) {
    window.print();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => window.print(), 250)));
}

/** Nome de arquivo seguro: só letras, números e hífen. */
export const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export function imprimirValidador(r: ResultadoAnalise): void {
  imprimir(htmlRelatorioValidador(r), `validador-lcdpr-${r.arquivo.anoBase ?? ''}-${slug(r.arquivo.abertura?.nome ?? r.arquivo.nomeArquivo)}`);
}

/** Nome do arquivo PDF sugerido: período e produtor (ou "por-produtor" no modo separado). */
export function nomeDocumento(base: string, visoes: readonly Visao[]): string {
  const v = visoes[0]!;
  const periodo = v.periodo.tipo === 'ano' ? String(v.ano) : slug(v.rotuloPeriodo);
  return `${base}-${periodo}-${visoes.length > 1 ? 'por-produtor' : slug(v.rotulo)}`;
}

/**
 * Uma Visão = relatório unificado. Várias = "separado": um relatório por
 * produtor, cada um começando em página nova.
 */
export function imprimirExecutivo(visoes: Visao | readonly Visao[]): void {
  const lista = Array.isArray(visoes) ? visoes : [visoes as Visao];
  const html = lista.map((v, i) => `<div class="${i > 0 ? 'rel-nova-pagina' : ''}">${htmlRelatorioExecutivo(v, `rel${i}`)}</div>`).join('');
  imprimir(html, nomeDocumento('relatorio-executivo-lcdpr', lista), (area) => lista.forEach((v, i) => desenharGraficosExecutivo(area, v, `rel${i}`)));
}

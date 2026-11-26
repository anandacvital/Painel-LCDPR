/**
 * ABAS GRÁFICAS DO PAINEL DO LIVRO CAIXA
 * 1. Visão Executiva  2. Fluxo de Caixa  3. Receitas & Despesas  4. Imóveis  5. Comparativo
 *
 * Cada função recebe a área da aba e a Visão (recorte de dados) e desenha tudo.
 * Cores com significado fixo: verde = receitas/agro, vermelho = despesas e negativos.
 */
import { agruparPor, mensal, totalizar, type TotalMensal } from '../../domain/agregacoes';
import {
  destaquesExecutivos,
  nomeMes,
  tituloConcentracao,
  tituloFluxoCaixa,
  tituloImoveis,
  tituloReceitasDespesas,
  tituloSazonalidade,
} from '../../domain/destaques';
import { formatarReais } from '../../domain/dinheiro';
import { formatarCpfCnpj } from '../../domain/documentos';
import { AVISO_ESTIMATIVA } from '../../domain/irpf';
import { TIPO_DOC, TIPO_EXPLORACAO } from '../../parser/leiaute';
import type { ResultadoAnalise } from '../../parser/modelo';
import { COR, desenharGrafico, eixoMeses, eixoValor, MESES_CURTOS, reaisCompacto } from '../graficos/echarts';
import { esc, numeroBR } from '../html';
import { cartaoKpi, molduraGrafico, pctTexto } from './componentes';
import { avisoPrevia, montarVisao, TEXTO_OPCAO, nomeConta, nomeImovel, textoComparacao, type Visao } from './contexto';

const el = (raiz: HTMLElement, id: string): HTMLElement => raiz.querySelector<HTMLElement>(`#${id}`)!;
const vals = (meses: readonly TotalMensal[], campo: 'receitas' | 'despesas' | 'resultado' | 'acumulado') => meses.map((m) => m[campo]);

// ===========================================================================
// 1. VISÃO EXECUTIVA
// ===========================================================================
export function abaVisaoExecutiva(raiz: HTMLElement, v: Visao): void {
  const t = v.totais;
  const a = v.anterior?.totais;
  const irpf = v.irpf.atual;
  const destaques = destaquesExecutivos(t, v.meses, a, textoComparacao(v));
  const vs = textoComparacao(v);

  raiz.innerHTML = `
    ${v.previa ? `<div class="aviso-previa" role="note"><strong>Prévia do ano em andamento.</strong> ${esc(avisoPrevia(v))}</div>` : ''}
    <div class="grade-kpi-painel">
      ${cartaoKpi({ rotulo: 'Receita bruta', valor: t.receitas, tom: 'agro', anterior: a?.receitas ?? null, vs })}
      ${cartaoKpi({ rotulo: 'Despesas', valor: t.despesas, tom: 'despesa', anterior: a?.despesas ?? null, vs, maiorEhMelhor: false })}
      ${cartaoKpi({ rotulo: 'Resultado', valor: t.resultado, tom: t.resultado < 0 ? 'negativo' : 'positivo', anterior: a?.resultado ?? null, vs })}
      ${cartaoKpi({ rotulo: 'Margem', valor: null, formatado: pctTexto(t.margem), atualComparavel: t.margem ?? undefined, anterior: a?.margem ?? null, vs, emPontos: true })}
      ${cartaoKpi({
        rotulo: 'IRPF estimado',
        valor: irpf.imposto,
        anterior: v.irpf.anterior?.imposto ?? null, vs,
        maiorEhMelhor: false,
        texto: `${TEXTO_OPCAO[irpf.opcao]}${v.previa ? ' (parcial, só o período da prévia; veja a projeção em Planejamento IRPF)' : ''}`,
      })}
    </div>
    <p class="nota-estimativa">${esc(AVISO_ESTIMATIVA)}</p>

    <section class="card destaques">
      <h3>Destaques do ano</h3>
      <ol>${destaques.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>
    </section>

    ${molduraGrafico('g-exec', tituloReceitasDespesas(v.meses), 'Barras: receitas e despesas do mês. Linha: resultado acumulado no ano.', 360)}
  `;

  desenharGrafico(el(raiz, 'g-exec'), {
    xAxis: eixoMeses(),
    yAxis: eixoValor(),
    series: [
      { name: 'Receitas', type: 'bar', data: vals(v.meses, 'receitas'), itemStyle: { color: COR.receita, borderRadius: [4, 4, 0, 0] } },
      { name: 'Despesas', type: 'bar', data: vals(v.meses, 'despesas'), itemStyle: { color: COR.despesa, borderRadius: [4, 4, 0, 0] } },
      {
        name: 'Resultado acumulado', type: 'line', data: vals(v.meses, 'acumulado'), smooth: true, symbolSize: 7,
        lineStyle: { width: 3, color: COR.navy }, itemStyle: { color: COR.navy },
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: COR.textoSuave, type: 'dashed' }, label: { show: false } },
      },
    ],
  });
}

// ===========================================================================
// 2. FLUXO DE CAIXA
// ===========================================================================
export function abaFluxoCaixa(raiz: HTMLElement, v: Visao): void {
  const res = vals(v.meses, 'resultado');
  // Cascata: barra invisível de apoio + barra do resultado do mês.
  let acumulado = 0;
  const apoio: number[] = [];
  const positivo: (number | string)[] = [];
  const negativo: (number | string)[] = [];
  for (const r of res) {
    const inicio = acumulado;
    acumulado += r;
    apoio.push(Math.min(inicio, acumulado));
    positivo.push(r >= 0 ? r : '-');
    negativo.push(r < 0 ? -r : '-');
  }
  const negativos = v.meses.map((m, i) => ({ m, i })).filter(({ m }) => m.quantidade > 0 && m.resultado < 0);
  const totalRec = v.meses.reduce((s, m) => s + Math.max(0, m.receitas), 0);

  raiz.innerHTML = `
    ${molduraGrafico('g-cascata', tituloFluxoCaixa(v.meses), 'Cascata: cada barra é o resultado do mês (verde soma, vermelho subtrai) partindo do acumulado anterior.', 340)}
    <div class="duas-colunas">
      ${molduraGrafico('g-saldo', negativos.length ? `Meses com resultado negativo: ${negativos.map(({ m }) => nomeMes(m.mes)).join(', ')}` : 'Nenhum mês com resultado negativo', 'Resultado acumulado no ano; faixas vermelhas marcam os meses com resultado negativo.', 300)}
      ${molduraGrafico('g-sazonal', tituloSazonalidade(v.meses), 'Participação de cada mês na receita do ano.', 300)}
    </div>
  `;

  desenharGrafico(el(raiz, 'g-cascata'), {
    tooltip: {
      trigger: 'axis',
      formatter: (p: unknown) => {
        const i = (p as { dataIndex: number }[])[0]?.dataIndex ?? 0;
        const m = v.meses[i]!;
        return `<strong>${MESES_CURTOS[i]}</strong><br/>Resultado do mês: ${formatarReais(m.resultado)}<br/>Acumulado: ${formatarReais(m.acumulado)}`;
      },
    },
    legend: { show: false },
    xAxis: eixoMeses(),
    yAxis: eixoValor(),
    series: [
      { type: 'bar', stack: 'c', data: apoio, itemStyle: { color: 'transparent' }, emphasis: { disabled: true } },
      { name: 'Entrou no caixa', type: 'bar', stack: 'c', data: positivo, itemStyle: { color: COR.receita, borderRadius: 3 } },
      { name: 'Saiu do caixa', type: 'bar', stack: 'c', data: negativo, itemStyle: { color: COR.negativo, borderRadius: 3 } },
    ],
  });

  desenharGrafico(el(raiz, 'g-saldo'), {
    legend: { show: false },
    xAxis: eixoMeses(),
    yAxis: eixoValor(),
    series: [{
      name: 'Resultado acumulado', type: 'line', data: vals(v.meses, 'acumulado'), smooth: true, areaStyle: { color: 'rgba(43,108,196,0.12)' },
      lineStyle: { width: 3, color: COR.azul2 }, itemStyle: { color: COR.azul2 },
      markArea: { silent: true, itemStyle: { color: 'rgba(192,0,29,0.08)' }, data: negativos.map(({ i }) => [{ xAxis: MESES_CURTOS[i] }, { xAxis: MESES_CURTOS[i] }]) },
      markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: COR.negativo, type: 'dashed' }, label: { show: false } },
    }],
  });

  desenharGrafico(el(raiz, 'g-sazonal'), {
    legend: { show: false },
    tooltip: { trigger: 'axis', valueFormatter: (x: unknown) => `${Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` },
    xAxis: eixoMeses(),
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%', color: COR.textoSuave }, splitLine: { lineStyle: { color: COR.grade } } },
    series: [{
      name: 'Parte da receita do ano', type: 'bar',
      data: v.meses.map((m) => (totalRec > 0 ? Math.round((Math.max(0, m.receitas) / totalRec) * 1000) / 10 : 0)),
      itemStyle: { color: COR.receita, borderRadius: [4, 4, 0, 0] },
    }],
  });
}

// ===========================================================================
// 3. RECEITAS & DESPESAS
// ===========================================================================
export function abaReceitasDespesas(raiz: HTMLElement, v: Visao): void {
  const participantes = agruparPor(v.lancamentos, (l) => l.idPartic);
  const clientes = participantes.filter((g) => g.receitas > 0).sort((a, b) => b.receitas - a.receitas).slice(0, 10);
  const fornecedores = participantes.filter((g) => g.despesas > 0).sort((a, b) => b.despesas - a.despesas).slice(0, 10);
  const porDoc = agruparPor(v.lancamentos, (l) => l.tipoDoc);
  const porConta = agruparPor(v.lancamentos, (l) => `${l.cpf}|${l.codConta}`);
  const despesasPorDoc = porDoc.filter((g) => g.despesas > 0).sort((a, b) => b.despesas - a.despesas);
  const maiorDoc = despesasPorDoc[0];

  raiz.innerHTML = `
    <div class="duas-colunas">
      ${molduraGrafico('g-clientes', tituloConcentracao(clientes, 'receitas', 'receitas'), 'Top 10 por CPF/CNPJ (o LCDPR não traz o nome do participante).', 380)}
      ${molduraGrafico('g-fornecedores', tituloConcentracao(fornecedores, 'despesas', 'despesas'), 'Top 10 por CPF/CNPJ.', 380)}
    </div>
    <div class="duas-colunas">
      ${molduraGrafico('g-docs', maiorDoc ? `${TIPO_DOC[maiorDoc.chave] ?? maiorDoc.chave} sustenta ${pctTexto(maiorDoc.despesas / Math.max(1, v.totais.despesas))} das despesas` : 'Sem despesas', 'Despesas por tipo de documento: quanto mais "Outros" e "Recibo", menor a força da comprovação.', 300)}
      ${molduraGrafico('g-contas', 'Movimento por conta bancária', 'Entradas e saídas por conta do 0050 (000 = espécie; 999 = sem trânsito por conta).', 300)}
    </div>
    <section class="card">
      <details>
        <summary><h3>Tabela mensal</h3></summary>
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Mês</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Acumulado</th><th class="num">Lançamentos</th></tr></thead>
            <tbody>
              ${v.meses.map((m) => `
                <tr>
                  <td>${esc(nomeMes(m.mes))}</td>
                  <td class="num">${formatarReais(m.receitas)}</td>
                  <td class="num">${formatarReais(m.despesas)}</td>
                  <td class="num ${m.resultado < 0 ? 'negativo' : ''}">${formatarReais(m.resultado)}</td>
                  <td class="num ${m.acumulado < 0 ? 'negativo' : ''}">${formatarReais(m.acumulado)}</td>
                  <td class="num">${numeroBR(m.quantidade)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr><th>Total</th><th class="num">${formatarReais(v.totais.receitas)}</th><th class="num">${formatarReais(v.totais.despesas)}</th><th class="num">${formatarReais(v.totais.resultado)}</th><th></th><th class="num">${numeroBR(v.totais.quantidade)}</th></tr></tfoot>
          </table>
        </div>
      </details>
    </section>
  `;

  const barrasH = (id: string, grupos: typeof clientes, campo: 'receitas' | 'despesas', cor: string) =>
    desenharGrafico(el(raiz, id), {
      legend: { show: false },
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: eixoValor(),
      yAxis: { type: 'category', inverse: true, data: grupos.map((g) => formatarCpfCnpj(g.chave)), axisLabel: { fontFamily: "'DM Mono', monospace", color: COR.textoSuave }, axisTick: { show: false } },
      series: [{ name: campo === 'receitas' ? 'Receitas' : 'Despesas', type: 'bar', data: grupos.map((g) => g[campo]), itemStyle: { color: cor, borderRadius: [0, 4, 4, 0] } }],
    });
  barrasH('g-clientes', clientes, 'receitas', COR.receita);
  barrasH('g-fornecedores', fornecedores, 'despesas', COR.despesa);

  desenharGrafico(el(raiz, 'g-docs'), {
    legend: { show: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: eixoValor(),
    yAxis: { type: 'category', inverse: true, data: despesasPorDoc.map((g) => TIPO_DOC[g.chave] ?? g.chave), axisTick: { show: false }, axisLabel: { color: COR.textoSuave } },
    series: [{
      name: 'Despesas', type: 'bar',
      data: despesasPorDoc.map((g) => ({ value: g.despesas, itemStyle: { color: g.chave === '6' || g.chave === '3' ? COR.despesaClara : COR.despesa } })),
      itemStyle: { borderRadius: [0, 4, 4, 0] },
    }],
  });

  desenharGrafico(el(raiz, 'g-contas'), {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 40, containLabel: true },
    xAxis: eixoValor(),
    yAxis: { type: 'category', inverse: true, data: porConta.map((g) => { const [cpf, cod] = g.chave.split('|'); return nomeConta(v, cpf!, cod!); }), axisTick: { show: false }, axisLabel: { color: COR.textoSuave, width: 130, overflow: 'break' } },
    series: [
      { name: 'Receitas', type: 'bar', data: porConta.map((g) => g.receitas), itemStyle: { color: COR.receita } },
      { name: 'Despesas', type: 'bar', data: porConta.map((g) => g.despesas), itemStyle: { color: COR.despesa } },
    ],
  });
}

// ===========================================================================
// 4. IMÓVEIS RURAIS
// ===========================================================================
export function abaImoveis(raiz: HTMLElement, v: Visao): void {
  const grupos = agruparPor(v.lancamentos, (l) => `${l.cpf}|${l.codImovel}`).map((g) => {
    const [cpf, cod] = g.chave.split('|') as [string, string];
    return { ...g, cpf, codigo: cod, nome: nomeImovel(v, cpf, cod) };
  });
  const cards = v.arquivos.flatMap((a) =>
    a.imoveis.map((im) => {
      const g = grupos.find((x) => x.cpf === a.abertura?.cpf && x.codigo === im.codigo);
      return { a, im, g };
    }),
  );

  raiz.innerHTML = `
    ${molduraGrafico('g-imoveis', tituloImoveis(grupos), 'Resultado (receitas − despesas) de cada imóvel no ano.', Math.max(240, grupos.length * 44 + 60))}
    <div class="grade-imoveis">
      ${cards.map(({ a, im, g }) => `
        <article class="card cartao-imovel">
          <header>
            <h3>${esc(im.nome || `Imóvel ${im.codigo}`)}</h3>
            <span class="selo">${esc(TIPO_EXPLORACAO[im.tipoExploracao] ?? 'Exploração ?')}</span>
          </header>
          <dl>
            <div><dt>NIRF (CAFIR)</dt><dd class="num">${esc(im.cadItr || '—')}</dd></div>
            <div><dt>UF</dt><dd>${esc(im.uf || im.pais)}</dd></div>
            <div><dt>Participação</dt><dd class="num">${im.participacao !== null ? pctTexto(im.participacao / 10000) : '—'}</dd></div>
            ${v.individual ? '' : `<div><dt>Produtor</dt><dd>${esc(a.abertura?.nome ?? '')}</dd></div>`}
          </dl>
          <div class="imovel-numeros">
            <div><span>Receitas</span><strong class="num agro">${formatarReais(g?.receitas ?? 0)}</strong></div>
            <div><span>Despesas</span><strong class="num negativo">${formatarReais(g?.despesas ?? 0)}</strong></div>
            <div><span>Resultado</span><strong class="num ${(g?.resultado ?? 0) < 0 ? 'negativo' : ''}">${formatarReais(g?.resultado ?? 0)}</strong></div>
          </div>
          ${a.terceiros.filter((t) => t.codImovel === im.codigo).length
            ? `<p class="ajuda">${a.terceiros.filter((t) => t.codImovel === im.codigo).length} terceiro(s) vinculado(s) no 0045.</p>`
            : ''}
        </article>`).join('')}
    </div>
  `;

  desenharGrafico(el(raiz, 'g-imoveis'), {
    legend: { show: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 32, top: 8, bottom: 8, containLabel: true },
    xAxis: eixoValor(),
    yAxis: { type: 'category', inverse: true, data: grupos.map((g) => g.nome), axisTick: { show: false }, axisLabel: { color: COR.textoSuave } },
    series: [{
      name: 'Resultado', type: 'bar',
      data: grupos.map((g) => ({ value: g.resultado, itemStyle: { color: g.resultado < 0 ? COR.negativo : COR.receita } })),
      label: { show: true, position: 'right', formatter: (p: { value: number }) => reaisCompacto(p.value), color: COR.textoSuave },
      itemStyle: { borderRadius: 4 },
    }],
  });
}

// ===========================================================================
// 5. COMPARATIVO (sempre com TODOS os produtores, independentemente do filtro)
// ===========================================================================
export function abaComparativo(raiz: HTMLElement, analises: readonly ResultadoAnalise[], ano: number): void {
  const doAno = analises.filter((r) => r.arquivo.anoBase === ano);
  const produtores = doAno.map((r) => ({
    nome: r.arquivo.abertura?.nome ?? r.arquivo.nomeArquivo,
    t: totalizar(r.arquivo.lancamentos),
  })).sort((a, b) => b.t.resultado - a.t.resultado);
  const anos = [...new Set(analises.map((r) => r.arquivo.anoBase).filter((x): x is number => x !== null))].sort();
  const porAno = anos.map((a) => {
    const v = montarVisao(analises, 'todos', a, 'somar');
    return { ano: a, meses: v?.meses ?? mensal([], a), totais: v?.totais ?? totalizar([]), visao: v };
  });
  const lider = produtores[0];
  const tituloProd = produtores.length < 2
    ? 'Carregue arquivos de mais de um produtor para comparar'
    : `${lider!.nome} lidera o resultado em ${ano} (${formatarReais(lider!.t.resultado)})`;
  const ultimo = porAno.at(-1);
  const penultimo = porAno.at(-2);
  const previaUltimo = ultimo?.visao?.previa ?? null;
  const tituloAnos = porAno.length < 2
    ? 'Carregue arquivos de mais de um ano para comparar ano contra ano'
    : previaUltimo && ultimo!.visao?.anterior && penultimo!.ano === ultimo!.ano - 1
      // Prévia: compara com o mesmo período do ano anterior, não com o ano inteiro.
      ? `Prévia de ${ultimo!.ano} até ${nomeMes(previaUltimo.fim.slice(0, 7)).toLowerCase()}: ${formatarReais(ultimo!.totais.resultado)} contra ${formatarReais(ultimo!.visao.anterior.totais.resultado)} no mesmo período de ${penultimo!.ano}`
      : `Resultado consolidado de ${ultimo!.ano}: ${formatarReais(ultimo!.totais.resultado)} contra ${formatarReais(penultimo!.totais.resultado)} em ${penultimo!.ano}`;

  raiz.innerHTML = `
    <p class="ajuda">O comparativo sempre considera todos os produtores carregados, independentemente do filtro do cabeçalho. Soma simples (sem ajuste de condôminos).</p>
    ${produtores.length < 2
      ? `<section class="card"><h3>${esc(tituloProd)}</h3><p class="ajuda">Com arquivos de dois ou mais produtores do mesmo ano, este quadro mostra receitas, despesas e resultado lado a lado.</p></section>`
      : molduraGrafico('g-produtores', tituloProd, `Receitas, despesas e resultado por produtor em ${ano}.`, Math.max(260, produtores.length * 70 + 80))}
    ${molduraGrafico('g-anos', tituloAnos, 'Resultado acumulado mês a mês de cada ano. Cada linha soma os produtores que têm arquivo naquele ano.', 340)}
  `;

  if (produtores.length >= 2) desenharGrafico(el(raiz, 'g-produtores'), {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 40, containLabel: true },
    xAxis: eixoValor(),
    yAxis: { type: 'category', inverse: true, data: produtores.map((p) => p.nome), axisTick: { show: false }, axisLabel: { color: COR.textoSuave, width: 180, overflow: 'truncate' } },
    series: [
      { name: 'Receitas', type: 'bar', data: produtores.map((p) => p.t.receitas), itemStyle: { color: COR.receita } },
      { name: 'Despesas', type: 'bar', data: produtores.map((p) => p.t.despesas), itemStyle: { color: COR.despesa } },
      { name: 'Resultado', type: 'bar', itemStyle: { color: COR.navy }, data: produtores.map((p) => ({ value: p.t.resultado, itemStyle: { color: p.t.resultado < 0 ? COR.negativo : COR.navy } })) },
    ],
  });

  const tons = [COR.azul3, COR.azul2, COR.azul1, COR.navy];
  desenharGrafico(el(raiz, 'g-anos'), {
    xAxis: eixoMeses(),
    yAxis: eixoValor(),
    series: porAno.map((p, i) => ({
      // Na prévia, a linha para no último mês do arquivo (os meses seguintes ainda não aconteceram).
      name: p.visao?.previa ? `${p.ano} (prévia)` : String(p.ano), type: 'line', smooth: true,
      data: vals(p.meses, 'acumulado').map((x, m) => (p.visao?.previa && m + 1 > p.visao.previa.ateMes ? null : x)),
      lineStyle: { width: i === porAno.length - 1 ? 3 : 2, color: tons[Math.max(0, tons.length - porAno.length + i)] },
      itemStyle: { color: tons[Math.max(0, tons.length - porAno.length + i)] },
    })),
  });
}

/**
 * RELATÓRIOS DETALHADOS (para impressão / PDF), a partir da mesma Visão do Painel:
 *
 * 1. LIVRO CAIXA COMPLETO: todos os lançamentos em ordem de data, agrupados por
 *    mês, com o saldo informado no arquivo linha a linha e o total de cada mês;
 * 2. RAZÃO POR IMÓVEL: lançamentos de cada imóvel, com subtotal;
 * 3. RAZÃO POR CONTA BANCÁRIA: lançamentos de cada conta com saldo acumulado
 *    CALCULADO na conta (para conferir com o extrato);
 * 4. RAZÃO POR PARTICIPANTE: cada cliente/fornecedor com total e % do total;
 * 5. DETALHAMENTO FILTRADO: exatamente o que está filtrado na aba Detalhamento.
 *
 * Todos usam o mesmo cabeçalho e rodapé de sigilo dos demais relatórios.
 */
import { formatarDataIso } from '../domain/datas';
import { nomeMes } from '../domain/destaques';
import { formatarReais } from '../domain/dinheiro';
import { formatarCpfCnpj } from '../domain/documentos';
import { TIPO_DOC, TIPO_LANC } from '../parser/leiaute';
import { esc, numeroBR } from '../ui/html';
import { nomeConta, nomeImovel, saldoInicialMes, type LancamentoVisao, type Visao } from '../ui/painel/contexto';
import { cabecalho, camposVisao, imprimir, nomeDocumento, RODAPE, slug } from './impressao';

export type TipoRazao = 'livro' | 'imovel' | 'conta' | 'participante';

export const TITULO_RAZAO: Readonly<Record<TipoRazao, string>> = {
  livro: 'Livro Caixa completo',
  imovel: 'Razão por imóvel',
  conta: 'Razão por conta bancária',
  participante: 'Razão por participante',
};

type Coluna = 'produtor' | 'imovel' | 'conta' | 'participante' | 'saldoArquivo' | 'saldoCalculado';

const pct = (f: number): string => `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const ordemData = (a: LancamentoVisao, b: LancamentoVisao): number =>
  a.data.iso.localeCompare(b.data.iso) || a.cpf.localeCompare(b.cpf) || a.linha - b.linha;

const camposCabecalho = (v: Visao, extra: [string, string][] = []): [string, string][] => camposVisao(v, extra);

/** Último dia do mês "AAAA-MM", em dd/mm/aaaa. */
function ultimoDia(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return `${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}

/**
 * Quadro de saldos de UM mês, por produtor: saldo inicial (do arquivo, após o
 * último lançamento anterior ao mês), entradas, saídas e saldo final.
 * Usa todos os lançamentos do produtor no mês (o saldo do LCDPR é do arquivo
 * inteiro, não de um filtro).
 */
export function quadroSaldosMes(v: Visao, mes: string): string {
  const linhas = v.arquivos.map((a) => {
    const cpf = a.abertura?.cpf ?? '';
    const ini = saldoInicialMes(v, cpf, mes);
    const doMes = v.arquivosPeriodo.find((x) => x.abertura?.cpf === cpf && x.anoBase === Number(mes.slice(0, 4)))?.lancamentos.filter((l) => l.data.iso.startsWith(mes)) ?? [];
    const ent = doMes.reduce((s, l) => s + l.entrada, 0);
    const sai = doMes.reduce((s, l) => s + l.saida, 0);
    const fim = doMes.at(-1)?.saldo ?? ini;
    return { nome: a.abertura?.nome ?? a.nomeArquivo, ini, ent, sai, fim };
  });
  const val = (c: number | null, neg = false): string => (c === null ? '—' : `<span class="${neg || c < 0 ? 'rel-neg' : ''}">${formatarReais(c)}</span>`);
  return `
    <table class="rel-tabela rel-compacta rel-saldos-mes">
      <thead><tr>${v.individual ? '' : '<th>Produtor</th>'}<th class="num">Saldo inicial em 01/${mes.slice(5, 7)}/${mes.slice(0, 4)}</th><th class="num">Entradas do mês</th><th class="num">Saídas do mês</th><th class="num">Saldo final em ${ultimoDia(mes)}</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr>${v.individual ? '' : `<td>${esc(l.nome)}</td>`}<td class="num">${val(l.ini)}</td><td class="num rel-pos">${formatarReais(l.ent)}</td><td class="num">${val(l.sai, true)}</td><td class="num">${val(l.fim)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="rel-nota">Saldo inicial: saldo informado no próprio LCDPR após o último lançamento anterior ao mês (zero se for o primeiro mês com movimento no ano, pois o saldo do LCDPR começa em zero em 1º de janeiro). Entradas e saídas consideram todos os lançamentos do mês no arquivo.</p>`;
}

/** Tabela de lançamentos com as colunas pedidas e uma linha de subtotal. */
function tabelaLancamentos(v: Visao, lista: readonly LancamentoVisao[], colunas: readonly Coluna[], rotuloTotal: string): string {
  const tem = (c: Coluna): boolean => colunas.includes(c);
  let ent = 0;
  let sai = 0;
  let acumulado = 0;
  const linhas = lista.map((l) => {
    ent += l.entrada;
    sai += l.saida;
    acumulado += l.entrada - l.saida;
    return `<tr>
      <td class="num">${formatarDataIso(l.data.iso)}</td>
      ${tem('produtor') ? `<td>${esc(l.produtor)}</td>` : ''}
      ${tem('imovel') ? `<td>${esc(nomeImovel(v, l.cpf, l.codImovel))}</td>` : ''}
      ${tem('conta') ? `<td>${esc(nomeConta(v, l.cpf, l.codConta))}</td>` : ''}
      <td>${esc(l.numDoc || '(sem nº)')}<br><small>${esc(TIPO_DOC[l.tipoDoc] ?? l.tipoDoc)}</small></td>
      <td title="${esc(TIPO_LANC[l.tipoLanc] ?? l.tipoLanc)}">${esc(l.historico)}</td>
      ${tem('participante') ? `<td class="num">${esc(formatarCpfCnpj(l.idPartic))}</td>` : ''}
      <td class="num rel-pos">${l.entrada ? formatarReais(l.entrada) : ''}</td>
      <td class="num rel-neg">${l.saida ? formatarReais(l.saida) : ''}</td>
      ${tem('saldoArquivo') ? `<td class="num ${l.saldo < 0 ? 'rel-neg' : ''}">${formatarReais(l.saldo)}</td>` : ''}
      ${tem('saldoCalculado') ? `<td class="num ${acumulado < 0 ? 'rel-neg' : ''}">${formatarReais(acumulado)}</td>` : ''}
    </tr>`;
  });
  const antesValores = 3 + (['produtor', 'imovel', 'conta', 'participante'] as const).filter(tem).length;
  const saldoFinal = tem('saldoCalculado') ? `<th class="num">${formatarReais(acumulado)}</th>` : tem('saldoArquivo') ? '<th></th>' : '';
  return `
    <table class="rel-tabela rel-razao">
      <thead><tr>
        <th>Data</th>
        ${tem('produtor') ? '<th>Produtor</th>' : ''}
        ${tem('imovel') ? '<th>Imóvel</th>' : ''}
        ${tem('conta') ? '<th>Conta</th>' : ''}
        <th>Documento</th>
        <th>Histórico</th>
        ${tem('participante') ? '<th>Participante</th>' : ''}
        <th class="num">Entrada</th>
        <th class="num">Saída</th>
        ${tem('saldoArquivo') ? '<th class="num">Saldo (arquivo)</th>' : ''}
        ${tem('saldoCalculado') ? '<th class="num">Saldo na conta</th>' : ''}
      </tr></thead>
      <tbody>${linhas.join('') || `<tr><td colspan="${antesValores + 2}">Sem lançamentos.</td></tr>`}</tbody>
      <tfoot><tr>
        <th colspan="${antesValores}">${esc(rotuloTotal)} · ${numeroBR(lista.length)} lançamento(s) · líquido ${formatarReais(ent - sai)}</th>
        <th class="num rel-pos">${formatarReais(ent)}</th>
        <th class="num rel-neg">${formatarReais(sai)}</th>
        ${saldoFinal}
      </tr></tfoot>
    </table>`;
}

/** Quadro-resumo dos grupos (uma linha por grupo) antes do detalhe. */
function resumoGrupos(grupos: readonly { nome: string; lista: readonly LancamentoVisao[] }[], comPercentual: boolean): string {
  const totEnt = grupos.reduce((s, g) => s + g.lista.reduce((x, l) => x + l.entrada, 0), 0);
  const totSai = grupos.reduce((s, g) => s + g.lista.reduce((x, l) => x + l.saida, 0), 0);
  return `
    <table class="rel-tabela rel-compacta">
      <thead><tr><th>Grupo</th><th class="num">Lanç.</th><th class="num">Entradas</th>${comPercentual ? '<th class="num">% entr.</th>' : ''}<th class="num">Saídas</th>${comPercentual ? '<th class="num">% saídas</th>' : ''}<th class="num">Líquido</th></tr></thead>
      <tbody>${grupos.map((g) => {
        const e = g.lista.reduce((x, l) => x + l.entrada, 0);
        const s = g.lista.reduce((x, l) => x + l.saida, 0);
        return `<tr><td>${esc(g.nome)}</td><td class="num">${numeroBR(g.lista.length)}</td><td class="num">${formatarReais(e)}</td>${comPercentual ? `<td class="num">${totEnt ? pct(e / totEnt) : '—'}</td>` : ''}<td class="num">${formatarReais(s)}</td>${comPercentual ? `<td class="num">${totSai ? pct(s / totSai) : '—'}</td>` : ''}<td class="num ${e - s < 0 ? 'rel-neg' : ''}">${formatarReais(e - s)}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th>Total</th><th class="num">${numeroBR(grupos.reduce((s, g) => s + g.lista.length, 0))}</th><th class="num">${formatarReais(totEnt)}</th>${comPercentual ? '<th></th>' : ''}<th class="num">${formatarReais(totSai)}</th>${comPercentual ? '<th></th>' : ''}<th class="num">${formatarReais(totEnt - totSai)}</th></tr></tfoot>
    </table>`;
}

function agrupar(lista: readonly LancamentoVisao[], chave: (l: LancamentoVisao) => string): Map<string, LancamentoVisao[]> {
  const m = new Map<string, LancamentoVisao[]>();
  for (const l of [...lista].sort(ordemData)) {
    const k = chave(l);
    const g = m.get(k);
    if (g) g.push(l);
    else m.set(k, [l]);
  }
  return m;
}

export interface OpcoesRazao {
  /** Só o Livro Caixa: um mês "AAAA-MM", com o saldo inicial e final do mês. */
  mes?: string;
}

export function htmlRazao(v: Visao, tipo: TipoRazao, opcoes: OpcoesRazao = {}): string {
  const varios = !v.individual;
  const prefixo = (l: LancamentoVisao): string => (varios ? `${l.produtor} · ` : '');
  let corpo = '';
  let nota = '';

  if (tipo === 'livro') {
    // O saldo informado é de cada arquivo (por produtor); no consolidado ele não soma entre produtores.
    const colunas: Coluna[] = varios ? ['produtor', 'imovel', 'conta', 'participante'] : ['imovel', 'conta', 'participante', 'saldoArquivo'];
    const lancamentos = opcoes.mes ? v.lancamentos.filter((l) => l.data.iso.startsWith(opcoes.mes!)) : v.lancamentos;
    const porMes = agrupar(lancamentos, (l) => l.data.iso.slice(0, 7));
    const comAno = v.periodo.tipo !== 'ano';
    const grupos = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, lista]) => ({ mes, nome: comAno || opcoes.mes ? `${nomeMes(mes)}/${mes.slice(0, 4)}` : nomeMes(mes), lista }));
    nota = varios
      ? 'Visão consolidada: o saldo linha a linha não é exibido porque cada produtor tem o próprio saldo no arquivo.'
      : 'Saldo (arquivo): saldo informado no próprio LCDPR após cada lançamento (campo SLD_FIN do Q100).';
    corpo = opcoes.mes
      ? `
      <section class="rel-bloco rel-sem-quebra"><h2>Saldos de ${esc(nomeMes(opcoes.mes))}/${opcoes.mes.slice(0, 4)}</h2>${quadroSaldosMes(v, opcoes.mes)}</section>
      ${grupos.length
        ? grupos.map((g) => `<section class="rel-bloco"><h2>Lançamentos de ${esc(g.nome)}</h2>${tabelaLancamentos(v, g.lista, colunas, `Total de ${g.nome}`)}</section>`).join('')
        : '<p class="rel-nota">Sem lançamentos neste mês.</p>'}`
      : `
      <section class="rel-bloco"><h2>Resumo por mês</h2>${resumoGrupos(grupos, false)}</section>
      ${grupos.map((g) => `<section class="rel-bloco"><h2>${esc(g.nome)}</h2>${tabelaLancamentos(v, g.lista, colunas, `Total de ${g.nome}`)}</section>`).join('')}`;
  } else {
    const def = {
      imovel: { chave: (l: LancamentoVisao) => `${l.cpf}|${l.codImovel}`, nome: (l: LancamentoVisao) => `${prefixo(l)}${nomeImovel(v, l.cpf, l.codImovel)}`, colunas: ['conta', 'participante'] as Coluna[], pct: false },
      conta: { chave: (l: LancamentoVisao) => `${l.cpf}|${l.codConta}`, nome: (l: LancamentoVisao) => `${prefixo(l)}${nomeConta(v, l.cpf, l.codConta)}`, colunas: ['imovel', 'participante', 'saldoCalculado'] as Coluna[], pct: false },
      participante: { chave: (l: LancamentoVisao) => l.idPartic, nome: (l: LancamentoVisao) => formatarCpfCnpj(l.idPartic), colunas: [...(varios ? ['produtor'] : []), 'imovel', 'conta'] as Coluna[], pct: true },
    }[tipo];
    const grupos = [...agrupar(v.lancamentos, def.chave).values()]
      .map((lista) => ({ nome: def.nome(lista[0]!), lista }))
      .sort((a, b) => {
        const mov = (g: typeof a) => g.lista.reduce((s, l) => s + l.entrada + l.saida, 0);
        return tipo === 'participante' ? mov(b) - mov(a) : a.nome.localeCompare(b.nome, 'pt-BR');
      });
    nota = {
      imovel: 'Imóvel "Despesas comuns (rateio)" corresponde ao código 000 do LCDPR.',
      conta: 'Saldo na conta: entradas menos saídas acumuladas desde 1º de janeiro, calculado pelo painel para conferência com o extrato (o LCDPR não informa saldo por conta).',
      participante: 'Ordenado do maior para o menor movimento. O LCDPR identifica o participante só pelo CPF/CNPJ, sem o nome.',
    }[tipo];
    corpo = `
      <section class="rel-bloco"><h2>Resumo</h2>${resumoGrupos(grupos, def.pct)}</section>
      ${grupos.map((g) => `<section class="rel-bloco"><h2>${esc(g.nome)}</h2>${tabelaLancamentos(v, g.lista, def.colunas, `Total de ${g.nome}`)}</section>`).join('')}`;
  }

  // Paisagem: as tabelas de lançamentos têm muitas colunas.
  return `<div class="rel-paisagem">
    ${cabecalho(opcoes.mes && tipo === 'livro' ? `Livro Caixa de ${nomeMes(opcoes.mes)}/${opcoes.mes.slice(0, 4)}` : TITULO_RAZAO[tipo], camposCabecalho(v, [['Lançamentos', numeroBR(opcoes.mes && tipo === 'livro' ? v.lancamentos.filter((l) => l.data.iso.startsWith(opcoes.mes!)).length : v.lancamentos.length)]]))}
    <p class="rel-nota">${esc(nota)}</p>
    ${corpo}
    ${RODAPE}</div>`;
}

/** Lançamentos filtrados na aba Detalhamento, na ordem em que estão na tela. */
export function htmlDetalhamento(v: Visao, lista: readonly LancamentoVisao[], filtrosDescritos: readonly string[], mes?: string): string {
  const colunas: Coluna[] = [...(v.individual ? [] : ['produtor' as Coluna]), 'imovel', 'conta', 'participante', ...(v.individual ? ['saldoArquivo' as Coluna] : [])];
  return `<div class="rel-paisagem">
    ${cabecalho('Lançamentos selecionados', camposCabecalho(v, [['Filtros do detalhamento', filtrosDescritos.length ? filtrosDescritos.join(' · ') : 'nenhum (todos os lançamentos)']]))}
    ${mes ? `<section class="rel-bloco rel-sem-quebra"><h2>Saldos de ${esc(nomeMes(mes))}/${mes.slice(0, 4)}</h2>${quadroSaldosMes(v, mes)}</section>` : ''}
    <section class="rel-bloco">${tabelaLancamentos(v, lista, colunas, 'Total selecionado')}</section>
    ${RODAPE}</div>`;
}

/**
 * Uma Visão = unificado (o produtor aparece em cada lançamento). Várias =
 * "separado": um relatório por produtor, cada um começando em página nova.
 */
export function imprimirRazao(visoes: Visao | readonly Visao[], tipo: TipoRazao, opcoes: OpcoesRazao = {}): void {
  const lista = Array.isArray(visoes) ? visoes : [visoes as Visao];
  const html = lista.map((v, i) => `<div class="${i > 0 ? 'rel-nova-pagina' : ''}">${htmlRazao(v, tipo, opcoes)}</div>`).join('');
  const base = opcoes.mes && tipo === 'livro' ? `livro-caixa-${opcoes.mes}` : slug(TITULO_RAZAO[tipo]);
  imprimir(html, nomeDocumento(base, lista));
}

export function imprimirDetalhamento(v: Visao, lista: readonly LancamentoVisao[], filtrosDescritos: readonly string[], mes?: string): void {
  imprimir(htmlDetalhamento(v, lista, filtrosDescritos, mes), nomeDocumento('lancamentos-selecionados', [v]));
}

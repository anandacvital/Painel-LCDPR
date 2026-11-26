/**
 * ABA DETALHAMENTO: todos os lançamentos (Q100) da Visão, com filtros, busca,
 * ordenação e exportação para CSV.
 *
 * "Rolagem virtual": um LCDPR pode ter dezenas de milhares de linhas. Desenhar
 * todas trava o navegador, então só as linhas visíveis na tela (mais uma
 * folga) viram HTML; o resto é um espaço vazio com a mesma altura. A pessoa
 * rola normalmente e não percebe a diferença.
 */
import { formatarDataIso } from '../../domain/datas';
import { formatarReais } from '../../domain/dinheiro';
import { formatarCpfCnpj } from '../../domain/documentos';
import { filtrarLancamentos, ordenarLancamentos, valorComSinal, type CampoOrdem, type FiltroLancamentos } from '../../domain/filtros';
import { nomeMes } from '../../domain/destaques';
import { TIPO_DOC, TIPO_LANC } from '../../parser/leiaute';
import { gerarCsv } from '../../report/csv';
import { baixarArquivo, esc, numeroBR } from '../html';
import { iconeDownload } from '../icones';
import { nomeConta, nomeImovel, type LancamentoVisao, type Visao } from './contexto';

/** Altura fixa de cada linha, em pixels (tem que bater com o CSS .tabela-virtual td). */
const ALTURA_LINHA = 40;
const FOLGA = 10;

/** Valor em reais para CSV (vírgula decimal, sem "R$"), que o Excel em português entende como número. */
const reaisCsv = (centavos: number): string => (centavos / 100).toFixed(2).replace('.', ',');

function opcoes(lista: readonly [string, string][], vazio: string, atual = ''): string {
  return [`<option value="">${esc(vazio)}</option>`, ...lista.map(([v, r]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(r)}</option>`)].join('');
}

export function abaDetalhamento(raiz: HTMLElement, v: Visao): void {
  const filtro: FiltroLancamentos = {};
  let campo: CampoOrdem = 'data';
  let crescente = true;
  let visiveis: LancamentoVisao[] = [];

  // Opções dos filtros, a partir do que existe nos lançamentos.
  const unicos = (f: (l: LancamentoVisao) => [string, string]): [string, string][] => {
    const m = new Map<string, string>();
    for (const l of v.lancamentos) {
      const [k, r] = f(l);
      if (!m.has(k)) m.set(k, r);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  };
  const prefixo = (l: LancamentoVisao): string => (v.individual ? '' : `${l.produtor} · `);
  const meses = unicos((l) => [l.data.iso.slice(0, 7), nomeMes(l.data.iso.slice(0, 7))]).sort((a, b) => a[0].localeCompare(b[0]));
  const imoveis = unicos((l) => [`${l.cpf}|${l.codImovel}`, `${prefixo(l)}${nomeImovel(v, l.cpf, l.codImovel)}`]);
  const contas = unicos((l) => [`${l.cpf}|${l.codConta}`, `${prefixo(l)}${nomeConta(v, l.cpf, l.codConta)}`]);
  const tiposDoc = unicos((l) => [l.tipoDoc, TIPO_DOC[l.tipoDoc] ?? l.tipoDoc]);
  const tiposLanc = unicos((l) => [l.tipoLanc, TIPO_LANC[l.tipoLanc] ?? l.tipoLanc]);
  const participantes = unicos((l) => [l.idPartic, formatarCpfCnpj(l.idPartic)]);

  raiz.innerHTML = `
    <section class="card">
      <h3>Todos os lançamentos do Livro Caixa</h3>
      <p class="ajuda">Combine os filtros para encontrar um lançamento. A busca procura no histórico, no número do documento e no CPF/CNPJ do participante.</p>
      <div class="filtros filtros-detalhe">
        <label>Mês<select data-filtro="mes">${opcoes(meses, 'Todos')}</select></label>
        <label>Imóvel<select data-filtro="imovel">${opcoes(imoveis, 'Todos')}</select></label>
        <label>Conta<select data-filtro="conta">${opcoes(contas, 'Todas')}</select></label>
        <label>Tipo de documento<select data-filtro="tipoDoc">${opcoes(tiposDoc, 'Todos')}</select></label>
        <label>Tipo de lançamento<select data-filtro="tipoLanc">${opcoes(tiposLanc, 'Todos')}</select></label>
        <label>Participante<select data-filtro="participante">${opcoes(participantes, 'Todos')}</select></label>
        <label class="busca">Buscar<input type="search" data-filtro="busca" placeholder="Ex.: diesel, 5012, 12.345.678" /></label>
      </div>
      <div class="barra-detalhe">
        <p class="contagem" role="status" aria-live="polite"></p>
        <button type="button" class="botao-sec" data-exportar>${iconeDownload}Exportar CSV (filtro atual)</button>
      </div>
      <div class="tabela-virtual" tabindex="0" aria-label="Lançamentos">
        <table class="tabela">
          <thead><tr>
            <th><button type="button" data-ordem="data">Data</button></th>
            ${v.individual ? '' : '<th>Produtor</th>'}
            <th>Imóvel</th>
            <th>Conta</th>
            <th>Documento</th>
            <th><button type="button" data-ordem="historico">Histórico</button></th>
            <th><button type="button" data-ordem="participante">Participante</button></th>
            <th>Tipo</th>
            <th class="num"><button type="button" data-ordem="valor">Valor</button></th>
            <th class="num">Saldo após</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </section>`;

  const caixa = raiz.querySelector<HTMLDivElement>('.tabela-virtual')!;
  const corpo = raiz.querySelector<HTMLTableSectionElement>('tbody')!;
  const contagem = raiz.querySelector<HTMLParagraphElement>('.contagem')!;
  const colunas = v.individual ? 9 : 10;

  const linhaHtml = (l: LancamentoVisao): string => {
    const valor = valorComSinal(l);
    return `<tr>
      <td class="num">${formatarDataIso(l.data.iso)}</td>
      ${v.individual ? '' : `<td title="${esc(l.produtor)}">${esc(l.produtor)}</td>`}
      <td title="${esc(nomeImovel(v, l.cpf, l.codImovel))}">${esc(nomeImovel(v, l.cpf, l.codImovel))}</td>
      <td>${esc(nomeConta(v, l.cpf, l.codConta))}</td>
      <td title="${esc(TIPO_DOC[l.tipoDoc] ?? '')}">${esc(l.numDoc || '(sem número)')}</td>
      <td title="${esc(l.historico)}">${esc(l.historico)}</td>
      <td class="num">${esc(formatarCpfCnpj(l.idPartic))}</td>
      <td>${esc(TIPO_LANC[l.tipoLanc] ?? l.tipoLanc)}</td>
      <td class="num ${valor < 0 ? 'negativo' : 'agro'}">${formatarReais(valor)}</td>
      <td class="num">${formatarReais(l.saldo)}</td>
    </tr>`;
  };

  /** Desenha só as linhas que aparecem na janela de rolagem. */
  const desenharJanela = (): void => {
    const inicio = Math.max(0, Math.floor(caixa.scrollTop / ALTURA_LINHA) - FOLGA);
    const qtd = Math.ceil(caixa.clientHeight / ALTURA_LINHA) + FOLGA * 2;
    const fim = Math.min(visiveis.length, inicio + qtd);
    const antes = inicio * ALTURA_LINHA;
    const depois = (visiveis.length - fim) * ALTURA_LINHA;
    corpo.innerHTML = visiveis.length === 0
      ? `<tr><td colspan="${colunas}" class="vazio">Nenhum lançamento com esses filtros.</td></tr>`
      : `${antes ? `<tr class="espaco" style="height:${antes}px"><td colspan="${colunas}"></td></tr>` : ''}${visiveis.slice(inicio, fim).map(linhaHtml).join('')}${depois ? `<tr class="espaco" style="height:${depois}px"><td colspan="${colunas}"></td></tr>` : ''}`;
  };

  const aplicar = (): void => {
    visiveis = ordenarLancamentos(filtrarLancamentos(v.lancamentos, filtro), campo, crescente);
    const ent = visiveis.reduce((s, l) => s + l.entrada, 0);
    const sai = visiveis.reduce((s, l) => s + l.saida, 0);
    contagem.innerHTML = `<strong>${numeroBR(visiveis.length)}</strong> de ${numeroBR(v.lancamentos.length)} lançamentos · entradas <span class="num agro">${formatarReais(ent)}</span> · saídas <span class="num negativo">${formatarReais(sai)}</span>`;
    raiz.querySelectorAll<HTMLButtonElement>('button[data-ordem]').forEach((b) => {
      const ativo = b.dataset.ordem === campo;
      b.closest('th')!.setAttribute('aria-sort', ativo ? (crescente ? 'ascending' : 'descending') : 'none');
      b.textContent = `${b.textContent!.replace(/ [▲▼]$/, '')}${ativo ? (crescente ? ' ▲' : ' ▼') : ''}`;
    });
    caixa.scrollTop = 0;
    desenharJanela();
  };

  raiz.querySelectorAll<HTMLSelectElement | HTMLInputElement>('[data-filtro]').forEach((el) => {
    el.addEventListener(el instanceof HTMLInputElement ? 'input' : 'change', () => {
      const chave = el.dataset.filtro as keyof FiltroLancamentos;
      if (el.value) filtro[chave] = el.value;
      else delete filtro[chave];
      aplicar();
    });
  });
  raiz.querySelectorAll<HTMLButtonElement>('button[data-ordem]').forEach((b) => {
    b.addEventListener('click', () => {
      const novo = b.dataset.ordem as CampoOrdem;
      crescente = novo === campo ? !crescente : novo !== 'valor';
      campo = novo;
      aplicar();
    });
  });
  let pendente = false;
  caixa.addEventListener('scroll', () => {
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => {
      pendente = false;
      desenharJanela();
    });
  });

  raiz.querySelector<HTMLButtonElement>('[data-exportar]')!.addEventListener('click', () => {
    const csv = gerarCsv(
      ['Linha do TXT', 'Produtor (CPF)', 'Produtor', 'Data', 'Imóvel', 'Conta', 'Nº documento', 'Tipo de documento', 'Histórico', 'Participante', 'Tipo de lançamento', 'Entrada (R$)', 'Saída (R$)', 'Saldo após (R$)'],
      visiveis.map((l) => [
        l.linha, formatarCpfCnpj(l.cpf), l.produtor, formatarDataIso(l.data.iso), nomeImovel(v, l.cpf, l.codImovel), nomeConta(v, l.cpf, l.codConta),
        l.numDoc, TIPO_DOC[l.tipoDoc] ?? l.tipoDoc, l.historico, formatarCpfCnpj(l.idPartic), TIPO_LANC[l.tipoLanc] ?? l.tipoLanc,
        reaisCsv(l.entrada), reaisCsv(l.saida), reaisCsv(l.saldo),
      ]),
    );
    baixarArquivo(`lancamentos-${v.ano}.csv`, csv);
  });

  aplicar();
}

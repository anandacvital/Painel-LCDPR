/**
 * ABA "SAÚDE DO ARQUIVO"
 *
 * Mostra, para o arquivo selecionado:
 * - título com a conclusão (ex.: "3 erros impedem a transmissão");
 * - contadores de erros, alertas e informações;
 * - identificação do arquivo (produtor, ano-base, período...);
 * - resumo agrupado por regra (clicar filtra a tabela);
 * - tabela detalhada com filtros, busca, paginação e exportação CSV.
 */
import { formatarDataIso } from '../domain/datas';
import { formatarCpfCnpj } from '../domain/documentos';
import { FORMA_APUR } from '../parser/leiaute';
import type { Categoria, Ocorrencia, ResultadoAnalise, Severidade } from '../parser/modelo';
import { csvOcorrencias } from '../report/csv';
import { baixarArquivo, esc, numeroBR } from './html';
import { iconeAlerta, iconeDownload, iconeErro, iconeImpressora, iconeInfo, iconeOk } from './icones';

const POR_PAGINA = 50;

export const ROTULO: Record<Severidade, string> = { erro: 'Erro', alerta: 'Alerta', info: 'Informação' };
const ICONE: Record<Severidade, string> = { erro: iconeErro, alerta: iconeAlerta, info: iconeInfo };
const CATEGORIAS: readonly Categoria[] = ['Estrutura', 'Campo', 'Integridade', 'Conciliação', 'Risco'];

interface Filtros {
  severidades: Set<Severidade>;
  categoria: Categoria | '';
  regra: string;
  busca: string;
  pagina: number;
}

const novosFiltros = (): Filtros => ({
  severidades: new Set<Severidade>(['erro', 'alerta', 'info']),
  categoria: '',
  regra: '',
  busca: '',
  pagina: 0,
});

/** Etiqueta de severidade: ícone + texto (a informação não depende só da cor). */
export const etiqueta = (s: Severidade): string => `<span class="etiqueta etiqueta-${s}">${ICONE[s]}${ROTULO[s]}</span>`;

/** Frase-conclusão do título, conforme o resultado. */
export function conclusaoSaude(r: ResultadoAnalise): string {
  const { erros, alertas } = r.saude;
  if (erros > 0) {
    return `${numeroBR(erros)} ${erros === 1 ? 'erro precisa' : 'erros precisam'} de correção antes da transmissão`;
  }
  if (alertas > 0) {
    return `Sem erros de leiaute; ${numeroBR(alertas)} ${alertas === 1 ? 'alerta merece' : 'alertas merecem'} revisão`;
  }
  return 'Arquivo íntegro: nenhum erro ou alerta encontrado';
}

function filtrar(lista: readonly Ocorrencia[], f: Filtros): Ocorrencia[] {
  const termo = f.busca.trim().toLowerCase();
  return lista.filter(
    (o) =>
      f.severidades.has(o.severidade) &&
      (!f.categoria || o.categoria === f.categoria) &&
      (!f.regra || o.regra === f.regra) &&
      (!termo ||
        o.problema.toLowerCase().includes(termo) ||
        (o.campo ?? '').toLowerCase().includes(termo) ||
        String(o.linha ?? '').includes(termo)),
  );
}

interface GrupoRegra {
  regra: string;
  severidade: Severidade;
  categoria: Categoria;
  quantidade: number;
  exemplo: string;
}

export function agruparPorRegra(lista: readonly Ocorrencia[]): GrupoRegra[] {
  const grupos = new Map<string, GrupoRegra>();
  for (const o of lista) {
    const chave = `${o.severidade}|${o.regra}`;
    const g = grupos.get(chave);
    if (g) g.quantidade++;
    else grupos.set(chave, { regra: o.regra, severidade: o.severidade, categoria: o.categoria, quantidade: 1, exemplo: o.problema });
  }
  const peso: Record<Severidade, number> = { erro: 0, alerta: 1, info: 2 };
  return [...grupos.values()].sort((a, b) => peso[a.severidade] - peso[b.severidade] || b.quantidade - a.quantidade);
}

export function montarSaudeArquivo(raiz: HTMLElement, r: ResultadoAnalise): void {
  const f = novosFiltros();
  const a = r.arquivo;
  const ab = a.abertura;
  const grupos = agruparPorRegra(r.ocorrencias);

  raiz.innerHTML = `
    <div class="cabecalho-aba">
      <div>
        <h2 class="titulo-conclusao">${esc(conclusaoSaude(r))}</h2>
        <p class="subtitulo">${esc(a.nomeArquivo)}</p>
      </div>
      <button type="button" class="botao-sec botao-imprimir" data-imprimir="validador">${iconeImpressora}Imprimir / salvar PDF</button>
    </div>

    <div class="grade-kpi">
      ${kpi('erro', r.saude.erros, 'Impedem a transmissão ou distorcem os números')}
      ${kpi('alerta', r.saude.alertas, 'Pontos a revisar antes de entregar')}
      ${kpi('info', r.saude.infos, 'Contexto para a análise, sem ação obrigatória')}
    </div>

    <dl class="identificacao card">
      ${item('Produtor', ab?.nome ?? '—')}
      ${item('CPF', ab ? formatarCpfCnpj(ab.cpf) : '—')}
      ${item('Ano-base', a.anoBase ?? '—')}
      ${item('Período', ab?.dtIni && ab.dtFin ? `${formatarDataIso(ab.dtIni.iso)} a ${formatarDataIso(ab.dtFin.iso)}` : '—')}
      ${item('Forma de apuração', a.formaApuracao ? (FORMA_APUR[a.formaApuracao] ?? a.formaApuracao) : '—')}
      ${item('Lançamentos (Q100)', numeroBR(a.lancamentos.length))}
      ${item('Imóveis / contas', `${a.imoveis.length} / ${a.contas.length}`)}
      ${item('Linhas / codificação', `${numeroBR(a.totalLinhas)} / ${a.codificacao.toUpperCase()}`)}
    </dl>

    ${grupos.length === 0 ? `<div class="vazio card">${iconeOk}<p>Nenhuma ocorrência. O arquivo passou em todas as verificações.</p></div>` : `
    <section class="card">
      <h3>Resumo por regra</h3>
      <p class="ajuda">Clique em uma linha para ver só as ocorrências daquela regra.</p>
      <div class="tabela-rolagem">
        <table class="tabela" id="tabela-grupos">
          <thead><tr><th>Severidade</th><th>Categoria</th><th>Exemplo</th><th class="num">Qtd.</th></tr></thead>
          <tbody>
            ${grupos.map((g) => `
              <tr class="clicavel" tabindex="0" data-regra="${esc(g.regra)}">
                <td>${etiqueta(g.severidade)}</td>
                <td>${esc(g.categoria)}</td>
                <td>${esc(g.exemplo)}</td>
                <td class="num">${numeroBR(g.quantidade)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="barra-ferramentas">
        <h3>Ocorrências</h3>
        <button type="button" class="botao" id="exportar">${iconeDownload}Exportar CSV</button>
      </div>
      <div class="filtros" role="group" aria-label="Filtros">
        ${(['erro', 'alerta', 'info'] as const).map((s) => `
          <label class="filtro-sev"><input type="checkbox" data-sev="${s}" checked /> ${ROTULO[s]}</label>`).join('')}
        <select id="filtro-categoria" aria-label="Categoria">
          <option value="">Todas as categorias</option>
          ${CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <input type="search" id="filtro-busca" placeholder="Buscar texto, campo ou linha" aria-label="Buscar" />
        <button type="button" class="botao-link" id="limpar-filtros" hidden>Limpar filtro de regra</button>
      </div>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Severidade</th><th class="num">Linha</th><th>Registro</th><th>Campo</th><th>Problema</th><th>Como corrigir</th></tr></thead>
          <tbody id="corpo-ocorrencias"></tbody>
        </table>
      </div>
      <div class="paginacao">
        <span id="info-pagina" aria-live="polite"></span>
        <button type="button" class="botao-sec" id="anterior">Anterior</button>
        <button type="button" class="botao-sec" id="proxima">Próxima</button>
      </div>
    </section>`}
  `;

  if (grupos.length === 0) return;

  const corpo = raiz.querySelector<HTMLTableSectionElement>('#corpo-ocorrencias')!;
  const info = raiz.querySelector<HTMLSpanElement>('#info-pagina')!;
  const anterior = raiz.querySelector<HTMLButtonElement>('#anterior')!;
  const proxima = raiz.querySelector<HTMLButtonElement>('#proxima')!;
  const limparRegra = raiz.querySelector<HTMLButtonElement>('#limpar-filtros')!;

  const desenhar = (): void => {
    const lista = filtrar(r.ocorrencias, f);
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    f.pagina = Math.min(f.pagina, paginas - 1);
    const fatia = lista.slice(f.pagina * POR_PAGINA, (f.pagina + 1) * POR_PAGINA);
    corpo.innerHTML = fatia.length === 0
      ? '<tr><td colspan="6" class="vazio-tabela">Nenhuma ocorrência com estes filtros.</td></tr>'
      : fatia.map((o) => `
        <tr>
          <td>${etiqueta(o.severidade)}</td>
          <td class="num">${o.linha ?? '—'}</td>
          <td>${esc(o.registro ?? '—')}</td>
          <td><code>${esc(o.campo ?? '—')}</code></td>
          <td>${esc(o.problema)}</td>
          <td class="corrigir">${esc(o.comoCorrigir)}</td>
        </tr>`).join('');
    info.textContent = `${numeroBR(lista.length)} ocorrência(s) · página ${f.pagina + 1} de ${paginas}`;
    anterior.disabled = f.pagina === 0;
    proxima.disabled = f.pagina >= paginas - 1;
    limparRegra.hidden = !f.regra;
  };

  raiz.querySelectorAll<HTMLInputElement>('input[data-sev]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const s = cb.dataset.sev as Severidade;
      if (cb.checked) f.severidades.add(s);
      else f.severidades.delete(s);
      f.pagina = 0;
      desenhar();
    });
  });
  raiz.querySelector<HTMLSelectElement>('#filtro-categoria')!.addEventListener('change', (e) => {
    f.categoria = (e.target as HTMLSelectElement).value as Categoria | '';
    f.pagina = 0;
    desenhar();
  });
  raiz.querySelector<HTMLInputElement>('#filtro-busca')!.addEventListener('input', (e) => {
    f.busca = (e.target as HTMLInputElement).value;
    f.pagina = 0;
    desenhar();
  });
  raiz.querySelectorAll<HTMLTableRowElement>('#tabela-grupos tr[data-regra]').forEach((tr) => {
    const escolher = (): void => {
      f.regra = tr.dataset.regra ?? '';
      f.pagina = 0;
      desenhar();
      corpo.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    tr.addEventListener('click', escolher);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        escolher();
      }
    });
  });
  limparRegra.addEventListener('click', () => {
    f.regra = '';
    desenhar();
  });
  anterior.addEventListener('click', () => {
    f.pagina--;
    desenhar();
  });
  proxima.addEventListener('click', () => {
    f.pagina++;
    desenhar();
  });
  raiz.querySelector<HTMLButtonElement>('#exportar')!.addEventListener('click', () => {
    const nome = a.nomeArquivo.replace(/\.[^.]+$/, '');
    baixarArquivo(`saude-${nome}.csv`, csvOcorrencias(a.nomeArquivo, filtrar(r.ocorrencias, f)));
  });

  desenhar();
}

function kpi(s: Severidade, n: number, texto: string): string {
  const titulo = s === 'erro' ? 'Erros' : s === 'alerta' ? 'Alertas' : 'Informações';
  return `
    <div class="kpi card kpi-${s}">
      <span class="kpi-rotulo">${ICONE[s]}${titulo}</span>
      <span class="kpi-valor num">${numeroBR(n)}</span>
      <span class="kpi-texto">${texto}</span>
    </div>`;
}

function item(rotulo: string, valor: string | number): string {
  return `<div><dt>${esc(rotulo)}</dt><dd>${esc(valor)}</dd></div>`;
}

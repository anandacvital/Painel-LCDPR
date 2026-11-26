/**
 * APLICAÇÃO: monta a página e coordena arquivos, Worker e armazenamento.
 *
 * Fluxo:
 * 1. a pessoa arrasta (ou escolhe) um ou mais TXT;
 * 2. cada arquivo vai para o Worker, que devolve a análise;
 * 3. a análise entra na lista de arquivos;
 * 4. se "Manter neste computador" estiver ligado, a análise é salva no IndexedDB.
 *
 * Dois módulos, escolhidos no cabeçalho, usam os mesmos arquivos:
 * - VALIDADOR (antes de transmitir): saúde do arquivo, erros e onde corrigir;
 * - PAINEL DO LIVRO CAIXA (arquivos já transmitidos): visão gráfica para decisão.
 */
import { formatarCpfCnpj } from '../domain/documentos';
import type { ResultadoAnalise, Semaforo } from '../parser/modelo';
import { analisarArquivo } from '../workers/cliente';
import {
  apagarTudo,
  carregarAnalises,
  definirPreferenciaManterDados,
  preferenciaManterDados,
  removerAnalise,
  salvarAnalise,
} from './armazenamento';
import { esc, numeroBR } from './html';
import { iconeArquivo, iconeBroto, iconeCadeado, iconeFechar, iconeLixeira } from './icones';
import { montarSaudeArquivo } from './saudeArquivo';
import { imprimirValidador } from '../report/impressao';
import { montarPainel, novoEstadoPainel, type EstadoPainel } from './painel/modulo';

type Modulo = 'validador' | 'painel';

const ROTULO_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Saudável',
  amarelo: 'Com alertas',
  vermelho: 'Com erros',
};

interface Estado {
  analises: Map<string, ResultadoAnalise>;
  selecionada: string | null;
  manterDados: boolean;
  modulo: Modulo;
  painel: EstadoPainel;
}

/** Chave do arquivo: produtor + ano. Reenviar o mesmo produtor/ano substitui a análise anterior. */
function chaveDe(r: ResultadoAnalise): string {
  const ab = r.arquivo.abertura;
  return ab?.cpf && r.arquivo.anoBase ? `${ab.cpf}-${r.arquivo.anoBase}` : `arquivo:${r.arquivo.nomeArquivo}`;
}

export function iniciarApp(raiz: HTMLElement): void {
  const estado: Estado = {
    analises: new Map(),
    selecionada: null,
    manterDados: preferenciaManterDados(),
    modulo: 'validador',
    painel: novoEstadoPainel(),
  };

  raiz.innerHTML = `
    <header class="cabecalho">
      <h1>Painel LCDPR <span class="marca">· Grupo Paraná</span></h1>
      <nav class="modulos" aria-label="Módulos">
        <button type="button" data-modulo="validador" aria-pressed="true">Validador<small>antes de transmitir</small></button>
        <button type="button" data-modulo="painel" aria-pressed="false">Painel do Livro Caixa<small>arquivos transmitidos</small></button>
      </nav>
      <span id="semaforo-topo" class="semaforo" hidden></span>
      <button type="button" class="botao-perigo" id="apagar-tudo">${iconeLixeira}Apagar dados deste computador</button>
    </header>
    <div class="faixa-sigilo" role="note">
      ${iconeCadeado}
      <p>
        <strong>Os arquivos são lidos só neste navegador; nada é enviado para servidor algum.</strong>
        Não use o painel em computador compartilhado ou público.
      </p>
      <label class="interruptor">
        <input type="checkbox" id="manter-dados" ${estado.manterDados ? 'checked' : ''} />
        <span>Manter as análises neste computador</span>
      </label>
    </div>
    <main>
      <section class="card">
        <label class="area-arquivo" id="area-arquivo">
          ${iconeBroto}
          <strong>Arraste aqui um ou mais arquivos TXT do LCDPR</strong>
          <p>ou clique para escolher no computador</p>
          <input id="entrada-arquivo" type="file" accept=".txt,text/plain" multiple hidden />
        </label>
        <p id="status" class="status" role="status" aria-live="polite"></p>
      </section>
      <div id="modulo-validador">
        <section id="lista-arquivos" class="lista-arquivos" aria-label="Arquivos analisados"></section>
        <section id="aba-saude" class="aba"></section>
      </div>
      <div id="modulo-painel" class="aba" hidden></div>
    </main>
  `;

  const status = raiz.querySelector<HTMLParagraphElement>('#status')!;
  const lista = raiz.querySelector<HTMLElement>('#lista-arquivos')!;
  const aba = raiz.querySelector<HTMLElement>('#aba-saude')!;
  const semaforoTopo = raiz.querySelector<HTMLSpanElement>('#semaforo-topo')!;
  const area = raiz.querySelector<HTMLLabelElement>('#area-arquivo')!;
  const entrada = raiz.querySelector<HTMLInputElement>('#entrada-arquivo')!;
  const manter = raiz.querySelector<HTMLInputElement>('#manter-dados')!;
  const moduloValidador = raiz.querySelector<HTMLElement>('#modulo-validador')!;
  const moduloPainel = raiz.querySelector<HTMLElement>('#modulo-painel')!;

  // ---- Desenho -------------------------------------------------------------------
  const desenhar = (): void => {
    const noPainel = estado.modulo === 'painel';
    moduloValidador.hidden = noPainel;
    moduloPainel.hidden = !noPainel;
    raiz.querySelectorAll<HTMLButtonElement>('button[data-modulo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modulo === estado.modulo)));
    if (noPainel) {
      semaforoTopo.hidden = true;
      montarPainel(moduloPainel, [...estado.analises.values()], estado.painel, () => irPara('validador'));
      return;
    }
    moduloPainel.innerHTML = '';

    const itens = [...estado.analises.entries()].sort(([, a], [, b]) =>
      (a.arquivo.abertura?.nome ?? '').localeCompare(b.arquivo.abertura?.nome ?? '') ||
      (a.arquivo.anoBase ?? 0) - (b.arquivo.anoBase ?? 0),
    );
    lista.innerHTML = itens
      .map(([chave, r]) => {
        const ab = r.arquivo.abertura;
        const ativo = chave === estado.selecionada;
        return `
          <article class="cartao-arquivo ${ativo ? 'ativo' : ''}">
            <button type="button" class="selecionar" data-chave="${esc(chave)}" aria-pressed="${ativo}">
              <span class="icone-arquivo">${iconeArquivo}</span>
              <span class="dados">
                <strong title="${esc(ab?.nome ?? r.arquivo.nomeArquivo)}">${esc(ab?.nome ?? r.arquivo.nomeArquivo)}</strong>
                <span class="linha-dado">${esc(ab ? `CPF ${formatarCpfCnpj(ab.cpf)}` : r.arquivo.nomeArquivo)}</span>
                <span class="linha-dado">Ano-base <strong class="num">${esc(r.arquivo.anoBase ?? '?')}</strong> · ${numeroBR(r.arquivo.lancamentos.length)} lançamentos</span>
                <span class="semaforo semaforo-${r.saude.semaforo}">${ROTULO_SEMAFORO[r.saude.semaforo]}</span>
              </span>
            </button>
            <button type="button" class="remover" data-remover="${esc(chave)}" aria-label="Remover ${esc(r.arquivo.nomeArquivo)} da lista">${iconeFechar}</button>
          </article>`;
      })
      .join('');

    const sel = estado.selecionada ? estado.analises.get(estado.selecionada) : undefined;
    if (sel) {
      semaforoTopo.hidden = false;
      semaforoTopo.className = `semaforo semaforo-${sel.saude.semaforo}`;
      semaforoTopo.textContent = `Saúde do arquivo: ${ROTULO_SEMAFORO[sel.saude.semaforo]}`;
      montarSaudeArquivo(aba, sel);
      aba.querySelector<HTMLButtonElement>('[data-imprimir="validador"]')?.addEventListener('click', () => imprimirValidador(sel));
    } else {
      semaforoTopo.hidden = true;
      aba.innerHTML = '';
    }
  };

  const irPara = (m: Modulo): void => {
    estado.modulo = m;
    desenhar();
    window.scrollTo({ top: 0 });
  };
  raiz.querySelectorAll<HTMLButtonElement>('button[data-modulo]').forEach((b) => {
    b.addEventListener('click', () => irPara(b.dataset.modulo as Modulo));
  });

  // ---- Arquivos ------------------------------------------------------------------
  const processar = async (arquivos: FileList | null): Promise<void> => {
    if (!arquivos || arquivos.length === 0) return;
    const falhas: string[] = [];
    const substituidos: string[] = [];
    let i = 0;
    for (const arq of Array.from(arquivos)) {
      i++;
      status.textContent = `Analisando ${arq.name} (${i} de ${arquivos.length})...`;
      try {
        const r = await analisarArquivo(arq);
        const chave = chaveDe(r);
        const anterior = estado.analises.get(chave);
        if (anterior) substituidos.push(`${arq.name} substituiu ${anterior.arquivo.nomeArquivo} (mesmo produtor e ano-base)`);
        estado.analises.set(chave, r);
        estado.selecionada = chave;
        if (estado.manterDados) await salvarAnalise(chave, r);
        desenhar();
      } catch (e) {
        falhas.push(`${arq.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const avisos = [
      falhas.length ? `Não foi possível ler: ${falhas.join('; ')}.` : `${arquivos.length} arquivo(s) analisado(s).`,
      ...substituidos.map((t) => `${t}.`),
    ];
    status.textContent = avisos.join(' ');
    entrada.value = '';
  };

  entrada.addEventListener('change', () => void processar(entrada.files));
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('arrastando');
  });
  area.addEventListener('dragleave', () => area.classList.remove('arrastando'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('arrastando');
    void processar(e.dataTransfer?.files ?? null);
  });

  lista.addEventListener('click', (e) => {
    const alvo = e.target as HTMLElement;
    const sel = alvo.closest<HTMLButtonElement>('button[data-chave]');
    const rem = alvo.closest<HTMLButtonElement>('button[data-remover]');
    if (sel?.dataset.chave) {
      estado.selecionada = sel.dataset.chave;
      desenhar();
    } else if (rem?.dataset.remover) {
      const chave = rem.dataset.remover;
      estado.analises.delete(chave);
      void removerAnalise(chave);
      if (estado.selecionada === chave) estado.selecionada = estado.analises.keys().next().value ?? null;
      desenhar();
    }
  });

  // ---- Privacidade -------------------------------------------------------------------
  manter.addEventListener('change', async () => {
    estado.manterDados = manter.checked;
    definirPreferenciaManterDados(manter.checked);
    if (manter.checked) {
      for (const [chave, r] of estado.analises) await salvarAnalise(chave, r);
      status.textContent = 'As análises serão mantidas neste navegador até você apagá-las.';
    } else {
      await apagarTudo();
      status.textContent = 'Nada mais será guardado. As análises salvas foram apagadas deste computador.';
    }
  });

  raiz.querySelector<HTMLButtonElement>('#apagar-tudo')!.addEventListener('click', async () => {
    await apagarTudo();
    estado.analises.clear();
    estado.selecionada = null;
    estado.manterDados = false;
    manter.checked = false;
    desenhar();
    status.textContent = 'Todos os dados do painel foram apagados deste computador.';
  });

  // ---- Restaura análises salvas (só se a pessoa optou por manter) ----------------------------
  if (estado.manterDados) {
    void carregarAnalises().then((salvas) => {
      for (const r of salvas) estado.analises.set(chaveDe(r), r);
      if (salvas.length) {
        estado.selecionada = chaveDe(salvas[0]!);
        status.textContent = `${salvas.length} análise(s) restaurada(s) deste computador.`;
        desenhar();
      }
    });
  }
}

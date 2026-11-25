/**
 * Tela inicial (Fase 0): cabeçalho fixo e área para arrastar o TXT.
 * Nesta fase a área só confirma quais arquivos foram escolhidos; a leitura
 * de verdade (parser no Web Worker) chega na Fase 1.
 */
import { iconeBroto, iconeCadeado } from './icones';

export function montarTelaInicial(raiz: HTMLElement): void {
  raiz.innerHTML = `
    <header class="cabecalho">
      <h1>Painel LCDPR <span class="marca">· Grupo Paraná</span></h1>
    </header>
    <main>
      <section class="card">
        <label class="area-arquivo" id="area-arquivo">
          ${iconeBroto}
          <strong>Arraste aqui um ou mais arquivos TXT do LCDPR</strong>
          <p>ou clique para escolher no computador</p>
          <input id="entrada-arquivo" type="file" accept=".txt,text/plain" multiple hidden />
        </label>
        <p class="aviso-sigilo">
          ${iconeCadeado}
          <span>Os arquivos são lidos apenas neste navegador. Nada é enviado para servidor algum.</span>
        </p>
        <p id="status" role="status" aria-live="polite"></p>
      </section>
    </main>
  `;

  const area = raiz.querySelector<HTMLLabelElement>('#area-arquivo');
  const entrada = raiz.querySelector<HTMLInputElement>('#entrada-arquivo');
  const status = raiz.querySelector<HTMLParagraphElement>('#status');
  if (!area || !entrada || !status) return;

  const informar = (arquivos: FileList | null): void => {
    if (!arquivos || arquivos.length === 0) return;
    const nomes = Array.from(arquivos, (a) => a.name);
    status.textContent = `${nomes.length} arquivo(s) selecionado(s). A leitura será ativada na Fase 1.`;
  };

  entrada.addEventListener('change', () => informar(entrada.files));
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('arrastando');
  });
  area.addEventListener('dragleave', () => area.classList.remove('arrastando'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('arrastando');
    informar(e.dataTransfer?.files ?? null);
  });
}

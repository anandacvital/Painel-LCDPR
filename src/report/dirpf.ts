/**
 * RELATÓRIO "FICHA ATIVIDADE RURAL DA DIRPF" (A4 retrato).
 *
 * Um produtor por página (o IRPF é por CPF, Lei nº 8.023/1990, art. 13), na
 * ordem em que o programa da Receita pede: identificação dos imóveis, receitas
 * e despesas mês a mês e apuração do resultado. Serve para CONFERIR a
 * declaração campo a campo; os valores vêm só do realizado no arquivo.
 *
 * Os cálculos estão em domain/dirpf.ts. A mesma função de HTML (htmlFichaDirpf)
 * é usada na tela (aba Planejamento) e na impressão, para que as duas mostrem
 * exatamente os mesmos números.
 */
import { formatarReais, type Centavos } from '../domain/dinheiro';
import { formatarCpfCnpj } from '../domain/documentos';
import { AVISO_ESTIMATIVA } from '../domain/irpf';
import { BASE_LEGAL_DIRPF, type FichaDirpf } from '../domain/dirpf';
import { esc } from '../ui/html';
import { cabecalho, imprimir, RODAPE, slug } from './impressao';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dataBR = (iso: string): string => iso.split('-').reverse().join('/');
const pct = (centesimos: number | null): string =>
  centesimos === null ? '—' : `${(centesimos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
/** Valor com sinal "-" e cor vermelha quando negativo (legível em P&B). */
const val = (c: Centavos): string => `<span class="${c < 0 ? 'rel-neg' : ''}">${formatarReais(c)}</span>`;

const NOME_OPCAO = { real: 'resultado real (Livro Caixa)', vinteporcento: '20% da receita bruta' } as const;

/** Tabelas da ficha (sem cabeçalho de relatório). Usada na tela e na impressão. */
export function htmlFichaDirpf(f: FichaDirpf): string {
  const imoveis = f.imoveis.length
    ? `<table class="rel-tabela rel-compacta">
        <thead><tr><th>Imóvel</th><th>NIRF/CIB</th><th>UF / município (IBGE)</th><th class="num">Participação</th><th>Condição de exploração</th><th class="num">Área (ha)</th></tr></thead>
        <tbody>${f.imoveis.map((i) => `
          <tr>
            <td>${esc(i.codigo)} · ${esc(i.nome)}</td>
            <td>${esc(i.nirf || '—')}</td>
            <td>${esc(i.uf)} / ${esc(i.codMun)}</td>
            <td class="num">${pct(i.participacao)}</td>
            <td>${esc(i.condicao)}${i.condicaoConferir ? ' <small>(conferir)</small>' : ''}<br><small>LCDPR: ${esc(i.tipoExploracaoLcdpr)}</small></td>
            <td class="num"><small>informar</small></td>
          </tr>`).join('')}
        </tbody>
      </table>`
    : '<p class="rel-nota">O arquivo não tem imóveis (registro 0040).</p>';

  const meses = `
    <table class="rel-tabela rel-compacta rel-sem-quebra">
      <thead><tr><th>Mês</th><th class="num">Receita bruta</th><th class="num">Despesas de custeio e investimentos</th></tr></thead>
      <tbody>${f.meses.map((m) => `<tr><td>${MESES[Number(m.mes.slice(5, 7)) - 1]}</td><td class="num rel-pos">${val(m.receitaBruta)}</td><td class="num rel-neg">${val(m.despesas)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th><th class="num rel-pos">${val(f.receitaBruta)}</th><th class="num rel-neg">${val(f.despesas)}</th></tr></tfoot>
    </table>`;

  const v = f.vinteporcento;
  const marca = (o: FichaDirpf['opcaoSugerida']): string => (f.opcaoSugerida === o ? ' ★' : '');
  const apuracao = `
    <table class="rel-tabela rel-compacta rel-sem-quebra">
      <thead><tr><th>Campo</th><th class="num">Resultado real${marca('real')}</th><th class="num">20% da receita bruta${marca('vinteporcento')}</th></tr></thead>
      <tbody>
        <tr><td>Receita bruta total</td><td class="num">${val(f.receitaBruta)}</td><td class="num">${val(f.receitaBruta)}</td></tr>
        <tr><td>Despesas de custeio e investimentos</td><td class="num">${val(f.despesas)}</td><td class="num">—</td></tr>
        <tr><td>Resultado I (receita − despesas)</td><td class="num">${val(f.resultado)}</td><td class="num">${val(f.resultado)}</td></tr>
        <tr><td>Prejuízo de anos anteriores (saldo em 1º/1)</td><td class="num">${val(f.prejuizoAnterior)}</td><td class="num">${val(f.prejuizoAnterior)}</td></tr>
        <tr><td>Prejuízo compensado no ano</td><td class="num">${val(f.real.prejuizoCompensado)}</td><td class="num">—</td></tr>
        <tr><td><strong>Resultado tributável</strong></td><td class="num"><strong>${val(f.real.resultadoTributavel)}</strong></td><td class="num"><strong>${v.cabivel ? val(v.resultadoTributavel) : 'não cabe'}</strong></td></tr>
        <tr><td><strong>Prejuízo a compensar em ${f.anoCalendario + 1}</strong></td><td class="num"><strong>${val(f.real.prejuizoACompensar)}</strong></td><td class="num"><strong>${v.cabivel ? val(0) : '—'}</strong>${v.cabivel && v.prejuizoPerdido > 0 ? `<br><small class="rel-neg">perde ${formatarReais(v.prejuizoPerdido)}</small>` : ''}</td></tr>
      </tbody>
      <tfoot><tr><th>Imposto estimado (só a atividade rural)</th><th class="num">${formatarReais(f.real.imposto)}</th><th class="num">${v.cabivel ? formatarReais(v.imposto) : '—'}</th></tr></tfoot>
    </table>
    <p class="rel-conclusao"><strong>Sugestão do painel: ${NOME_OPCAO[f.opcaoSugerida]}</strong>${v.cabivel ? ' (menor imposto estimado).' : ' (a opção pelos 20% só cabe com resultado positivo).'}
      ${f.resultado < 0 ? ` O prejuízo do ano (${formatarReais(-f.resultado)}) soma-se ao saldo a compensar.` : ''}
      ${f.opcaoSugerida === 'vinteporcento' && v.prejuizoPerdido > 0 ? ` Atenção: a opção pelos 20% faz perder ${formatarReais(v.prejuizoPerdido)} de prejuízo acumulado.` : ''}</p>`;

  const conferir = f.receitasParaConferir.length
    ? `<h3>Receitas para conferir antes de declarar</h3>
      <table class="rel-tabela rel-compacta">
        <thead><tr><th>Linha</th><th>Data</th><th>Histórico</th><th class="num">Valor</th></tr></thead>
        <tbody>${f.receitasParaConferir.map((r) => `<tr><td class="num">${r.linha}</td><td>${dataBR(r.data)}</td><td>${esc(r.historico)}</td><td class="num">${formatarReais(r.valor)}</td></tr>`).join('')}</tbody>
      </table>`
    : '';

  return `
    <h3>1. Identificação dos imóveis explorados</h3>
    ${imoveis}
    <h3>2. Receitas e despesas (mês a mês)</h3>
    ${meses}
    <h3>3. Apuração do resultado</h3>
    ${apuracao}
    ${conferir}
    <div class="rel-avisos rel-sem-quebra"><strong>Antes de transmitir:</strong><ul>${f.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
}

const baseLegal = (): string => `
  <section class="rel-bloco rel-sem-quebra">
    <h2>Base legal</h2>
    <table class="rel-tabela rel-compacta">
      <thead><tr><th>Regra</th><th>Base</th></tr></thead>
      <tbody>${BASE_LEGAL_DIRPF.map((b) => `<tr><td>${esc(b.item)}</td><td>${esc(b.base)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="rel-nota">Os nomes dos campos seguem o programa IRPF e podem mudar entre versões. ${esc(AVISO_ESTIMATIVA)}</p>
  </section>`;

/** Um relatório com uma ficha por produtor, cada produtor em página nova. */
export function htmlRelatorioDirpf(fichas: readonly FichaDirpf[]): string {
  return fichas.map((f, i) => `
    <div class="${i > 0 ? 'rel-nova-pagina' : ''}">
      ${cabecalho('DIRPF: Ficha Atividade Rural (valores do LCDPR)', [
        ['Produtor', f.nome],
        ['CPF', formatarCpfCnpj(f.cpf)],
        ['Ano-calendário', f.previa ? `${f.anoCalendario} (prévia até ${dataBR(f.previa.fim)})` : String(f.anoCalendario)],
        ['Exercício', String(f.exercicio)],
      ])}
      <section class="rel-bloco">${htmlFichaDirpf(f)}</section>
      ${baseLegal()}
      ${RODAPE}
    </div>`).join('');
}

export function imprimirDirpf(fichas: readonly FichaDirpf[]): void {
  if (!fichas.length) return;
  const f = fichas[0]!;
  imprimir(htmlRelatorioDirpf(fichas), `dirpf-atividade-rural-${f.anoCalendario}-${fichas.length > 1 ? 'por-produtor' : slug(f.nome)}`);
}

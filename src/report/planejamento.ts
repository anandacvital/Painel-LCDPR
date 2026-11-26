/**
 * RELATÓRIO DE PLANEJAMENTO IRPF (A4 retrato), mesmo cabeçalho e rodapé de
 * sigilo dos outros relatórios. Imprime o que está na aba: por produtor, a
 * projeção (se prévia), real x 20%, ponto de equilíbrio, prejuízo e a
 * simulação digitada; no fim, os cuidados com base legal.
 */
import { formatarReais } from '../domain/dinheiro';
import { formatarCpfCnpj } from '../domain/documentos';
import { AVISO_ESTIMATIVA } from '../domain/irpf';
import { CUIDADOS, melhorImposto, textoEquilibrio, type PlanoProdutor } from '../domain/planejamento';
import { esc } from '../ui/html';
import type { Visao } from '../ui/painel/contexto';
import { cabecalho, imprimir, RODAPE, slug } from './impressao';

/** Só os campos do estado da aba que o relatório usa. */
export interface DadosSimulacao {
  cpfSimulacao: string;
  anteciparDespesas: number;
  postergarReceitas: number;
  usarProjecao: boolean;
}

const dataBR = (iso: string): string => iso.split('-').reverse().join('/');
const opcaoTexto = (r: PlanoProdutor['irpf']): string =>
  r.maisVantajosa === 'presumido' ? '20% da receita bruta' : r.maisVantajosa === 'empate' ? 'empate' : 'resultado real';

function secaoProdutor(p: PlanoProdutor, sim: DadosSimulacao): string {
  const r = p.irpf;
  const pr = p.projecao;
  const projecao = p.previa && pr ? `
    <h3>Projeção até dezembro</h3>
    <table class="rel-tabela rel-compacta">
      <thead><tr><th></th><th class="num">Realizado até ${esc(dataBR(p.previa.fim))}</th><th class="num">Projeção (restante)</th><th class="num">Ano projetado</th></tr></thead>
      <tbody>
        <tr><td>Receita bruta</td><td class="num">${formatarReais(p.realizado.receitas)}</td><td class="num">${formatarReais(pr.receitaBruta - p.realizado.receitas)}</td><td class="num">${formatarReais(pr.receitaBruta)}</td></tr>
        <tr><td>Despesas</td><td class="num">${formatarReais(p.realizado.despesas)}</td><td class="num">${formatarReais(pr.despesas - p.realizado.despesas)}</td><td class="num">${formatarReais(pr.despesas)}</td></tr>
      </tbody>
    </table>
    <p class="rel-nota">${esc(pr.explicacao)} ${p.usaProjecao ? 'O cálculo abaixo usa o ano projetado.' : 'O cálculo abaixo usa só o realizado.'}</p>` : '';

  const s = p.simulacao;
  const temSim = sim.cpfSimulacao === p.cpf && (sim.anteciparDespesas > 0 || sim.postergarReceitas > 0);
  const simulacao = temSim ? `
    <h3>Simulação</h3>
    <p>Antecipar ${formatarReais(sim.anteciparDespesas)} de despesas e postergar ${formatarReais(sim.postergarReceitas)} de receitas:
      imposto estimado de ${formatarReais(melhorImposto(s.antes))} para ${formatarReais(melhorImposto(s.depois))}
      (${s.variacaoImposto >= 0 ? 'economia' : 'aumento'} de ${formatarReais(Math.abs(s.variacaoImposto))}; melhor opção: ${esc(opcaoTexto(s.depois))}).</p>
    <ul class="rel-destaques">${s.cuidados.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';

  return `
    <section class="rel-bloco">
      <h2>${esc(p.nome)} <small class="rel-nota">CPF ${esc(formatarCpfCnpj(p.cpf))} · LCDPR ${p.obrigatoriedade.obrigado ? 'obrigatório' : 'opcional'} (receita bruta ${formatarReais(p.obrigatoriedade.receitaBruta)})</small></h2>
      ${projecao}
      <h3>Resultado real x 20% da receita bruta</h3>
      <table class="rel-tabela rel-compacta rel-sem-quebra">
        <thead><tr><th></th><th class="num">Resultado real</th><th class="num">20% da receita bruta</th></tr></thead>
        <tbody>
          <tr><td>Receita bruta</td><td class="num">${formatarReais(r.receitaBruta)}</td><td class="num">${formatarReais(r.receitaBruta)}</td></tr>
          <tr><td>Despesas</td><td class="num">${formatarReais(r.despesas)}</td><td class="num">—</td></tr>
          <tr><td>Prejuízo compensado</td><td class="num">${formatarReais(r.real.prejuizoCompensado)}</td><td class="num">—</td></tr>
          <tr><td>Base de cálculo</td><td class="num">${formatarReais(r.real.base)}</td><td class="num">${r.presumido.cabivel ? formatarReais(r.presumido.base) : 'não cabe'}</td></tr>
        </tbody>
        <tfoot><tr><th>Imposto estimado</th><th class="num">${formatarReais(r.real.impostoEstimado)}</th><th class="num">${r.presumido.cabivel ? formatarReais(r.presumido.impostoEstimado) : '—'}</th></tr></tfoot>
      </table>
      <p class="rel-conclusao"><strong>Melhor opção: ${esc(opcaoTexto(r))}.</strong> ${esc(r.insights.join(' '))}</p>
      <p>${esc(textoEquilibrio(p))}</p>
      <h3>Prejuízo a compensar</h3>
      <p>Saldo no início de ${p.ano}: <strong class="num">${formatarReais(p.prejuizo.saldoNoInicio)}</strong>; compensado no ano (resultado real): <span class="num">${formatarReais(r.real.prejuizoCompensado)}</span>; saldo para os próximos anos: <span class="num">${formatarReais(r.real.prejuizoRemanescente)}</span>.
      ${p.prejuizo.lacunas.length ? ` Anos não carregados no painel: ${p.prejuizo.lacunas.join(', ')}.` : ''}</p>
      ${simulacao}
      ${!p.tabela.exata ? `<p class="rel-nota">Tabela progressiva de ${p.ano} não cadastrada: usada a de ${p.tabela.anoTabela}.</p>` : ''}
    </section>`;
}

export function htmlPlanejamento(v: Visao, planos: readonly PlanoProdutor[], sim: DadosSimulacao): string {
  const previa = planos.find((p) => p.previa)?.previa;
  return `
    ${cabecalho('Planejamento do IRPF da Atividade Rural', [
      ['Produtor', v.rotulo],
      ['Ano-calendário', previa ? `${v.ano} (prévia até ${dataBR(previa.fim)})` : String(v.ano)],
      ['Base do cálculo', previa ? (sim.usarProjecao ? 'projeção até dezembro' : 'realizado até a prévia') : 'ano realizado'],
    ])}
    <div class="rel-avisos"><strong>Estimativa.</strong> ${esc(AVISO_ESTIMATIVA)}</div>
    ${planos.map((p) => secaoProdutor(p, sim)).join('')}
    <section class="rel-bloco">
      <h2>Cuidados e base legal</h2>
      <table class="rel-tabela rel-compacta">
        <thead><tr><th>Cuidado</th><th>Base legal</th></tr></thead>
        <tbody>${CUIDADOS.map((c) => `<tr><td><strong>${esc(c.titulo)}.</strong> ${esc(c.texto)}</td><td>${esc(c.base)}</td></tr>`).join('')}</tbody>
      </table>
    </section>
    ${RODAPE}`;
}

export function imprimirPlanejamento(v: Visao, planos: readonly PlanoProdutor[], sim: DadosSimulacao): void {
  imprimir(htmlPlanejamento(v, planos, sim), `planejamento-irpf-${v.ano}-${slug(v.rotulo)}`);
}

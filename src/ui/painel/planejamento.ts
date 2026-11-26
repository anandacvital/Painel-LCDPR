/**
 * ABA PLANEJAMENTO IRPF: o que fazer até 31/12 para pagar o imposto certo.
 *
 * Cinco blocos, um produtor (CPF) por vez, porque o IRPF é de cada pessoa
 * (Lei nº 8.023/1990, art. 13):
 * 1. Real x 20% da receita bruta, lado a lado, com a melhor opção destacada.
 * 2. Projeção até dezembro, quando o arquivo é uma prévia do ano em andamento.
 * 3. Simulador "e se": antecipar despesas e postergar receitas, com o ponto de
 *    equilíbrio (a despesa a mais que faz o resultado real valer mais a pena).
 * 4. Prejuízo a compensar: saldo, uso no ano e sobra.
 * 5. Checklist de cuidados, cada um com a base legal.
 *
 * Os cálculos ficam em domain/planejamento.ts (sem tela). Aqui só se desenha
 * e se guardam os valores digitados (em EstadoPlano, que sobrevive à troca de aba).
 */
import { formatarReais, lerReais, reaisParaCampo, type Centavos } from '../../domain/dinheiro';
import { formatarCpfCnpj } from '../../domain/documentos';
import { AVISO_ESTIMATIVA, PERCENTUAL_PRESUMIDO } from '../../domain/irpf';
import { CUIDADOS, LIMITE_OBRIGATORIEDADE_LCDPR, melhorImposto, planejarProdutor, textoEquilibrio, type PlanoProdutor } from '../../domain/planejamento';
import type { ArquivoLcdpr, ResultadoAnalise } from '../../parser/modelo';
import { imprimirPlanejamento } from '../../report/planejamento';
import { esc } from '../html';
import { iconeAlerta, iconeImpressora } from '../icones';
import type { Visao } from './contexto';

/** Valores digitados na aba (guardados no estado do Painel). */
export interface EstadoPlano {
  /** Prejuízo acumulado antes do primeiro ano carregado, por CPF (centavos). */
  prejuizoInicial: Record<string, Centavos>;
  /** Na prévia: usar a projeção até dezembro (true) ou só o realizado. */
  usarProjecao: boolean;
  /** CPF do produtor no simulador. */
  cpfSimulacao: string;
  anteciparDespesas: Centavos;
  postergarReceitas: Centavos;
}

export function novoEstadoPlano(): EstadoPlano {
  return { prejuizoInicial: {}, usarProjecao: true, cpfSimulacao: '', anteciparDespesas: 0, postergarReceitas: 0 };
}

const nomeMesCurto = (mes: number): string => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][mes - 1] ?? String(mes);
const pctTexto = (f: number): string => `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Monta os planos de todos os produtores da Visão (cada um com os SEUS arquivos de todos os anos). */
export function montarPlanos(analises: readonly ResultadoAnalise[], v: Visao, e: EstadoPlano): PlanoProdutor[] {
  const cpfs = [...new Set(v.arquivos.map((a) => a.abertura?.cpf ?? ''))];
  if (!e.cpfSimulacao || !cpfs.includes(e.cpfSimulacao)) e.cpfSimulacao = cpfs[0] ?? '';
  return cpfs.flatMap((cpf) => {
    const doProdutor: ArquivoLcdpr[] = analises.map((r) => r.arquivo).filter((a) => (a.abertura?.cpf ?? '') === cpf);
    const simula = cpf === e.cpfSimulacao;
    const p = planejarProdutor(doProdutor, v.ano, {
      prejuizoInicial: e.prejuizoInicial[cpf] ?? 0,
      usarProjecao: e.usarProjecao,
      anteciparDespesas: simula ? e.anteciparDespesas : 0,
      postergarReceitas: simula ? e.postergarReceitas : 0,
    });
    return p ? [p] : [];
  });
}

/** Primeiro ano carregado de um produtor (o prejuízo informado é o acumulado ANTES dele). */
function primeiroAno(analises: readonly ResultadoAnalise[], cpf: string): number | null {
  const anos = analises.filter((r) => r.arquivo.abertura?.cpf === cpf).map((r) => r.arquivo.anoBase).filter((a): a is number => a !== null);
  return anos.length ? Math.min(...anos) : null;
}

// ---------------------------------------------------------------------------
// Peças da tela
// ---------------------------------------------------------------------------

function linha(rotulo: string, valor: Centavos, classe = ''): string {
  return `<div class="plano-linha ${classe}"><span>${esc(rotulo)}</span><span class="num">${formatarReais(valor)}</span></div>`;
}

/** Bloco 1: Real x 20%, lado a lado. */
function blocoOpcoes(p: PlanoProdutor): string {
  const r = p.irpf;
  const melhorReal = r.maisVantajosa === 'real';
  const melhorPres = r.maisVantajosa === 'presumido';
  const selo = (ok: boolean): string => (ok ? '<span class="selo selo-melhor">Mais vantajosa</span>' : r.maisVantajosa === 'empate' ? '<span class="selo">Empate</span>' : '');
  const conclusao = r.resultado <= 0
    ? `Resultado negativo: não há imposto da atividade rural no ano e o prejuízo de ${formatarReais(-r.resultado)} fica para compensar nos próximos anos (Lei nº 8.023/1990, art. 14).`
    : r.maisVantajosa === 'empate'
      ? 'As duas opções dão o mesmo imposto estimado.'
      : `${melhorPres ? 'A opção pelos 20% da receita bruta' : 'O resultado real'} gera ${formatarReais(r.economiaNoAno)} a menos de imposto estimado.`;
  return `
    <div class="plano-opcoes">
      <div class="plano-opcao ${melhorReal ? 'melhor' : ''}">
        <div class="plano-opcao-topo"><h4>Resultado real</h4>${selo(melhorReal)}</div>
        <p class="ajuda">Receitas menos despesas do Livro Caixa (art. 4º).</p>
        ${linha('Receita bruta', r.receitaBruta)}
        ${linha('(−) Despesas', r.despesas)}
        ${linha('= Resultado', r.resultado, 'plano-subtotal')}
        ${r.real.prejuizoCompensado ? linha('(−) Prejuízo compensado', r.real.prejuizoCompensado) : ''}
        ${linha('Base de cálculo', r.real.base, 'plano-subtotal')}
        ${linha('Imposto estimado', r.real.impostoEstimado, 'plano-imposto')}
      </div>
      <div class="plano-opcao ${melhorPres ? 'melhor' : ''}">
        <div class="plano-opcao-topo"><h4>20% da receita bruta</h4>${selo(melhorPres)}</div>
        <p class="ajuda">Opção do art. 5º: a base é 20% da receita, quaisquer que sejam as despesas.</p>
        ${r.presumido.cabivel ? `
          ${linha('Receita bruta', r.receitaBruta)}
          ${linha(`× ${pctTexto(PERCENTUAL_PRESUMIDO)}`, r.presumido.base, 'plano-subtotal')}
          ${linha('Base de cálculo', r.presumido.base, 'plano-subtotal')}
          ${linha('Imposto estimado', r.presumido.impostoEstimado, 'plano-imposto')}
          ${r.presumido.prejuizoPerdido > 0 ? `<p class="plano-alerta">${iconeAlerta}Optar pelos 20% faz perder TODO o prejuízo acumulado (${formatarReais(r.presumido.prejuizoPerdido)}), inclusive o que sobraria para os próximos anos (art. 16, parágrafo único).</p>` : ''}
        ` : '<p class="plano-nao-cabe">Não cabe neste ano: a opção só existe para resultado positivo.</p>'}
      </div>
    </div>
    <p class="plano-conclusao">${esc(conclusao)}</p>`;
}

/** Bloco 2: projeção até dezembro (só na prévia). */
function blocoProjecao(p: PlanoProdutor): string {
  if (!p.previa || !p.projecao) return '';
  const pr = p.projecao;
  const mes = nomeMesCurto(p.previa.ateMes);
  const restRec = pr.receitaBruta - p.realizado.receitas;
  const restDesp = pr.despesas - p.realizado.despesas;
  return `
    <div class="plano-projecao">
      <h4>Projeção até dezembro</h4>
      <div class="tabela-rolagem">
        <table class="tabela tabela-compacta">
          <thead><tr><th></th><th class="num">Realizado (jan–${mes})</th><th class="num">Projeção (restante)</th><th class="num">Ano projetado</th></tr></thead>
          <tbody>
            <tr><td>Receita bruta</td><td class="num agro">${formatarReais(p.realizado.receitas)}</td><td class="num">${formatarReais(restRec)}</td><td class="num agro">${formatarReais(pr.receitaBruta)}</td></tr>
            <tr><td>Despesas</td><td class="num negativo">${formatarReais(p.realizado.despesas)}</td><td class="num">${formatarReais(restDesp)}</td><td class="num negativo">${formatarReais(pr.despesas)}</td></tr>
            <tr class="linha-total"><td>Resultado</td><td class="num">${formatarReais(p.realizado.resultado)}</td><td class="num">${formatarReais(restRec - restDesp)}</td><td class="num">${formatarReais(pr.receitaBruta - pr.despesas)}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="ajuda">${esc(pr.explicacao)} ${p.usaProjecao ? 'Os cálculos desta aba usam o ano projetado.' : 'Os cálculos desta aba usam só o realizado.'}</p>
    </div>`;
}

/** Bloco 4: prejuízo a compensar. */
function blocoPrejuizo(p: PlanoProdutor, analises: readonly ResultadoAnalise[], e: EstadoPlano): string {
  const primeiro = primeiroAno(analises, p.cpf) ?? p.ano;
  const r = p.irpf;
  const linhas = [
    ...p.prejuizo.linhas.map((l) => ({ ...l, rotulo: String(l.ano) })),
    {
      rotulo: `${p.ano}${p.usaProjecao ? ' (projetado)' : ''}`,
      saldoInicial: p.prejuizo.saldoNoInicio,
      resultado: r.resultado,
      compensado: r.real.prejuizoCompensado,
      gerado: r.resultado < 0 ? -r.resultado : 0,
      saldoFinal: r.real.prejuizoRemanescente,
    },
  ];
  return `
    <div class="plano-prejuizo">
      <h4>Prejuízo a compensar</h4>
      <label class="campo-valor">Prejuízo acumulado antes de ${primeiro} (R$)
        <input type="text" inputmode="decimal" data-prejuizo="${esc(p.cpf)}" value="${esc(reaisParaCampo(e.prejuizoInicial[p.cpf] ?? 0))}" placeholder="0,00" />
      </label>
      <div class="tabela-rolagem">
        <table class="tabela tabela-compacta">
          <thead><tr><th>Ano</th><th class="num">Saldo no início</th><th class="num">Resultado do ano</th><th class="num">Compensado</th><th class="num">Saldo no fim</th></tr></thead>
          <tbody>${linhas.map((l) => `<tr><td>${esc(l.rotulo)}</td><td class="num">${formatarReais(l.saldoInicial)}</td><td class="num ${l.resultado < 0 ? 'negativo' : ''}">${formatarReais(l.resultado)}</td><td class="num">${formatarReais(l.compensado)}</td><td class="num">${formatarReais(l.saldoFinal)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="ajuda">Considera que nos anos anteriores a apuração foi pelo resultado real. Se em algum ano a opção foi pelos 20%, o saldo daquele ano em diante é zero (art. 16, parágrafo único): ajuste o valor acima. O saldo final de ${esc(String(p.ano))} vale se a apuração deste ano for pelo resultado real.</p>
      ${p.prejuizo.lacunas.length ? `<p class="plano-alerta">${iconeAlerta}Faltam no painel os anos ${p.prejuizo.lacunas.join(', ')}: o saldo pode estar incompleto.</p>` : ''}
    </div>`;
}

/** Bloco 3: simulador (um produtor por vez). */
function blocoSimulador(planos: readonly PlanoProdutor[], e: EstadoPlano): string {
  const p = planos.find((x) => x.cpf === e.cpfSimulacao) ?? planos[0];
  if (!p) return '';
  const s = p.simulacao;
  const melhor = (r: typeof s.antes): string => (r.maisVantajosa === 'presumido' ? '20% da receita' : r.maisVantajosa === 'empate' ? 'empate' : 'resultado real');
  const temSimulacao = e.anteciparDespesas > 0 || e.postergarReceitas > 0;
  const economia = s.variacaoImposto;
  const conclusao = !temSimulacao
    ? 'Digite um valor para ver o efeito no imposto estimado.'
    : economia > 0
      ? `Economia estimada de ${formatarReais(economia)} no imposto de ${p.ano}.`
      : economia < 0
        ? `O imposto estimado AUMENTA ${formatarReais(-economia)} (verifique a opção mais vantajosa).`
        : 'Sem efeito no imposto estimado: a opção pelos 20% continua sendo a melhor e não depende das despesas.';
  return `
    <section class="card plano-simulador">
      <h3>Simulador "e se"</h3>
      <p class="ajuda">Simule pagar despesas antes de 31/12 ou receber receitas só em janeiro. Os valores são estimativas para apoiar a decisão, não a decisão em si.</p>
      <div class="filtros plano-campos">
        ${planos.length > 1 ? `<label>Produtor<select data-sim="cpf">${planos.map((x) => `<option value="${esc(x.cpf)}" ${x.cpf === p.cpf ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>` : ''}
        <label class="campo-valor">Antecipar despesas (R$)<input type="text" inputmode="decimal" data-sim="antecipar" value="${esc(reaisParaCampo(e.anteciparDespesas))}" placeholder="0,00" /></label>
        <label class="campo-valor">Postergar receitas (R$)<input type="text" inputmode="decimal" data-sim="postergar" value="${esc(reaisParaCampo(e.postergarReceitas))}" placeholder="0,00" /></label>
      </div>
      <p class="plano-equilibrio">${esc(textoEquilibrio(p))}</p>
      <div class="tabela-rolagem">
        <table class="tabela tabela-compacta">
          <thead><tr><th></th><th class="num">Hoje</th><th class="num">Com a simulação</th></tr></thead>
          <tbody>
            <tr><td>Receita bruta</td><td class="num">${formatarReais(s.antes.receitaBruta)}</td><td class="num">${formatarReais(s.depois.receitaBruta)}</td></tr>
            <tr><td>Despesas</td><td class="num">${formatarReais(s.antes.despesas)}</td><td class="num">${formatarReais(s.depois.despesas)}</td></tr>
            <tr><td>Imposto pelo resultado real</td><td class="num">${formatarReais(s.antes.real.impostoEstimado)}</td><td class="num">${formatarReais(s.depois.real.impostoEstimado)}</td></tr>
            <tr><td>Imposto pelos 20% da receita</td><td class="num">${s.antes.presumido.cabivel ? formatarReais(s.antes.presumido.impostoEstimado) : 'não cabe'}</td><td class="num">${s.depois.presumido.cabivel ? formatarReais(s.depois.presumido.impostoEstimado) : 'não cabe'}</td></tr>
            <tr><td>Melhor opção</td><td>${melhor(s.antes)}</td><td>${melhor(s.depois)}</td></tr>
            <tr class="linha-total"><td>Imposto estimado (melhor opção)</td><td class="num">${formatarReais(melhorImposto(s.antes))}</td><td class="num">${formatarReais(melhorImposto(s.depois))}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="plano-conclusao ${economia > 0 ? 'boa' : ''}" role="status" aria-live="polite">${esc(conclusao)}</p>
      ${s.cuidados.length ? `<ul class="plano-cuidados-sim">${s.cuidados.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    </section>`;
}

/** Bloco 5: checklist de cuidados. */
function blocoCuidados(): string {
  return `
    <section class="card">
      <h3>Antes de decidir: cuidados e base legal</h3>
      <ul class="plano-checklist">
        ${CUIDADOS.map((c) => `<li><strong>${esc(c.titulo)}.</strong> ${esc(c.texto)} <small>${esc(c.base)}</small></li>`).join('')}
      </ul>
    </section>`;
}

function cartaoProdutor(p: PlanoProdutor, analises: readonly ResultadoAnalise[], e: EstadoPlano): string {
  const ob = p.obrigatoriedade;
  const seloLcdpr = ob.obrigado
    ? `<span class="selo selo-alerta" title="Receita bruta acima de ${formatarReais(LIMITE_OBRIGATORIEDADE_LCDPR)}">LCDPR obrigatório</span>`
    : `<span class="selo" title="Receita bruta até ${formatarReais(LIMITE_OBRIGATORIEDADE_LCDPR)}">LCDPR opcional</span>`;
  return `
    <section class="card plano-produtor">
      <div class="plano-cabecalho">
        <div>
          <h3>${esc(p.nome)}</h3>
          <p class="ajuda">CPF ${esc(formatarCpfCnpj(p.cpf))} · ano-calendário ${p.ano}${p.previa ? ` · prévia até ${esc(p.previa.fim.split('-').reverse().join('/'))}` : ''}</p>
        </div>
        ${seloLcdpr}
      </div>
      ${blocoProjecao(p)}
      ${blocoOpcoes(p)}
      ${blocoPrejuizo(p, analises, e)}
      ${!p.tabela.exata ? `<p class="plano-alerta">${iconeAlerta}A tabela progressiva de ${p.ano} ainda não está cadastrada no painel: o imposto usa a tabela de ${p.tabela.anoTabela}.</p>` : ''}
    </section>`;
}

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

export function abaPlanejamento(raiz: HTMLElement, analises: readonly ResultadoAnalise[], v: Visao, e: EstadoPlano): void {
  const desenhar = (): void => {
    const planos = montarPlanos(analises, v, e);
    const temPrevia = planos.some((p) => p.previa);
    const total = planos.reduce((s, p) => s + melhorImposto(p.irpf), 0);
    raiz.innerHTML = `
      <div class="cabecalho-aba plano-topo">
        <p class="ajuda">Compare as duas formas de apurar o IRPF da atividade rural, projete o ano e simule decisões antes de 31/12. ${planos.length > 1 ? `Cada produtor é calculado separadamente (art. 13). Imposto estimado somado: <strong class="num">${formatarReais(total)}</strong>.` : ''}</p>
        <button type="button" class="botao-sec" data-imprimir-plano>${iconeImpressora}Imprimir planejamento</button>
      </div>
      ${temPrevia ? `
        <div class="aviso-previa" role="note">
          <strong>Ano em andamento.</strong> O arquivo é uma prévia; a projeção completa o ano até dezembro.
          <label class="plano-alternar"><input type="checkbox" data-projecao ${e.usarProjecao ? 'checked' : ''} /> Calcular com a projeção até dezembro</label>
        </div>` : ''}
      ${planos.map((p) => cartaoProdutor(p, analises, e)).join('')}
      ${blocoSimulador(planos, e)}
      ${blocoCuidados()}
      <p class="nota-estimativa">${esc(AVISO_ESTIMATIVA)}</p>
    `;
    ligar(planos);
  };

  /** Liga os campos. Valores em reais são lidos no "change" (ao sair do campo ou Enter). */
  const ligar = (planos: PlanoProdutor[]): void => {
    const valor = (input: HTMLInputElement): Centavos | null => {
      const c = lerReais(input.value);
      input.setCustomValidity(c === null ? 'Use o formato 50.000,00' : '');
      if (c === null) input.reportValidity();
      return c;
    };
    raiz.querySelectorAll<HTMLInputElement>('input[data-prejuizo]').forEach((i) => {
      i.addEventListener('change', () => {
        const c = valor(i);
        if (c === null) return;
        e.prejuizoInicial[i.dataset.prejuizo!] = c;
        desenhar();
      });
    });
    raiz.querySelectorAll<HTMLInputElement>('input[data-sim]').forEach((i) => {
      i.addEventListener('change', () => {
        const c = valor(i);
        if (c === null) return;
        if (i.dataset.sim === 'antecipar') e.anteciparDespesas = c;
        else e.postergarReceitas = c;
        desenhar();
        raiz.querySelector<HTMLInputElement>(`input[data-sim="${i.dataset.sim}"]`)?.focus();
      });
    });
    raiz.querySelector<HTMLSelectElement>('select[data-sim="cpf"]')?.addEventListener('change', (ev) => {
      e.cpfSimulacao = (ev.target as HTMLSelectElement).value;
      desenhar();
    });
    raiz.querySelector<HTMLInputElement>('input[data-projecao]')?.addEventListener('change', (ev) => {
      e.usarProjecao = (ev.target as HTMLInputElement).checked;
      desenhar();
    });
    raiz.querySelector<HTMLButtonElement>('[data-imprimir-plano]')?.addEventListener('click', () => imprimirPlanejamento(v, planos, e));
  };

  desenhar();
}

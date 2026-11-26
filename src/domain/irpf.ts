/**
 * IRPF DA ATIVIDADE RURAL — ESTIMATIVA E PLANEJAMENTO
 *
 * Fundamentos conferidos no texto da Lei nº 8.023/1990 (versão atualizada da
 * Câmara dos Deputados), em 26/11/2026:
 * - art. 4º: resultado = receitas recebidas − despesas pagas no ano (regime de caixa);
 *   investimento é despesa no mês do pagamento (§ 2º).
 * - art. 5º: à opção do contribuinte, o resultado, QUANDO POSITIVO, limita-se a
 *   20% da receita bruta do ano.
 * - art. 14: o prejuízo pode ser compensado com resultados positivos de anos
 *   posteriores. A Lei nº 8.023/1990 não traz o limite de 30% para a pessoa física
 *   (esse limite é regra das pessoas jurídicas).
 * - art. 16, parágrafo único: quem opta pelos 20% PERDE o direito de compensar
 *   todo o prejuízo de anos anteriores ao da opção.
 * - art. 13: condôminos e parceiros tributam separadamente, na proporção que
 *   couber a cada um.
 * O briefing do projeto cita também a Lei nº 9.250/1995, art. 18; o texto desse
 * artigo NÃO foi conferido pelo painel (fonte indisponível): validar antes de citar
 * em relatório.
 *
 * O IMPOSTO É SÓ UMA ESTIMATIVA: base × 27,5% (alíquota marginal máxima). O valor
 * real depende da declaração completa (outros rendimentos, deduções, parcela a
 * deduzir da tabela progressiva). O painel deixa isso explícito.
 */
import type { TotalMensal } from './agregacoes';
import type { Centavos } from './dinheiro';
import type { ArquivoLcdpr } from '../parser/modelo';

export const ALIQUOTA_MARGINAL = 0.275;
export const PERCENTUAL_PRESUMIDO = 0.2;

export const AVISO_ESTIMATIVA =
  'Estimativa pela alíquota marginal de 27,5%. O imposto real depende da declaração completa: outros rendimentos, deduções e parcela a deduzir da tabela progressiva.';

const imposto = (base: Centavos): Centavos => Math.round(Math.max(0, base) * ALIQUOTA_MARGINAL);

export interface EntradaIrpf {
  receitaBruta: Centavos;
  despesas: Centavos;
  /** Saldo de prejuízos de anos anteriores ainda não compensado, informado pelo usuário. */
  prejuizoAnterior?: Centavos;
}

export interface OpcaoReal {
  base: Centavos;
  prejuizoCompensado: Centavos;
  /** Prejuízo que sobra para os próximos anos (inclui o prejuízo do próprio ano, se houver). */
  prejuizoRemanescente: Centavos;
  impostoEstimado: Centavos;
}

export interface OpcaoPresumida {
  /** false quando o resultado não é positivo: o art. 5º só limita resultado positivo. */
  cabivel: boolean;
  base: Centavos;
  impostoEstimado: Centavos;
  /** Prejuízo de anos anteriores perdido pela opção (Lei 8.023, art. 16, parágrafo único). */
  prejuizoPerdido: Centavos;
}

export interface ResultadoIrpf {
  receitaBruta: Centavos;
  despesas: Centavos;
  resultado: Centavos;
  real: OpcaoReal;
  presumido: OpcaoPresumida;
  maisVantajosa: 'real' | 'presumido' | 'empate';
  /** Diferença de imposto estimado entre a pior e a melhor opção no ano. */
  economiaNoAno: Centavos;
  insights: string[];
}

export function calcularIrpf(e: EntradaIrpf): ResultadoIrpf {
  const prejuizoAnterior = Math.max(0, e.prejuizoAnterior ?? 0);
  const resultado = e.receitaBruta - e.despesas;

  // ---- Opção 1: resultado real (Livro Caixa) com compensação de prejuízo ----
  const compensado = resultado > 0 ? Math.min(prejuizoAnterior, resultado) : 0;
  const baseReal = resultado > 0 ? resultado - compensado : 0;
  const real: OpcaoReal = {
    base: baseReal,
    prejuizoCompensado: compensado,
    prejuizoRemanescente: prejuizoAnterior - compensado + (resultado < 0 ? -resultado : 0),
    impostoEstimado: imposto(baseReal),
  };

  // ---- Opção 2: 20% da receita bruta (art. 5º) ----
  const cabivel = resultado > 0;
  const basePresumida = cabivel ? Math.round(e.receitaBruta * PERCENTUAL_PRESUMIDO) : 0;
  const presumido: OpcaoPresumida = {
    cabivel,
    base: basePresumida,
    impostoEstimado: imposto(basePresumida),
    prejuizoPerdido: cabivel ? prejuizoAnterior : 0,
  };

  let maisVantajosa: ResultadoIrpf['maisVantajosa'] = 'real';
  if (cabivel && presumido.base < real.base) maisVantajosa = 'presumido';
  else if (cabivel && presumido.base === real.base) maisVantajosa = 'empate';
  const economiaNoAno = Math.abs(real.impostoEstimado - presumido.impostoEstimado) * (cabivel ? 1 : 0);

  const insights: string[] = [];
  if (resultado <= 0) {
    insights.push(
      `Resultado negativo ou nulo: não há imposto da atividade rural no ano e o prejuízo de ${fmt(-resultado)} pode ser compensado em anos seguintes (Lei nº 8.023/1990, art. 14). Guarde a comprovação.`,
    );
  } else if (maisVantajosa === 'presumido') {
    insights.push(
      `A opção pelos 20% da receita bruta reduz a base de ${fmt(real.base)} para ${fmt(presumido.base)}: economia estimada de ${fmt(economiaNoAno)} no ano (Lei nº 8.023/1990, art. 5º).`,
    );
    const futuro = real.prejuizoRemanescente;
    if (prejuizoAnterior > 0) {
      insights.push(
        `Atenção: optar pelos 20% faz perder TODO o prejuízo de anos anteriores (${fmt(prejuizoAnterior)}), inclusive o que sobraria para os próximos anos (${fmt(futuro)}), conforme a Lei nº 8.023/1990, art. 16, parágrafo único. Compare a economia do ano com o valor futuro desse prejuízo antes de decidir.`,
      );
    }
  } else {
    insights.push(
      `O resultado real (receitas − despesas) gera base menor que 20% da receita bruta: manter a apuração pelo Livro Caixa é mais vantajoso${economiaNoAno > 0 ? `, com ${fmt(economiaNoAno)} a menos de imposto estimado` : ''} (Lei nº 8.023/1990, arts. 4º e 5º).`,
    );
    if (compensado > 0) {
      insights.push(`Foram compensados ${fmt(compensado)} de prejuízos anteriores (Lei nº 8.023/1990, art. 14).`);
    }
  }
  const margem = e.receitaBruta > 0 ? resultado / e.receitaBruta : 0;
  if (resultado > 0 && margem > PERCENTUAL_PRESUMIDO && margem < 0.3) {
    insights.push(
      `A margem do ano (${(margem * 100).toFixed(1).replace('.', ',')}%) está próxima de 20%: pequenas variações de despesas mudam a opção mais vantajosa. Vale simular.`,
    );
  }

  return {
    receitaBruta: e.receitaBruta,
    despesas: e.despesas,
    resultado,
    real,
    presumido,
    maisVantajosa,
    economiaNoAno,
    insights,
  };
}

// ---------------------------------------------------------------------------
// Projeção até dezembro (ano em curso)
// ---------------------------------------------------------------------------

export interface Projecao {
  metodo: 'realizado' | 'media-mensal' | 'sazonal-ano-anterior';
  mesesRealizados: number;
  receitaBruta: Centavos;
  despesas: Centavos;
  explicacao: string;
}

/**
 * Quantos meses do ano já estão "fechados". Ano anterior ao atual: 12. Ano atual:
 * até o mês anterior ao de hoje (o mês corrente ainda está incompleto).
 */
export function mesesRealizados(arquivo: ArquivoLcdpr, hoje: Date = new Date()): number {
  const ano = arquivo.anoBase;
  if (!ano || ano < hoje.getFullYear()) return 12;
  if (ano > hoje.getFullYear()) return 0;
  return hoje.getMonth(); // janeiro = 0 → nenhum mês fechado
}

/**
 * Projeta o ano inteiro a partir dos meses realizados.
 * - Com o ano anterior disponível: usa a sazonalidade dele (o agro concentra
 *   receitas na safra), corrigida pelo ritmo deste ano.
 * - Sem ano anterior: média mensal dos meses realizados.
 */
export function projetarAno(meses: readonly TotalMensal[], realizados: number, anoAnterior?: readonly TotalMensal[]): Projecao {
  const soma = (lista: readonly TotalMensal[], campo: 'receitas' | 'despesas', de: number, ate: number): Centavos =>
    lista.slice(de, ate).reduce((s, m) => s + m[campo], 0);

  const recReal = soma(meses, 'receitas', 0, realizados);
  const despReal = soma(meses, 'despesas', 0, realizados);
  if (realizados >= 12) {
    return { metodo: 'realizado', mesesRealizados: 12, receitaBruta: recReal, despesas: despReal, explicacao: 'Ano completo: valores realizados.' };
  }
  if (realizados <= 0) {
    return { metodo: 'media-mensal', mesesRealizados: 0, receitaBruta: 0, despesas: 0, explicacao: 'Ainda não há mês fechado para projetar.' };
  }

  if (anoAnterior && anoAnterior.length === 12) {
    const recAntAte = soma(anoAnterior, 'receitas', 0, realizados);
    const despAntAte = soma(anoAnterior, 'despesas', 0, realizados);
    if (recAntAte > 0 && despAntAte > 0) {
      const fatorRec = recReal / recAntAte;
      const fatorDesp = despReal / despAntAte;
      return {
        metodo: 'sazonal-ano-anterior',
        mesesRealizados: realizados,
        receitaBruta: recReal + Math.round(soma(anoAnterior, 'receitas', realizados, 12) * fatorRec),
        despesas: despReal + Math.round(soma(anoAnterior, 'despesas', realizados, 12) * fatorDesp),
        explicacao: `Projeção pela sazonalidade do ano anterior: os meses restantes repetem o perfil do ano passado, ajustado pelo ritmo deste ano (receitas ${(fatorRec * 100).toFixed(0)}% e despesas ${(fatorDesp * 100).toFixed(0)}% do mesmo período do ano anterior).`,
      };
    }
  }
  const restantes = 12 - realizados;
  return {
    metodo: 'media-mensal',
    mesesRealizados: realizados,
    receitaBruta: recReal + Math.round((recReal / realizados) * restantes),
    despesas: despReal + Math.round((despReal / realizados) * restantes),
    explicacao: `Projeção pela média mensal dos ${realizados} meses realizados. No agro, a receita é sazonal: carregue o arquivo do ano anterior para uma projeção mais fiel.`,
  };
}

// ---------------------------------------------------------------------------
// Simulação: "e se eu antecipar despesas ou postergar receitas?"
// ---------------------------------------------------------------------------

export interface Simulacao {
  anteciparDespesas?: Centavos;
  postergarReceitas?: Centavos;
}

export interface ResultadoSimulacao {
  antes: ResultadoIrpf;
  depois: ResultadoIrpf;
  /** Imposto estimado a menos no ano (positivo = economia), considerando a melhor opção em cada cenário. */
  variacaoImposto: Centavos;
  cuidados: string[];
}

const melhorImposto = (r: ResultadoIrpf): Centavos =>
  r.presumido.cabivel ? Math.min(r.real.impostoEstimado, r.presumido.impostoEstimado) : r.real.impostoEstimado;

export function simular(base: EntradaIrpf, s: Simulacao): ResultadoSimulacao {
  const antecipar = Math.max(0, s.anteciparDespesas ?? 0);
  const postergar = Math.min(Math.max(0, s.postergarReceitas ?? 0), base.receitaBruta);
  const antes = calcularIrpf(base);
  const depois = calcularIrpf({
    ...base,
    receitaBruta: base.receitaBruta - postergar,
    despesas: base.despesas + antecipar,
  });
  const cuidados: string[] = [];
  if (antecipar > 0) {
    cuidados.push(
      'Antecipar despesa só reduz o imposto se o PAGAMENTO ocorrer até 31/12 e a despesa for necessária à atividade rural, com documento em nome do produtor (Lei nº 8.023/1990, art. 4º; investimento conta no mês do pagamento, § 2º).',
    );
  }
  if (postergar > 0) {
    cuidados.push(
      'Postergar receita desloca o imposto para o ano seguinte (regime de caixa: a receita conta quando é recebida). Não elimina o imposto e pode aumentar a base do próximo ano.',
    );
  }
  if (antecipar > 0 || postergar > 0) {
    cuidados.push('A operação precisa ter substância econômica e documentação real; mudanças feitas só para reduzir imposto podem ser questionadas pela Receita.');
  }
  return { antes, depois, variacaoImposto: melhorImposto(antes) - melhorImposto(depois), cuidados };
}

function fmt(c: Centavos): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
}

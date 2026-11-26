/**
 * CONSOLIDAÇÃO DE PRODUTORES ("Todos os Produtores")
 *
 * O PROBLEMA: imóveis em condomínio ou parceria (registro 0045) aparecem no
 * LCDPR de cada participante. A Receita orienta que cada um escriture só a SUA
 * PARCELA (Perguntas e Respostas LCDPR, perguntas 47 e 52; Lei nº 8.023/1990,
 * art. 13). Na prática, há sistemas e escritórios que lançam a operação inteira
 * em todos os arquivos. Somar esses arquivos duplicaria receitas e despesas.
 *
 * O QUE ESTE MÓDULO FAZ:
 * 1. Acha arquivos VINCULADOS (mesmo ano): um produtor aparece como terceiro
 *    (0045) no arquivo do outro, ou os dois cadastram o mesmo imóvel (mesmo NIRF).
 * 2. Acha lançamentos ESPELHADOS entre eles: mesma data, documento, participante
 *    e tipo de lançamento.
 * 3. Compara os valores espelhados com os percentuais de participação do 0040
 *    para diagnosticar se cada arquivo traz a parcela ou a operação inteira.
 * 4. Consolida pelo critério que a pessoa escolher, sempre com aviso.
 */
import { totalizar, type Totais } from './agregacoes';
import type { Centavos } from './dinheiro';
import type { ArquivoLcdpr, Lancamento } from '../parser/modelo';

export type CriterioConsolidacao = 'somar' | 'proporcional' | 'sem-duplicar';

export const DESCRICAO_CRITERIO: Readonly<Record<CriterioConsolidacao, string>> = {
  somar: 'Somar os arquivos como estão (cada arquivo traz só a parcela do produtor, como orienta a Receita)',
  proporcional: 'Aplicar o percentual de participação do 0040 (os arquivos trazem a operação inteira do imóvel)',
  'sem-duplicar': 'Contar uma vez os lançamentos idênticos entre condôminos (visão da operação total do grupo)',
};

export type Diagnostico = 'parcela' | 'operacao-inteira' | 'indeterminado';

export interface Vinculo {
  cpfA: string;
  cpfB: string;
  motivo: string;
  espelhados: number;
  diagnostico: Diagnostico;
  explicacao: string;
}

export interface LancamentoConsolidado extends Lancamento {
  cpf: string;
  produtor: string;
}

export interface ResultadoConsolidacao {
  ano: number;
  criterio: CriterioConsolidacao;
  produtores: { cpf: string; nome: string }[];
  lancamentos: LancamentoConsolidado[];
  totais: Totais;
  vinculos: Vinculo[];
  avisos: string[];
}

/** Chave que identifica a mesma operação em arquivos diferentes. */
const chaveOperacao = (l: Lancamento): string | null =>
  l.numDoc ? `${l.data.iso}|${l.numDoc.trim().toUpperCase()}|${l.idPartic}|${l.tipoLanc}` : null;

const valorDe = (l: Lancamento): Centavos => l.entrada + l.saida;

/** Percentual (centésimos) do produtor no imóvel do lançamento; 10000 se não houver dado. */
function participacaoNoImovel(a: ArquivoLcdpr, codImovel: string): number {
  return a.imoveis.find((i) => i.codigo === codImovel)?.participacao ?? 10000;
}

function motivoVinculo(a: ArquivoLcdpr, b: ArquivoLcdpr): string | null {
  const cpfA = a.abertura?.cpf;
  const cpfB = b.abertura?.cpf;
  if (cpfB && a.terceiros.some((t) => t.id === cpfB)) return 'o segundo produtor é terceiro (0045) no arquivo do primeiro';
  if (cpfA && b.terceiros.some((t) => t.id === cpfA)) return 'o primeiro produtor é terceiro (0045) no arquivo do segundo';
  const nirfA = new Set(a.imoveis.map((i) => i.cadItr).filter(Boolean));
  if (b.imoveis.some((i) => i.cadItr && nirfA.has(i.cadItr))) return 'os dois cadastram o mesmo imóvel (mesmo NIRF)';
  return null;
}

/** Compara dois arquivos vinculados e diagnostica parcela x operação inteira. */
export function diagnosticarVinculo(a: ArquivoLcdpr, b: ArquivoLcdpr): Vinculo | null {
  const motivo = motivoVinculo(a, b);
  if (!motivo) return null;
  const doB = new Map<string, Lancamento>();
  for (const l of b.lancamentos) {
    const k = chaveOperacao(l);
    if (k) doB.set(k, l);
  }
  let espelhados = 0;
  let iguais = 0; // valores idênticos com percentuais diferentes → operação inteira
  let proporcionais = 0; // valores na proporção dos percentuais → parcela
  let ambiguos = 0; // percentuais iguais (ex.: 50/50) e valores iguais → não dá para saber
  for (const la of a.lancamentos) {
    const k = chaveOperacao(la);
    const lb = k ? doB.get(k) : undefined;
    if (!lb) continue;
    espelhados++;
    const pa = participacaoNoImovel(a, la.codImovel);
    const pb = participacaoNoImovel(b, lb.codImovel);
    const va = valorDe(la);
    const vb = valorDe(lb);
    if (pa === pb) {
      if (va === vb) ambiguos++;
      continue;
    }
    // Tolerância de 1% para arredondamentos de rateio.
    if (Math.abs(va - vb) <= Math.max(1, vb * 0.01)) iguais++;
    else if (Math.abs(va * pb - vb * pa) <= Math.max(pa, pb) * Math.max(va, vb) * 0.01) proporcionais++;
  }
  let diagnostico: Diagnostico = 'indeterminado';
  let explicacao = 'Não há lançamentos espelhados suficientes para concluir.';
  if (espelhados > 0) {
    if (iguais > proporcionais && iguais >= ambiguos) {
      diagnostico = 'operacao-inteira';
      explicacao = `${iguais} de ${espelhados} lançamentos espelhados têm o MESMO valor nos dois arquivos, embora os percentuais de participação sejam diferentes: os arquivos parecem trazer a operação inteira. Somar duplicaria valores.`;
    } else if (proporcionais > iguais && proporcionais >= ambiguos) {
      diagnostico = 'parcela';
      explicacao = `${proporcionais} de ${espelhados} lançamentos espelhados estão na proporção dos percentuais de participação: cada arquivo traz só a sua parcela. Somar é o correto.`;
    } else {
      explicacao = `${espelhados} lançamentos espelhados com o mesmo valor e o mesmo percentual de participação (ex.: 50% / 50%). Pode ser parcela igual de cada um ou a operação inteira lançada duas vezes: confira um documento.`;
    }
  }
  return { cpfA: a.abertura?.cpf ?? '', cpfB: b.abertura?.cpf ?? '', motivo, espelhados, diagnostico, explicacao };
}

/** Aplica o percentual de participação aos lançamentos de imóveis com participação menor que 100%. */
function aplicarParticipacao(a: ArquivoLcdpr, l: Lancamento): Lancamento {
  const p = participacaoNoImovel(a, l.codImovel);
  if (p >= 10000) return l;
  const prop = (v: Centavos): Centavos => Math.round((v * p) / 10000);
  return { ...l, entrada: prop(l.entrada), saida: prop(l.saida) };
}

export function consolidar(
  arquivos: readonly ArquivoLcdpr[],
  ano: number,
  criterio: CriterioConsolidacao = 'somar',
): ResultadoConsolidacao {
  const doAno = arquivos.filter((a) => a.anoBase === ano);
  const avisos: string[] = [];

  // Mesmo CPF duas vezes no mesmo ano: provável retificadora + original.
  const vistos = new Set<string>();
  for (const a of doAno) {
    const cpf = a.abertura?.cpf ?? '';
    if (vistos.has(cpf)) avisos.push(`Há mais de um arquivo do mesmo produtor em ${ano}. Mantenha só a versão mais recente (retificadora).`);
    vistos.add(cpf);
  }

  const vinculos: Vinculo[] = [];
  for (let i = 0; i < doAno.length; i++) {
    for (let j = i + 1; j < doAno.length; j++) {
      const v = diagnosticarVinculo(doAno[i]!, doAno[j]!);
      if (v) vinculos.push(v);
    }
  }
  if (criterio === 'somar' && vinculos.some((v) => v.diagnostico === 'operacao-inteira')) {
    avisos.push('Risco de DUPLICIDADE: há condôminos cujos arquivos parecem trazer a operação inteira. Considere o critério "aplicar o percentual de participação".');
  }
  if (criterio !== 'somar' && vinculos.length > 0 && vinculos.every((v) => v.diagnostico === 'parcela')) {
    avisos.push('Os arquivos dos condôminos parecem trazer só a parcela de cada um. O critério escolhido pode SUBESTIMAR os valores; o recomendado é "somar".');
  }

  const lancamentos: LancamentoConsolidado[] = [];
  const operacoesJaContadas = new Map<string, string>(); // chave da operação → CPF que já contou
  for (const a of doAno) {
    const cpf = a.abertura?.cpf ?? '';
    const produtor = a.abertura?.nome ?? a.nomeArquivo;
    for (const original of a.lancamentos) {
      let l = original;
      if (criterio === 'proporcional') l = aplicarParticipacao(a, l);
      if (criterio === 'sem-duplicar') {
        const k = chaveOperacao(l);
        if (k) {
          const chaveValor = `${k}|${valorDe(l)}`;
          const dono = operacoesJaContadas.get(chaveValor);
          if (dono !== undefined && dono !== cpf) continue;
          operacoesJaContadas.set(chaveValor, cpf);
        }
      }
      lancamentos.push({ ...l, cpf, produtor });
    }
  }

  return {
    ano,
    criterio,
    produtores: doAno.map((a) => ({ cpf: a.abertura?.cpf ?? '', nome: a.abertura?.nome ?? a.nomeArquivo })),
    lancamentos,
    totais: totalizar(lancamentos),
    vinculos,
    avisos,
  };
}

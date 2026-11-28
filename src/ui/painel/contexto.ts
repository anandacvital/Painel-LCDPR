/**
 * "VISÃO": o recorte de dados que o Painel do Livro Caixa está mostrando,
 * conforme o cabeçalho (produtor, PERÍODO e critério de consolidação) e o
 * FILTRO CRUZADO (clique num mês, imóvel, participante ou natureza).
 *
 * Todas as abas recebem a mesma Visão, então os números sempre conferem entre si.
 *
 * Período: ano civil (o do LCDPR e do IRPF), safra (12 meses a partir do mês de
 * início escolhido, ex.: jul a jun) ou livre. Safra e período livre juntam os
 * arquivos dos anos que tocam; o IRPF continua só no ano civil (é anual).
 */
import { mensal, mensalPeriodo, totalizar, type TotalMensal, type Totais } from '../../domain/agregacoes';
import { consolidar, type CriterioConsolidacao, type ResultadoConsolidacao } from '../../domain/consolidacao';
import { nomeMes } from '../../domain/destaques';
import { formatarCpfCnpj } from '../../domain/documentos';
import { aplicarFiltro, filtroAnterior, type Dimensao, type FiltroCruzado, type LancamentoGestao } from '../../domain/gestao';
import { calcularIrpf } from '../../domain/irpf';
import { classificarDespesas, NOMES_CURTOS_NATUREZA, type AjustesNatureza, type Natureza } from '../../domain/naturezas';
import {
  anosDoPeriodo,
  mesesEntre,
  periodoAno,
  periodoAnterior,
  rotuloPeriodo,
  TERMOS_PERIODO,
  type Periodo,
  type TermosPeriodo,
} from '../../domain/periodo';
import { detectarPrevia, melhorImposto } from '../../domain/planejamento';
import type { ArquivoLcdpr, ResultadoAnalise, Semaforo } from '../../parser/modelo';

export { detectarPrevia };

export const TODOS = 'todos';

/** Como o imposto foi estimado, por opção mais vantajosa. */
export const TEXTO_OPCAO = {
  presumido: 'pela opção de 20% da receita bruta',
  real: 'pelo resultado real',
  misto: 'na melhor opção de cada produtor',
} as const;

export interface LancamentoVisao extends LancamentoGestao {
  produtor: string;
}

export interface Visao {
  rotulo: string;
  /** Ano civil (no ano civil) ou o ano do último mês (safra e período livre). */
  ano: number;
  periodo: Periodo;
  rotuloPeriodo: string;
  termos: TermosPeriodo;
  individual: boolean;
  /** Um arquivo por produtor (o do ano mais recente do período): cadastro de imóveis e contas. */
  arquivos: ArquivoLcdpr[];
  /** Todos os arquivos do período (todos os anos e produtores): saldo do arquivo, saldo inicial do mês. */
  arquivosPeriodo: ArquivoLcdpr[];
  /** Filtro cruzado aplicado. */
  filtro: FiltroCruzado;
  /** Todos os lançamentos do período, SEM o filtro cruzado (alertas usam este). */
  base: LancamentoVisao[];
  /** Lançamentos do período COM o filtro cruzado. */
  lancamentos: LancamentoVisao[];
  /** Lançamentos com o filtro, ignorando uma dimensão (o gráfico daquela dimensão destaca a escolha). */
  recorte: (exceto?: Dimensao) => LancamentoVisao[];
  /** Meses do período (filtrados, menos o filtro de mês, que só destaca o mês). */
  meses: TotalMensal[];
  totais: Totais;
  /**
   * Mesmo recorte 12 meses antes, quando há arquivo. Se o período atual está
   * incompleto (prévia), o anterior é cortado no MESMO PONTO, para a comparação ser justa.
   */
  anterior: { totais: Totais; meses: TotalMensal[]; base: LancamentoVisao[]; lancamentos: LancamentoVisao[] } | null;
  /**
   * Prévia do ano em andamento (só no ano civil): algum arquivo termina antes de
   * 31/12 sem situação especial. `fim` é a maior data final (AAAA-MM-DD) e `ateMes` o mês dela.
   */
  previa: { fim: string; ateMes: number } | null;
  /** Avisos do período (arquivo faltando, período cortado no último mês carregado). */
  avisosPeriodo: string[];
  consolidacao: ResultadoConsolidacao | null;
  /** Avisos da consolidação de todos os anos do período, sem repetição. */
  avisosConsolidacao: string[];
  semaforo: Semaforo;
  /**
   * IRPF estimado (só no ano civil, sem o filtro cruzado): soma do imposto de CADA
   * produtor (cada CPF tributa a sua parte, Lei nº 8.023/1990, art. 13) na opção
   * mais vantajosa para cada um, sobre o realizado e sem prejuízo anterior.
   */
  irpf: { atual: IrpfVisao; anterior: IrpfVisao | null } | null;
}

export interface IrpfVisao {
  imposto: number;
  /** Opção mais vantajosa: igual para todos os produtores, ou "misto". */
  opcao: 'presumido' | 'real' | 'misto';
}

function irpfDosArquivos(arquivos: readonly ArquivoLcdpr[], ano: number, ateDiaMes?: string): IrpfVisao {
  let imposto = 0;
  const opcoes = new Set<'presumido' | 'real'>();
  for (const a of arquivos) {
    const lanc = ateDiaMes ? a.lancamentos.filter((l) => l.data.iso.slice(5) <= ateDiaMes) : a.lancamentos;
    const t = totalizar(lanc);
    const r = calcularIrpf({ receitaBruta: t.receitas, despesas: t.despesas, ano });
    imposto += melhorImposto(r);
    opcoes.add(r.maisVantajosa === 'presumido' ? 'presumido' : 'real');
  }
  return { imposto, opcao: opcoes.size > 1 ? 'misto' : opcoes.has('presumido') ? 'presumido' : 'real' };
}

const PIOR: Record<Semaforo, number> = { verde: 0, amarelo: 1, vermelho: 2 };

/** Lançamentos de um ano civil (um produtor, ou todos consolidados). */
function recortarAno(analises: readonly ResultadoAnalise[], produtor: string, ano: number, criterio: CriterioConsolidacao) {
  const doAno = analises.filter((r) => r.arquivo.anoBase === ano && (produtor === TODOS || r.arquivo.abertura?.cpf === produtor));
  if (doAno.length === 0) return null;
  const arquivos = doAno.map((r) => r.arquivo);
  if (produtor !== TODOS) {
    const a = arquivos[0]!;
    const cpf = a.abertura?.cpf ?? '';
    const nome = a.abertura?.nome ?? a.nomeArquivo;
    return { doAno, arquivos, consolidacao: null, lancamentos: a.lancamentos.map((l) => ({ ...l, cpf, produtor: nome })) };
  }
  const c = consolidar(arquivos, ano, criterio);
  return { doAno, arquivos, consolidacao: c, lancamentos: c.lancamentos };
}

/** Primeiro e último mês que cada arquivo cobre (do 0000; sem datas, o ano inteiro). */
function mesesCobertos(a: ArquivoLcdpr): [string, string] | null {
  const ano = a.anoBase;
  const ini = a.abertura?.dtIni?.iso.slice(0, 7) ?? (ano ? `${ano}-01` : null);
  const fim = a.abertura?.dtFin?.iso.slice(0, 7) ?? (ano ? `${ano}-12` : null);
  return ini && fim ? [ini, fim] : null;
}

/**
 * Junta os anos do período: lançamentos, arquivos e avisos. `cpfs` restringe
 * aos produtores informados (o período anterior só usa quem está no atual).
 */
function recortarPeriodo(
  analises: readonly ResultadoAnalise[],
  produtor: string,
  periodo: Periodo,
  criterio: CriterioConsolidacao,
  ajustes: AjustesNatureza,
  cpfs?: ReadonlySet<string>,
) {
  const lista = cpfs ? analises.filter((r) => cpfs.has(r.arquivo.abertura?.cpf ?? '')) : analises;
  const anos = anosDoPeriodo(periodo).map((ano) => ({ ano, r: recortarAno(lista, produtor, ano, criterio) }));
  const presentes = anos.filter((x) => x.r !== null);
  if (presentes.length === 0) return null;
  const lancamentos = presentes
    .flatMap((x) => x.r!.lancamentos)
    .filter((l) => l.data.iso.slice(0, 7) >= periodo.inicio && l.data.iso.slice(0, 7) <= periodo.fim)
    .sort((a, b) => a.data.iso.localeCompare(b.data.iso) || a.cpf.localeCompare(b.cpf) || a.linha - b.linha);
  const classes = classificarDespesas(lancamentos, ajustes);
  const comNatureza: LancamentoVisao[] = lancamentos.map((l, i) => ({
    ...l,
    natureza: classes[i]?.natureza ?? null,
    origemNatureza: classes[i]?.origem ?? null,
  }));
  const doPeriodo = presentes.flatMap((x) => x.r!.doAno);
  // Um arquivo por produtor: o do ano mais recente (cadastro de imóveis e contas).
  const arquivos = new Map<string, ArquivoLcdpr>();
  for (const x of presentes) for (const a of x.r!.arquivos) arquivos.set(a.abertura?.cpf ?? a.nomeArquivo, a);
  // Cobertura: último mês que algum arquivo alcança, e produtores sem arquivo em algum ano.
  const cobertos = doPeriodo.map((r) => mesesCobertos(r.arquivo)).filter((c): c is [string, string] => c !== null);
  const ultimoCoberto = cobertos.map((c) => c[1]).sort().at(-1) ?? periodo.fim;
  const faltando: string[] = [];
  for (const a of arquivos.values()) {
    const cpf = a.abertura?.cpf;
    const semAno = anos.filter((x) => !lista.some((r) => r.arquivo.anoBase === x.ano && r.arquivo.abertura?.cpf === cpf)).map((x) => x.ano);
    if (semAno.length) faltando.push(`${a.abertura?.nome ?? a.nomeArquivo} não tem arquivo de ${semAno.join(' e ')}: os meses desse ano aparecem sem os lançamentos dele.`);
  }
  return {
    anos,
    presentes,
    doPeriodo,
    arquivos: [...arquivos.values()],
    lancamentos: comNatureza,
    consolidacao: presentes.at(-1)!.r!.consolidacao,
    avisosConsolidacao: [...new Set(presentes.flatMap((x) => x.r!.consolidacao?.avisos ?? []))],
    ultimoCoberto,
    faltando,
  };
}

export interface OpcoesVisao {
  criterio: CriterioConsolidacao;
  /** Padrão: o ano civil `ano`. */
  periodo?: Periodo;
  filtro?: FiltroCruzado;
  ajustes?: AjustesNatureza;
}

export function montarVisao(
  analises: readonly ResultadoAnalise[],
  produtor: string,
  ano: number,
  criterioOuOpcoes: CriterioConsolidacao | OpcoesVisao,
): Visao | null {
  const o: OpcoesVisao = typeof criterioOuOpcoes === 'string' ? { criterio: criterioOuOpcoes } : criterioOuOpcoes;
  const periodo = o.periodo ?? periodoAno(ano);
  const filtro = o.filtro ?? {};
  const ajustes = o.ajustes ?? {};
  const civil = periodo.tipo === 'ano';
  const anoVisao = Number(periodo.fim.slice(0, 4));

  const atual = recortarPeriodo(analises, produtor, periodo, o.criterio, ajustes);
  if (!atual) return null;
  const cpfsAtuais = new Set(atual.arquivos.map((a) => a.abertura?.cpf ?? ''));

  // Ponto de corte: prévia (ano civil, por dia) ou último mês carregado (safra/livre).
  // Com vários produtores, se ALGUM arquivo do ano vai até dezembro, a visão não é
  // prévia (senão os meses seriam cortados e não bateriam com os totais); os
  // produtores com arquivo parcial ganham um aviso.
  const arquivosAno = atual.presentes.flatMap((x) => x.r!.arquivos);
  const previasAno = arquivosAno.filter((a) => detectarPrevia([a]) !== null);
  const algumCompleto = previasAno.length < arquivosAno.length;
  const previa = civil && !algumCompleto ? detectarPrevia(arquivosAno) : null;
  const diaMes = previa?.fim.slice(5);
  const ultimoMes = civil ? (previa ? previa.fim.slice(0, 7) : periodo.fim) : (atual.ultimoCoberto < periodo.fim ? atual.ultimoCoberto : periodo.fim);
  const mesesPeriodo = mesesEntre(periodo.inicio, ultimoMes);

  // Período anterior: só os produtores do atual, e só se houver arquivo em TODOS os anos dele.
  const pAnt = periodoAnterior(periodo);
  let ant = recortarPeriodo(analises, produtor, pAnt, o.criterio, ajustes, cpfsAtuais);
  if (ant && ant.anos.some((x) => x.r === null)) ant = null;
  let antBase: LancamentoVisao[] | null = null;
  if (ant) {
    const limiteMes = mesesPeriodo.length ? mesesEntre(pAnt.inicio, pAnt.fim)[mesesPeriodo.length - 1]! : pAnt.inicio;
    antBase = ant.lancamentos.filter((l) => (diaMes ? l.data.iso.slice(5) <= diaMes : l.data.iso.slice(0, 7) <= limiteMes));
  }

  const recorte = (exceto?: Dimensao): LancamentoVisao[] => aplicarFiltro(atual.lancamentos, filtro, exceto);
  const lancamentos = recorte();
  const filtroAnt = filtroAnterior(filtro);
  const nomes = atual.arquivos.map((a) => a.abertura?.nome ?? a.nomeArquivo);

  const avisosPeriodo = [...atual.faltando];
  if (civil && algumCompleto) {
    for (const a of previasAno) {
      const fim = a.abertura?.dtFin?.iso.split('-').reverse().join('/') ?? '?';
      avisosPeriodo.push(`${a.abertura?.nome ?? a.nomeArquivo} tem só a prévia de ${ano} (lançamentos até ${fim}), enquanto os demais produtores vão até dezembro: a comparação com o ano anterior considera o ano inteiro.`);
    }
  }
  if (!civil && ultimoMes < periodo.fim) {
    avisosPeriodo.unshift(`Os arquivos carregados vão só até ${nomeMes(ultimoMes)} de ${ultimoMes.slice(0, 4)}: o período foi cortado nesse mês${ant ? ', e a comparação usa o mesmo corte' : ''}.`);
  }

  return {
    rotulo: produtor === TODOS ? (nomes.length === 1 ? nomes[0]! : `Todos os produtores (${nomes.length})`) : nomes[0]!,
    ano: civil ? ano : anoVisao,
    periodo,
    rotuloPeriodo: rotuloPeriodo(periodo),
    termos: TERMOS_PERIODO[periodo.tipo],
    individual: produtor !== TODOS || nomes.length === 1,
    arquivos: atual.arquivos,
    arquivosPeriodo: atual.doPeriodo.map((r) => r.arquivo),
    filtro,
    base: atual.lancamentos,
    lancamentos,
    recorte,
    meses: mensalPeriodo(recorte('mes'), mesesPeriodo),
    totais: totalizar(lancamentos),
    anterior: antBase
      ? {
          totais: totalizar(aplicarFiltro(antBase, filtroAnt)),
          // No ano civil o anterior mantém os 12 meses (gráficos de comparação); fora dele, o mesmo corte.
          meses: civil ? mensal(aplicarFiltro(antBase, filtroAnt, 'mes'), ano - 1) : mensalPeriodo(aplicarFiltro(antBase, filtroAnt, 'mes'), mesesEntre(pAnt.inicio, pAnt.fim).slice(0, mesesPeriodo.length)),
          base: antBase,
          lancamentos: aplicarFiltro(antBase, filtroAnt),
        }
      : null,
    previa,
    avisosPeriodo,
    consolidacao: atual.consolidacao,
    avisosConsolidacao: atual.avisosConsolidacao,
    irpf: civil
      ? {
          atual: irpfDosArquivos(atual.presentes[0]!.r!.arquivos, ano),
          anterior: ant ? irpfDosArquivos(ant.presentes[0]!.r!.arquivos, ano - 1, diaMes) : null,
        }
      : null,
    semaforo: atual.doPeriodo.reduce<Semaforo>((pior, r) => (PIOR[r.saude.semaforo] > PIOR[pior] ? r.saude.semaforo : pior), 'verde'),
  };
}

/** Nome do imóvel a partir do código e do produtor (o código é só único dentro de cada arquivo). */
export function nomeImovel(v: Visao, cpf: string, codigo: string): string {
  if (codigo === '000') return 'Despesas comuns (rateio)';
  const a = v.arquivos.find((x) => x.abertura?.cpf === cpf);
  return a?.imoveis.find((i) => i.codigo === codigo)?.nome || `Imóvel ${codigo}`;
}

/** Nome da conta bancária a partir do código. */
export function nomeConta(v: Visao, cpf: string, codigo: string): string {
  if (codigo === '000') return 'Espécie';
  if (codigo === '999') return 'Sem trânsito por conta';
  const a = v.arquivos.find((x) => x.abertura?.cpf === cpf);
  const c = a?.contas.find((x) => x.codigo === codigo);
  return c ? `${c.nomeBanco} · ag. ${c.agencia}` : `Conta ${codigo}`;
}

/** Explica a prévia em uma frase (tela e relatório impresso). */
export function avisoPrevia(v: Visao): string {
  if (!v.previa) return '';
  const [a, m, d] = v.previa.fim.split('-');
  return `Lançamentos até ${d}/${m}/${a}. As variações comparam com o mesmo período de ${v.ano - 1} (01/01 a ${d}/${m}), e o IRPF estimado considera só esse período. Este arquivo não deve ser transmitido: o LCDPR final precisa ir até 31/12.`;
}

/** Texto da comparação: "ano anterior", "safra anterior" ou, na prévia, "mesmo período de AAAA". */
export function textoComparacao(v: Visao): string {
  if (v.periodo.tipo === 'safra') return 'safra anterior';
  if (v.periodo.tipo === 'livre') return 'mesmo período um ano antes';
  return v.previa ? `mesmo período de ${v.ano - 1}` : 'ano anterior';
}

/**
 * Saldo do Livro Caixa do produtor no INÍCIO do mês ("AAAA-MM"): o saldo
 * informado no arquivo após o último lançamento anterior ao mês, no mesmo ano.
 * Sem lançamento anterior no ano, é zero (o saldo do LCDPR começa em zero em
 * 1º de janeiro). Null se não houver arquivo daquele ano para o produtor.
 */
export function saldoInicialMes(v: Visao, cpf: string, mes: string): number | null {
  const a = v.arquivosPeriodo.find((x) => x.abertura?.cpf === cpf && x.anoBase === Number(mes.slice(0, 4)));
  if (!a) return null;
  let saldo = 0;
  for (const l of a.lancamentos) if (l.data.iso.slice(0, 7) < mes) saldo = l.saldo;
  return saldo;
}

/** Texto de um filtro para o "chip" do cabeçalho e para os relatórios. */
export function rotuloFiltro(v: Visao, d: Dimensao, valor: string): string {
  if (d === 'mes') return `Mês: ${nomeMes(valor)}/${valor.slice(0, 4)}`;
  if (d === 'imovel') {
    const [cpf, cod] = valor.split('|') as [string, string];
    return `Imóvel: ${v.individual ? '' : `${nomeProdutor(v, cpf)} · `}${nomeImovel(v, cpf, cod)}`;
  }
  if (d === 'participante') return `Participante: ${formatarCpfCnpj(valor)}`;
  return `Natureza: ${NOMES_CURTOS_NATUREZA[valor as Natureza] ?? valor}`;
}

/** Todos os filtros ativos, em texto (ex.: para o cabeçalho do relatório). */
export function filtrosDescritos(v: Visao): string[] {
  return (['mes', 'imovel', 'participante', 'natureza'] as const)
    .filter((d) => v.filtro[d])
    .map((d) => rotuloFiltro(v, d, v.filtro[d]!));
}

function nomeProdutor(v: Visao, cpf: string): string {
  return v.arquivos.find((a) => a.abertura?.cpf === cpf)?.abertura?.nome ?? cpf;
}

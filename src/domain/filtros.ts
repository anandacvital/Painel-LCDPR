/**
 * FILTROS E ORDENAÇÃO DO DETALHAMENTO (lista completa de lançamentos Q100).
 *
 * Fica fora da tela para ser testado. A tela só monta os controles e chama
 * `filtrarLancamentos` e `ordenarLancamentos`.
 */
import type { Lancamento } from '../parser/modelo';

export interface FiltroLancamentos {
  /** "AAAA-MM" ou vazio (todos). */
  mes?: string;
  /** "cpf|codigo" do imóvel ou vazio. */
  imovel?: string;
  /** "cpf|codigo" da conta ou vazio. */
  conta?: string;
  tipoDoc?: string;
  tipoLanc?: string;
  participante?: string;
  /** Texto livre: procura no histórico, no documento e no CPF/CNPJ do participante. */
  busca?: string;
}

export type CampoOrdem = 'data' | 'valor' | 'historico' | 'participante';

/** Lançamento com o produtor (no consolidado, cada linha diz de quem é). */
type ComProdutor = Lancamento & { cpf: string };

/** Tira acentos e caixa para a busca achar "Oleo" em "Óleo". */
export const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarLancamentos<L extends ComProdutor>(lista: readonly L[], f: FiltroLancamentos): L[] {
  const busca = f.busca ? normalizar(f.busca.trim()) : '';
  const buscaNum = busca.replace(/\D/g, '');
  return lista.filter((l) => {
    if (f.mes && !l.data.iso.startsWith(f.mes)) return false;
    if (f.imovel && `${l.cpf}|${l.codImovel}` !== f.imovel) return false;
    if (f.conta && `${l.cpf}|${l.codConta}` !== f.conta) return false;
    if (f.tipoDoc && l.tipoDoc !== f.tipoDoc) return false;
    if (f.tipoLanc && l.tipoLanc !== f.tipoLanc) return false;
    if (f.participante && l.idPartic !== f.participante) return false;
    if (busca) {
      const noTexto = normalizar(`${l.historico} ${l.numDoc}`).includes(busca);
      const noDocumento = buscaNum.length >= 3 && l.idPartic.includes(buscaNum);
      if (!noTexto && !noDocumento) return false;
    }
    return true;
  });
}

/** Valor do lançamento com sinal: entrada positiva, saída negativa. */
export const valorComSinal = (l: Lancamento): number => l.entrada - l.saida;

export function ordenarLancamentos<L extends Lancamento>(lista: readonly L[], campo: CampoOrdem, crescente: boolean): L[] {
  const fator = crescente ? 1 : -1;
  const comparar: Record<CampoOrdem, (a: L, b: L) => number> = {
    data: (a, b) => a.data.iso.localeCompare(b.data.iso) || a.linha - b.linha,
    valor: (a, b) => valorComSinal(a) - valorComSinal(b),
    historico: (a, b) => a.historico.localeCompare(b.historico, 'pt-BR'),
    participante: (a, b) => a.idPartic.localeCompare(b.idPartic),
  };
  return [...lista].sort((a, b) => comparar[campo](a, b) * fator || a.linha - b.linha);
}

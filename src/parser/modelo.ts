/**
 * MODELO DE DADOS: o "formato interno" do arquivo depois de lido.
 *
 * O TXT vira estes objetos; as validações e, nas próximas fases, os cálculos
 * e gráficos trabalham só com eles. Valores monetários em CENTAVOS inteiros.
 * Saldos já vêm com sinal: natureza "N" vira número negativo.
 */
import type { Centavos } from '../domain/dinheiro';
import type { DataLcdpr } from '../domain/datas';
import type { Codificacao } from './encoding';

export type Severidade = 'erro' | 'alerta' | 'info';
export type Categoria = 'Estrutura' | 'Campo' | 'Integridade' | 'Conciliação' | 'Risco';
export type Semaforo = 'verde' | 'amarelo' | 'vermelho';

/** Um item do relatório de conformidade (aba "Saúde do Arquivo"). */
export interface Ocorrencia {
  severidade: Severidade;
  categoria: Categoria;
  /** Código estável da regra (ex.: "CAMPO-OBRIG"), útil para filtrar e agrupar. */
  regra: string;
  /** Linha do arquivo (1 = primeira linha) ou null quando o problema é do arquivo inteiro. */
  linha: number | null;
  registro: string | null;
  campo: string | null;
  problema: string;
  comoCorrigir: string;
}

export interface Abertura {
  linha: number;
  codVersao: string;
  cpf: string;
  nome: string;
  indSitIniPer: string;
  sitEspecial: string;
  dtSitEsp: DataLcdpr | null;
  dtIni: DataLcdpr | null;
  dtFin: DataLcdpr | null;
}

export interface Cadastro {
  linha: number;
  uf: string;
  codMun: string;
}

export interface Imovel {
  linha: number;
  codigo: string;
  pais: string;
  moeda: string;
  cadItr: string;
  caepf: string;
  inscricaoEstadual: string;
  nome: string;
  uf: string;
  codMun: string;
  cep: string;
  tipoExploracao: string;
  /** Percentual em centésimos (10000 = 100,00%). */
  participacao: number | null;
}

export interface Terceiro {
  linha: number;
  codImovel: string;
  tipoContraparte: string;
  id: string;
  nome: string;
  /** Percentual em centésimos (10000 = 100,00%). */
  percentual: number | null;
}

export interface Conta {
  linha: number;
  codigo: string;
  pais: string;
  banco: string;
  nomeBanco: string;
  agencia: string;
  numConta: string;
}

export interface Lancamento {
  linha: number;
  data: DataLcdpr;
  codImovel: string;
  codConta: string;
  numDoc: string;
  tipoDoc: string;
  historico: string;
  idPartic: string;
  tipoLanc: string;
  entrada: Centavos;
  saida: Centavos;
  /** Saldo após o lançamento, com sinal (negativo quando natureza = N). */
  saldo: Centavos;
}

export interface ResumoMensal {
  linha: number;
  /** "AAAA-MM" */
  mes: string;
  entrada: Centavos;
  saida: Centavos;
  /** Saldo acumulado com sinal. */
  saldo: Centavos;
}

export interface Encerramento {
  linha: number;
  nomeContador: string;
  idContador: string;
  crc: string;
  qtdLinhas: number | null;
}

export interface ArquivoLcdpr {
  nomeArquivo: string;
  codificacao: Codificacao;
  totalLinhas: number;
  abertura: Abertura | null;
  /** Ano-base: SEMPRE do 0000 (DT_INI), nunca do nome do arquivo. */
  anoBase: number | null;
  formaApuracao: string | null;
  cadastro: Cadastro | null;
  imoveis: Imovel[];
  terceiros: Terceiro[];
  contas: Conta[];
  lancamentos: Lancamento[];
  resumos: ResumoMensal[];
  encerramento: Encerramento | null;
}

export interface ResumoSaude {
  erros: number;
  alertas: number;
  infos: number;
  semaforo: Semaforo;
}

export interface ResultadoAnalise {
  arquivo: ArquivoLcdpr;
  ocorrencias: Ocorrencia[];
  saude: ResumoSaude;
}

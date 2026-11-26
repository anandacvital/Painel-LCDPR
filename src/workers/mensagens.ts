/** Formato das mensagens trocadas entre a tela e o Worker. */
import type { ResultadoAnalise } from '../parser/modelo';

export interface PedidoAnalise {
  id: number;
  nome: string;
  bytes: ArrayBuffer;
}

export type RespostaAnalise =
  | { id: number; ok: true; resultado: ResultadoAnalise }
  | { id: number; ok: false; erro: string };

/**
 * WEB WORKER: roda a leitura e a validação do TXT em segundo plano.
 *
 * Sem isso, um arquivo com dezenas de milhares de linhas congelaria a tela
 * durante a análise. O Worker roda no próprio navegador (não é um servidor):
 * o arquivo continua sem sair do computador.
 */
import { analisarBytes } from '../parser/analisar';
import type { PedidoAnalise, RespostaAnalise } from './mensagens';

self.onmessage = (evento: MessageEvent<PedidoAnalise>) => {
  const { id, nome, bytes } = evento.data;
  let resposta: RespostaAnalise;
  try {
    resposta = { id, ok: true, resultado: analisarBytes(bytes, nome) };
  } catch (e) {
    resposta = { id, ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
  self.postMessage(resposta);
};

/**
 * Lado da TELA da conversa com o Worker: entrega o arquivo e recebe o resultado.
 * Um único Worker atende todos os arquivos, um de cada vez, em fila.
 */
import type { ResultadoAnalise } from '../parser/modelo';
import type { PedidoAnalise, RespostaAnalise } from './mensagens';

let worker: Worker | null = null;
let proximoId = 1;
const pendentes = new Map<number, { resolver: (r: ResultadoAnalise) => void; rejeitar: (e: Error) => void }>();

function obterWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<RespostaAnalise>) => {
    const r = ev.data;
    const p = pendentes.get(r.id);
    if (!p) return;
    pendentes.delete(r.id);
    if (r.ok) p.resolver(r.resultado);
    else p.rejeitar(new Error(r.erro));
  };
  worker.onerror = (ev) => {
    for (const p of pendentes.values()) p.rejeitar(new Error(ev.message || 'Falha no processamento do arquivo.'));
    pendentes.clear();
  };
  return worker;
}

export async function analisarArquivo(arquivo: File): Promise<ResultadoAnalise> {
  const bytes = await arquivo.arrayBuffer();
  const id = proximoId++;
  return new Promise((resolver, rejeitar) => {
    pendentes.set(id, { resolver, rejeitar });
    const pedido: PedidoAnalise = { id, nome: arquivo.name, bytes };
    // "transfer": entrega a memória ao Worker sem copiar (mais rápido com arquivos grandes).
    obterWorker().postMessage(pedido, [bytes]);
  });
}

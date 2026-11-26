/**
 * PONTO DE ENTRADA DA ANÁLISE: bytes do TXT → arquivo lido + relatório de saúde.
 * É esta função que o Web Worker chama. Também é usada direto nos testes.
 */
import { decodificarLcdpr } from './encoding';
import type { Ocorrencia, ResultadoAnalise, ResumoSaude, Severidade } from './modelo';
import { lerLcdpr } from './parser';
import { validarArquivo } from './validacoes';

const PESO: Record<Severidade, number> = { erro: 0, alerta: 1, info: 2 };

/** Ordena: erros primeiro, depois alertas e informações; dentro de cada um, pela linha. */
export function ordenarOcorrencias(lista: Ocorrencia[]): Ocorrencia[] {
  return [...lista].sort(
    (a, b) => PESO[a.severidade] - PESO[b.severidade] || (a.linha ?? 0) - (b.linha ?? 0),
  );
}

export function resumirSaude(ocorrencias: readonly Ocorrencia[]): ResumoSaude {
  let erros = 0;
  let alertas = 0;
  let infos = 0;
  for (const o of ocorrencias) {
    if (o.severidade === 'erro') erros++;
    else if (o.severidade === 'alerta') alertas++;
    else infos++;
  }
  return { erros, alertas, infos, semaforo: erros > 0 ? 'vermelho' : alertas > 0 ? 'amarelo' : 'verde' };
}

export function analisarTexto(texto: string, nomeArquivo: string, codificacao: 'utf-8' | 'iso-8859-1' = 'utf-8'): ResultadoAnalise {
  const { arquivo, ocorrencias } = lerLcdpr(texto, nomeArquivo, codificacao);
  const todas = ordenarOcorrencias([...ocorrencias, ...validarArquivo(arquivo)]);
  return { arquivo, ocorrencias: todas, saude: resumirSaude(todas) };
}

export function analisarBytes(bytes: ArrayBuffer | Uint8Array, nomeArquivo: string): ResultadoAnalise {
  const { texto, codificacao } = decodificarLcdpr(bytes);
  return analisarTexto(texto, nomeArquivo, codificacao);
}

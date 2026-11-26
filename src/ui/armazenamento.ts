/**
 * ARMAZENAMENTO LOCAL OPCIONAL (IndexedDB) — DESLIGADO POR PADRÃO.
 *
 * O que é: um banco de dados que o navegador mantém dentro do próprio
 * computador. Nada vai para a internet. Serve só para o painel lembrar os
 * arquivos já analisados quando a pessoa reabrir a página.
 *
 * Regras de sigilo:
 * - Só salva se a pessoa ligar a opção "Manter neste computador".
 * - O TXT original nunca é salvo; só o resultado da análise.
 * - "Apagar dados deste computador" apaga o banco inteiro e a preferência.
 *
 * Todas as funções toleram navegador sem IndexedDB (modo anônimo, bloqueio
 * corporativo): nesse caso o painel funciona só em memória.
 */
import type { Cenario } from '../domain/cenarios';
import type { ResultadoAnalise } from '../parser/modelo';

const BANCO = 'painel-lcdpr';
const LOJA = 'analises';
/** Cenários do simulador de IRPF (versão 2 do banco). Só valores digitados, nada do TXT. */
const LOJA_CENARIOS = 'cenarios';
const VERSAO = 2;
const CHAVE_PREFERENCIA = 'painel-lcdpr:manter-dados';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = () => {
      // Cria só o que falta: quem já tinha a versão 1 mantém as análises salvas.
      const nomes = req.result.objectStoreNames;
      if (!nomes.contains(LOJA)) req.result.createObjectStore(LOJA);
      if (!nomes.contains(LOJA_CENARIOS)) req.result.createObjectStore(LOJA_CENARIOS);
    };
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rejeitar(req.error ?? new Error('IndexedDB indisponível'));
  });
}

async function transacao<T>(modo: IDBTransactionMode, operacao: (loja: IDBObjectStore) => IDBRequest<T>, loja = LOJA): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolver, rejeitar) => {
      const req = operacao(db.transaction(loja, modo).objectStore(loja));
      req.onsuccess = () => resolver(req.result);
      req.onerror = () => rejeitar(req.error ?? new Error('Falha no IndexedDB'));
    });
  } finally {
    db.close();
  }
}

export function preferenciaManterDados(): boolean {
  try {
    return localStorage.getItem(CHAVE_PREFERENCIA) === 'sim';
  } catch {
    return false;
  }
}

export function definirPreferenciaManterDados(manter: boolean): void {
  try {
    if (manter) localStorage.setItem(CHAVE_PREFERENCIA, 'sim');
    else localStorage.removeItem(CHAVE_PREFERENCIA);
  } catch {
    /* navegador sem localStorage: segue só em memória */
  }
}

export async function salvarAnalise(chave: string, resultado: ResultadoAnalise): Promise<void> {
  try {
    await transacao('readwrite', (l) => l.put(resultado, chave));
  } catch {
    /* sem IndexedDB: segue só em memória */
  }
}

export async function removerAnalise(chave: string): Promise<void> {
  try {
    await transacao('readwrite', (l) => l.delete(chave));
  } catch {
    /* ignore */
  }
}

export async function carregarAnalises(): Promise<ResultadoAnalise[]> {
  try {
    return await transacao('readonly', (l) => l.getAll() as IDBRequest<ResultadoAnalise[]>);
  } catch {
    return [];
  }
}

/** Grava a lista inteira de cenários (é pequena: substituir tudo é mais simples e seguro). */
export async function salvarCenarios(cenarios: readonly Cenario[]): Promise<void> {
  try {
    await transacao('readwrite', (l) => l.put([...cenarios], 'todos'), LOJA_CENARIOS);
  } catch {
    /* sem IndexedDB: segue só em memória */
  }
}

export async function carregarCenarios(): Promise<Cenario[]> {
  try {
    return ((await transacao('readonly', (l) => l.get('todos') as IDBRequest<Cenario[] | undefined>, LOJA_CENARIOS)) ?? []);
  } catch {
    return [];
  }
}

/** Apaga TUDO que o painel guardou neste navegador: banco e preferência. */
export async function apagarTudo(): Promise<void> {
  definirPreferenciaManterDados(false);
  try {
    await new Promise<void>((resolver) => {
      const req = indexedDB.deleteDatabase(BANCO);
      req.onsuccess = () => resolver();
      req.onerror = () => resolver();
      req.onblocked = () => resolver();
    });
  } catch {
    /* ignore */
  }
}

/**
 * Exportação do relatório de inconsistências para CSV (abre direto no Excel).
 *
 * Padrão brasileiro do Excel: separador ";" e BOM UTF-8 no início (sem o BOM,
 * o Excel mostra acentos quebrados).
 *
 * Segurança: um texto do TXT que comece com "=", "+", "-" ou "@" seria
 * interpretado pelo Excel como FÓRMULA (ataque conhecido como "CSV injection").
 * Por isso esses textos recebem um apóstrofo na frente.
 */
import type { Ocorrencia } from '../parser/modelo';

const SEVERIDADE: Record<Ocorrencia['severidade'], string> = {
  erro: 'Erro',
  alerta: 'Alerta',
  info: 'Informação',
};

/** Prepara um valor para uma célula CSV. */
export function celulaCsv(valor: string | number | null): string {
  if (valor === null) return '';
  let s = String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function gerarCsv(cabecalho: readonly string[], linhas: readonly (readonly (string | number | null)[])[]): string {
  const corpo = [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}

export function csvOcorrencias(nomeArquivo: string, ocorrencias: readonly Ocorrencia[]): string {
  return gerarCsv(
    ['Arquivo', 'Severidade', 'Categoria', 'Regra', 'Linha', 'Registro', 'Campo', 'Problema', 'Como corrigir'],
    ocorrencias.map((o) => [
      nomeArquivo,
      SEVERIDADE[o.severidade],
      o.categoria,
      o.regra,
      o.linha,
      o.registro,
      o.campo,
      o.problema,
      o.comoCorrigir,
    ]),
  );
}

/**
 * Testes do leitor e das validações usando SOMENTE arquivos sintéticos.
 * Cada teste parte de um arquivo limpo e injeta um problema específico,
 * conferindo que o painel aponta a regra, a linha e o registro certos.
 */
import { describe, expect, it } from 'vitest';
import { analisarBytes, analisarTexto } from '../src/parser/analisar';
import type { Ocorrencia } from '../src/parser/modelo';
import { gerarLcdpr, montarTexto } from './fixtures/gerador';

const base = () => gerarLcdpr({ semente: 7, lancamentosPorMes: 10 });

/** Analisa linhas modificadas e devolve as ocorrências de uma regra. */
function analisar(linhas: string[]) {
  return analisarTexto(montarTexto(linhas), 'teste.txt');
}
const daRegra = (lista: Ocorrencia[], regra: string) => lista.filter((o) => o.regra === regra);

/** Índice (base 0) da primeira linha de um registro. */
const idx = (linhas: string[], reg: string, n = 0) =>
  linhas.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith(`${reg}|`))[n]![1];

/** Troca o campo `pos` (base 0) de uma linha. */
function trocarCampo(linhas: string[], i: number, pos: number, valor: string): void {
  const p = linhas[i]!.split('|');
  p[pos] = valor;
  linhas[i] = p.join('|');
}

describe('arquivo sintético limpo', () => {
  const r = analisarTexto(base().texto, 'limpo.txt');

  it('não tem erros nem alertas (semáforo verde)', () => {
    const problemas = r.ocorrencias.filter((o) => o.severidade !== 'info');
    expect(problemas).toEqual([]);
    expect(r.saude.semaforo).toBe('verde');
  });

  it('lê todos os registros', () => {
    expect(r.arquivo.anoBase).toBe(2025);
    expect(r.arquivo.formaApuracao).toBe('1');
    expect(r.arquivo.imoveis).toHaveLength(2);
    expect(r.arquivo.terceiros).toHaveLength(1);
    expect(r.arquivo.contas).toHaveLength(2);
    expect(r.arquivo.lancamentos).toHaveLength(120);
    expect(r.arquivo.resumos).toHaveLength(12);
    expect(r.arquivo.encerramento?.qtdLinhas).toBe(r.arquivo.totalLinhas);
  });

  it('o ano-base vem do 0000, não do nome do arquivo', () => {
    const outro = analisarTexto(base().texto, 'LCDPR_2019.txt');
    expect(outro.arquivo.anoBase).toBe(2025);
  });

  it('saldo final = receitas - despesas', () => {
    const { lancamentos } = r.arquivo;
    const resultado = lancamentos.reduce((s, l) => s + l.entrada - l.saida, 0);
    expect(lancamentos.at(-1)!.saldo).toBe(resultado);
  });
});

describe('encoding', () => {
  it('lê arquivo em ISO-8859-1 com acentos', () => {
    const { linhas } = base();
    const i = idx(linhas, '0030');
    trocarCampo(linhas, i, 4, 'SÃO JOSÉ');
    const latin1 = Uint8Array.from(montarTexto(linhas), (c) => c.charCodeAt(0));
    const r = analisarBytes(latin1, 'latin1.txt');
    expect(r.arquivo.codificacao).toBe('iso-8859-1');
    expect(r.saude.erros).toBe(0);
  });
});

describe('estrutura', () => {
  it('registro desconhecido', () => {
    const { linhas } = base();
    linhas.splice(3, 0, 'X999|LIXO');
    const o = daRegra(analisar(linhas).ocorrencias, 'REG-DESCONHECIDO');
    expect(o).toHaveLength(1);
    expect(o[0]!.linha).toBe(4);
  });

  it('registro obrigatório ausente (0010)', () => {
    const { linhas } = base();
    linhas.splice(idx(linhas, '0010'), 1);
    const o = daRegra(analisar(linhas).ocorrencias, 'REG-AUSENTE');
    expect(o.map((x) => x.registro)).toContain('0010');
  });

  it('quantidade de campos errada', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 5);
    linhas[i] = linhas[i]!.replace('|Venda', '|Venda | com pipe').replace('|Compra', '|Compra | com pipe')
      .replace('|Óleo', '|Óleo | pipe').replace('|Manutenção', '|Manutenção | pipe').replace('|Frete', '|Frete | pipe')
      .replace('|Salários', '|Salários | pipe').replace('|Energia', '|Energia | pipe').replace('|Vacinas', '|Vacinas | pipe')
      .replace('|Sal ', '|Sal | pipe ');
    const o = daRegra(analisar(linhas).ocorrencias, 'QTD-CAMPOS');
    expect(o[0]?.linha).toBe(i + 1);
  });

  it('fora de ordem', () => {
    const { linhas } = base();
    const [l0010] = linhas.splice(idx(linhas, '0010'), 1);
    linhas.splice(idx(linhas, '0050'), 0, l0010!);
    expect(daRegra(analisar(linhas).ocorrencias, 'ORDEM')).toHaveLength(1);
  });

  it('QTD_LIN do 9999 diferente', () => {
    const { linhas } = base();
    trocarCampo(linhas, linhas.length - 1, 6, '5');
    expect(daRegra(analisar(linhas).ocorrencias, 'QTD-LINHAS')).toHaveLength(1);
  });

  it('tolera "|" no início e no fim da linha, com alerta', () => {
    const { linhas } = base();
    const tolerantes = linhas.map((l) => `|${l}|`);
    tolerantes[tolerantes.length - 1] = tolerantes.at(-1)!; // mantém contagem
    const r = analisar(tolerantes);
    expect(r.saude.erros).toBe(0);
    expect(daRegra(r.ocorrencias, 'PIPE-INICIAL').length).toBe(linhas.length);
    expect(r.arquivo.lancamentos).toHaveLength(120);
  });
});

describe('campos', () => {
  it('obrigatório vazio, não numérico, tamanho e código inválido', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 2);
    trocarCampo(linhas, i, 6, ''); // HIST vazio
    trocarCampo(linhas, i, 9, '12,50'); // valor com vírgula
    const j = idx(linhas, 'Q100', 3);
    trocarCampo(linhas, j, 2, '1'); // COD_IMOVEL sem zeros
    trocarCampo(linhas, j, 8, '7'); // TIPO_LANC inexistente
    const oc = analisar(linhas).ocorrencias;
    expect(daRegra(oc, 'CAMPO-OBRIG')[0]).toMatchObject({ linha: i + 1, campo: 'HIST' });
    expect(daRegra(oc, 'CAMPO-NUMERICO')[0]).toMatchObject({ linha: i + 1, campo: 'VL_ENTRADA' });
    expect(daRegra(oc, 'CAMPO-TAMANHO')[0]).toMatchObject({ linha: j + 1, campo: 'COD_IMOVEL' });
    expect(daRegra(oc, 'CAMPO-CODIGO')[0]).toMatchObject({ linha: j + 1, campo: 'TIPO_LANC' });
  });

  it('data inexistente', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 0);
    trocarCampo(linhas, i, 1, '31022025');
    expect(daRegra(analisar(linhas).ocorrencias, 'CAMPO-DATA')[0]?.linha).toBe(i + 1);
  });

  it('espaços em campo numérico geram alerta, mas o valor é lido', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q200', 0);
    const p = linhas[i]!.split('|');
    p[3] = ` ${p[3]}`;
    linhas[i] = p.join('|');
    const r = analisar(linhas);
    expect(daRegra(r.ocorrencias, 'CAMPO-ESPACOS')).toHaveLength(1);
    expect(daRegra(r.ocorrencias, 'Q100-Q200')).toHaveLength(0);
  });
});

describe('integridade', () => {
  it('imóvel e conta não cadastrados', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 4);
    trocarCampo(linhas, i, 2, '009');
    trocarCampo(linhas, i, 3, '077');
    const oc = analisar(linhas).ocorrencias;
    expect(daRegra(oc, 'REF-IMOVEL')[0]?.linha).toBe(i + 1);
    expect(daRegra(oc, 'REF-CONTA')[0]?.linha).toBe(i + 1);
  });

  it('códigos especiais 000 (imóvel) e 000/999 (conta) são aceitos', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 4);
    trocarCampo(linhas, i, 2, '000');
    trocarCampo(linhas, i, 3, '999');
    const oc = analisar(linhas).ocorrencias;
    expect(daRegra(oc, 'REF-IMOVEL')).toHaveLength(0);
    expect(daRegra(oc, 'REF-CONTA')).toHaveLength(0);
    expect(daRegra(oc, 'IMOVEL-RATEIO')).toHaveLength(1);
  });

  it('data fora do período', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 0);
    trocarCampo(linhas, i, 1, '15122024');
    expect(daRegra(analisar(linhas).ocorrencias, 'DATA-PERIODO')[0]?.linha).toBe(i + 1);
  });

  it('CPF/CNPJ com DV inválido no participante e no produtor', () => {
    const { linhas } = base();
    trocarCampo(linhas, 0, 3, '12345678900');
    const i = idx(linhas, 'Q100', 1);
    trocarCampo(linhas, i, 7, '11222333000180');
    const oc = daRegra(analisar(linhas).ocorrencias, 'CPF-DV');
    expect(oc.map((o) => o.linha)).toEqual(expect.arrayContaining([1, i + 1]));
  });

  it('condomínio sem 0045', () => {
    const { linhas } = base();
    linhas.splice(idx(linhas, '0045'), 1);
    expect(daRegra(analisar(linhas).ocorrencias, 'TERCEIRO-AUSENTE')).toHaveLength(1);
  });
});

describe('conciliação', () => {
  it('saldo divergente aponta só a linha alterada', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 30);
    const p = linhas[i]!.split('|');
    p[11] = String(Number(p[11]) + 100);
    linhas[i] = p.join('|');
    const oc = daRegra(analisar(linhas).ocorrencias, 'SALDO-LANC');
    // a linha alterada e a seguinte (cujo saldo anterior mudou) divergem
    expect(oc.map((o) => o.linha)).toEqual([i + 1, i + 2]);
  });

  it('Q200 diferente da soma dos Q100 do mês', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q200', 4);
    const p = linhas[i]!.split('|');
    p[3] = String(Number(p[3]) + 1);
    linhas[i] = p.join('|');
    const oc = analisar(linhas).ocorrencias;
    expect(daRegra(oc, 'Q100-Q200')).toHaveLength(1);
    expect(daRegra(oc, 'Q100-Q200')[0]).toMatchObject({ linha: i + 1, campo: 'VL_SAIDA' });
    expect(daRegra(oc, 'Q200-ACUMULADO')).toHaveLength(1);
  });

  it('mês com lançamento sem Q200', () => {
    const { linhas } = base();
    linhas.splice(idx(linhas, 'Q200', 0), 1);
    expect(daRegra(analisar(linhas).ocorrencias, 'Q200-AUSENTE')).toHaveLength(1);
  });

  it('tipo 3 que não movimenta o saldo vira alerta específico', () => {
    const { linhas } = base();
    // Insere um tipo 3 no fim de dezembro sem alterar o saldo e ajusta o Q200 de dezembro.
    const ultimoQ100 = idx(linhas, 'Q200', 0) - 1;
    const p = linhas[ultimoQ100]!.split('|');
    const novo = ['Q100', '31122025', '001', '001', 'NF-9', '1', 'Entrega de soja de contrato antecipado', p[7], '3', '500000', '0', p[11], p[12]].join('|');
    linhas.splice(ultimoQ100 + 1, 0, novo);
    const oc = analisar(linhas).ocorrencias;
    const saldo = daRegra(oc, 'SALDO-LANC');
    expect(saldo).toHaveLength(1);
    expect(saldo[0]!.severidade).toBe('alerta');
  });
});

describe('riscos', () => {
  it('sem documento, histórico genérico e duplicidade', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 10);
    trocarCampo(linhas, i, 4, '');
    trocarCampo(linhas, i, 6, 'Diversos');
    const oc = analisar(linhas).ocorrencias;
    expect(daRegra(oc, 'SEM-DOCUMENTO')[0]?.linha).toBe(i + 1);
    expect(daRegra(oc, 'HIST-GENERICO')[0]?.linha).toBe(i + 1);
  });

  it('duplicidade provável (mesma data, valor e documento)', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 20);
    const p = linhas[i]!.split('|');
    // Cópia exata, com saldo ajustado para isolar a regra de duplicidade.
    const valor = Number(p[9]) - Number(p[10]);
    const saldoAnterior = (p[12] === 'N' ? -1 : 1) * Number(p[11]);
    const novoSaldo = saldoAnterior + valor;
    const copia = [...p];
    copia[11] = String(Math.abs(novoSaldo));
    copia[12] = novoSaldo < 0 ? 'N' : 'P';
    linhas.splice(i + 1, 0, copia.join('|'));
    const dup = daRegra(analisar(linhas).ocorrencias, 'DUPLICIDADE');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.linha).toBe(i + 2);
  });

  it('lançamento em feriado nacional', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 100); // dezembro
    trocarCampo(linhas, i, 1, '25122025');
    expect(daRegra(analisar(linhas).ocorrencias, 'DIA-NAO-UTIL').some((o) => o.linha === i + 1)).toBe(true);
  });

  it('valor atípico', () => {
    const { linhas } = base();
    const i = idx(linhas, 'Q100', 0);
    const p = linhas[i]!.split('|');
    expect(p[8]).toBe('2');
    p[10] = String(Number(p[10]) * 1000);
    linhas[i] = p.join('|');
    expect(daRegra(analisar(linhas).ocorrencias, 'VALOR-ATIPICO').some((o) => o.linha === i + 1)).toBe(true);
  });
});

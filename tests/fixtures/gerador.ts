/**
 * GERADOR DE ARQUIVOS LCDPR SINTÉTICOS (100% fictícios).
 *
 * Gera um TXT no leiaute 1.3 com produtor, imóveis, contas, participantes e
 * lançamentos INVENTADOS. CPFs e CNPJs são aleatórios com dígito verificador
 * válido (válidos só no formato). Nenhum dado vem de arquivo real.
 *
 * É determinístico: a mesma "semente" gera sempre o mesmo arquivo, para que os
 * testes sejam repetíveis.
 *
 * Só usa sintaxe que o Node executa direto (sem enum, sem parameter properties),
 * para o script scripts/gerar-fixtures.ts rodar sem ferramenta extra.
 */
import { completarCnpj, completarCpf } from '../../src/domain/documentos.ts';

export interface OpcoesGerador {
  ano?: number;
  lancamentosPorMes?: number;
  semente?: number;
}

export interface ArquivoGerado {
  /** Texto completo, com quebras CRLF (como o PVA da Receita gera). */
  texto: string;
  /** Linhas sem a quebra, para os testes modificarem e remontarem. */
  linhas: string[];
}

/** Gerador pseudoaleatório "mulberry32": rápido e reproduzível. */
function criarAleatorio(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number, tam: number): string => String(n).padStart(tam, '0');

const DESPESAS = [
  'Compra de sementes de soja - safra fictícia',
  'Compra de fertilizantes NPK',
  'Compra de defensivos agrícolas',
  'Óleo diesel para tratores',
  'Manutenção de colheitadeira',
  'Frete de grãos até o armazém',
  'Salários de empregados rurais',
  'Energia elétrica do pivô de irrigação',
  'Vacinas e medicamentos veterinários',
  'Sal mineral para o rebanho',
];
const RECEITAS = [
  'Venda de soja em grãos',
  'Venda de milho em grãos',
  'Venda de bezerros desmamados',
  'Venda de boi gordo para frigorífico',
];

export function gerarLcdpr(opcoes: OpcoesGerador = {}): ArquivoGerado {
  const ano = opcoes.ano ?? 2025;
  const porMes = opcoes.lancamentosPorMes ?? 12;
  const rnd = criarAleatorio(opcoes.semente ?? 42);
  const inteiro = (min: number, max: number): number => min + Math.floor(rnd() * (max - min + 1));
  const escolher = <T,>(lista: readonly T[]): T => lista[inteiro(0, lista.length - 1)] as T;
  const cpf = (): string => completarCpf(pad(inteiro(100000000, 999999999), 9));
  const cnpj = (): string => completarCnpj(`${pad(inteiro(10000000, 99999999), 8)}0001`);

  const produtorCpf = cpf();
  const condominoCpf = cpf();
  const clientes = [cnpj(), cnpj(), cnpj()];
  const fornecedores = [cnpj(), cnpj(), cnpj(), cnpj(), cpf(), cpf()];

  const linhas: string[] = [];
  const L = (...campos: (string | number)[]): void => {
    linhas.push(campos.join('|'));
  };

  // ---- Bloco 0 ----
  L('0000', 'LCDPR', '0013', produtorCpf, 'PRODUTOR FICTICIO DE TESTE', 0, 0, '', `0101${ano}`, `3112${ano}`);
  L('0010', 1);
  L('0030', 'RUA FICTICIA DOS TESTES', '100', '', 'CENTRO', 'MS', '5002704', '79000000', '', 'teste@exemplo.invalid');
  L('0040', '001', 'BR', 'BRL', '12345679', '', '', 'FAZENDA MODELO A', 'RODOVIA FICTICIA KM 10', '', '', 'ZONA RURAL', 'MS', '5002704', '79000000', 1, '10000');
  L('0040', '002', 'BR', 'BRL', '87654321', '', '', 'FAZENDA MODELO B', 'ESTRADA FICTICIA KM 5', '', '', 'ZONA RURAL', 'MS', '5002704', '79000000', 2, '05000');
  L('0045', '002', 1, condominoCpf, 'CONDOMINO FICTICIO', '05000');
  L('0050', '001', 'BR', '001', 'BANCO FICTICIO UM', '1234', '0000000000123456');
  L('0050', '002', 'BR', '237', 'BANCO FICTICIO DOIS', '4321', '0000000000654321');

  // ---- Bloco Q ----
  let saldo = 0;
  let doc = 1000;
  const resumos: string[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const dias = Array.from({ length: porMes }, () => inteiro(1, ultimoDia)).sort((x, y) => x - y);
    let entMes = 0;
    let saiMes = 0;
    for (const dia of dias) {
      // Receitas concentradas na safra (mar a jun) e no gado (set a nov).
      const ehReceita = rnd() < ((mes >= 3 && mes <= 6) || (mes >= 9 && mes <= 11) ? 0.45 : 0.1);
      const valor = ehReceita ? inteiro(2_000_000, 25_000_000) : inteiro(50_000, 3_000_000);
      const entrada = ehReceita ? valor : 0;
      const saida = ehReceita ? 0 : valor;
      saldo += entrada - saida;
      entMes += entrada;
      saiMes += saida;
      doc++;
      L(
        'Q100',
        `${pad(dia, 2)}${pad(mes, 2)}${ano}`,
        ehReceita ? '001' : escolher(['001', '002']),
        escolher(['001', '002']),
        String(doc),
        ehReceita ? 1 : escolher([1, 1, 1, 3, 5]),
        ehReceita ? escolher(RECEITAS) : escolher(DESPESAS),
        ehReceita ? escolher(clientes) : escolher(fornecedores),
        ehReceita ? 1 : 2,
        entrada,
        saida,
        Math.abs(saldo),
        saldo < 0 ? 'N' : 'P',
      );
    }
    resumos.push(['Q200', `${pad(mes, 2)}${ano}`, entMes, saiMes, Math.abs(saldo), saldo < 0 ? 'N' : 'P'].join('|'));
  }
  linhas.push(...resumos);

  // ---- Bloco 9 ---- (QTD_LIN conta todas as linhas, inclusive o 9999)
  L('9999', 'CONTADOR FICTICIO', completarCpf('987654321'), 'MS000000O0', 'contador@exemplo.invalid', '', linhas.length + 1);

  return { texto: `${linhas.join('\r\n')}\r\n`, linhas };
}

/** Remonta o texto a partir das linhas (após um teste modificá-las). */
export function montarTexto(linhas: readonly string[]): string {
  return `${linhas.join('\r\n')}\r\n`;
}

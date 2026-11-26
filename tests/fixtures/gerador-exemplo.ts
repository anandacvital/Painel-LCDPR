/**
 * GERADOR DO "LCDPR DE EXEMPLO" (100% fictício) — para testar o painel antes
 * de usar um arquivo real.
 *
 * Diferente do gerador.ts (que sorteia lançamentos para os testes automáticos),
 * aqui o ano segue o CALENDÁRIO AGRÍCOLA de uma fazenda típica de MS, para os
 * gráficos fazerem sentido:
 *
 * - Fazenda Exemplo Boa Vista (001, própria, 100%): soja (colheita e venda de
 *   fevereiro a abril) e milho safrinha (venda em julho e agosto).
 * - Sítio Exemplo Água Limpa (002, próprio, 100%): pecuária de cria e recria
 *   (venda de bezerros e boi gordo em março, junho, outubro e novembro).
 * - Fazenda Exemplo Santa Cruz (003, condomínio): o produtor tem 60% e um
 *   condômino fictício tem 40% (registro 0045). Como manda a Receita
 *   (Perguntas e Respostas do LCDPR, perguntas 47 e 52), o arquivo traz SÓ a
 *   parcela de 60% das receitas e despesas desse imóvel.
 * - Custeio concentrado no plantio (agosto a novembro: sementes, adubo,
 *   defensivos, diesel) e despesas fixas todo mês (folha, energia).
 * - Lançamentos só em dias úteis, todos com documento, histórico descritivo e
 *   vários compradores e fornecedores: o Validador deve dar semáforo VERDE.
 *
 * O resultado (receitas − despesas) é POSITIVO nos dois anos, para a aba de
 * IRPF ter o que calcular. As "receitas-alvo" foram escolhidas para que a
 * margem de 2025 fique perto de 30% (a opção pelos 20% da receita bruta tende
 * a compensar) e a de 2024 perto de 13% (o resultado real tende a compensar).
 *
 * Nomes, CPFs, CNPJs, NIRFs, contas e valores são INVENTADOS. CPF/CNPJ têm
 * dígito verificador válido só para passar na conferência de formato.
 */
import { completarCnpj, completarCpf } from '../../src/domain/documentos.ts';
import { criarData, diaNaoUtil } from '../../src/domain/datas.ts';

export interface OpcoesExemplo {
  ano: number;
  /** Multiplica todas as receitas (preço/produtividade do ano). */
  fatorReceita: number;
  /** Multiplica todas as despesas (custo dos insumos no ano). */
  fatorDespesa: number;
  semente: number;
}

/** Gerador pseudoaleatório "mulberry32": a mesma semente gera o mesmo arquivo. */
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

interface Evento {
  mes: number;
  dia: number;
  imovel: string;
  conta: string;
  tipoDoc: number;
  historico: string;
  partic: string;
  /** 1 = receita, 2 = despesa. */
  tipo: 1 | 2;
  /** Centavos. */
  valor: number;
}

export function gerarExemplo(o: OpcoesExemplo): { texto: string; linhas: string[] } {
  const rnd = criarAleatorio(o.semente);
  const entre = (min: number, max: number): number => min + rnd() * (max - min);
  // Documentos fixos entre os anos (o "mesmo produtor" nos dois arquivos).
  const fixo = criarAleatorio(7);
  const cpfFixo = (): string => completarCpf(pad(100000000 + Math.floor(fixo() * 899999999), 9));
  const cnpjFixo = (): string => completarCnpj(`${pad(10000000 + Math.floor(fixo() * 89999999), 8)}0001`);

  const produtor = cpfFixo();
  const condomino = cpfFixo();
  const contador = cpfFixo();
  const compradoresGraos = [cnpjFixo(), cnpjFixo(), cnpjFixo(), cnpjFixo(), cnpjFixo()];
  const frigorificos = [cnpjFixo(), cnpjFixo()];
  const f = {
    sementes: [cnpjFixo(), cnpjFixo()],
    adubo: [cnpjFixo(), cnpjFixo()],
    defensivos: [cnpjFixo(), cnpjFixo()],
    diesel: [cnpjFixo(), cnpjFixo()],
    oficina: [cnpjFixo()],
    energia: [cnpjFixo()],
    frete: [cnpjFixo(), cnpjFixo()],
    veterinaria: [cnpjFixo()],
    sal: [cnpjFixo()],
    empregados: [cpfFixo(), cpfFixo(), cpfFixo(), cpfFixo()],
  };

  const eventos: Evento[] = [];
  const reais = (v: number, fator: number): number => Math.round(v * fator * 100);
  const receita = (mes: number, dia: number, imovel: string, historico: string, partic: string, valor: number, conta = '001'): void => {
    eventos.push({ mes, dia, imovel, conta, tipoDoc: 1, historico, partic, tipo: 1, valor: reais(valor, o.fatorReceita) });
  };
  const despesa = (mes: number, dia: number, imovel: string, historico: string, partic: string, valor: number, tipoDoc = 1, conta = '002'): void => {
    eventos.push({ mes, dia, imovel, conta, tipoDoc, historico, partic, tipo: 2, valor: reais(valor, o.fatorDespesa) });
  };
  const um = <T,>(lista: readonly T[], i: number): T => lista[i % lista.length] as T;

  // ---------------- RECEITAS ----------------
  // Milho armazenado da safra anterior, vendido em janeiro.
  receita(1, 2, '001', 'Venda de milho em graos armazenado - safrinha anterior', um(compradoresGraos, 3), entre(140_000, 170_000));
  // Soja: colheita e venda de fevereiro a abril (Fazenda Boa Vista).
  const vendasSoja: [number, number][] = [[2, 12], [2, 26], [3, 6], [3, 18], [3, 27], [4, 8], [4, 22]];
  vendasSoja.forEach(([mes, dia], i) => {
    receita(mes, dia, '001', 'Venda de soja em graos - safra de verao', um(compradoresGraos, i), entre(260_000, 380_000), i % 3 === 0 ? '002' : '001');
  });
  // Soja da Fazenda Santa Cruz: só a parcela de 60% do produtor.
  [[3, 11], [4, 15]].forEach(([mes, dia], i) => {
    receita(mes!, dia!, '003', 'Venda de soja em graos - parcela de 60% do condominio', um(compradoresGraos, i + 2), entre(150_000, 190_000));
  });
  // Milho safrinha: julho e agosto.
  [[7, 9], [7, 23], [8, 6], [8, 20]].forEach(([mes, dia], i) => {
    receita(mes!, dia!, '001', 'Venda de milho safrinha em graos', um(compradoresGraos, i + 1), entre(110_000, 170_000));
  });
  // Pecuária (Sítio Água Limpa).
  receita(3, 24, '002', 'Venda de bezerros desmamados', frigorificos[0]!, entre(70_000, 95_000), '002');
  receita(6, 16, '002', 'Venda de boi gordo para abate', frigorificos[1]!, entre(110_000, 140_000), '002');
  receita(10, 14, '002', 'Venda de bezerros desmamados', frigorificos[0]!, entre(80_000, 105_000), '002');
  receita(11, 18, '002', 'Venda de boi gordo para abate', frigorificos[1]!, entre(120_000, 150_000), '002');

  // ---------------- DESPESAS ----------------
  for (let mes = 1; mes <= 12; mes++) {
    // Folha de pagamento: 4 empregados rurais (3 na fazenda, 1 no sítio).
    f.empregados.forEach((cpf, i) => {
      despesa(mes, 5, i === 3 ? '002' : '001', `Salario de empregado rural - competencia ${pad(mes === 1 ? 12 : mes - 1, 2)}`, cpf, entre(3_400, 4_300), 5);
    });
    // Energia (pivô de irrigação pesa mais na seca, de maio a setembro).
    despesa(mes, 20, '001', 'Energia eletrica - pivo de irrigacao e sede', f.energia[0]!, mes >= 5 && mes <= 9 ? entre(9_000, 12_000) : entre(3_500, 5_000), 2);
    // Diesel: mais na colheita (fev-abr) e no plantio (set-nov).
    const forte = (mes >= 2 && mes <= 4) || (mes >= 9 && mes <= 11);
    despesa(mes, 10, '001', 'Oleo diesel para tratores e colheitadeira', um(f.diesel, mes), forte ? entre(38_000, 52_000) : entre(12_000, 18_000));
    // Santa Cruz: parcela de 60% do custeio do condomínio, todo mês.
    despesa(mes, 25, '003', 'Custeio da Fazenda Santa Cruz - parcela de 60% do condominio', um(f.diesel, mes + 1), entre(6_000, 9_000));
    // Sal mineral nos meses pares.
    if (mes % 2 === 0) despesa(mes, 15, '002', 'Sal mineral para o rebanho', f.sal[0]!, entre(7_000, 9_500));
  }
  // Frete na colheita.
  [[2, 27], [3, 20], [4, 10], [7, 24], [8, 21]].forEach(([mes, dia], i) => {
    despesa(mes!, dia!, '001', 'Frete de graos ate o armazem', um(f.frete, i), entre(18_000, 30_000));
  });
  // Manutenção de máquinas antes de cada safra.
  despesa(1, 22, '001', 'Manutencao da colheitadeira antes da colheita da soja', f.oficina[0]!, entre(45_000, 60_000));
  despesa(6, 23, '001', 'Manutencao de tratores e plantadeira', f.oficina[0]!, entre(35_000, 48_000));
  // Defensivos: aplicações na soja (jan-fev) e no milho (abr-mai) e dessecação (out-nov).
  [[1, 16], [2, 11], [4, 28], [5, 13], [10, 22], [11, 12], [12, 9]].forEach(([mes, dia], i) => {
    despesa(mes!, dia!, '001', 'Compra de defensivos agricolas', um(f.defensivos, i), entre(55_000, 95_000));
  });
  // Sementes de milho (fev) e de soja (set).
  despesa(2, 19, '001', 'Compra de sementes de milho safrinha', f.sementes[1]!, entre(120_000, 150_000));
  despesa(9, 9, '001', 'Compra de sementes de soja', f.sementes[0]!, entre(210_000, 250_000));
  despesa(9, 23, '001', 'Compra de sementes de soja - complemento', f.sementes[1]!, entre(70_000, 90_000));
  // Fertilizantes antes do plantio.
  [[2, 17], [8, 12], [8, 26], [9, 16], [10, 7]].forEach(([mes, dia], i) => {
    despesa(mes!, dia!, '001', 'Compra de fertilizantes NPK e calcario', um(f.adubo, i), entre(90_000, 160_000));
  });
  // Sanidade do rebanho (campanhas de vacinação de maio e novembro).
  despesa(5, 19, '002', 'Vacinas e medicamentos veterinarios - campanha de maio', f.veterinaria[0]!, entre(9_000, 13_000));
  despesa(11, 10, '002', 'Vacinas e medicamentos veterinarios - campanha de novembro', f.veterinaria[0]!, entre(9_000, 13_000));

  // ---------------- AJUSTES DE CALENDÁRIO ----------------
  // Empurra cada data para o próximo dia útil (sem fim de semana nem feriado nacional).
  for (const e of eventos) {
    let d = criarData(o.ano, e.mes, e.dia);
    while (diaNaoUtil(d)) {
      const prox = new Date(Date.UTC(d.ano, d.mes - 1, d.dia + 1));
      d = criarData(prox.getUTCFullYear(), prox.getUTCMonth() + 1, prox.getUTCDate());
    }
    e.mes = d.mes;
    e.dia = d.dia;
  }
  // Ordem cronológica; no mesmo dia, receita antes de despesa.
  eventos.sort((a, b) => a.mes - b.mes || a.dia - b.dia || a.tipo - b.tipo);

  // ---------------- MONTAGEM DO TXT ----------------
  const linhas: string[] = [];
  const L = (...campos: (string | number)[]): void => {
    linhas.push(campos.join('|'));
  };

  L('0000', 'LCDPR', '0013', produtor, 'PRODUTOR EXEMPLO FICTICIO', 0, 0, '', `0101${o.ano}`, `3112${o.ano}`);
  L('0010', 1);
  L('0030', 'RUA DOS EXEMPLOS FICTICIOS', '250', '', 'CENTRO', 'MS', '5002704', '79002000', '6799990000', 'exemplo@exemplo.invalid');
  L('0040', '001', 'BR', 'BRL', '11111118', '', '', 'FAZENDA EXEMPLO BOA VISTA', 'RODOVIA FICTICIA MS-000 KM 42', '', '', 'ZONA RURAL', 'MS', '5002704', '79100000', 1, '10000');
  L('0040', '002', 'BR', 'BRL', '22222226', '', '', 'SITIO EXEMPLO AGUA LIMPA', 'ESTRADA VICINAL FICTICIA KM 8', '', '', 'ZONA RURAL', 'MS', '5002704', '79100000', 1, '10000');
  L('0040', '003', 'BR', 'BRL', '33333334', '', '', 'FAZENDA EXEMPLO SANTA CRUZ', 'ESTRADA FICTICIA DO CONDOMINIO KM 15', '', '', 'ZONA RURAL', 'MS', '5002704', '79100000', 2, '06000');
  L('0045', '003', 1, condomino, 'CONDOMINO EXEMPLO FICTICIO', '04000');
  L('0050', '001', 'BR', '001', 'BANCO EXEMPLO UM', '1111', '0000000000011111');
  L('0050', '002', 'BR', '756', 'COOPERATIVA DE CREDITO EXEMPLO', '2222', '0000000000022222');

  let saldo = 0;
  let doc = 5000;
  const resumo = new Map<number, { ent: number; sai: number; saldo: number }>();
  for (const e of eventos) {
    const entrada = e.tipo === 1 ? e.valor : 0;
    const saida = e.tipo === 2 ? e.valor : 0;
    saldo += entrada - saida;
    doc++;
    const numDoc = e.tipoDoc === 5 ? `FP${pad(e.mes, 2)}${o.ano}${doc}` : String(doc);
    L('Q100', `${pad(e.dia, 2)}${pad(e.mes, 2)}${o.ano}`, e.imovel, e.conta, numDoc, e.tipoDoc, e.historico, e.partic, e.tipo, entrada, saida, Math.abs(saldo), saldo < 0 ? 'N' : 'P');
    const r = resumo.get(e.mes) ?? { ent: 0, sai: 0, saldo: 0 };
    r.ent += entrada;
    r.sai += saida;
    r.saldo = saldo;
    resumo.set(e.mes, r);
  }
  for (let mes = 1; mes <= 12; mes++) {
    const r = resumo.get(mes);
    if (!r) continue;
    L('Q200', `${pad(mes, 2)}${o.ano}`, r.ent, r.sai, Math.abs(r.saldo), r.saldo < 0 ? 'N' : 'P');
  }
  // QTD_LIN conta todas as linhas, inclusive o próprio 9999 (P&R LCDPR, pergunta 12).
  L('9999', 'CONTADOR EXEMPLO FICTICIO', contador, 'MS000000O0', 'contador@exemplo.invalid', '6799990001', linhas.length + 1);

  return { texto: `${linhas.join('\r\n')}\r\n`, linhas };
}

/**
 * GERADOR DO "LCDPR DE EXEMPLO" DO SEGUNDO PRODUTOR (100% fictício).
 *
 * Serve para ver o painel com MAIS DE UM PRODUTOR: seletor de produtor,
 * consolidação, comparativo entre produtores e condomínio.
 *
 * Este produtor é o CONDÔMINO dos 40% da Fazenda Exemplo Santa Cruz, que já
 * aparece no registro 0045 do arquivo do primeiro produtor (gerador-exemplo.ts).
 * Perfil diferente do primeiro, de propósito:
 *
 * - Fazenda Exemplo Ipê (001, própria, 100%): PECUÁRIA DE CORTE (recria e
 *   engorda). Compra bezerros no 1º semestre e vende boi gordo de maio a
 *   novembro. Despesa pesada com reposição de animais, suplemento e pastagem.
 * - Fazenda Exemplo Santa Cruz (003, condomínio, 40%): soja. Os lançamentos são
 *   o "espelho" dos lançamentos do primeiro produtor nesse imóvel: mesma data,
 *   mesmo documento e mesmo participante, com o valor na proporção 40/60.
 *   É assim que cada condômino escritura só a sua parcela (Perguntas e
 *   Respostas do LCDPR, perguntas 47 e 52; Lei nº 8.023/1990, art. 13), e é
 *   isso que o painel usa para diagnosticar "parcela" e recomendar "somar".
 * - Uma só conta bancária.
 *
 * Nomes, CPFs, CNPJs, NIRFs, contas e valores são INVENTADOS.
 */
import { completarCnpj, completarCpf } from '../../src/domain/documentos.ts';
import { ajustarDiasUteis, criarAleatorio, gerarExemplo, montarTxt, pad, type Evento, type OpcoesExemplo } from './gerador-exemplo.ts';

/** Percentuais do condomínio da Santa Cruz (em centésimos de %: 6000 = 60%). */
const PARTE_PRIMEIRO = 6000;
const PARTE_CONDOMINO = 4000;

/**
 * @param o opções deste arquivo (ano, fatores, semente)
 * @param doPrimeiro opções do arquivo do primeiro produtor no MESMO ano (de onde vem o espelho da Santa Cruz)
 */
export function gerarExemploCondomino(o: OpcoesExemplo, doPrimeiro: OpcoesExemplo): { texto: string; linhas: string[] } {
  const rnd = criarAleatorio(o.semente * 31 + 7);
  const entre = (min: number, max: number): number => min + rnd() * (max - min);

  // Documentos tirados do arquivo do primeiro produtor (são as mesmas pessoas).
  const primeiro = gerarExemplo(doPrimeiro).linhas.map((l) => l.split('|'));
  const campo = (reg: string, i: number): string => primeiro.find((c) => c[0] === reg)?.[i] ?? '';
  const cpfPrimeiro = campo('0000', 3);
  const cpfCondomino = campo('0045', 3);
  const contador = campo('9999', 2);

  // Documentos próprios deste produtor (fixos entre os anos).
  const fixo = criarAleatorio(41);
  const cpfFixo = (): string => completarCpf(pad(100000000 + Math.floor(fixo() * 899999999), 9));
  const cnpjFixo = (): string => completarCnpj(`${pad(10000000 + Math.floor(fixo() * 89999999), 8)}0001`);
  const frigorificos = [cnpjFixo(), cnpjFixo(), cnpjFixo()];
  const f = {
    bezerros: [cpfFixo(), cpfFixo(), cnpjFixo()],
    suplemento: [cnpjFixo(), cnpjFixo()],
    sal: [cnpjFixo()],
    veterinaria: [cnpjFixo()],
    pastagem: [cnpjFixo()],
    diesel: [cnpjFixo()],
    energia: [cnpjFixo()],
    frete: [cnpjFixo()],
    empregados: [cpfFixo(), cpfFixo()],
  };

  const eventos: Evento[] = [];
  const reais = (v: number, fator: number): number => Math.round(v * fator * 100);
  const receita = (mes: number, dia: number, historico: string, partic: string, valor: number): void => {
    eventos.push({ mes, dia, imovel: '001', conta: '001', tipoDoc: 1, historico, partic, tipo: 1, valor: reais(valor, o.fatorReceita) });
  };
  const despesa = (mes: number, dia: number, historico: string, partic: string, valor: number, tipoDoc = 1): void => {
    eventos.push({ mes, dia, imovel: '001', conta: '001', tipoDoc, historico, partic, tipo: 2, valor: reais(valor, o.fatorDespesa) });
  };
  const um = <T,>(lista: readonly T[], i: number): T => lista[i % lista.length] as T;

  // ---------------- PECUÁRIA (Fazenda Ipê) ----------------
  // Venda de boi gordo: de maio a novembro (fim da engorda a pasto e confinamento).
  [[5, 14], [6, 11], [7, 16], [8, 13], [9, 17], [10, 15], [11, 12]].forEach(([mes, dia], i) => {
    receita(mes!, dia!, 'Venda de boi gordo para abate', um(frigorificos, i), entre(150_000, 210_000));
  });
  // Venda de vacas de descarte no início do ano.
  receita(2, 20, 'Venda de vacas de descarte', frigorificos[2]!, entre(45_000, 60_000));
  // Reposição: compra de bezerros para recria (fevereiro a abril).
  [[2, 9], [3, 12], [4, 9]].forEach(([mes, dia], i) => {
    despesa(mes!, dia!, 'Compra de bezerros para recria', um(f.bezerros, i), entre(150_000, 190_000));
  });
  for (let mes = 1; mes <= 12; mes++) {
    f.empregados.forEach((cpf) => {
      despesa(mes, 5, `Salario de empregado rural - competencia ${pad(mes === 1 ? 12 : mes - 1, 2)}`, cpf, entre(3_300, 4_000), 5);
    });
    despesa(mes, 20, 'Energia eletrica - sede e bebedouros', f.energia[0]!, entre(2_500, 3_500), 2);
    despesa(mes, 12, 'Oleo diesel para trator e vagao forrageiro', f.diesel[0]!, entre(6_000, 9_000));
    // Suplementação mais forte na seca (maio a setembro).
    const seca = mes >= 5 && mes <= 9;
    despesa(mes, 18, 'Racao e suplemento proteico para engorda', um(f.suplemento, mes), seca ? entre(45_000, 60_000) : entre(15_000, 22_000));
    if (mes % 2 === 1) despesa(mes, 15, 'Sal mineral para o rebanho', f.sal[0]!, entre(6_000, 8_000));
  }
  despesa(5, 21, 'Vacinas e medicamentos veterinarios - campanha de maio', f.veterinaria[0]!, entre(8_000, 11_000));
  despesa(11, 19, 'Vacinas e medicamentos veterinarios - campanha de novembro', f.veterinaria[0]!, entre(8_000, 11_000));
  despesa(10, 8, 'Reforma de pastagem - calcario, sementes de capim e servico', f.pastagem[0]!, entre(70_000, 95_000));
  [[5, 15], [7, 17], [9, 18], [11, 13]].forEach(([mes, dia]) => {
    despesa(mes!, dia!, 'Frete de gado para o frigorifico', f.frete[0]!, entre(6_000, 9_000));
  });

  // ---------------- SANTA CRUZ (espelho da parcela de 40%) ----------------
  // Já vem em dia útil e com o número de documento do arquivo do primeiro produtor.
  const espelho: Evento[] = [];
  for (const c of primeiro) {
    if (c[0] !== 'Q100' || c[2] !== '003') continue;
    const tipo = c[8] === '1' ? 1 : 2;
    const valorPrimeiro = Number(tipo === 1 ? c[9] : c[10]);
    espelho.push({
      mes: Number(c[1]!.slice(2, 4)),
      dia: Number(c[1]!.slice(0, 2)),
      imovel: '003',
      conta: '001',
      tipoDoc: Number(c[5]),
      historico: c[6]!.replace('parcela de 60%', 'parcela de 40%'),
      partic: c[7]!,
      tipo,
      valor: Math.round((valorPrimeiro * PARTE_CONDOMINO) / PARTE_PRIMEIRO),
      numDoc: c[4]!,
    });
  }

  ajustarDiasUteis(eventos, o.ano);
  return montarTxt(
    {
      ano: o.ano,
      cpf: cpfCondomino,
      nome: 'CONDOMINO EXEMPLO FICTICIO',
      contador,
      docInicial: 8000,
      ...(o.ateMes ? { ateMes: o.ateMes } : {}),
      cadastros: [
        '0040|001|BR|BRL|44444442|||FAZENDA EXEMPLO IPE|RODOVIA FICTICIA MS-000 KM 77|||ZONA RURAL|MS|5002704|79100000|1|10000',
        `0040|003|BR|BRL|33333334|||FAZENDA EXEMPLO SANTA CRUZ|ESTRADA FICTICIA DO CONDOMINIO KM 15|||ZONA RURAL|MS|5002704|79100000|2|0${PARTE_CONDOMINO}`,
        `0045|003|1|${cpfPrimeiro}|PRODUTOR EXEMPLO FICTICIO|0${PARTE_PRIMEIRO}`,
        '0050|001|BR|001|BANCO EXEMPLO UM|3333|0000000000033333',
      ],
    },
    [...eventos, ...espelho],
  );
}

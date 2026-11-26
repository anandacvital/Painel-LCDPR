/**
 * TABELA DE DEFINIÇÃO DE REGISTROS DO LCDPR — leiaute 1.3
 *
 * Fonte: Manual de Preenchimento do LCDPR, anexo ao ADE COPES nº 1/2020
 * (leiaute 1.3, válido a partir do ano-calendário 2019), publicado pela
 * Receita Federal; base legal: IN RFB nº 1.848/2018.
 * https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/lcdpr-livro-caixa-digital-do-produtor-rural/manual-de-preenchimento-do-lcdpr-1-3
 *
 * POR QUE UMA TABELA: o leitor (parser.ts) não tem nenhuma regra de campo
 * "escrita à mão". Ele percorre esta tabela. Quando a Receita mudar o leiaute,
 * basta ajustar aqui (e os testes acusam o que quebrou).
 *
 * Convenções desta tabela (as mesmas do Manual):
 * - tipo 'N' = numérico (só dígitos); 'C' = alfanumérico.
 * - tamanho = máximo de caracteres. `tamanhosExatos` = o campo só aceita
 *   esses tamanhos (ex.: CPF 11 ou CNPJ 14; data 8).
 * - decimais = casas decimais implícitas (valores monetários e percentuais: 2).
 * - obrigatorio: 'S' sim, 'N' não, 'COND' condicional (regra validada à parte).
 * - valores = lista fechada de códigos aceitos (tabelas do Manual).
 */

export type TipoCampo = 'N' | 'C';
export type Obrigatoriedade = 'S' | 'N' | 'COND';

export interface DefinicaoCampo {
  /** Sigla oficial do campo, exatamente como no Manual. */
  nome: string;
  descricao: string;
  tipo: TipoCampo;
  tamanho: number;
  tamanhosExatos?: readonly number[];
  decimais?: number;
  obrigatorio: Obrigatoriedade;
  valores?: readonly string[];
}

export interface DefinicaoRegistro {
  reg: CodigoRegistro;
  descricao: string;
  /** Hierarquia do Manual (1 = abertura/encerramento, 2 = principal, 3 = filho). */
  nivel: 1 | 2 | 3;
  /** Ocorrência mínima e máxima no arquivo (null = sem limite). */
  minimo: number;
  maximo: number | null;
  /** Posição relativa na ordem dos blocos (não pode diminuir ao longo do arquivo). */
  ordem: number;
  campos: readonly DefinicaoCampo[];
}

export type CodigoRegistro =
  | '0000'
  | '0010'
  | '0030'
  | '0040'
  | '0045'
  | '0050'
  | 'Q100'
  | 'Q200'
  | '9999';

/** Tamanho padrão de campo alfanumérico sem tamanho definido no Manual. */
const C_LIVRE = 255;

// ---------------------------------------------------------------------------
// Tabelas de códigos (Manual, seção de tabelas)
// ---------------------------------------------------------------------------

export const TIPO_DOC: Readonly<Record<string, string>> = {
  '1': 'Nota Fiscal',
  '2': 'Fatura',
  '3': 'Recibo',
  '4': 'Contrato',
  '5': 'Folha de Pagamento',
  '6': 'Outros',
};

export const TIPO_LANC: Readonly<Record<string, string>> = {
  '1': 'Receita da atividade rural',
  '2': 'Despesa de custeio e investimento',
  '3': 'Receita de produto entregue no ano, referente a adiantamento recebido em ano anterior',
};

export const FORMA_APUR: Readonly<Record<string, string>> = {
  '1': 'Livro Caixa (receitas menos despesas)',
  '2': 'Lucro arbitrado em 20% da receita bruta (Lei nº 8.023/1990, art. 5º)',
};

export const TIPO_EXPLORACAO: Readonly<Record<string, string>> = {
  '1': 'Exploração individual (imóvel próprio)',
  '2': 'Condomínio',
  '3': 'Imóvel arrendado',
  '4': 'Parceria',
  '5': 'Comodato',
  '6': 'Outros',
};

export const TIPO_CONTRAPARTE: Readonly<Record<string, string>> = {
  '1': 'Condômino',
  '2': 'Arrendador',
  '3': 'Parceiro',
  '4': 'Comodante',
  '5': 'Outro',
};

export const IND_SIT_INI_PER: Readonly<Record<string, string>> = {
  '0': 'Regular (início no primeiro dia do ano)',
  '1': 'Abertura (início de atividades no ano)',
  '2': 'Início de obrigatoriedade no curso do ano',
};

export const SIT_ESPECIAL: Readonly<Record<string, string>> = {
  '0': 'Normal',
  '1': 'Falecimento',
  '2': 'Espólio',
  '3': 'Saída definitiva do País',
};

export const NAT_SLD: Readonly<Record<string, string>> = {
  P: 'Positivo',
  N: 'Negativo',
};

/** Códigos especiais de conta no Q100 (Manual): 000 = espécie; 999 = valor que não passou por conta. */
export const CONTA_ESPECIE = '000';
export const CONTA_NAO_BANCARIA = '999';
/** Código de imóvel "000" (Manual): despesa comum de condomínio/parceria em vários imóveis. */
export const IMOVEL_RATEIO = '000';

const chaves = (t: Readonly<Record<string, string>>): readonly string[] => Object.keys(t);

// ---------------------------------------------------------------------------
// Registros
// ---------------------------------------------------------------------------

export const LEIAUTE: Readonly<Record<CodigoRegistro, DefinicaoRegistro>> = {
  '0000': {
    reg: '0000',
    descricao: 'Abertura e identificação da pessoa física',
    nivel: 1,
    minimo: 1,
    maximo: 1,
    ordem: 0,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['0000'] },
      { nome: 'NOME_ESC', descricao: 'Nome da escrituração', tipo: 'C', tamanho: 5, obrigatorio: 'S', valores: ['LCDPR'] },
      { nome: 'COD_VER', descricao: 'Versão do leiaute', tipo: 'C', tamanho: 4, obrigatorio: 'S' },
      { nome: 'CPF', descricao: 'CPF do produtor', tipo: 'N', tamanho: 11, tamanhosExatos: [11], obrigatorio: 'S' },
      { nome: 'NOME', descricao: 'Nome do produtor', tipo: 'C', tamanho: C_LIVRE, obrigatorio: 'S' },
      { nome: 'IND_SIT_INI_PER', descricao: 'Situação no início do período', tipo: 'N', tamanho: 1, obrigatorio: 'S', valores: chaves(IND_SIT_INI_PER) },
      { nome: 'SIT_ESPECIAL', descricao: 'Situação especial', tipo: 'N', tamanho: 1, obrigatorio: 'S', valores: chaves(SIT_ESPECIAL) },
      { nome: 'DT_SIT_ESP', descricao: 'Data da situação especial', tipo: 'N', tamanho: 8, tamanhosExatos: [8], obrigatorio: 'COND' },
      { nome: 'DT_INI', descricao: 'Data inicial do período', tipo: 'N', tamanho: 8, tamanhosExatos: [8], obrigatorio: 'S' },
      { nome: 'DT_FIN', descricao: 'Data final do período', tipo: 'N', tamanho: 8, tamanhosExatos: [8], obrigatorio: 'S' },
    ],
  },
  '0010': {
    reg: '0010',
    descricao: 'Parâmetros de tributação',
    nivel: 2,
    minimo: 1,
    maximo: 1,
    ordem: 1,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['0010'] },
      { nome: 'FORMA_APUR', descricao: 'Forma de apuração', tipo: 'N', tamanho: 1, obrigatorio: 'S', valores: chaves(FORMA_APUR) },
    ],
  },
  '0030': {
    reg: '0030',
    descricao: 'Dados cadastrais',
    nivel: 2,
    minimo: 1,
    maximo: 1,
    ordem: 2,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['0030'] },
      { nome: 'ENDERECO', descricao: 'Endereço', tipo: 'C', tamanho: 150, obrigatorio: 'S' },
      { nome: 'NUM', descricao: 'Número', tipo: 'C', tamanho: 6, obrigatorio: 'S' },
      { nome: 'COMPL', descricao: 'Complemento', tipo: 'C', tamanho: 50, obrigatorio: 'N' },
      { nome: 'BAIRRO', descricao: 'Bairro', tipo: 'C', tamanho: 50, obrigatorio: 'S' },
      { nome: 'UF', descricao: 'UF', tipo: 'C', tamanho: 2, obrigatorio: 'S' },
      { nome: 'COD_MUN', descricao: 'Código do município (IBGE)', tipo: 'C', tamanho: 7, obrigatorio: 'S' },
      { nome: 'CEP', descricao: 'CEP', tipo: 'C', tamanho: 8, obrigatorio: 'S' },
      { nome: 'NUM_TEL', descricao: 'Telefone', tipo: 'N', tamanho: 15, obrigatorio: 'N' },
      { nome: 'EMAIL', descricao: 'E-mail', tipo: 'C', tamanho: 115, obrigatorio: 'S' },
    ],
  },
  '0040': {
    reg: '0040',
    descricao: 'Cadastro dos imóveis rurais',
    nivel: 2,
    minimo: 1,
    maximo: null,
    ordem: 3,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['0040'] },
      { nome: 'COD_IMOVEL', descricao: 'Código do imóvel no LCDPR', tipo: 'N', tamanho: 3, tamanhosExatos: [3], obrigatorio: 'S' },
      { nome: 'PAIS', descricao: 'País', tipo: 'C', tamanho: 2, obrigatorio: 'S' },
      { nome: 'MOEDA', descricao: 'Moeda', tipo: 'C', tamanho: 3, obrigatorio: 'S' },
      { nome: 'CAD_ITR', descricao: 'Número no CAFIR (NIRF)', tipo: 'N', tamanho: 8, tamanhosExatos: [8], obrigatorio: 'COND' },
      { nome: 'CAEPF', descricao: 'CAEPF', tipo: 'N', tamanho: 14, tamanhosExatos: [14], obrigatorio: 'COND' },
      { nome: 'INSCR_ESTADUAL', descricao: 'Inscrição estadual', tipo: 'N', tamanho: 14, obrigatorio: 'N' },
      { nome: 'NOME_IMOVEL', descricao: 'Nome do imóvel', tipo: 'C', tamanho: 50, obrigatorio: 'S' },
      { nome: 'ENDERECO', descricao: 'Endereço', tipo: 'C', tamanho: 150, obrigatorio: 'S' },
      { nome: 'NUM', descricao: 'Número', tipo: 'C', tamanho: 6, obrigatorio: 'N' },
      { nome: 'COMPL', descricao: 'Complemento', tipo: 'C', tamanho: 50, obrigatorio: 'N' },
      { nome: 'BAIRRO', descricao: 'Bairro', tipo: 'C', tamanho: 50, obrigatorio: 'S' },
      { nome: 'UF', descricao: 'UF', tipo: 'C', tamanho: 2, obrigatorio: 'COND' },
      { nome: 'COD_MUN', descricao: 'Código do município (IBGE)', tipo: 'C', tamanho: 7, obrigatorio: 'COND' },
      { nome: 'CEP', descricao: 'CEP', tipo: 'C', tamanho: 8, obrigatorio: 'COND' },
      { nome: 'TIPO_EXPLORACAO', descricao: 'Tipo de exploração', tipo: 'N', tamanho: 1, obrigatorio: 'S', valores: chaves(TIPO_EXPLORACAO) },
      { nome: 'PARTICIPACAO', descricao: 'Percentual de participação', tipo: 'N', tamanho: 5, decimais: 2, obrigatorio: 'S' },
    ],
  },
  '0045': {
    reg: '0045',
    descricao: 'Cadastro de terceiros vinculados ao imóvel',
    nivel: 3,
    minimo: 0,
    maximo: null,
    ordem: 3, // filho do 0040: aparece intercalado com ele
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['0045'] },
      { nome: 'COD_IMOVEL', descricao: 'Código do imóvel (igual ao 0040)', tipo: 'N', tamanho: 3, tamanhosExatos: [3], obrigatorio: 'S' },
      { nome: 'TIPO_CONTRAPARTE', descricao: 'Tipo de contraparte', tipo: 'N', tamanho: 1, obrigatorio: 'S', valores: chaves(TIPO_CONTRAPARTE) },
      { nome: 'ID_CONTRAPARTE', descricao: 'CPF ou CNPJ da contraparte', tipo: 'N', tamanho: 14, tamanhosExatos: [11, 14], obrigatorio: 'S' },
      { nome: 'NOME_CONTRAPARTE', descricao: 'Nome da contraparte', tipo: 'C', tamanho: 50, obrigatorio: 'S' },
      { nome: 'PERC_CONTRAPARTE', descricao: 'Percentual da contraparte', tipo: 'N', tamanho: 5, decimais: 2, obrigatorio: 'S' },
    ],
  },
  '0050': {
    reg: '0050',
    descricao: 'Cadastro das contas bancárias',
    nivel: 2,
    minimo: 1,
    maximo: null,
    ordem: 4,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['0050'] },
      { nome: 'COD_CONTA', descricao: 'Código da conta no LCDPR', tipo: 'N', tamanho: 3, tamanhosExatos: [3], obrigatorio: 'S' },
      { nome: 'PAIS_CTA', descricao: 'País da conta', tipo: 'C', tamanho: 3, obrigatorio: 'S' },
      { nome: 'BANCO', descricao: 'Código do banco (compensação)', tipo: 'N', tamanho: 3, obrigatorio: 'COND' },
      { nome: 'NOME_BANCO', descricao: 'Nome do banco', tipo: 'C', tamanho: 30, obrigatorio: 'S' },
      { nome: 'AGENCIA', descricao: 'Agência (sem dígito)', tipo: 'N', tamanho: 4, obrigatorio: 'S' },
      { nome: 'NUM_CONTA', descricao: 'Número da conta (com dígito)', tipo: 'N', tamanho: 16, obrigatorio: 'S' },
    ],
  },
  Q100: {
    reg: 'Q100',
    descricao: 'Demonstrativo do resultado da atividade rural (lançamentos)',
    nivel: 2,
    minimo: 0,
    maximo: null,
    ordem: 5,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['Q100'] },
      { nome: 'DATA', descricao: 'Data do lançamento', tipo: 'N', tamanho: 8, tamanhosExatos: [8], obrigatorio: 'S' },
      { nome: 'COD_IMOVEL', descricao: 'Código do imóvel (0040)', tipo: 'N', tamanho: 3, tamanhosExatos: [3], obrigatorio: 'S' },
      { nome: 'COD_CONTA', descricao: 'Código da conta (0050)', tipo: 'N', tamanho: 3, tamanhosExatos: [3], obrigatorio: 'S' },
      { nome: 'NUM_DOC', descricao: 'Número do documento', tipo: 'C', tamanho: C_LIVRE, obrigatorio: 'N' },
      { nome: 'TIPO_DOC', descricao: 'Tipo do documento', tipo: 'N', tamanho: 1, obrigatorio: 'S', valores: chaves(TIPO_DOC) },
      { nome: 'HIST', descricao: 'Histórico', tipo: 'C', tamanho: C_LIVRE, obrigatorio: 'S' },
      { nome: 'ID_PARTIC', descricao: 'CPF ou CNPJ do participante', tipo: 'N', tamanho: 14, tamanhosExatos: [11, 14], obrigatorio: 'S' },
      { nome: 'TIPO_LANC', descricao: 'Tipo de lançamento', tipo: 'N', tamanho: 1, obrigatorio: 'S', valores: chaves(TIPO_LANC) },
      { nome: 'VL_ENTRADA', descricao: 'Valor de entrada', tipo: 'N', tamanho: 19, decimais: 2, obrigatorio: 'S' },
      { nome: 'VL_SAIDA', descricao: 'Valor de saída', tipo: 'N', tamanho: 19, decimais: 2, obrigatorio: 'S' },
      { nome: 'SLD_FIN', descricao: 'Saldo após o lançamento', tipo: 'N', tamanho: 19, decimais: 2, obrigatorio: 'S' },
      { nome: 'NAT_SLD_FIN', descricao: 'Natureza do saldo', tipo: 'C', tamanho: 1, obrigatorio: 'S', valores: chaves(NAT_SLD) },
    ],
  },
  Q200: {
    reg: 'Q200',
    descricao: 'Resumo mensal',
    nivel: 2,
    minimo: 0,
    maximo: null,
    ordem: 6,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['Q200'] },
      { nome: 'MES', descricao: 'Mês (MMAAAA)', tipo: 'N', tamanho: 6, tamanhosExatos: [6], obrigatorio: 'S' },
      { nome: 'VL_ENTRADA', descricao: 'Total de entradas no mês', tipo: 'N', tamanho: 19, decimais: 2, obrigatorio: 'S' },
      { nome: 'VL_SAIDA', descricao: 'Total de saídas no mês', tipo: 'N', tamanho: 19, decimais: 2, obrigatorio: 'S' },
      { nome: 'SLD_FIN', descricao: 'Saldo acumulado até o mês', tipo: 'N', tamanho: 19, decimais: 2, obrigatorio: 'S' },
      { nome: 'NAT_SLD_FIN', descricao: 'Natureza do saldo', tipo: 'C', tamanho: 1, obrigatorio: 'S', valores: chaves(NAT_SLD) },
    ],
  },
  '9999': {
    reg: '9999',
    descricao: 'Encerramento e identificação do contador',
    nivel: 1,
    minimo: 1,
    maximo: 1,
    ordem: 7,
    campos: [
      { nome: 'REG', descricao: 'Tipo do registro', tipo: 'C', tamanho: 4, obrigatorio: 'S', valores: ['9999'] },
      { nome: 'IDENT_NOM', descricao: 'Nome do contador', tipo: 'C', tamanho: C_LIVRE, obrigatorio: 'N' },
      { nome: 'IDENT_CPF_CNPJ', descricao: 'CPF/CNPJ do contador', tipo: 'N', tamanho: 14, tamanhosExatos: [11, 14], obrigatorio: 'N' },
      { nome: 'IND_CRC', descricao: 'Inscrição no CRC', tipo: 'C', tamanho: C_LIVRE, obrigatorio: 'N' },
      { nome: 'EMAIL', descricao: 'E-mail', tipo: 'C', tamanho: 115, obrigatorio: 'N' },
      { nome: 'FONE', descricao: 'Telefone', tipo: 'N', tamanho: 15, obrigatorio: 'N' },
      { nome: 'QTD_LIN', descricao: 'Quantidade de linhas do arquivo', tipo: 'N', tamanho: 30, obrigatorio: 'S' },
    ],
  },
};

export function ehRegistroConhecido(reg: string): reg is CodigoRegistro {
  return Object.prototype.hasOwnProperty.call(LEIAUTE, reg);
}

/** Posição (base 0) de um campo pelo nome. Lança erro se o nome não existir: protege contra erro de digitação no código. */
export function indiceCampo(reg: CodigoRegistro, nome: string): number {
  const i = LEIAUTE[reg].campos.findIndex((c) => c.nome === nome);
  if (i < 0) throw new Error(`Campo ${nome} não existe no registro ${reg}`);
  return i;
}

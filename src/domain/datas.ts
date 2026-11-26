/**
 * Datas do LCDPR e calendário de feriados nacionais.
 *
 * O LCDPR usa DDMMAAAA (datas) e MMAAAA (meses). Internamente guardamos a data
 * como texto ISO "AAAA-MM-DD": é legível, ordena corretamente como texto e não
 * sofre com fuso horário (o objeto Date do JavaScript sofre).
 */

export interface DataLcdpr {
  ano: number;
  mes: number; // 1 a 12
  dia: number;
  iso: string; // AAAA-MM-DD
}

const diasNoMes = (ano: number, mes: number): number => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

export function criarData(ano: number, mes: number, dia: number): DataLcdpr {
  return { ano, mes, dia, iso: `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}` };
}

/** Lê "DDMMAAAA". Retorna null se não for uma data de calendário válida (ex.: 31022025). */
export function lerData(texto: string): DataLcdpr | null {
  if (!/^\d{8}$/.test(texto)) return null;
  const dia = Number(texto.slice(0, 2));
  const mes = Number(texto.slice(2, 4));
  const ano = Number(texto.slice(4, 8));
  if (ano < 1900 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
  return criarData(ano, mes, dia);
}

/** Lê "MMAAAA" e devolve a chave "AAAA-MM". */
export function lerMes(texto: string): string | null {
  if (!/^\d{6}$/.test(texto)) return null;
  const mes = Number(texto.slice(0, 2));
  const ano = Number(texto.slice(2, 6));
  if (ano < 1900 || mes < 1 || mes > 12) return null;
  return `${ano}-${doisDigitos(mes)}`;
}

/** Dia da semana: 0 = domingo … 6 = sábado. */
export function diaDaSemana(d: DataLcdpr): number {
  return new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay();
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

function somarDias(ano: number, mes: number, dia: number, n: number): string {
  const dt = new Date(Date.UTC(ano, mes - 1, dia + n));
  return `${dt.getUTCFullYear()}-${doisDigitos(dt.getUTCMonth() + 1)}-${doisDigitos(dt.getUTCDate())}`;
}

const cacheFeriados = new Map<number, Map<string, string>>();

/**
 * Feriados NACIONAIS (Lei nº 662/1949, Lei nº 6.802/1980, Lei nº 14.759/2023 para
 * 20/11 a partir de 2024) e Sexta-feira Santa. Carnaval e Corpus Christi são
 * pontos facultativos, incluídos porque o comércio bancário costuma não operar.
 * Feriados estaduais e municipais NÃO estão aqui.
 */
export function feriadosNacionais(ano: number): Map<string, string> {
  const pronto = cacheFeriados.get(ano);
  if (pronto) return pronto;
  const f = new Map<string, string>();
  const fixo = (mes: number, dia: number, nome: string): void => {
    f.set(`${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`, nome);
  };
  fixo(1, 1, 'Confraternização Universal');
  fixo(4, 21, 'Tiradentes');
  fixo(5, 1, 'Dia do Trabalho');
  fixo(9, 7, 'Independência');
  fixo(10, 12, 'Nossa Senhora Aparecida');
  fixo(11, 2, 'Finados');
  fixo(11, 15, 'Proclamação da República');
  if (ano >= 2024) fixo(11, 20, 'Dia Nacional de Zumbi e da Consciência Negra');
  fixo(12, 25, 'Natal');
  const p = pascoa(ano);
  f.set(somarDias(ano, p.mes, p.dia, -48), 'Carnaval (ponto facultativo)');
  f.set(somarDias(ano, p.mes, p.dia, -47), 'Carnaval (ponto facultativo)');
  f.set(somarDias(ano, p.mes, p.dia, -2), 'Sexta-feira Santa');
  f.set(somarDias(ano, p.mes, p.dia, 60), 'Corpus Christi (ponto facultativo)');
  cacheFeriados.set(ano, f);
  return f;
}

/** Nome do feriado ou do fim de semana, ou null se for dia útil. */
export function diaNaoUtil(d: DataLcdpr): string | null {
  const feriado = feriadosNacionais(d.ano).get(d.iso);
  if (feriado) return feriado;
  const dow = diaDaSemana(d);
  if (dow === 0) return 'Domingo';
  if (dow === 6) return 'Sábado';
  return null;
}

/** "2025-03-14" → "14/03/2025". */
export function formatarDataIso(iso: string): string {
  const [a, m, d] = iso.split('-');
  return d ? `${d}/${m}/${a}` : iso;
}

/** "2025-03" → "03/2025". */
export function formatarMesIso(chave: string): string {
  const [a, m] = chave.split('-');
  return m ? `${m}/${a}` : chave;
}

/** Fecha de negocio 'YYYY-MM-DD' en hora local del dispositivo, sin hora. */
export type FechaISO = string;

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const dos = (n: number) => String(n).padStart(2, '0');

/** Fecha local de hoy (o del `now` dado), usando getters locales. */
export function hoy(now: Date = new Date()): FechaISO {
  return aFecha(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Descompone 'YYYY-MM-DD'; m va de 1 a 12. */
export function parseFecha(f: FechaISO): { y: number; m: number; d: number } {
  const [y, m, d] = f.split('-').map(Number);
  return { y, m, d };
}

export function aFecha(y: number, m: number, d: number): FechaISO {
  return `${String(y).padStart(4, '0')}-${dos(m)}-${dos(d)}`;
}

export function diasEnMes(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function sumarDias(f: FechaISO, n: number): FechaISO {
  const { y, m, d } = parseFecha(f);
  const r = new Date(y, m - 1, d + n);
  return aFecha(r.getFullYear(), r.getMonth() + 1, r.getDate());
}

export function sumarMeses(y: number, m: number, n: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (((idx % 12) + 12) % 12) + 1 };
}

/** Fecha del día `dia` del mes, o el último día del mes si `dia` no existe en él. */
export function diaAcotado(y: number, m: number, dia: number): FechaISO {
  return aFecha(y, m, Math.min(dia, diasEnMes(y, m)));
}

/** 'YYYY-MM' */
export function mesClave(f: FechaISO): string {
  return f.slice(0, 7);
}

/** Mes `n` meses después (o antes, si `n` es negativo) de `mes` ('YYYY-MM'). */
export function moverMes(mes: string, n: number): string {
  const { y, m } = parseFecha(`${mes}-01`);
  const r = sumarMeses(y, m, n);
  return mesClave(aFecha(r.y, r.m, 1));
}

/** Días de `a` a `b` (positivo si b es posterior). */
export function diasEntre(a: FechaISO, b: FechaISO): number {
  const pa = parseFecha(a);
  const pb = parseFecha(b);
  const ta = new Date(pa.y, pa.m - 1, pa.d).getTime();
  const tb = new Date(pb.y, pb.m - 1, pb.d).getTime();
  return Math.round((tb - ta) / 86_400_000);
}

/** "27 oct" */
export function formatFechaCorta(f: FechaISO): string {
  const { m, d } = parseFecha(f);
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

/** "Octubre": nombre completo del mes de la fecha. */
export function nombreMes(f: FechaISO): string {
  return MESES[parseFecha(f).m - 1];
}

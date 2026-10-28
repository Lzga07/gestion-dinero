/** Monto en centavos enteros. */
export type Centavos = number;

/** Tope de un monto: 1.000 millones de pesos, en centavos. */
export const MAX_CENTAVOS = 100_000_000_000;

const MINUS = '−';

function agruparMiles(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formatea centavos como pesos es-AR: "$ 1.234.567" o "$ 1.234,50". Los negativos usan el signo menos U+2212. */
export function formatPesos(c: Centavos): string {
  const abs = Math.abs(c);
  const pesos = Math.floor(abs / 100);
  const centavos = abs % 100;
  const cuerpo =
    centavos === 0
      ? agruparMiles(pesos)
      : `${agruparMiles(pesos)},${String(centavos).padStart(2, '0')}`;
  return `${c < 0 ? MINUS : ''}$ ${cuerpo}`;
}

/**
 * Interpreta un monto tipeado en es-AR. El "." separa miles (grupos de 3) y la "," es
 * decimal (1 o 2 dígitos). Devuelve null si es inválido, negativo o supera MAX_CENTAVOS.
 */
export function parsePesos(s: string): Centavos | null {
  const limpio = s.replace(/\$/g, '').replace(/\s+/g, '');
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpio);
  if (!m) return null;
  const pesos = Number(m[1].replace(/\./g, ''));
  const decimales = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  const total = pesos * 100 + decimales;
  if (!Number.isSafeInteger(total) || total > MAX_CENTAVOS) return null;
  return total;
}

/** Interpreta un porcentaje tipeado ("40", "37,5", "33,33") y devuelve puntos básicos. Rango válido: (0, 100]. */
export function parsePorcentaje(s: string): number | null {
  const limpio = s.replace(/%/g, '').replace(/\s+/g, '');
  const m = /^(\d+)(?:,(\d{1,2}))?$/.exec(limpio);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + (m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0')));
  if (!Number.isSafeInteger(bp) || bp <= 0 || bp > 10000) return null;
  return bp;
}

/** Puntos básicos a texto: 4000 → "40 %", 3750 → "37,5 %". */
export function formatPorcentaje(bp: number): string {
  const entero = Math.trunc(bp / 100);
  const resto = Math.abs(bp % 100);
  const decimales = String(resto).padStart(2, '0').replace(/0+$/, '');
  return `${entero}${decimales ? `,${decimales}` : ''} %`;
}

/** base × bp / 10000, redondeado al centavo con la mitad hacia arriba (aritmética entera). */
export function aplicarPorcentaje(base: Centavos, bp: number): Centavos {
  return Math.floor((base * bp + 5000) / 10000);
}

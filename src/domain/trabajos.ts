import { type Centavos, MAX_CENTAVOS, aplicarPorcentaje, formatPesos, formatPorcentaje } from './money';
import type { TipoTrabajo } from './types';

export type EntradaTrabajo =
  | { forma: 'ARANCEL_FIJO'; tipo: TipoTrabajo | null; otroNombre?: string; otroMonto?: Centavos | null }
  | { forma: 'PORCENTAJE'; descripcion: string; montoCliente: Centavos | null; descuento: Centavos | null; porcentajeBp: number };

export type ErrorTrabajo = 'FALTA_TIPO' | 'FALTA_DESCRIPCION' | 'MONTO_INVALIDO' | 'DESCUENTO_MAYOR' | 'PORCENTAJE_INVALIDO';

export type ResultadoTrabajo =
  | { ok: true; monto: Centavos; descripcion: string; detalle: string }
  | { ok: false; error: ErrorTrabajo };

const error = (e: ErrorTrabajo): ResultadoTrabajo => ({ ok: false, error: e });

/** Monto positivo, entero y dentro del tope. */
const montoValido = (c: Centavos | null | undefined): c is Centavos =>
  typeof c === 'number' && Number.isInteger(c) && c > 0 && c <= MAX_CENTAVOS;

/** formatPesos sin el prefijo "$ ", para armar la cuenta visible. */
const sinPeso = (c: Centavos): string => formatPesos(c).replace(/^\$ /, '');

/** Calcula cuánto te corresponde por un trabajo (monto, descripción y la cuenta visible). */
export function calcularTrabajo(e: EntradaTrabajo): ResultadoTrabajo {
  if (e.forma === 'ARANCEL_FIJO') {
    if (e.tipo) {
      if (!montoValido(e.tipo.precio)) return error('MONTO_INVALIDO');
      return { ok: true, monto: e.tipo.precio, descripcion: e.tipo.nombre, detalle: '' };
    }
    if (e.otroNombre === undefined) return error('FALTA_TIPO');
    const descripcion = e.otroNombre.trim();
    if (!descripcion) return error('FALTA_DESCRIPCION');
    if (!montoValido(e.otroMonto)) return error('MONTO_INVALIDO');
    return { ok: true, monto: e.otroMonto, descripcion, detalle: '' };
  }

  const descripcion = e.descripcion.trim();
  if (!descripcion) return error('FALTA_DESCRIPCION');
  if (!Number.isInteger(e.porcentajeBp) || e.porcentajeBp <= 0 || e.porcentajeBp > 10000) {
    return error('PORCENTAJE_INVALIDO');
  }
  const { montoCliente, descuento } = e;
  if (!montoValido(montoCliente)) return error('MONTO_INVALIDO');
  if (descuento !== null && (!Number.isInteger(descuento) || descuento < 0 || descuento > MAX_CENTAVOS)) {
    return error('MONTO_INVALIDO');
  }
  const desc = descuento ?? 0;
  // Un descuento igual al total dejaría el trabajo en cero: también cuenta como "mayor".
  if (desc >= montoCliente) return error('DESCUENTO_MAYOR');

  const monto = aplicarPorcentaje(montoCliente - desc, e.porcentajeBp);
  if (monto <= 0) return error('MONTO_INVALIDO');
  const pct = formatPorcentaje(e.porcentajeBp);
  const detalle = desc > 0
    ? `(${sinPeso(montoCliente)} − ${sinPeso(desc)}) × ${pct}`
    : `${sinPeso(montoCliente)} × ${pct}`;
  return { ok: true, monto, descripcion, detalle };
}

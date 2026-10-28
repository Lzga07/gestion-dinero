import type { Centavos } from './money';
import type { FechaISO } from './dates';
import { type Periodo, periodoQueContiene } from './periodos';
import type { EstadoPago, Lugar, Pago, Trabajo } from './types';

/** ¿Hay que preguntar "a cuenta o final"? Cuando lo recibido no alcanza o quedó algún trabajo sin tildar. */
export function requierePregunta(esperado: Centavos, recibido: Centavos, destildados: number): boolean {
  return recibido < esperado || destildados > 0;
}

export interface CambioTrabajo {
  id: string;
  estado: EstadoPago;
  pagoId: string | null;
}

/**
 * Cambios que produce registrar un pago: los tildados pasan a PAGADO asociados al pago; los destildados
 * pasan a NO_PAGADO si el pago es FINAL; si es A_CUENTA conservan su estado (un NO_PAGADO sigue siendo deuda
 * declarada y un PENDIENTE sigue pendiente). Lo que no se ofrece no cambia.
 */
export function resolverPago(a: { pago: Pago; tildados: Trabajo[]; destildados: Trabajo[] }): CambioTrabajo[] {
  const estadoDestildado = (tr: Trabajo): EstadoPago =>
    a.pago.tipo === 'FINAL' || tr.estado === 'NO_PAGADO' ? 'NO_PAGADO' : 'PENDIENTE';
  return [
    ...a.tildados.map(tr => ({ id: tr.id, estado: 'PAGADO' as const, pagoId: a.pago.id })),
    ...a.destildados.map(tr => ({ id: tr.id, estado: estadoDestildado(tr), pagoId: null })),
  ];
}

/**
 * Lo que hace falta para conciliar un lugar, calculado en una sola pasada: el período de cada trabajo (una
 * vez por trabajo, no una vez por período), los trabajos y los pagos agrupados por período (en el orden en
 * que vinieron) y lo cobrado por período.
 */
interface Indice {
  porPeriodo: Map<FechaISO, { periodo: Periodo; trabajos: Trabajo[] }>;
  pagosPorFin: Map<FechaISO, Pago[]>;
  cobrado: Map<FechaISO, Centavos>;
}

function indexar(lugar: Lugar, trabajos: Trabajo[], pagos: Pago[]): Indice {
  const porPeriodo = new Map<FechaISO, { periodo: Periodo; trabajos: Trabajo[] }>();
  const finDe = new Map<string, FechaISO>();
  const porPago = new Map<string, Trabajo[]>();
  for (const tr of trabajos) {
    if (tr.lugarId !== lugar.id) continue;
    const periodo = periodoQueContiene(lugar.reglasCierre, tr.fecha);
    finDe.set(tr.id, periodo.fin);
    const grupo = porPeriodo.get(periodo.fin) ?? { periodo, trabajos: [] };
    grupo.trabajos.push(tr);
    porPeriodo.set(periodo.fin, grupo);
    if (tr.pagoId !== null) porPago.set(tr.pagoId, [...(porPago.get(tr.pagoId) ?? []), tr]);
  }

  // Cada pago asigna a cada trabajo tildado de otro período su `monto`; el resto (puede ser negativo) va
  // al `periodoFin` del pago.
  const pagosPorFin = new Map<FechaISO, Pago[]>();
  const cobrado = new Map<FechaISO, Centavos>();
  const sumar = (fin: FechaISO, c: Centavos) => cobrado.set(fin, (cobrado.get(fin) ?? 0) + c);
  for (const p of pagos) {
    if (p.lugarId !== lugar.id) continue;
    pagosPorFin.set(p.periodoFin, [...(pagosPorFin.get(p.periodoFin) ?? []), p]);
    let resto = p.monto;
    for (const tr of porPago.get(p.id) ?? []) {
      const fin = finDe.get(tr.id)!;
      if (fin === p.periodoFin) continue;
      sumar(fin, tr.monto);
      resto -= tr.monto;
    }
    sumar(p.periodoFin, resto);
  }
  return { porPeriodo, pagosPorFin, cobrado };
}

/**
 * Plata cobrada por período (clave: `fin`). Cada pago asigna a cada trabajo tildado de otro período su
 * `monto`; el resto (puede ser negativo) va al `periodoFin` del pago.
 */
export function cobradoPorPeriodo(lugar: Lugar, trabajos: Trabajo[], pagos: Pago[]): Map<FechaISO, Centavos> {
  return indexar(lugar, trabajos, pagos).cobrado;
}

export interface ResumenPeriodo {
  periodo: Periodo;
  cantidad: number;
  teCorresponde: Centavos;
  cobrado: Centavos;
  faltaCobrar: Centavos;
  pendientes: Trabajo[];
  noPagados: Trabajo[];
  deudaPlata: Centavos;
  /**
   * "A cuenta, falta cobrar": el período tiene pagos pero ninguno FINAL, y lo cobrado no llega a lo que
   * corresponde aunque se descuenten los trabajos pendientes y los no pagados. Al cerrar el período (pago
   * FINAL) esto pasa a ser `deudaPlata`.
   */
  faltaACuenta: Centavos;
  tienePagos: boolean;
  aFavor: Centavos;
}

const suma = (ts: Trabajo[]): Centavos => ts.reduce((s, tr) => s + tr.monto, 0);

function resumenDesde(idx: Indice, periodo: Periodo): ResumenPeriodo {
  const delPeriodo = idx.porPeriodo.get(periodo.fin)?.trabajos ?? [];
  const pendientes = delPeriodo.filter(tr => tr.estado === 'PENDIENTE');
  const noPagados = delPeriodo.filter(tr => tr.estado === 'NO_PAGADO');
  const pagosDelPeriodo = idx.pagosPorFin.get(periodo.fin) ?? [];
  const teCorresponde = suma(delPeriodo);
  const cobrado = idx.cobrado.get(periodo.fin) ?? 0;
  const faltaCobrar = teCorresponde - cobrado;
  const hayFinal = pagosDelPeriodo.some(p => p.tipo === 'FINAL');
  const faltaEnPlata = Math.max(0, faltaCobrar - suma(pendientes) - suma(noPagados));
  const deudaPlata = hayFinal ? faltaEnPlata : 0;
  const faltaACuenta = !hayFinal && pagosDelPeriodo.length > 0 ? faltaEnPlata : 0;
  return {
    periodo,
    cantidad: delPeriodo.length,
    teCorresponde,
    cobrado,
    faltaCobrar,
    pendientes,
    noPagados,
    deudaPlata,
    faltaACuenta,
    tienePagos: pagosDelPeriodo.length > 0,
    aFavor: Math.max(0, -faltaCobrar),
  };
}

export function resumenPeriodo(lugar: Lugar, periodo: Periodo, trabajos: Trabajo[], pagos: Pago[]): ResumenPeriodo {
  return resumenDesde(indexar(lugar, trabajos, pagos), periodo);
}

/**
 * Para resumir muchos períodos del mismo lugar sin recalcular todo cada vez: `periodosConTrabajos` (del más
 * viejo al más nuevo) y `resumen(periodo)`, que da lo mismo que `resumenPeriodo`.
 */
export function conciliacionDelLugar(lugar: Lugar, trabajos: Trabajo[], pagos: Pago[]): {
  periodosConTrabajos: Periodo[];
  resumen: (periodo: Periodo) => ResumenPeriodo;
} {
  const idx = indexar(lugar, trabajos, pagos);
  const periodosConTrabajos = [...idx.porPeriodo.values()]
    .map(g => g.periodo)
    .sort((a, b) => (a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : 0));
  return { periodosConTrabajos, resumen: periodo => resumenDesde(idx, periodo) };
}

const porFecha = (a: Trabajo, b: Trabajo) =>
  a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0;

/**
 * Lista para tildar al registrar un pago: lo sin pagar del período elegido y lo atrasado de períodos
 * anteriores (del más nuevo al más viejo), cada lista por fecha.
 */
export function trabajosOfrecidosParaPago(
  lugar: Lugar,
  periodoFin: FechaISO,
  trabajos: Trabajo[],
): { delPeriodo: Trabajo[]; anteriores: { periodo: Periodo; trabajos: Trabajo[] }[] } {
  const delPeriodo: Trabajo[] = [];
  const porPeriodo = new Map<FechaISO, { periodo: Periodo; trabajos: Trabajo[] }>();
  for (const tr of trabajos) {
    if (tr.lugarId !== lugar.id || tr.estado === 'PAGADO') continue;
    const periodo = periodoQueContiene(lugar.reglasCierre, tr.fecha);
    if (periodo.fin === periodoFin) delPeriodo.push(tr);
    else if (periodo.fin < periodoFin) {
      const grupo = porPeriodo.get(periodo.fin) ?? { periodo, trabajos: [] };
      grupo.trabajos.push(tr);
      porPeriodo.set(periodo.fin, grupo);
    }
  }
  const anteriores = [...porPeriodo.values()]
    .sort((x, y) => (x.periodo.fin < y.periodo.fin ? 1 : -1))
    .map(g => ({ ...g, trabajos: g.trabajos.sort(porFecha) }));
  return { delPeriodo: delPeriodo.sort(porFecha), anteriores };
}

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

function finDe(lugar: Lugar, tr: Trabajo): FechaISO {
  return periodoQueContiene(lugar.reglasCierre, tr.fecha).fin;
}

/**
 * Plata cobrada por período (clave: `fin`). Cada pago asigna a cada trabajo tildado de otro período su
 * `monto`; el resto (puede ser negativo) va al `periodoFin` del pago.
 */
export function cobradoPorPeriodo(lugar: Lugar, trabajos: Trabajo[], pagos: Pago[]): Map<FechaISO, Centavos> {
  const delLugar = trabajos.filter(tr => tr.lugarId === lugar.id);
  const cobrado = new Map<FechaISO, Centavos>();
  const sumar = (fin: FechaISO, c: Centavos) => cobrado.set(fin, (cobrado.get(fin) ?? 0) + c);
  for (const p of pagos) {
    if (p.lugarId !== lugar.id) continue;
    let resto = p.monto;
    for (const tr of delLugar) {
      if (tr.pagoId !== p.id) continue;
      const fin = finDe(lugar, tr);
      if (fin === p.periodoFin) continue;
      sumar(fin, tr.monto);
      resto -= tr.monto;
    }
    sumar(p.periodoFin, resto);
  }
  return cobrado;
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
  tienePagos: boolean;
  aFavor: Centavos;
}

const suma = (ts: Trabajo[]): Centavos => ts.reduce((s, tr) => s + tr.monto, 0);

export function resumenPeriodo(lugar: Lugar, periodo: Periodo, trabajos: Trabajo[], pagos: Pago[]): ResumenPeriodo {
  const delPeriodo = trabajos.filter(tr => tr.lugarId === lugar.id && finDe(lugar, tr) === periodo.fin);
  const pendientes = delPeriodo.filter(tr => tr.estado === 'PENDIENTE');
  const noPagados = delPeriodo.filter(tr => tr.estado === 'NO_PAGADO');
  const pagosDelPeriodo = pagos.filter(p => p.lugarId === lugar.id && p.periodoFin === periodo.fin);
  const teCorresponde = suma(delPeriodo);
  const cobrado = cobradoPorPeriodo(lugar, trabajos, pagos).get(periodo.fin) ?? 0;
  const faltaCobrar = teCorresponde - cobrado;
  const hayFinal = pagosDelPeriodo.some(p => p.tipo === 'FINAL');
  const deudaPlata = hayFinal ? Math.max(0, faltaCobrar - suma(pendientes) - suma(noPagados)) : 0;
  return {
    periodo,
    cantidad: delPeriodo.length,
    teCorresponde,
    cobrado,
    faltaCobrar,
    pendientes,
    noPagados,
    deudaPlata,
    tienePagos: pagosDelPeriodo.length > 0,
    aFavor: Math.max(0, -faltaCobrar),
  };
}

/** Lista para tildar al registrar un pago: lo sin pagar del período elegido y lo atrasado de períodos anteriores. */
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
  const anteriores = [...porPeriodo.values()].sort((x, y) => (x.periodo.fin < y.periodo.fin ? 1 : -1));
  return { delPeriodo, anteriores };
}

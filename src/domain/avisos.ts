import { type FechaISO, diasEntre, hoy as fechaLocal } from './dates';
import { resumenPeriodo } from './conciliacion';
import type { Centavos } from './money';
import { type Periodo, periodoQueContiene, ventanaPago } from './periodos';
import type { Lugar, Pago, Trabajo } from './types';

export type Aviso =
  | { tipo: 'PAGO_ATRASADO'; lugarId: string; periodo: Periodo; monto: Centavos }
  /**
   * Vencida la ventana de pago, el período tiene trabajos PENDIENTE (`trabajos`) y/o pagos solo a cuenta que
   * no llegan a lo que corresponde (`faltaACuenta`). `monto` = suma de `trabajos` + `faltaACuenta`.
   */
  | { tipo: 'SIN_CONCILIAR'; lugarId: string; periodo: Periodo; trabajos: Trabajo[]; faltaACuenta: Centavos; monto: Centavos }
  | { tipo: 'DEUDA'; lugarId: string; noPagados: Trabajo[]; deudasPlata: { periodo: Periodo; monto: Centavos }[]; monto: Centavos }
  | { tipo: 'COPIA'; diasSinCopia: number | null }; // null = nunca se hizo

const suma = (ts: Trabajo[]): Centavos => ts.reduce((s, tr) => s + tr.monto, 0);
const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es');

/** Períodos del lugar que contienen al menos uno de sus trabajos, del más viejo al más nuevo. */
function periodosConTrabajos(lugar: Lugar, trabajos: Trabajo[]): Periodo[] {
  const porFin = new Map<FechaISO, Periodo>();
  for (const tr of trabajos) {
    if (tr.lugarId !== lugar.id) continue;
    const p = periodoQueContiene(lugar.reglasCierre, tr.fecha);
    porFin.set(p.fin, p);
  }
  return [...porFin.values()].sort((a, b) => (a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : 0));
}

export function calcularAvisos(a: {
  hoy: FechaISO;
  lugares: Lugar[];
  trabajos: Trabajo[];
  pagos: Pago[];
  ultimaCopia: string | null;
  recordatorioDias: number;
  hayDatos: boolean;
}): Aviso[] {
  const atrasados: { fin: FechaISO; lugar: Lugar; aviso: Aviso }[] = [];
  const sinConciliar: { fin: FechaISO; lugar: Lugar; aviso: Aviso }[] = [];
  const deudas: { lugar: Lugar; aviso: Aviso }[] = [];

  for (const lugar of a.lugares) {
    const noPagados: Trabajo[] = [];
    const deudasPlata: { periodo: Periodo; monto: Centavos }[] = [];
    for (const periodo of periodosConTrabajos(lugar, a.trabajos)) {
      const r = resumenPeriodo(lugar, periodo, a.trabajos, a.pagos);
      noPagados.push(...r.noPagados);
      if (r.deudaPlata > 0) deudasPlata.push({ periodo, monto: r.deudaPlata });

      const vencida = a.hoy > ventanaPago(periodo.fin, lugar.pagoDesdeDia, lugar.pagoHastaDia).hasta;
      if (!vencida || (r.pendientes.length === 0 && r.faltaACuenta === 0)) continue;
      if (r.tienePagos) {
        sinConciliar.push({
          fin: periodo.fin, lugar,
          aviso: {
            tipo: 'SIN_CONCILIAR', lugarId: lugar.id, periodo, trabajos: r.pendientes,
            faltaACuenta: r.faltaACuenta, monto: suma(r.pendientes) + r.faltaACuenta,
          },
        });
      } else {
        atrasados.push({
          fin: periodo.fin, lugar,
          aviso: { tipo: 'PAGO_ATRASADO', lugarId: lugar.id, periodo, monto: r.teCorresponde },
        });
      }
    }
    const monto = suma(noPagados) + deudasPlata.reduce((s, d) => s + d.monto, 0);
    if (noPagados.length > 0 || monto > 0) {
      deudas.push({ lugar, aviso: { tipo: 'DEUDA', lugarId: lugar.id, noPagados, deudasPlata, monto } });
    }
  }

  const porFinYNombre = (x: { fin: FechaISO; lugar: Lugar }, y: { fin: FechaISO; lugar: Lugar }) =>
    x.fin < y.fin ? -1 : x.fin > y.fin ? 1 : porNombre(x.lugar, y.lugar);

  const avisos: Aviso[] = [
    ...atrasados.sort(porFinYNombre).map(x => x.aviso),
    ...deudas.sort((x, y) => porNombre(x.lugar, y.lugar)).map(x => x.aviso),
    ...sinConciliar.sort(porFinYNombre).map(x => x.aviso),
  ];

  if (a.recordatorioDias > 0 && a.hayDatos) {
    const dias = a.ultimaCopia === null ? null : diasEntre(fechaLocal(new Date(a.ultimaCopia)), a.hoy);
    if (dias === null || dias >= a.recordatorioDias) avisos.push({ tipo: 'COPIA', diasSinCopia: dias });
  }
  return avisos;
}

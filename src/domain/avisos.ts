import { type FechaISO, diasEntre, hoy as fechaLocal } from './dates';
import { conciliacionDelLugar } from './conciliacion';
import { avisoDeuda, deudasDelLugar, soloRecientes } from './deudas';
import type { Centavos } from './money';
import { type Periodo, ventanaPago } from './periodos';
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

export type AvisoDeuda = Extract<Aviso, { tipo: 'DEUDA' }>;

const suma = (ts: Trabajo[]): Centavos => ts.reduce((s, tr) => s + tr.monto, 0);
const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es');

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
    const conciliacion = conciliacionDelLugar(lugar, a.trabajos, a.pagos);
    // Solo la deuda reciente avisa en Inicio; la vieja vive en "Me deben".
    const deuda = deudasDelLugar(lugar, conciliacion, a.hoy);
    const reciente = deuda === null ? null : soloRecientes(deuda);
    if (reciente !== null) deudas.push({ lugar, aviso: avisoDeuda(reciente) });
    for (const periodo of conciliacion.periodosConTrabajos) {
      const r = conciliacion.resumen(periodo);
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
  }

  const porFinYNombre = (x: { fin: FechaISO; lugar: Lugar }, y: { fin: FechaISO; lugar: Lugar }) =>
    x.fin < y.fin ? -1 : x.fin > y.fin ? 1 : porNombre(x.lugar, y.lugar);

  const avisos: Aviso[] = [
    ...atrasados.sort(porFinYNombre).map(x => x.aviso),
    ...deudas.sort((x, y) => porNombre(x.lugar, y.lugar)).map(x => x.aviso),
    ...sinConciliar.sort(porFinYNombre).map(x => x.aviso),
  ];

  if (a.recordatorioDias > 0 && a.hayDatos) {
    // Una fecha que no se puede leer cuenta como "nunca": mejor avisar de más que dejar de recordar la copia.
    const cuando = a.ultimaCopia === null ? null : new Date(a.ultimaCopia);
    const dias = cuando === null || Number.isNaN(cuando.getTime()) ? null : diasEntre(fechaLocal(cuando), a.hoy);
    if (dias === null || dias >= a.recordatorioDias) avisos.push({ tipo: 'COPIA', diasSinCopia: dias });
  }
  return avisos;
}

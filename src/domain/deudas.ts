import { type FechaISO, diaAcotado, parseFecha, sumarMeses } from './dates';
import { conciliacionDelLugar } from './conciliacion';
import type { AvisoDeuda } from './avisos';
import type { Centavos } from './money';
import type { Periodo } from './periodos';
import type { Lugar, Pago, Trabajo } from './types';

/** Pasados estos meses desde el fin del período, la deuda deja de ser "reciente" y pasa a "Me deben". */
export const MESES_DEUDA_VIEJA = 2;

/** ¿La deuda de un período que cerró en `periodoFin` ya es vieja? Hoy > mismo día + 2 meses (acotado a fin de mes). */
export function esDeudaVieja(periodoFin: FechaISO, hoy: FechaISO): boolean {
  const { y, m, d } = parseFecha(periodoFin);
  const limite = sumarMeses(y, m, MESES_DEUDA_VIEJA);
  return hoy > diaAcotado(limite.y, limite.m, d);
}

/** Lo que se debe de un período: trabajos no pagados + diferencia en plata. */
export interface DeudaPeriodo {
  periodo: Periodo;
  noPagados: Trabajo[];
  plata: Centavos;
  monto: Centavos;
  vieja: boolean;
}

export interface DeudasLugar {
  lugar: Lugar;
  /** Del más viejo al más nuevo. */
  periodos: DeudaPeriodo[];
  monto: Centavos;
}

const suma = (ts: Trabajo[]): Centavos => ts.reduce((s, tr) => s + tr.monto, 0);

/** Por fecha y, a igual fecha, en el orden en que se anotaron (la base los devuelve por id, que es un uuid). */
const porFechaYCarga = (x: Trabajo, y: Trabajo): number =>
  x.fecha !== y.fecha ? (x.fecha < y.fecha ? -1 : 1) : x.creadoEn < y.creadoEn ? -1 : x.creadoEn > y.creadoEn ? 1 : 0;

type Conciliacion = ReturnType<typeof conciliacionDelLugar>;

/** La deuda de un lugar ya conciliado, o null si no debe nada. (Evita conciliar dos veces cuando ya se tiene.) */
export function deudasDelLugar(lugar: Lugar, conciliacion: Conciliacion, hoy: FechaISO): DeudasLugar | null {
  const periodos: DeudaPeriodo[] = [];
  for (const periodo of conciliacion.periodosConTrabajos) {
    const r = conciliacion.resumen(periodo);
    const monto = suma(r.noPagados) + r.deudaPlata;
    if (r.noPagados.length === 0 && monto <= 0) continue;
    periodos.push({ periodo, noPagados: [...r.noPagados].sort(porFechaYCarga), plata: r.deudaPlata, monto, vieja: esDeudaVieja(periodo.fin, hoy) });
  }
  return periodos.length === 0 ? null : { lugar, periodos, monto: periodos.reduce((s, p) => s + p.monto, 0) };
}

/** Los lugares con deuda (archivados incluidos), por nombre, con sus períodos adeudados. */
export function deudasPorLugar(a: { hoy: FechaISO; lugares: Lugar[]; trabajos: Trabajo[]; pagos: Pago[] }): DeudasLugar[] {
  const resultado: DeudasLugar[] = [];
  for (const lugar of a.lugares) {
    const d = deudasDelLugar(lugar, conciliacionDelLugar(lugar, a.trabajos, a.pagos), a.hoy);
    if (d !== null) resultado.push(d);
  }
  return resultado.sort((x, y) => x.lugar.nombre.localeCompare(y.lugar.nombre, 'es'));
}

function filtrar(d: DeudasLugar, vieja: boolean): DeudasLugar | null {
  const periodos = d.periodos.filter(p => p.vieja === vieja);
  return periodos.length === 0 ? null : { ...d, periodos, monto: periodos.reduce((s, p) => s + p.monto, 0) };
}

/** Solo los períodos de deuda reciente, o null si no queda ninguno. */
export const soloRecientes = (d: DeudasLugar): DeudasLugar | null => filtrar(d, false);

/** Solo los períodos de deuda vieja, o null si no queda ninguno. */
export const soloViejas = (d: DeudasLugar): DeudasLugar | null => filtrar(d, true);

/** La deuda de un lugar con la forma de aviso (la que usan la tarjeta, "Ya me lo pagaron" y el reclamo). */
export function avisoDeuda(d: DeudasLugar): AvisoDeuda {
  const noPagados = d.periodos.flatMap(p => p.noPagados).sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : 0));
  const deudasPlata = d.periodos.filter(p => p.plata > 0).map(p => ({ periodo: p.periodo, monto: p.plata }));
  return { tipo: 'DEUDA', lugarId: d.lugar.id, noPagados, deudasPlata, monto: d.monto };
}

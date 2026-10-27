import {
  type FechaISO,
  aFecha,
  diaAcotado,
  diasEnMes,
  formatFechaCorta,
  parseFecha,
  sumarDias,
  sumarMeses,
} from './dates';

/** Día de cierre del período: 1..31, o 'ULTIMO' (último día de cada mes). */
export type DiaCierre = number | 'ULTIMO';
export interface ReglaCierre {
  vigenteDesde: FechaISO;
  dia: DiaCierre;
}
/** `fin` identifica el período. */
export interface Periodo {
  inicio: FechaISO;
  fin: FechaISO;
}

export const INICIO_DE_LOS_TIEMPOS = '1900-01-01';

/** Fecha de cierre dentro del mes (y, m); un día inexistente se acota al último del mes. */
export function cierreEnMes(y: number, m: number, dia: DiaCierre): FechaISO {
  return aFecha(y, m, dia === 'ULTIMO' ? diasEnMes(y, m) : Math.min(dia, diasEnMes(y, m)));
}

/** Primer cierre >= `desde`. */
export function siguienteCierre(desde: FechaISO, dia: DiaCierre): FechaISO {
  const { y, m } = parseFecha(desde);
  const delMes = cierreEnMes(y, m, dia);
  if (delMes >= desde) return delMes;
  const sig = sumarMeses(y, m, 1);
  return cierreEnMes(sig.y, sig.m, dia);
}

/** Cierre del mes anterior al de `fin`, con la misma regla. */
function cierreAnterior(fin: FechaISO, dia: DiaCierre): FechaISO {
  const { y, m } = parseFecha(fin);
  const ant = sumarMeses(y, m, -1);
  return cierreEnMes(ant.y, ant.m, dia);
}

/** Última regla con `vigenteDesde <= fecha`; si no hay (fecha anterior a todas), la más antigua. */
function reglaVigente(reglas: ReglaCierre[], fecha: FechaISO): ReglaCierre {
  let elegida: ReglaCierre | undefined;
  let masAntigua: ReglaCierre | undefined;
  for (const r of reglas) {
    if (!masAntigua || r.vigenteDesde < masAntigua.vigenteDesde) masAntigua = r;
    if (r.vigenteDesde <= fecha && (!elegida || r.vigenteDesde >= elegida.vigenteDesde)) elegida = r;
  }
  const regla = elegida ?? masAntigua;
  if (!regla) throw new Error('Se necesita al menos una regla de cierre');
  return regla;
}

export function periodoQueContiene(reglas: ReglaCierre[], fecha: FechaISO): Periodo {
  const r = reglaVigente(reglas, fecha);
  const fin = siguienteCierre(fecha, r.dia);
  const despuesDelAnterior = sumarDias(cierreAnterior(fin, r.dia), 1);
  const inicio = r.vigenteDesde > despuesDelAnterior ? r.vigenteDesde : despuesDelAnterior;
  return { inicio, fin };
}

/** Períodos que tocan [desde, hasta], del más nuevo al más viejo. */
export function periodosEntre(reglas: ReglaCierre[], desde: FechaISO, hasta: FechaISO): Periodo[] {
  const lista: Periodo[] = [];
  let p = periodoQueContiene(reglas, hasta);
  while (p.fin >= desde) {
    lista.push(p);
    if (p.inicio <= INICIO_DE_LOS_TIEMPOS) break;
    p = periodoQueContiene(reglas, sumarDias(p.inicio, -1));
  }
  return lista;
}

/** El cambio rige desde el próximo período; reemplaza cualquier cambio futuro ya anotado. */
export function cambiarDiaCierre(reglas: ReglaCierre[], nuevo: DiaCierre, hoy: FechaISO): ReglaCierre[] {
  const vigentes = reglas.filter(r => r.vigenteDesde <= hoy);
  const { fin } = periodoQueContiene(vigentes, hoy);
  return [...vigentes, { vigenteDesde: sumarDias(fin, 1), dia: nuevo }];
}

/** Ventana de pago: días `desdeDia`..`hastaDia` del mes siguiente al cierre, acotados al fin de mes. */
export function ventanaPago(
  periodoFin: FechaISO,
  desdeDia: number,
  hastaDia: number,
): { desde: FechaISO; hasta: FechaISO } {
  const { y, m } = parseFecha(periodoFin);
  const sig = sumarMeses(y, m, 1);
  return { desde: diaAcotado(sig.y, sig.m, desdeDia), hasta: diaAcotado(sig.y, sig.m, hastaDia) };
}

/** "1 – 31 oct" (mismo mes) o "16 oct – 15 nov". */
export function nombrePeriodo(p: Periodo): string {
  const a = parseFecha(p.inicio);
  const b = parseFecha(p.fin);
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${formatFechaCorta(p.fin)}`;
  return `${formatFechaCorta(p.inicio)} – ${formatFechaCorta(p.fin)}`;
}

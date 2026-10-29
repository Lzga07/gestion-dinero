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

/**
 * Regla efectiva para `fecha`: la última con `vigenteDesde <= fecha`. La regla más antigua rige desde
 * el inicio de los tiempos aunque su `vigenteDesde` sea posterior, así el período siempre contiene la
 * fecha y los períodos quedan contiguos.
 */
function reglaVigente(reglas: ReglaCierre[], fecha: FechaISO): ReglaCierre {
  let elegida: ReglaCierre | undefined;
  let masAntigua: ReglaCierre | undefined;
  for (const r of reglas) {
    if (!masAntigua || r.vigenteDesde < masAntigua.vigenteDesde) masAntigua = r;
    if (r.vigenteDesde <= fecha && (!elegida || r.vigenteDesde >= elegida.vigenteDesde)) elegida = r;
  }
  if (!masAntigua) throw new Error('Se necesita al menos una regla de cierre');
  if (!elegida || elegida === masAntigua) return { vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: masAntigua.dia };
  return elegida;
}

export function periodoQueContiene(reglas: ReglaCierre[], fecha: FechaISO): Periodo {
  const r = reglaVigente(reglas, fecha);
  const fin = siguienteCierre(fecha, r.dia);
  const despuesDelAnterior = sumarDias(cierreAnterior(fin, r.dia), 1);
  const inicio = r.vigenteDesde > despuesDelAnterior ? r.vigenteDesde : despuesDelAnterior;
  return { inicio, fin };
}

/** Período contiguo anterior (sin saltear ni repetir aunque haya cambiado la regla de cierre). */
export function periodoAnterior(reglas: ReglaCierre[], p: Periodo): Periodo {
  return periodoQueContiene(reglas, sumarDias(p.inicio, -1));
}

/** Período contiguo siguiente. */
export function periodoSiguiente(reglas: ReglaCierre[], p: Periodo): Periodo {
  return periodoQueContiene(reglas, sumarDias(p.fin, 1));
}

/** Días del período, de `inicio` a `fin` (o a `hoy`, si el período sigue abierto). */
export function diasDelPeriodo(p: Periodo, hoy: FechaISO): FechaISO[] {
  const ultimo = p.fin < hoy ? p.fin : hoy;
  const dias: FechaISO[] = [];
  for (let d = p.inicio; d <= ultimo; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

/** Períodos que tocan [desde, hasta], del más nuevo al más viejo. */
export function periodosEntre(reglas: ReglaCierre[], desde: FechaISO, hasta: FechaISO): Periodo[] {
  const lista: Periodo[] = [];
  let p = periodoQueContiene(reglas, hasta);
  while (p.fin >= desde) {
    lista.push(p);
    if (p.inicio <= INICIO_DE_LOS_TIEMPOS) break;
    const anterior = periodoQueContiene(reglas, sumarDias(p.inicio, -1));
    if (anterior.inicio >= p.inicio) break; // garantiza progreso
    p = anterior;
  }
  return lista;
}

/** El cambio rige desde el próximo período; reemplaza cualquier cambio futuro ya anotado. */
export function cambiarDiaCierre(reglas: ReglaCierre[], nuevo: DiaCierre, hoy: FechaISO): ReglaCierre[] {
  let vigentes = reglas.filter(r => r.vigenteDesde <= hoy);
  if (vigentes.length === 0 && reglas.length > 0) {
    // `hoy` es anterior a todas las reglas: se conserva la más antigua como base de la historia.
    vigentes = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: reglaVigente(reglas, hoy).dia }];
  }
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

/** Fecha de pago sugerida: el primer día de la ventana de pago, sin pasar de hoy. */
export function fechaPagoPropuesta(p: Periodo, desdeDia: number, hastaDia: number, hoy: FechaISO): FechaISO {
  const { desde } = ventanaPago(p.fin, desdeDia, hastaDia);
  return desde < hoy ? desde : hoy;
}

/** "1 – 31 oct" (mismo mes) o "16 oct – 15 nov". */
export function nombrePeriodo(p: Periodo): string {
  const a = parseFecha(p.inicio);
  const b = parseFecha(p.fin);
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${formatFechaCorta(p.fin)}`;
  return `${formatFechaCorta(p.inicio)} – ${formatFechaCorta(p.fin)}`;
}

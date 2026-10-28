import { type FechaISO, diaAcotado, parseFecha, sumarMeses } from './dates';
import { slug } from './texto';
import type { Lugar } from './types';

const CRLF = '\r\n';
const MAX_OCTETOS = 75;

/** Escapa texto según RFC 5545: \ ; , y saltos de línea. */
function escaparTexto(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Pliega una línea a 75 octetos UTF-8 (sin cortar caracteres); las continuaciones empiezan con un espacio. */
function plegar(linea: string): string {
  const enc = new TextEncoder();
  const partes: string[] = [];
  let actual = '';
  let bytes = 0;
  for (const ch of linea) {
    const n = enc.encode(ch).length;
    // las continuaciones llevan un espacio inicial que también cuenta
    const tope = partes.length === 0 ? MAX_OCTETOS : MAX_OCTETOS - 1;
    if (bytes + n > tope) {
      partes.push(actual);
      actual = '';
      bytes = 0;
    }
    actual += ch;
    bytes += n;
  }
  partes.push(actual);
  return partes.join(CRLF + ' ');
}

/** Primera fecha >= hoy en que cae el recordatorio: el día `hastaDia`, o el último del mes si no existe. */
function proximaOcurrencia(hastaDia: number, hoy: FechaISO): FechaISO {
  const { y, m } = parseFecha(hoy);
  const delMes = diaAcotado(y, m, hastaDia);
  if (delMes >= hoy) return delMes;
  const sig = sumarMeses(y, m, 1);
  return diaAcotado(sig.y, sig.m, hastaDia);
}

/**
 * Regla de repetición (RFC 5545) que cae cada mes en min(`hastaDia`, último día del mes), igual que
 * `ventanaPago`:
 * - 1 a 28: existe en todos los meses → `BYMONTHDAY=<día>`.
 * - 31: el último día de cada mes → `BYMONTHDAY=-1`.
 * - 29 y 30: `BYMONTHDAY=28,…,<día>;BYSETPOS=-1`. Los días que no existen en un mes se ignoran
 *   (§3.3.10) y BYSETPOS=-1 elige el mayor de los que quedan: febrero → 28 (29 si es bisiesto), un mes de
 *   30 → 29 o 30, uno de 31 → 29 o 30 (nunca el 31). El 28 está en todos los meses, así que siempre hay uno.
 */
export function reglaMensual(hastaDia: number): string {
  if (hastaDia <= 28) return `FREQ=MONTHLY;BYMONTHDAY=${hastaDia}`;
  if (hastaDia >= 31) return 'FREQ=MONTHLY;BYMONTHDAY=-1';
  const dias = Array.from({ length: hastaDia - 27 }, (_, i) => 28 + i).join(',');
  return `FREQ=MONTHLY;BYMONTHDAY=${dias};BYSETPOS=-1`;
}

/**
 * Evento mensual a las 10:00 (hora flotante) el último día del rango de pago del lugar (acotado al fin de
 * cada mes), con una alarma en el momento.
 */
export function armarIcsLugar(lugar: Lugar, hoy: FechaISO): string {
  const inicio = proximaOcurrencia(lugar.pagoHastaDia, hoy).replaceAll('-', '');
  const texto = `Revisar pago de ${escaparTexto(lugar.nombre)}`;
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gestion Dinero//ES',
    'BEGIN:VEVENT',
    `UID:pago-${lugar.id}@gestion-dinero`,
    `DTSTAMP:${hoy.replaceAll('-', '')}T000000Z`,
    `DTSTART:${inicio}T100000`,
    'DURATION:PT30M',
    `RRULE:${reglaMensual(lugar.pagoHastaDia)}`,
    `SUMMARY:${texto}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    `DESCRIPTION:${texto}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lineas.map(plegar).join(CRLF) + CRLF;
}

/** `pago-<lugar>.ics` */
export function nombreArchivoCalendario(lugar: Lugar): string {
  return `pago-${slug(lugar.nombre) || 'lugar'}.ics`;
}

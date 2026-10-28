import { type FechaISO, aFecha, diasEnMes, parseFecha, sumarMeses } from './dates';
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

/** Primera fecha >= hoy en que cae el recordatorio. */
function proximaOcurrencia(hastaDia: number, hoy: FechaISO): FechaISO {
  const { y, m, d } = parseFecha(hoy);
  if (hastaDia >= 29) return aFecha(y, m, diasEnMes(y, m));
  if (hastaDia >= d) return aFecha(y, m, hastaDia);
  const sig = sumarMeses(y, m, 1);
  return aFecha(sig.y, sig.m, hastaDia);
}

/**
 * Evento mensual a las 10:00 (hora flotante) el último día del rango de pago del lugar,
 * con una alarma en el momento. Si `hastaDia >= 29` se repite el último día de cada mes.
 */
export function armarIcsLugar(lugar: Lugar, hoy: FechaISO): string {
  const ultimoDia = lugar.pagoHastaDia >= 29;
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
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${ultimoDia ? -1 : lugar.pagoHastaDia}`,
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

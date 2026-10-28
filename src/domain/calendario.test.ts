import { describe, expect, test } from 'vitest';
import { armarIcsLugar, nombreArchivoCalendario } from './calendario';
import { INICIO_DE_LOS_TIEMPOS } from './periodos';
import type { Lugar } from './types';

const lugar: Lugar = {
  id: 'L1', nombre: 'Clínica Centro', formaCobro: 'ARANCEL_FIJO', porcentajeBp: null,
  reglasCierre: [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 'ULTIMO' }],
  pagoDesdeDia: 21, pagoHastaDia: 31, archivado: false, creadoEn: '',
};

describe('armarIcsLugar', () => {
  test('ICS mensual del día 31 usa el último día del mes', () => {
    const ics = armarIcsLugar({ ...lugar, nombre: 'Clínica Centro', pagoHastaDia: 31 }, '2026-10-27');
    expect(ics).toContain('SUMMARY:Revisar pago de Clínica Centro');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1');
    expect(ics).toContain('DTSTART:20261031T100000');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.split('\r\n').length).toBeGreaterThan(5);
  });

  test('estructura completa, con CRLF y UID estable', () => {
    const lineas = armarIcsLugar(lugar, '2026-10-27').split('\r\n');
    expect(lineas[0]).toBe('BEGIN:VCALENDAR');
    expect(lineas).toContain('VERSION:2.0');
    expect(lineas).toContain('PRODID:-//Gestion Dinero//ES');
    expect(lineas).toContain('BEGIN:VEVENT');
    expect(lineas).toContain('UID:pago-L1@gestion-dinero');
    expect(lineas).toContain('DTSTAMP:20261027T000000Z');
    expect(lineas).toContain('DURATION:PT30M');
    expect(lineas).toContain('ACTION:DISPLAY');
    expect(lineas).toContain('TRIGGER:PT0M');
    expect(lineas).toContain('DESCRIPTION:Revisar pago de Clínica Centro');
    expect(lineas).toContain('END:VALARM');
    expect(lineas).toContain('END:VEVENT');
    expect(lineas[lineas.length - 2]).toBe('END:VCALENDAR');
    expect(lineas[lineas.length - 1]).toBe('');
    expect(lineas.some(l => l.includes('\n'))).toBe(false);
  });

  test('día 10 con hoy después del 10: arranca el mes siguiente', () => {
    const ics = armarIcsLugar({ ...lugar, pagoHastaDia: 10 }, '2026-10-27');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=10');
    expect(ics).toContain('DTSTART:20261110T100000');
  });

  test('día 10 con hoy antes del 10 o justo el 10: arranca este mes', () => {
    expect(armarIcsLugar({ ...lugar, pagoHastaDia: 10 }, '2026-10-03')).toContain('DTSTART:20261010T100000');
    expect(armarIcsLugar({ ...lugar, pagoHastaDia: 10 }, '2026-10-10')).toContain('DTSTART:20261010T100000');
  });

  test('pasa de año en diciembre', () => {
    expect(armarIcsLugar({ ...lugar, pagoHastaDia: 5 }, '2026-12-20')).toContain('DTSTART:20270105T100000');
  });

  test('día 29 o más usa el último día del mes (febrero incluido)', () => {
    const ics = armarIcsLugar({ ...lugar, pagoHastaDia: 29 }, '2027-02-10');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1');
    expect(ics).toContain('DTSTART:20270228T100000');
  });

  test('escapa coma, punto y coma, barra y saltos de línea del nombre', () => {
    const ics = armarIcsLugar({ ...lugar, nombre: 'Clínica, Centro; "A"\\B\nC' }, '2026-10-27');
    expect(ics).toContain('SUMMARY:Revisar pago de Clínica\\, Centro\\; "A"\\\\B\\nC');
    expect(ics).toContain('DESCRIPTION:Revisar pago de Clínica\\, Centro\\; "A"\\\\B\\nC');
  });

  test('pliega las líneas de más de 75 bytes sin cortar caracteres', () => {
    const nombre = 'Ñandú '.repeat(30);
    const ics = armarIcsLugar({ ...lugar, nombre }, '2026-10-27');
    for (const l of ics.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    // al desplegar (CRLF + espacio) la línea vuelve a ser la original
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:Revisar pago de ${nombre}`);
  });
});

describe('nombreArchivoCalendario', () => {
  test('pago-<lugar>.ics sin tildes ni espacios', () => {
    expect(nombreArchivoCalendario({ ...lugar, nombre: 'Clínica  Centro' })).toBe('pago-clinica-centro.ics');
  });

  test('un nombre sin letras ni números usa "lugar"', () => {
    expect(nombreArchivoCalendario({ ...lugar, nombre: '???' })).toBe('pago-lugar.ics');
  });
});

import { describe, expect, test } from 'vitest';
import { armarIcsLugar, nombreArchivoCalendario } from './calendario';
import { aFecha, diaAcotado, diasEnMes } from './dates';
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

  test('día 29 o 30: el mayor de 28…N que exista en el mes (BYSETPOS=-1), no el 31', () => {
    const ics29 = armarIcsLugar({ ...lugar, pagoHastaDia: 29 }, '2027-02-10');
    expect(ics29).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1');
    expect(ics29).toContain('DTSTART:20270228T100000');
    const ics30 = armarIcsLugar({ ...lugar, pagoHastaDia: 30 }, '2026-10-27');
    expect(ics30).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
    expect(ics30).toContain('DTSTART:20261030T100000'); // octubre tiene 31: el 30, no el 31
  });

  test('DTSTART es la primera ocurrencia: con hoy después del día acotado, el mes siguiente', () => {
    expect(armarIcsLugar({ ...lugar, pagoHastaDia: 30 }, '2026-10-31')).toContain('DTSTART:20261130T100000');
    expect(armarIcsLugar({ ...lugar, pagoHastaDia: 30 }, '2027-01-31')).toContain('DTSTART:20270228T100000');
    expect(armarIcsLugar({ ...lugar, pagoHastaDia: 31 }, '2027-02-28')).toContain('DTSTART:20270228T100000');
  });

  describe('la regla cae siempre en min(día, último día del mes)', () => {
    /** Expande FREQ=MONTHLY con BYMONTHDAY (y BYSETPOS) según RFC 5545 §3.3.10, para los meses pedidos. */
    function ocurrencias(ics: string, meses: [number, number][]): string[] {
      const regla = /RRULE:(.*)/.exec(ics.replace(/\r\n /g, ''))![1].trim();
      const partes = Object.fromEntries(regla.split(';').map(p => p.split('=')));
      expect(partes.FREQ).toBe('MONTHLY');
      const dias = String(partes.BYMONTHDAY).split(',').map(Number);
      return meses.map(([y, m]) => {
        const ultimo = diasEnMes(y, m);
        // Un BYMONTHDAY que no existe en el mes (p. ej. 30 en febrero) se ignora.
        const set = [...new Set(dias.map(d => (d < 0 ? ultimo + 1 + d : d)).filter(d => d >= 1 && d <= ultimo))].sort((a, b) => a - b);
        const pos = partes.BYSETPOS === undefined ? null : Number(partes.BYSETPOS);
        const elegidos = pos === null ? set : [set[pos > 0 ? pos - 1 : set.length + pos]];
        expect(elegidos).toHaveLength(1);
        return aFecha(y, m, elegidos[0]);
      });
    }
    const MESES: [number, number][] = [[2027, 2], [2028, 2], [2027, 4], [2027, 5]]; // feb (28), feb bisiesto (29), abr (30), may (31)

    test.each([
      [29, ['2027-02-28', '2028-02-29', '2027-04-29', '2027-05-29']],
      [30, ['2027-02-28', '2028-02-29', '2027-04-30', '2027-05-30']],
      [31, ['2027-02-28', '2028-02-29', '2027-04-30', '2027-05-31']],
      [28, ['2027-02-28', '2028-02-28', '2027-04-28', '2027-05-28']],
    ])('día %i en feb, feb bisiesto, abr y may', (dia, esperado) => {
      expect(ocurrencias(armarIcsLugar({ ...lugar, pagoHastaDia: dia }, '2026-10-01'), MESES)).toEqual(esperado);
    });

    test('para todos los días de 1 a 31, durante dos años', () => {
      const meses: [number, number][] = Array.from({ length: 24 }, (_, i) => [2027 + Math.floor(i / 12), (i % 12) + 1]);
      for (let dia = 1; dia <= 31; dia++) {
        const ics = armarIcsLugar({ ...lugar, pagoHastaDia: dia }, '2026-10-01');
        expect(ocurrencias(ics, meses)).toEqual(meses.map(([y, m]) => diaAcotado(y, m, dia)));
      }
    });
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

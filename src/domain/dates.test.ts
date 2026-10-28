import { describe, expect, test } from 'vitest';
import {
  aFecha,
  diaAcotado,
  diasEnMes,
  diasEntre,
  formatFechaCorta,
  formatFechaLarga,
  nombreMes,
  hoy,
  mesClave,
  parseFecha,
  sumarDias,
  moverMes,
  sumarMeses,
} from './dates';

describe('dates', () => {
  test('hoy usa la fecha local, no UTC', () => {
    expect(hoy(new Date('2026-10-28T02:30:00Z'))).toBe('2026-10-27'); // 23:30 en Buenos Aires
  });

  test('diaAcotado y diasEnMes', () => {
    expect(diaAcotado(2026, 11, 31)).toBe('2026-11-30');
    expect(diaAcotado(2028, 2, 31)).toBe('2028-02-29');
    expect(diaAcotado(2027, 2, 30)).toBe('2027-02-28');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarMeses(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
  });

  test('moverMes hacia atrás y adelante, cruzando años', () => {
    expect(moverMes('2026-10', -3)).toBe('2026-07');
    expect(moverMes('2026-01', -1)).toBe('2025-12');
    expect(moverMes('2026-12', 1)).toBe('2027-01');
    expect(moverMes('2026-10', -11)).toBe('2025-11');
  });

  test('diasEnMes', () => {
    expect(diasEnMes(2028, 2)).toBe(29);
    expect(diasEnMes(2027, 2)).toBe(28);
    expect(diasEnMes(2026, 12)).toBe(31);
  });

  test('parseFecha y aFecha', () => {
    expect(parseFecha('2026-10-07')).toEqual({ y: 2026, m: 10, d: 7 });
    expect(aFecha(2026, 3, 5)).toBe('2026-03-05');
  });

  test('sumarMeses hacia atrás y cruzando años', () => {
    expect(sumarMeses(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
    expect(sumarMeses(2026, 5, 20)).toEqual({ y: 2028, m: 1 });
  });

  test('sumarDias negativo', () => {
    expect(sumarDias('2027-01-01', -1)).toBe('2026-12-31');
  });

  test('mesClave', () => {
    expect(mesClave('2026-10-27')).toBe('2026-10');
  });

  test('diasEntre', () => {
    expect(diasEntre('2026-10-01', '2026-10-27')).toBe(26);
    expect(diasEntre('2026-10-27', '2026-10-01')).toBe(-26);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
  });

  test('formatFechaCorta', () => {
    expect(formatFechaCorta('2026-10-27')).toBe('27 oct');
    expect(formatFechaCorta('2026-01-05')).toBe('5 ene');
  });
});

describe('formatFechaLarga', () => {
  test('día de mes de año, con el mes en minúscula', () => {
    expect(formatFechaLarga('2026-05-03')).toBe('3 de mayo de 2026');
    expect(formatFechaLarga('2025-12-31')).toBe('31 de diciembre de 2025');
  });
});

describe('nombreMes', () => {
  test('nombre completo del mes de la fecha, con mayúscula', () => {
    expect(nombreMes('2026-10-27')).toBe('Octubre');
    expect(nombreMes('2026-01-05')).toBe('Enero');
    expect(nombreMes('2026-12-31')).toBe('Diciembre');
  });
});

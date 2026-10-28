import { describe, expect, test } from 'vitest';
import {
  MAX_CENTAVOS,
  aplicarPorcentaje,
  formatPesos,
  formatPorcentaje,
  parsePesos,
  parsePorcentaje,
} from './money';

describe('money', () => {
  test('formatPesos', () => {
    expect(formatPesos(123456700)).toBe('$ 1.234.567');
    expect(formatPesos(123450)).toBe('$ 1.234,50');
    expect(formatPesos(-4500000)).toBe('−$ 45.000');
    expect(formatPesos(0)).toBe('$ 0');
  });

  test('formatPesos con centavos de un dígito y negativos con centavos', () => {
    expect(formatPesos(123405)).toBe('$ 1.234,05');
    expect(formatPesos(1)).toBe('$ 0,01');
    expect(formatPesos(-150)).toBe('−$ 1,50');
  });

  test.each([
    ['200.000', 20000000],
    ['1.234,50', 123450],
    ['1234,5', 123450],
    ['$ 200.000', 20000000],
    [' 38000 ', 3800000],
    ['0,01', 1],
    ['', null],
    ['abc', null],
    ['1,2,3', null],
    ['-5', null],
    ['2.000.000.000', null], // supera MAX_CENTAVOS
  ])('parsePesos(%s)', (s, esperado) => expect(parsePesos(s)).toBe(esperado));

  test.each([
    ['1.000.000.000', MAX_CENTAVOS],
    ['1.000.000.000,01', null],
    ['1.23', null],
    ['12.34.567', null],
    ['1,234', null],
    ['   ', null],
    ['$', null],
  ])('parsePesos borde (%s)', (s, esperado) => expect(parsePesos(s)).toBe(esperado));

  test.each([
    ['40', 4000],
    ['37,5', 3750],
    ['33,33', 3333],
    ['0', null],
    ['100', 10000],
    ['100,01', null],
    ['', null],
  ])('parsePorcentaje(%s)', (s, e) => expect(parsePorcentaje(s)).toBe(e));

  test.each([
    ['40 %', 4000],
    ['abc', null],
    ['-5', null],
    ['33,333', null],
  ])('parsePorcentaje borde (%s)', (s, e) => expect(parsePorcentaje(s)).toBe(e));

  test('formatPorcentaje', () => {
    expect(formatPorcentaje(4000)).toBe('40 %');
    expect(formatPorcentaje(3750)).toBe('37,5 %');
    expect(formatPorcentaje(3333)).toBe('33,33 %');
    expect(formatPorcentaje(10000)).toBe('100 %');
    expect(formatPorcentaje(5)).toBe('0,05 %');
  });

  test('aplicarPorcentaje redondea mitad hacia arriba', () => {
    expect(aplicarPorcentaje(15000000, 4000)).toBe(6000000); // (200.000−50.000)×40 %
    expect(aplicarPorcentaje(1, 5000)).toBe(1); // 0,5 centavo → 1
    expect(aplicarPorcentaje(333, 3333)).toBe(111); // 110,9889 → 111
  });
});

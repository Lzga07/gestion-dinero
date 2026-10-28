import { beforeEach, expect, test } from 'vitest';
import { guardarAjuste, leerAjuste } from './ajustes';
import { reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

test('leerAjuste devuelve el valor por defecto cuando no existe', async () => {
  expect(await leerAjuste('recordatorioCopiaDias', 7)).toBe(7);
  expect(await leerAjuste<string | null>('ultimoLugarId', null)).toBeNull();
});

test('guardarAjuste guarda y reemplaza; un valor falso guardado no se confunde con ausente', async () => {
  await guardarAjuste('recordatorioCopiaDias', 14);
  expect(await leerAjuste('recordatorioCopiaDias', 7)).toBe(14);
  await guardarAjuste('recordatorioCopiaDias', 0);
  expect(await leerAjuste('recordatorioCopiaDias', 7)).toBe(0);
});

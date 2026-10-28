import { beforeEach, expect, test } from 'vitest';
import { db } from './db';
import { borrarMovimiento, guardarMovimiento } from './movimientos';
import { guardarCategoria } from './categorias';
import { reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

async function categoria(nombre = 'Materiales') {
  return guardarCategoria({ nombre, tipo: 'GASTO', ambito: 'TRABAJO', icono: '🧰', color: '#9e4430', orden: 0 });
}

test('guardar un movimiento nuevo le pone id y creadoEn', async () => {
  const categoriaId = await categoria();
  const id = await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500, categoriaId, nota: 'guantes' });
  const m = (await db.movimientos.get(id))!;
  expect(m).toMatchObject({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500, categoriaId, nota: 'guantes' });
  expect(Number.isNaN(Date.parse(m.creadoEn))).toBe(false);
});

test('editar un movimiento conserva creadoEn', async () => {
  const categoriaId = await categoria();
  const id = await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500, categoriaId, nota: '' });
  const antes = (await db.movimientos.get(id))!;
  await guardarMovimiento({ id, tipo: 'GASTO', fecha: '2026-10-06', monto: 2000, categoriaId, nota: 'editado' });
  const despues = (await db.movimientos.get(id))!;
  expect(despues.creadoEn).toBe(antes.creadoEn);
  expect(despues).toMatchObject({ fecha: '2026-10-06', monto: 2000, nota: 'editado' });
  expect(await db.movimientos.count()).toBe(1);
});

test('un movimiento con una categoría inexistente no se guarda', async () => {
  await expect(
    guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500, categoriaId: 'nada', nota: '' }),
  ).rejects.toMatchObject({ codigo: 'CATEGORIA_INEXISTENTE' });
  expect(await db.movimientos.count()).toBe(0);
});

test('borrarMovimiento lo elimina', async () => {
  const categoriaId = await categoria();
  const id = await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500, categoriaId, nota: '' });
  await borrarMovimiento(id);
  expect(await db.movimientos.count()).toBe(0);
});

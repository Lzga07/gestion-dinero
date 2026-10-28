import { beforeEach, expect, test } from 'vitest';
import { borrarCategoria, guardarCategoria } from './categorias';
import { db } from './db';
import { guardarMovimiento } from './movimientos';
import { reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

const nueva = (nombre: string, orden: number) =>
  guardarCategoria({ nombre, tipo: 'GASTO', ambito: 'PERSONAL', icono: '📦', color: '#7d7468', orden });
const gasto = (categoriaId: string, monto: number) =>
  guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto, categoriaId, nota: '' });

test('guardarCategoria crea y edita', async () => {
  const id = await nueva('Ocio', 0);
  await guardarCategoria({ id, nombre: 'Salidas', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🎬', color: '#6a5acd', orden: 3 });
  expect(await db.categorias.count()).toBe(1);
  expect(await db.categorias.get(id)).toMatchObject({ nombre: 'Salidas', orden: 3 });
});

test('borrarCategoria en uso exige moverA y reasigna movimientos', async () => {
  const origen = await nueva('Ocio', 0);
  const destino = await nueva('Otros personales', 1);
  const m1 = await gasto(origen, 1000);
  const m2 = await gasto(origen, 2000);
  const otro = await gasto(destino, 3000);

  await expect(borrarCategoria(origen, null)).rejects.toMatchObject({ codigo: 'CATEGORIA_EN_USO' });
  expect(await db.categorias.get(origen)).toBeDefined();
  expect((await db.movimientos.get(m1))!.categoriaId).toBe(origen);

  await borrarCategoria(origen, destino);

  expect(await db.categorias.get(origen)).toBeUndefined();
  expect((await db.movimientos.get(m1))!.categoriaId).toBe(destino);
  expect((await db.movimientos.get(m2))!.categoriaId).toBe(destino);
  expect((await db.movimientos.get(otro))!.categoriaId).toBe(destino);
});

test('borrarCategoria sin movimientos la borra aunque no haya moverA', async () => {
  const id = await nueva('Ocio', 0);
  await borrarCategoria(id, null);
  expect(await db.categorias.count()).toBe(0);
});

test('borrarCategoria con un destino inexistente o igual a sí misma no toca nada', async () => {
  const id = await nueva('Ocio', 0);
  const m = await gasto(id, 1000);
  await expect(borrarCategoria(id, 'nada')).rejects.toMatchObject({ codigo: 'CATEGORIA_INEXISTENTE' });
  await expect(borrarCategoria(id, id)).rejects.toMatchObject({ codigo: 'CATEGORIA_INEXISTENTE' });
  expect(await db.categorias.get(id)).toBeDefined();
  expect((await db.movimientos.get(m))!.categoriaId).toBe(id);
});

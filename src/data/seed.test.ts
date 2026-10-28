import { beforeEach, expect, test } from 'vitest';
import { db } from './db';
import { asegurarCategoriasIniciales } from './seed';
import { reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

test('categorías iniciales una sola vez', async () => {
  await asegurarCategoriasIniciales();
  await asegurarCategoriasIniciales();
  expect(await db.categorias.count()).toBe(11);
});

test('las categorías iniciales son las del spec, con orden secuencial', async () => {
  await asegurarCategoriasIniciales();
  const cats = (await db.categorias.toArray()).sort((a, b) => a.orden - b.orden);
  expect(cats.map(c => c.orden)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const resumen = (tipo: string, ambito: string | null) =>
    cats.filter(c => c.tipo === tipo && c.ambito === ambito).map(c => c.nombre);
  expect(resumen('GASTO', 'TRABAJO')).toEqual(['Materiales', 'Traslado', 'Cursos', 'Otros de trabajo']);
  expect(resumen('GASTO', 'PERSONAL')).toEqual([
    'Supermercado', 'Alquiler', 'Servicios', 'Salud', 'Ocio', 'Otros personales',
  ]);
  expect(resumen('INGRESO', null)).toEqual(['Otros ingresos']);
  expect(cats.every(c => c.icono.length > 0 && /^#[0-9a-f]{6}$/i.test(c.color))).toBe(true);
});

test('si la persona borró categorías, no se vuelven a crear mientras quede alguna', async () => {
  await asegurarCategoriasIniciales();
  const [primera] = await db.categorias.toArray();
  await db.categorias.delete(primera.id);
  await asegurarCategoriasIniciales();
  expect(await db.categorias.count()).toBe(10);
});

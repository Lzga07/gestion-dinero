import { beforeEach, expect, test } from 'vitest';
import { type Copia, armarCopia, leerCopia } from '../domain/copia';
import { guardarAjuste, leerAjuste } from './ajustes';
import { guardarCategoria } from './categorias';
import { ErrorDatos, exportarDatos, restaurarDatos } from './copia';
import { db } from './db';
import { ErrorDatos as ErrorDeModulo } from './errores';
import { guardarTipoTrabajo } from './lugares';
import { guardarMovimiento } from './movimientos';
import { registrarPago } from './pagos';
import { anotarTrabajo, lugarFijo, reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

/** Carga una base completa y devuelve su copia ya armada (sin PIN, como sale de la app). */
async function llenarYCopiar(): Promise<Copia> {
  const lugarId = await lugarFijo(15, 'Lugar de la copia');
  await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 5000, orden: 0 });
  const t1 = await anotarTrabajo(lugarId, '2026-10-05');
  const t2 = await anotarTrabajo(lugarId, '2026-10-06');
  await registrarPago({
    lugarId, periodoFin: '2026-10-15', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [t1], destildados: [t2],
  });
  const categoriaId = await guardarCategoria({
    nombre: 'Ocio', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🎬', color: '#6a5acd', orden: 0,
  });
  await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500, categoriaId, nota: '' });
  await guardarAjuste('ultimaCopia', '2026-10-27T10:00:00.000Z');
  return armarCopia(await exportarDatos(), new Date('2026-10-27T10:00:00Z'));
}

const contar = async () => ({
  lugares: await db.lugares.count(), tiposTrabajo: await db.tiposTrabajo.count(),
  trabajos: await db.trabajos.count(), pagos: await db.pagos.count(),
  movimientos: await db.movimientos.count(), categorias: await db.categorias.count(),
  ajustes: await db.ajustes.count(),
});

test('ErrorDatos se exporta desde copia con su código', () => {
  expect(ErrorDatos).toBe(ErrorDeModulo);
  const e = new ErrorDatos('X');
  expect(e).toBeInstanceOf(Error);
  expect(e.codigo).toBe('X');
});

test('exportarDatos devuelve todas las tablas, ajustes incluidos', async () => {
  const lugarId = await lugarFijo();
  await anotarTrabajo(lugarId, '2026-10-05');
  await guardarAjuste('pinHash', 'abc');
  const datos = await exportarDatos();
  expect(datos.lugares).toHaveLength(1);
  expect(datos.trabajos).toHaveLength(1);
  expect(datos.pagos).toEqual([]);
  expect(datos.ajustes).toEqual([{ clave: 'pinHash', valor: 'abc' }]);
});

test('el ciclo exportar → armarCopia → leerCopia → restaurar reproduce los datos', async () => {
  const original = await llenarYCopiar();
  const leida = leerCopia(JSON.stringify(original));
  if (!leida.ok) throw new Error(leida.error);
  await reiniciarDb();
  await restaurarDatos(leida.copia);
  expect(await exportarDatos()).toEqual(original.datos);
});

test('restaurarDatos reemplaza todo y conserva el PIN actual', async () => {
  const copia = await llenarYCopiar();
  // El dispositivo de destino tiene datos distintos y su propio PIN.
  await reiniciarDb();
  const otroLugar = await lugarFijo('ULTIMO', 'Lugar que se pierde');
  await anotarTrabajo(otroLugar, '2026-09-01');
  await guardarAjuste('pinHash', 'hash-del-dispositivo');
  await guardarAjuste('pinSalt', 'sal-del-dispositivo');
  await guardarAjuste('ultimoLugarId', otroLugar);

  await restaurarDatos(copia);

  const lugares = await db.lugares.toArray();
  expect(lugares.map(l => l.nombre)).toEqual(['Lugar de la copia']);
  expect(await db.trabajos.count()).toBe(2);
  expect(await db.pagos.count()).toBe(1);
  expect(await leerAjuste('pinHash', null)).toBe('hash-del-dispositivo');
  expect(await leerAjuste('pinSalt', null)).toBe('sal-del-dispositivo');
  expect(await leerAjuste('ultimaCopia', null)).toBe('2026-10-27T10:00:00.000Z');
  expect(await leerAjuste('ultimoLugarId', 'sin valor')).toBe('sin valor'); // no estaba en la copia
});

test('restaurarDatos descarta un pinHash que viene dentro del archivo', async () => {
  const copia = await llenarYCopiar();
  const conPinAjeno: Copia = {
    ...copia,
    datos: {
      ...copia.datos,
      ajustes: [...copia.datos.ajustes, { clave: 'pinHash', valor: 'hash-ajeno' }, { clave: 'pinSalt', valor: 'sal-ajena' }],
    },
  };

  // Dispositivo sin PIN: el del archivo no debe aparecer.
  await restaurarDatos(conPinAjeno);
  expect(await leerAjuste('pinHash', null)).toBeNull();
  expect(await leerAjuste('pinSalt', null)).toBeNull();

  // Dispositivo con PIN: gana el del dispositivo.
  await guardarAjuste('pinHash', 'hash-propio');
  await restaurarDatos(conPinAjeno);
  expect(await leerAjuste('pinHash', null)).toBe('hash-propio');
  expect(await leerAjuste('pinSalt', null)).toBeNull();
});

test('pinOfrecido es del dispositivo: no viaja en la copia y la restauración conserva el de este celular', async () => {
  const copia = await llenarYCopiar();
  const conOfertaAjena: Copia = {
    ...copia,
    datos: { ...copia.datos, ajustes: [...copia.datos.ajustes, { clave: 'pinOfrecido', valor: true }] },
  };

  await guardarAjuste('pinOfrecido', true);
  expect(JSON.stringify(armarCopia(await exportarDatos(), new Date()))).not.toContain('pinOfrecido');

  // Dispositivo que todavía no ofreció el PIN: el valor del archivo no cuenta.
  await db.ajustes.delete('pinOfrecido');
  await restaurarDatos(conOfertaAjena);
  expect(await leerAjuste('pinOfrecido', false)).toBe(false);

  // Dispositivo que ya lo ofreció: se conserva.
  await guardarAjuste('pinOfrecido', true);
  await restaurarDatos(copia);
  expect(await leerAjuste('pinOfrecido', false)).toBe(true);
});

test('restaurarDatos con error a mitad no toca los datos existentes', async () => {
  const copia = await llenarYCopiar();
  await reiniciarDb();
  const lugarId = await lugarFijo('ULTIMO', 'Mis datos de hoy');
  await anotarTrabajo(lugarId, '2026-10-05');
  await guardarAjuste('pinHash', 'mi-pin');
  const antes = await exportarDatos();
  const conteo = await contar();

  // Ids duplicados en movimientos (la tabla que se carga casi al final): bulkAdd falla con la base ya vaciada.
  const duplicado = { ...copia.datos.movimientos[0] };
  const rota: Copia = { ...copia, datos: { ...copia.datos, movimientos: [duplicado, { ...duplicado }] } };

  await expect(restaurarDatos(rota)).rejects.toThrow();

  expect(await contar()).toEqual(conteo);
  expect(await exportarDatos()).toEqual(antes);
  expect(await leerAjuste('pinHash', null)).toBe('mi-pin');
});

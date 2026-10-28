import { beforeEach, expect, test } from 'vitest';
import { INICIO_DE_LOS_TIEMPOS, periodoQueContiene } from '../domain/periodos';
import { db } from './db';
import { ErrorDatos } from './errores';
import {
  actualizarLugar, archivarLugar, borrarLugar, borrarTipoTrabajo, crearLugar, guardarTipoTrabajo,
} from './lugares';
import { anotarTrabajo, lugarFijo, reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

test('crearLugar guarda la regla de cierre inicial, sin archivar', async () => {
  const id = await crearLugar({
    nombre: 'Estudio', formaCobro: 'PORCENTAJE', porcentajeBp: 4000, pagoDesdeDia: 5, pagoHastaDia: 10, diaCierre: 15,
  });
  const l = (await db.lugares.get(id))!;
  expect(l.reglasCierre).toEqual([{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 15 }]);
  expect(l.archivado).toBe(false);
  expect(l.porcentajeBp).toBe(4000);
  expect(Number.isNaN(Date.parse(l.creadoEn))).toBe(false);
});

test('borrar lugar con trabajos falla; archivar funciona', async () => {
  const id = await lugarFijo();
  await anotarTrabajo(id, '2026-10-05');
  await expect(borrarLugar(id)).rejects.toMatchObject({ codigo: 'LUGAR_CON_TRABAJOS' });
  await expect(borrarLugar(id)).rejects.toBeInstanceOf(ErrorDatos);
  expect(await db.lugares.get(id)).toBeDefined();

  await archivarLugar(id, true);
  expect((await db.lugares.get(id))!.archivado).toBe(true);
  await archivarLugar(id, false);
  expect((await db.lugares.get(id))!.archivado).toBe(false);
});

test('borrar un lugar sin trabajos lo borra junto con sus tipos de trabajo, y no toca los de otro lugar', async () => {
  const id = await lugarFijo();
  const otro = await lugarFijo('ULTIMO', 'Otro');
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 5000, orden: 0 });
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 8000, orden: 1 });
  await guardarTipoTrabajo({ lugarId: otro, nombre: 'Consulta', precio: 3000, orden: 0 });

  await borrarLugar(id);

  expect(await db.lugares.get(id)).toBeUndefined();
  expect(await db.tiposTrabajo.where('lugarId').equals(id).count()).toBe(0);
  expect(await db.tiposTrabajo.where('lugarId').equals(otro).count()).toBe(1);
});

test('cambiar día de cierre agrega una regla desde el próximo período', async () => {
  const id = await lugarFijo(31);
  await actualizarLugar(id, { diaCierre: 15 }, '2026-10-10');
  const l = (await db.lugares.get(id))!;
  expect(l.reglasCierre).toEqual([
    { vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 31 },
    { vigenteDesde: '2026-11-01', dia: 15 }, // el período abierto cierra el 31/10
  ]);
  expect(periodoQueContiene(l.reglasCierre, '2026-10-10').fin).toBe('2026-10-31');
  expect(periodoQueContiene(l.reglasCierre, '2026-11-02').fin).toBe('2026-11-15');
});

test('actualizarLugar con el mismo día de cierre no agrega reglas; el resto son cambios simples', async () => {
  const id = await lugarFijo(31);
  await actualizarLugar(id, { diaCierre: 31, nombre: 'Renombrado', pagoHastaDia: 28 }, '2026-10-10');
  const l = (await db.lugares.get(id))!;
  expect(l.reglasCierre).toHaveLength(1);
  expect(l.nombre).toBe('Renombrado');
  expect(l.pagoHastaDia).toBe(28);
  expect(l.pagoDesdeDia).toBe(21);

  await actualizarLugar(id, { nombre: 'Solo nombre' }, '2026-10-10');
  expect((await db.lugares.get(id))!.reglasCierre).toHaveLength(1);
});

test('volver al día anterior pisa el cambio futuro ya anotado', async () => {
  const id = await lugarFijo(31);
  await actualizarLugar(id, { diaCierre: 15 }, '2026-10-10');
  await actualizarLugar(id, { diaCierre: 31 }, '2026-10-12');
  const l = (await db.lugares.get(id))!;
  expect(l.reglasCierre.at(-1)).toEqual({ vigenteDesde: '2026-11-01', dia: 31 });
  expect(periodoQueContiene(l.reglasCierre, '2026-11-02').fin).toBe('2026-11-30');
});

test('actualizarLugar de un lugar inexistente falla', async () => {
  await expect(actualizarLugar('nada', { nombre: 'x' }, '2026-10-10')).rejects.toMatchObject({
    codigo: 'LUGAR_INEXISTENTE',
  });
});

test('tipos de trabajo: alta, edición y borrado sin tocar trabajos existentes', async () => {
  const lugarId = await lugarFijo();
  const tipoId = await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 5000, orden: 0 });
  await guardarTipoTrabajo({ id: tipoId, lugarId, nombre: 'Limpieza profunda', precio: 6000, orden: 0 });
  expect(await db.tiposTrabajo.count()).toBe(1);
  expect((await db.tiposTrabajo.get(tipoId))!.precio).toBe(6000);

  const trabajoId = await anotarTrabajo(lugarId, '2026-10-05', 5000);
  await borrarTipoTrabajo(tipoId);
  expect(await db.tiposTrabajo.count()).toBe(0);
  expect((await db.trabajos.get(trabajoId))!.precioLista).toBe(5000);
});

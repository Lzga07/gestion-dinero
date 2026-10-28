import { beforeEach, expect, test, vi } from 'vitest';
import { INICIO_DE_LOS_TIEMPOS, periodoQueContiene } from '../domain/periodos';
import { db } from './db';
import { ErrorDatos } from './errores';
import {
  actualizarLugar, archivarLugar, borrarLugar, borrarTipoTrabajo, crearLugar, guardarLugarConTipos, guardarTipoTrabajo,
} from './lugares';
import { registrarPago, saldarDiferencia } from './pagos';
import { anotarTrabajo, lugarFijo, reiniciarDb } from './test-helpers';
import { borrarTrabajo, guardarTrabajo } from './trabajos';

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

test('un lugar con pagos pero sin trabajos tampoco se borra; se puede archivar', async () => {
  const id = await lugarFijo();
  const trabajoId = await anotarTrabajo(id, '2026-10-05');
  const pagoId = await registrarPago({
    lugarId: id, periodoFin: '2026-10-31', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [trabajoId], destildados: [],
  });
  await saldarDiferencia(id, '2026-10-31', '2026-11-26', 500);
  await borrarTrabajo(trabajoId); // el pago queda a propósito
  expect(await db.trabajos.where('lugarId').equals(id).count()).toBe(0);

  await expect(borrarLugar(id)).rejects.toMatchObject({ codigo: 'LUGAR_CON_PAGOS' });
  expect(await db.lugares.get(id)).toBeDefined();
  expect(await db.pagos.get(pagoId)).toBeDefined();
  expect(await db.pagos.where('lugarId').equals(id).count()).toBe(2);

  await archivarLugar(id, true);
  expect((await db.lugares.get(id))!.archivado).toBe(true);

  // Un pago suelto (solo saldarDiferencia) también lo impide.
  const otro = await lugarFijo('ULTIMO', 'Otro');
  await saldarDiferencia(otro, '2026-10-31', '2026-11-26', 500);
  await expect(borrarLugar(otro)).rejects.toMatchObject({ codigo: 'LUGAR_CON_PAGOS' });
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

const DATOS = {
  nombre: 'Clínica Norte', formaCobro: 'ARANCEL_FIJO' as const, porcentajeBp: null,
  pagoDesdeDia: 1, pagoHastaDia: 10, diaCierre: 'ULTIMO' as const,
};

test('guardarLugarConTipos crea el lugar con sus tipos en orden', async () => {
  const id = await guardarLugarConTipos({
    datos: DATOS, hoy: '2026-10-27',
    tipos: [{ nombre: 'Limpieza', precio: 2500000 }, { nombre: 'Arreglo', precio: 3800000 }],
  });
  expect((await db.lugares.get(id))?.nombre).toBe('Clínica Norte');
  const tipos = await db.tiposTrabajo.where('lugarId').equals(id).sortBy('orden');
  expect(tipos).toMatchObject([{ nombre: 'Limpieza', orden: 0 }, { nombre: 'Arreglo', orden: 1 }]);
});

test('guardarLugarConTipos: si un tipo falla al crear, no queda ningún lugar', async () => {
  const espia = vi.spyOn(db.tiposTrabajo, 'put').mockRejectedValue(new Error('falla'));
  try {
    await expect(
      guardarLugarConTipos({ datos: DATOS, hoy: '2026-10-27', tipos: [{ nombre: 'Limpieza', precio: 100 }] }),
    ).rejects.toThrow();
  } finally {
    espia.mockRestore();
  }
  expect(await db.lugares.count()).toBe(0);
  expect(await db.tiposTrabajo.count()).toBe(0);
});

test('guardarLugarConTipos: si un tipo falla al editar, el lugar y sus precios quedan como estaban', async () => {
  const id = await lugarFijo();
  const a = await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 });
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 });
  const antes = await db.lugares.get(id);
  const espia = vi.spyOn(db.tiposTrabajo, 'put').mockRejectedValue(new Error('falla'));
  try {
    await expect(
      guardarLugarConTipos({
        id, hoy: '2026-10-27', datos: { ...DATOS, nombre: 'Otro nombre', diaCierre: 15 },
        tipos: [{ id: a, nombre: 'Limpieza', precio: 9900 }], // además quita "Arreglo"
      }),
    ).rejects.toThrow();
  } finally {
    espia.mockRestore();
  }
  expect(await db.lugares.get(id)).toEqual(antes);
  expect((await db.tiposTrabajo.toArray()).sort((x, y) => x.orden - y.orden)).toMatchObject([
    { nombre: 'Limpieza', precio: 2500000 }, { nombre: 'Arreglo', precio: 3800000 },
  ]);
});

test('guardarLugarConTipos edita, reordena y borra los tipos que ya no están', async () => {
  const id = await lugarFijo();
  const a = await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 });
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 });
  await guardarLugarConTipos({
    id, hoy: '2026-10-27', datos: DATOS,
    tipos: [{ nombre: 'Nuevo', precio: 100 }, { id: a, nombre: 'Limpieza', precio: 3000000 }],
  });
  expect(await db.tiposTrabajo.where('lugarId').equals(id).sortBy('orden')).toMatchObject([
    { nombre: 'Nuevo', precio: 100, orden: 0 }, { id: a, precio: 3000000, orden: 1 },
  ]);
  // tipos: null no toca la lista
  await guardarLugarConTipos({ id, hoy: '2026-10-27', datos: DATOS, tipos: null });
  expect(await db.tiposTrabajo.count()).toBe(2);
});

/** Trabajo de arancel fijo anotado con un tipo de la lista. */
async function anotarConTipo(lugarId: string, tipoId: string, fecha: string, nombre: string, precio: number) {
  const { id } = await guardarTrabajo({
    lugarId, fecha, descripcion: nombre, tipoTrabajoId: tipoId, precioLista: precio,
    montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null, monto: precio, nota: 'Ana',
  });
  return id;
}

test('borrarTipoTrabajo deja sin tipo a sus trabajos, con monto, descripción y precio intactos', async () => {
  const lugarId = await lugarFijo();
  const tipoId = await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 5000, orden: 0 });
  const otroTipo = await guardarTipoTrabajo({ lugarId, nombre: 'Arreglo', precio: 7000, orden: 1 });
  const t1 = await anotarConTipo(lugarId, tipoId, '2026-10-05', 'Limpieza', 5000);
  const t2 = await anotarConTipo(lugarId, otroTipo, '2026-10-06', 'Arreglo', 7000);
  const antes = (await db.trabajos.get(t1))!;

  await borrarTipoTrabajo(tipoId);

  expect(await db.trabajos.get(t1)).toEqual({ ...antes, tipoTrabajoId: null });
  expect((await db.trabajos.get(t2))!.tipoTrabajoId).toBe(otroTipo);
});

test('guardarLugarConTipos: quitar un tipo de la lista deja sin tipo a sus trabajos', async () => {
  const id = await lugarFijo();
  const a = await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 });
  const b = await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 });
  const ta = await anotarConTipo(id, a, '2026-10-05', 'Limpieza', 2500000);
  const tb = await anotarConTipo(id, b, '2026-10-06', 'Arreglo', 3800000);
  const antes = (await db.trabajos.get(tb))!;

  await guardarLugarConTipos({ id, hoy: '2026-10-27', datos: DATOS, tipos: [{ id: a, nombre: 'Limpieza', precio: 2500000 }] });

  expect((await db.trabajos.get(ta))!.tipoTrabajoId).toBe(a);
  expect(await db.trabajos.get(tb)).toEqual({ ...antes, tipoTrabajoId: null });
});

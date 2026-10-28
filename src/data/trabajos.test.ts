import { beforeEach, expect, test } from 'vitest';
import { db } from './db';
import { actualizarLugar } from './lugares';
import { registrarPago } from './pagos';
import { borrarTrabajo, guardarTrabajo } from './trabajos';
import { anotarTrabajo, lugarFijo, reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

const base = {
  descripcion: 'Limpieza', tipoTrabajoId: null, precioLista: 10000, montoCliente: null, descuento: null,
  descuentoMotivo: null, porcentajeBp: null, monto: 10000, nota: '',
};

test('un trabajo nuevo queda PENDIENTE, sin pago, con fechas de creación', async () => {
  const lugarId = await lugarFijo();
  const { id, periodoYaPagado } = await guardarTrabajo({ ...base, lugarId, fecha: '2026-10-05' });
  const t = (await db.trabajos.get(id))!;
  expect(t.estado).toBe('PENDIENTE');
  expect(t.pagoId).toBeNull();
  expect(t.creadoEn).toBe(t.actualizadoEn);
  expect(periodoYaPagado).toBe(false);
});

test('editar conserva estado, pago y creadoEn, y actualiza actualizadoEn', async () => {
  const lugarId = await lugarFijo();
  const id = await anotarTrabajo(lugarId, '2026-10-05');
  const pagoId = await registrarPago({
    lugarId, periodoFin: '2026-10-31', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [id], destildados: [],
  });
  const antes = (await db.trabajos.get(id))!;
  await new Promise(r => setTimeout(r, 5));

  await guardarTrabajo({ ...base, id, lugarId, fecha: '2026-10-06', nota: 'editado' });

  const despues = (await db.trabajos.get(id))!;
  expect(despues.estado).toBe('PAGADO');
  expect(despues.pagoId).toBe(pagoId);
  expect(despues.creadoEn).toBe(antes.creadoEn);
  expect(despues.actualizadoEn > antes.actualizadoEn).toBe(true);
  expect(despues.nota).toBe('editado');
  expect(despues.fecha).toBe('2026-10-06');
});

test('guardarTrabajo marca periodoYaPagado en un período con pago', async () => {
  const lugarId = await lugarFijo();
  const uno = await anotarTrabajo(lugarId, '2026-10-05');
  await registrarPago({
    lugarId, periodoFin: '2026-10-31', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [uno], destildados: [],
  });

  // nuevo en el período pagado
  const olvidado = await guardarTrabajo({ ...base, lugarId, fecha: '2026-10-20' });
  expect(olvidado.periodoYaPagado).toBe(true);
  // nuevo en otro período sin pago
  expect((await guardarTrabajo({ ...base, lugarId, fecha: '2026-11-03' })).periodoYaPagado).toBe(false);
  // editar sin cambiar de período no vuelve a preguntar
  expect((await guardarTrabajo({ ...base, id: olvidado.id, lugarId, fecha: '2026-10-21' })).periodoYaPagado).toBe(false);
  // editar cambiándolo hacia el período pagado sí
  const deNoviembre = (await guardarTrabajo({ ...base, lugarId, fecha: '2026-11-04' })).id;
  expect((await guardarTrabajo({ ...base, id: deNoviembre, lugarId, fecha: '2026-10-30' })).periodoYaPagado).toBe(true);
});

test('el pago de otro lugar no cuenta para periodoYaPagado', async () => {
  const a = await lugarFijo();
  const b = await lugarFijo('ULTIMO', 'Otro');
  const delA = await anotarTrabajo(a, '2026-10-05');
  await registrarPago({
    lugarId: a, periodoFin: '2026-10-31', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [delA], destildados: [],
  });
  expect((await guardarTrabajo({ ...base, lugarId: b, fecha: '2026-10-20' })).periodoYaPagado).toBe(false);
});

test('el período se calcula con las reglas de cierre del lugar (cambio de día de cierre)', async () => {
  const lugarId = await lugarFijo(31);
  await actualizarLugar(lugarId, { diaCierre: 15 }, '2026-10-10'); // desde 01/11 cierra el 15
  const dic = await anotarTrabajo(lugarId, '2026-11-10'); // período 01/11 – 15/11
  await registrarPago({
    lugarId, periodoFin: '2026-11-15', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [dic], destildados: [],
  });
  expect((await guardarTrabajo({ ...base, lugarId, fecha: '2026-11-14' })).periodoYaPagado).toBe(true);
  expect((await guardarTrabajo({ ...base, lugarId, fecha: '2026-11-16' })).periodoYaPagado).toBe(false);
});

test('guardar un trabajo de un lugar inexistente falla y no escribe', async () => {
  await expect(guardarTrabajo({ ...base, lugarId: 'nada', fecha: '2026-10-05' })).rejects.toMatchObject({
    codigo: 'LUGAR_INEXISTENTE',
  });
  expect(await db.trabajos.count()).toBe(0);
});

test('borrar un trabajo pagado deja el pago existiendo', async () => {
  const lugarId = await lugarFijo();
  const id = await anotarTrabajo(lugarId, '2026-10-05');
  const pagoId = await registrarPago({
    lugarId, periodoFin: '2026-10-31', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [id], destildados: [],
  });
  await borrarTrabajo(id);
  expect(await db.trabajos.get(id)).toBeUndefined();
  expect(await db.pagos.get(pagoId)).toBeDefined();
});

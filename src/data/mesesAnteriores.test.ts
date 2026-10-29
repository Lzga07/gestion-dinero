import { beforeEach, expect, test } from 'vitest';
import { db } from './db';
import { resumenPeriodo } from '../domain/conciliacion';
import { MAX_CENTAVOS } from '../domain/money';
import { periodoQueContiene } from '../domain/periodos';
import { cerrarMes, mesCerrado } from './mesesAnteriores';
import { anotarTrabajo, lugarFijo, reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

/** Lugar con 3 trabajos de agosto de $ 100 cada uno (suma 30000 centavos). */
async function agosto() {
  const lugarId = await lugarFijo();
  const ids = [
    await anotarTrabajo(lugarId, '2026-08-05'),
    await anotarTrabajo(lugarId, '2026-08-12'),
    await anotarTrabajo(lugarId, '2026-08-20'),
  ];
  const lugar = (await db.lugares.get(lugarId))!;
  const periodo = periodoQueContiene(lugar.reglasCierre, '2026-08-05');
  const resumen = async () => resumenPeriodo(lugar, periodo, await db.trabajos.toArray(), await db.pagos.toArray());
  return { lugarId, ids, periodo, resumen };
}

test('TODO: un pago FINAL por la suma y los trabajos quedan PAGADO', async () => {
  const { lugarId, ids, periodo, resumen } = await agosto();

  await cerrarMes(lugarId, periodo, { tipo: 'TODO', fecha: '2026-09-03' });

  const pagos = await db.pagos.toArray();
  expect(pagos).toHaveLength(1);
  expect(pagos[0]).toMatchObject({ lugarId, periodoFin: '2026-08-31', fecha: '2026-09-03', monto: 30000, tipo: 'FINAL', nota: '' });
  for (const id of ids) expect(await db.trabajos.get(id)).toMatchObject({ estado: 'PAGADO', pagoId: pagos[0].id });
  expect((await resumen()).deudaPlata).toBe(0);
});

test('PARTE por menos: los trabajos quedan PAGADO y la diferencia es deuda en plata', async () => {
  const { lugarId, ids, periodo, resumen } = await agosto();

  await cerrarMes(lugarId, periodo, { tipo: 'PARTE', fecha: '2026-09-03', monto: 22000 });

  const pagos = await db.pagos.toArray();
  expect(pagos).toHaveLength(1);
  expect(pagos[0]).toMatchObject({ monto: 22000, tipo: 'FINAL' });
  for (const id of ids) expect(await db.trabajos.get(id)).toMatchObject({ estado: 'PAGADO', pagoId: pagos[0].id });
  expect((await resumen()).deudaPlata).toBe(8000);
});

test.each([30000, 35000])('PARTE por igual o más (%i): sin deuda y el pago es lo escrito', async monto => {
  const { lugarId, ids, periodo, resumen } = await agosto();

  await cerrarMes(lugarId, periodo, { tipo: 'PARTE', fecha: '2026-09-03', monto });

  const pagos = await db.pagos.toArray();
  expect(pagos).toHaveLength(1);
  expect(pagos[0]).toMatchObject({ monto, tipo: 'FINAL' });
  for (const id of ids) expect(await db.trabajos.get(id)).toMatchObject({ estado: 'PAGADO' });
  expect((await resumen()).deudaPlata).toBe(0);
});

test.each([0, -100, NaN, 1.5, MAX_CENTAVOS + 1])('PARTE con monto %s lanza MONTO_INVALIDO y no escribe nada', async monto => {
  const { lugarId, ids, periodo } = await agosto();

  await expect(cerrarMes(lugarId, periodo, { tipo: 'PARTE', fecha: '2026-09-03', monto }))
    .rejects.toMatchObject({ codigo: 'MONTO_INVALIDO' });

  expect(await db.pagos.count()).toBe(0);
  for (const id of ids) expect(await db.trabajos.get(id)).toMatchObject({ estado: 'PENDIENTE', pagoId: null });
});

test('NADA: los trabajos quedan NO_PAGADO y no hay pagos', async () => {
  const { lugarId, ids, periodo } = await agosto();

  await cerrarMes(lugarId, periodo, { tipo: 'NADA' });

  expect(await db.pagos.count()).toBe(0);
  for (const id of ids) expect(await db.trabajos.get(id)).toMatchObject({ estado: 'NO_PAGADO' });
});

test('solo toma los trabajos del período, no los de otros meses', async () => {
  const { lugarId, periodo } = await agosto();
  const deJulio = await anotarTrabajo(lugarId, '2026-07-10');
  const deSeptiembre = await anotarTrabajo(lugarId, '2026-09-10');

  await cerrarMes(lugarId, periodo, { tipo: 'TODO', fecha: '2026-09-03' });

  expect(await db.trabajos.get(deJulio)).toMatchObject({ estado: 'PENDIENTE' });
  expect(await db.trabajos.get(deSeptiembre)).toMatchObject({ estado: 'PENDIENTE' });
  expect((await db.pagos.toArray())[0].monto).toBe(30000);
});

test('sin trabajos pendientes en el período no hace nada', async () => {
  const lugarId = await lugarFijo();
  const lugar = (await db.lugares.get(lugarId))!;
  const periodo = periodoQueContiene(lugar.reglasCierre, '2026-08-05');

  await cerrarMes(lugarId, periodo, { tipo: 'TODO', fecha: '2026-09-03' });
  await cerrarMes(lugarId, periodo, { tipo: 'PARTE', fecha: '2026-09-03', monto: 5000 });
  await cerrarMes(lugarId, periodo, { tipo: 'NADA' });

  expect(await db.pagos.count()).toBe(0);
});

test('cerrar dos veces el mismo mes no duplica pagos', async () => {
  const { lugarId, periodo } = await agosto();

  await cerrarMes(lugarId, periodo, { tipo: 'TODO', fecha: '2026-09-03' });
  await cerrarMes(lugarId, periodo, { tipo: 'TODO', fecha: '2026-09-04' });

  expect(await db.pagos.count()).toBe(1);
});

test('un lugar inexistente lanza LUGAR_INEXISTENTE', async () => {
  await expect(cerrarMes('no-existe', { inicio: '2026-08-01', fin: '2026-08-31' }, { tipo: 'NADA' }))
    .rejects.toMatchObject({ codigo: 'LUGAR_INEXISTENTE' });
});

test('mesCerrado: true con un pago o con un NO_PAGADO; false con solo pendientes', async () => {
  const { lugarId, periodo, resumen } = await agosto();
  expect(mesCerrado(await resumen())).toBe(false);

  await cerrarMes(lugarId, periodo, { tipo: 'NADA' });
  expect(mesCerrado(await resumen())).toBe(true);

  await reiniciarDb();
  const otro = await agosto();
  await cerrarMes(otro.lugarId, otro.periodo, { tipo: 'TODO', fecha: '2026-09-03' });
  expect(mesCerrado(await otro.resumen())).toBe(true);
});

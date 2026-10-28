import { beforeEach, expect, test, vi } from 'vitest';
import { db } from './db';
import { resumenPeriodo } from '../domain/conciliacion';
import { periodoQueContiene } from '../domain/periodos';
import {
  borrarPago, cerrarPeriodo, cobrarDeuda, marcarNoPagado, noMePagaron, registrarPago, saldarDiferencia, volverAPendiente, yaMeLoPagaron,
} from './pagos';
import { anotarTrabajo, lugarFijo, reiniciarDb } from './test-helpers';

beforeEach(reiniciarDb);

const pago = { periodoFin: '2026-10-31', fecha: '2026-11-25', nota: 'transferencia' };

test('registrarPago aplica estados en una transacción', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(lugarId, '2026-10-06');
  const c = await anotarTrabajo(lugarId, '2026-10-07');

  const id = await registrarPago({
    lugarId, ...pago, monto: 20000, tipo: 'FINAL', tildados: [a, b], destildados: [c],
  });

  const p = (await db.pagos.get(id))!;
  expect(p).toMatchObject({ lugarId, periodoFin: '2026-10-31', monto: 20000, tipo: 'FINAL', nota: 'transferencia' });
  expect(Number.isNaN(Date.parse(p.creadoEn))).toBe(false);
  expect(await db.trabajos.get(a)).toMatchObject({ estado: 'PAGADO', pagoId: id });
  expect(await db.trabajos.get(b)).toMatchObject({ estado: 'PAGADO', pagoId: id });
  expect(await db.trabajos.get(c)).toMatchObject({ estado: 'NO_PAGADO', pagoId: null });
});

test('un pago a cuenta deja los destildados PENDIENTES', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(lugarId, '2026-10-06');
  await registrarPago({ lugarId, ...pago, monto: 10000, tipo: 'A_CUENTA', tildados: [a], destildados: [b] });
  expect(await db.trabajos.get(b)).toMatchObject({ estado: 'PENDIENTE', pagoId: null });
});

test('si falla a mitad, registrarPago no deja nada escrito', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(lugarId, '2026-10-06');

  await expect(
    registrarPago({ lugarId, ...pago, monto: 10000, tipo: 'FINAL', tildados: [a], destildados: [b, 'no-existe'] }),
  ).rejects.toMatchObject({ codigo: 'TRABAJO_INEXISTENTE' });

  expect(await db.pagos.count()).toBe(0);
  expect(await db.trabajos.get(a)).toMatchObject({ estado: 'PENDIENTE', pagoId: null });
  expect(await db.trabajos.get(b)).toMatchObject({ estado: 'PENDIENTE', pagoId: null });
});

test('si falla en medio de la transacción (después de crear el pago), no queda nada escrito', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(lugarId, '2026-10-06');
  const c = await anotarTrabajo(lugarId, '2026-10-07');
  const antes = await db.trabajos.toArray();

  const original = db.trabajos.update.bind(db.trabajos);
  let llamadas = 0;
  const espia = vi.spyOn(db.trabajos, 'update').mockImplementation(((...args: Parameters<typeof original>) => {
    llamadas++;
    if (llamadas === 2) return Promise.reject(new Error('falla simulada'));
    return original(...args);
  }) as typeof original);

  try {
    await expect(
      registrarPago({ lugarId, ...pago, monto: 20000, tipo: 'FINAL', tildados: [a, b], destildados: [c] }),
    ).rejects.toThrow('falla simulada');
  } finally {
    espia.mockRestore();
  }

  expect(llamadas).toBe(2); // el pago ya se había creado y el primer trabajo ya se había actualizado
  expect(await db.pagos.count()).toBe(0);
  const despues = await db.trabajos.toArray();
  expect(despues.sort((x, y) => x.id.localeCompare(y.id))).toEqual(antes.sort((x, y) => x.id.localeCompare(y.id)));
  expect(despues.every(t => t.estado === 'PENDIENTE' && t.pagoId === null)).toBe(true);
});

test('registrarPago rechaza un trabajo de otro lugar sin escribir nada', async () => {
  const lugarId = await lugarFijo();
  const otro = await lugarFijo('ULTIMO', 'Otro');
  const mio = await anotarTrabajo(lugarId, '2026-10-05');
  const ajeno = await anotarTrabajo(otro, '2026-10-06');

  await expect(
    registrarPago({ lugarId, ...pago, monto: 10000, tipo: 'FINAL', tildados: [mio, ajeno], destildados: [] }),
  ).rejects.toMatchObject({ codigo: 'TRABAJO_INEXISTENTE' });

  expect(await db.pagos.count()).toBe(0);
  expect((await db.trabajos.get(mio))!.estado).toBe('PENDIENTE');
  expect((await db.trabajos.get(ajeno))!.estado).toBe('PENDIENTE');
});

test('borrarPago devuelve los trabajos a PENDIENTE', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(lugarId, '2026-10-06');
  const c = await anotarTrabajo(lugarId, '2026-10-07');
  const id = await registrarPago({ lugarId, ...pago, monto: 20000, tipo: 'FINAL', tildados: [a, b], destildados: [c] });
  const otroPago = await saldarDiferencia(lugarId, '2026-10-31', '2026-11-26', 500);

  await borrarPago(id);

  expect(await db.pagos.get(id)).toBeUndefined();
  expect(await db.trabajos.get(a)).toMatchObject({ estado: 'PENDIENTE', pagoId: null });
  expect(await db.trabajos.get(b)).toMatchObject({ estado: 'PENDIENTE', pagoId: null });
  // el destildado de un pago FINAL sigue siendo deuda declarada
  expect((await db.trabajos.get(c))!.estado).toBe('NO_PAGADO');
  expect(await db.pagos.get(otroPago)).toBeDefined();
});

test('noMePagaron pasa a NO_PAGADO solo los PENDIENTES de ese período y lugar', async () => {
  const lugarId = await lugarFijo();
  const otro = await lugarFijo('ULTIMO', 'Otro');
  const octubre = await anotarTrabajo(lugarId, '2026-10-05');
  const pagado = await anotarTrabajo(lugarId, '2026-10-06');
  const noviembre = await anotarTrabajo(lugarId, '2026-11-05');
  const deOtro = await anotarTrabajo(otro, '2026-10-05');
  await registrarPago({ lugarId, ...pago, monto: 10000, tipo: 'A_CUENTA', tildados: [pagado], destildados: [] });

  await noMePagaron(lugarId, '2026-10-31');

  expect((await db.trabajos.get(octubre))!.estado).toBe('NO_PAGADO');
  expect((await db.trabajos.get(pagado))!.estado).toBe('PAGADO');
  expect((await db.trabajos.get(noviembre))!.estado).toBe('PENDIENTE');
  expect((await db.trabajos.get(deOtro))!.estado).toBe('PENDIENTE');
});

test('marcarNoPagado pasa un PENDIENTE a NO_PAGADO y no toca otros estados', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(lugarId, '2026-10-06');
  await registrarPago({ lugarId, ...pago, monto: 10000, tipo: 'FINAL', tildados: [b], destildados: [] });

  await marcarNoPagado(a);
  await marcarNoPagado(b);
  await marcarNoPagado('no-existe');

  expect((await db.trabajos.get(a))!.estado).toBe('NO_PAGADO');
  expect((await db.trabajos.get(b))!.estado).toBe('PAGADO');
});

test('yaMeLoPagaron crea un pago FINAL del período del trabajo y lo deja PAGADO', async () => {
  const lugarId = await lugarFijo();
  const t = await anotarTrabajo(lugarId, '2026-10-05');
  await marcarNoPagado(t);

  const id = await yaMeLoPagaron(t, '2026-12-03', 9000);

  expect(await db.pagos.get(id)).toMatchObject({
    tipo: 'FINAL', lugarId, periodoFin: '2026-10-31', fecha: '2026-12-03', monto: 9000, nota: '',
  });
  expect(await db.trabajos.get(t)).toMatchObject({ estado: 'PAGADO', pagoId: id });
});

test('yaMeLoPagaron con un trabajo inexistente falla y no crea ningún pago', async () => {
  await expect(yaMeLoPagaron('no-existe', '2026-12-03', 9000)).rejects.toMatchObject({
    codigo: 'TRABAJO_INEXISTENTE',
  });
  expect(await db.pagos.count()).toBe(0);
});

test('saldarDiferencia crea un pago FINAL sin trabajos', async () => {
  const lugarId = await lugarFijo();
  const id = await saldarDiferencia(lugarId, '2026-10-31', '2026-12-01', 2500);
  expect(await db.pagos.get(id)).toMatchObject({
    tipo: 'FINAL', lugarId, periodoFin: '2026-10-31', fecha: '2026-12-01', monto: 2500, nota: '',
  });
  expect(await db.trabajos.where('pagoId').equals(id).count()).toBe(0);
});

test('cerrarPeriodo: pago FINAL de $ 0 y los PENDIENTE del período pasan a NO_PAGADO; lo que faltaba en plata queda como deuda', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05', 10000);
  const b = await anotarTrabajo(lugarId, '2026-10-06', 5000);
  const c = await anotarTrabajo(lugarId, '2026-10-07', 2000);
  const deNoviembre = await anotarTrabajo(lugarId, '2026-11-02', 3000);
  // a y b pagados a cuenta con 9.000 de 15.000 esperados; c queda pendiente.
  await registrarPago({ lugarId, ...pago, monto: 9000, tipo: 'A_CUENTA', tildados: [a, b], destildados: [c] });

  const id = await cerrarPeriodo(lugarId, '2026-10-31', '2026-11-28');

  expect(await db.pagos.get(id)).toMatchObject({
    lugarId, periodoFin: '2026-10-31', fecha: '2026-11-28', monto: 0, tipo: 'FINAL',
  });
  expect(await db.trabajos.get(c)).toMatchObject({ estado: 'NO_PAGADO', pagoId: null });
  expect(await db.trabajos.get(a)).toMatchObject({ estado: 'PAGADO' });
  expect(await db.trabajos.get(deNoviembre)).toMatchObject({ estado: 'PENDIENTE' });
  const lugar = (await db.lugares.get(lugarId))!;
  const r = resumenPeriodo(lugar, periodoQueContiene(lugar.reglasCierre, '2026-10-05'), await db.trabajos.toArray(), await db.pagos.toArray());
  expect(r.deudaPlata).toBe(6000);
  expect(r.faltaACuenta).toBe(0);
  expect(r.noPagados.map(t => t.id)).toEqual([c]);
});

test('cerrarPeriodo es una sola transacción: si falla, no cambia nada', async () => {
  const lugarId = await lugarFijo();
  const c = await anotarTrabajo(lugarId, '2026-10-07', 2000);
  const espia = vi.spyOn(db.pagos, 'add').mockRejectedValue(new Error('falla simulada'));
  try {
    await expect(cerrarPeriodo(lugarId, '2026-10-31', '2026-11-28')).rejects.toThrow('falla simulada');
  } finally {
    espia.mockRestore();
  }
  expect(await db.pagos.count()).toBe(0);
  expect(await db.trabajos.get(c)).toMatchObject({ estado: 'PENDIENTE' });
});

test('cerrarPeriodo de un lugar inexistente falla sin escribir nada', async () => {
  await expect(cerrarPeriodo('no-existe', '2026-10-31', '2026-11-28')).rejects.toMatchObject({ codigo: 'LUGAR_INEXISTENTE' });
  expect(await db.pagos.count()).toBe(0);
});

test('volverAPendiente pasa un NO_PAGADO a PENDIENTE y no toca otros estados', async () => {
  const lugarId = await lugarFijo();
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(lugarId, '2026-10-06');
  await registrarPago({ lugarId, ...pago, monto: 10000, tipo: 'FINAL', tildados: [a], destildados: [b] });
  expect(await db.trabajos.get(b)).toMatchObject({ estado: 'NO_PAGADO' });

  await volverAPendiente(b);
  expect(await db.trabajos.get(b)).toMatchObject({ estado: 'PENDIENTE', pagoId: null });

  const antes = await db.trabajos.get(a);
  await volverAPendiente(a); // PAGADO: no cambia
  expect(await db.trabajos.get(a)).toEqual(antes);
  await volverAPendiente('no-existe'); // no lanza
});

test('cobrarDeuda: un pago FINAL por período con lo elegido; los trabajos quedan PAGADO y la diferencia se salda', async () => {
  const lugarId = await lugarFijo();
  const sep1 = await anotarTrabajo(lugarId, '2026-09-05', 10000);
  const sep2 = await anotarTrabajo(lugarId, '2026-09-06', 5000);
  const sep3 = await anotarTrabajo(lugarId, '2026-09-07', 4000);
  const oct1 = await anotarTrabajo(lugarId, '2026-10-05', 3000);
  // Septiembre: pago final de 3.000 por sep3 (4.000) → 1.000 de diferencia en plata; sep1 y sep2 quedan sin pagar.
  await registrarPago({ lugarId, periodoFin: '2026-09-30', fecha: '2026-10-25', monto: 3000, tipo: 'FINAL', nota: '', tildados: [sep3], destildados: [sep1, sep2] });
  await registrarPago({ lugarId, periodoFin: '2026-10-31', fecha: '2026-11-25', monto: 0, tipo: 'FINAL', nota: '', tildados: [], destildados: [oct1] });

  const ids = await cobrarDeuda(lugarId, '2026-11-28', {
    trabajos: [sep1, oct1],
    diferencias: [{ periodoFin: '2026-09-30', monto: 1000 }],
  });

  expect(ids).toHaveLength(2);
  const nuevos = await db.pagos.bulkGet(ids);
  expect(nuevos).toEqual(expect.arrayContaining([
    expect.objectContaining({ periodoFin: '2026-09-30', fecha: '2026-11-28', monto: 11000, tipo: 'FINAL' }),
    expect.objectContaining({ periodoFin: '2026-10-31', fecha: '2026-11-28', monto: 3000, tipo: 'FINAL' }),
  ]));
  const sep = nuevos.find(p => p!.periodoFin === '2026-09-30')!;
  expect(await db.trabajos.get(sep1)).toMatchObject({ estado: 'PAGADO', pagoId: sep.id });
  expect(await db.trabajos.get(sep2)).toMatchObject({ estado: 'NO_PAGADO' });
  const lugar = (await db.lugares.get(lugarId))!;
  const r = resumenPeriodo(lugar, periodoQueContiene(lugar.reglasCierre, '2026-09-05'), await db.trabajos.toArray(), await db.pagos.toArray());
  expect(r.deudaPlata).toBe(0);
  expect(r.noPagados.map(t => t.id)).toEqual([sep2]);
});

test('cobrarDeuda rechaza un trabajo de otro lugar o que no está sin pagar, sin escribir nada', async () => {
  const lugarId = await lugarFijo();
  const otro = await lugarFijo('ULTIMO', 'Otro');
  const a = await anotarTrabajo(lugarId, '2026-10-05');
  const b = await anotarTrabajo(otro, '2026-10-05');
  await marcarNoPagado(a);
  await marcarNoPagado(b);
  const pendiente = await anotarTrabajo(lugarId, '2026-10-06');

  await expect(cobrarDeuda(lugarId, '2026-11-28', { trabajos: [a, b], diferencias: [] })).rejects.toMatchObject({ codigo: 'TRABAJO_INEXISTENTE' });
  await expect(cobrarDeuda(lugarId, '2026-11-28', { trabajos: [a, pendiente], diferencias: [] })).rejects.toMatchObject({ codigo: 'TRABAJO_INEXISTENTE' });
  expect(await db.pagos.count()).toBe(0);
  expect(await db.trabajos.get(a)).toMatchObject({ estado: 'NO_PAGADO', pagoId: null });
});

import type { FechaISO } from '../domain/dates';
import type { Centavos } from '../domain/money';
import { resolverPago } from '../domain/conciliacion';
import { periodoQueContiene } from '../domain/periodos';
import type { Pago, TipoPago } from '../domain/types';
import { ahoraISO, db, nuevoId } from './db';
import { ErrorDatos } from './errores';

export async function registrarPago(p: {
  lugarId: string; periodoFin: FechaISO; fecha: FechaISO; monto: Centavos; tipo: TipoPago; nota: string;
  tildados: string[]; destildados: string[];
}): Promise<string> {
  return db.transaction('rw', db.pagos, db.trabajos, async () => {
    const { tildados: idsTildados, destildados: idsDestildados, ...datos } = p;
    const todos = await db.trabajos.bulkGet([...idsTildados, ...idsDestildados]);
    if (todos.some(tr => !tr || tr.lugarId !== p.lugarId)) throw new ErrorDatos('TRABAJO_INEXISTENTE');
    const porId = new Map(todos.map(tr => [tr!.id, tr!]));
    const pago: Pago = { ...datos, id: nuevoId(), creadoEn: ahoraISO() };
    await db.pagos.add(pago);
    const cambios = resolverPago({
      pago,
      tildados: idsTildados.map(id => porId.get(id)!),
      destildados: idsDestildados.map(id => porId.get(id)!),
    });
    for (const c of cambios) await db.trabajos.update(c.id, { estado: c.estado, pagoId: c.pagoId });
    return pago.id;
  });
}

/** "No me pagaron": los PENDIENTE del período pasan a NO_PAGADO. */
export async function noMePagaron(lugarId: string, periodoFin: FechaISO): Promise<void> {
  await db.transaction('rw', db.trabajos, db.lugares, async () => {
    const lugar = await db.lugares.get(lugarId);
    if (!lugar) throw new ErrorDatos('LUGAR_INEXISTENTE');
    await db.trabajos
      .where('lugarId').equals(lugarId)
      .filter(tr => tr.estado === 'PENDIENTE' && periodoQueContiene(lugar.reglasCierre, tr.fecha).fin === periodoFin)
      .modify({ estado: 'NO_PAGADO' });
  });
}

/** Un trabajo PENDIENTE pasa a NO_PAGADO; en cualquier otro estado no hace nada. */
export async function marcarNoPagado(trabajoId: string): Promise<void> {
  await db.transaction('rw', db.trabajos, async () => {
    const tr = await db.trabajos.get(trabajoId);
    if (tr && tr.estado === 'PENDIENTE') await db.trabajos.update(trabajoId, { estado: 'NO_PAGADO' });
  });
}

/** "Ya me lo pagaron": pago FINAL adicional del período del trabajo, que queda PAGADO. */
export async function yaMeLoPagaron(trabajoId: string, fecha: FechaISO, monto: Centavos): Promise<string> {
  return db.transaction('rw', db.pagos, db.trabajos, db.lugares, async () => {
    const tr = await db.trabajos.get(trabajoId);
    if (!tr) throw new ErrorDatos('TRABAJO_INEXISTENTE');
    const lugar = await db.lugares.get(tr.lugarId);
    if (!lugar) throw new ErrorDatos('LUGAR_INEXISTENTE');
    const pago: Pago = {
      id: nuevoId(), tipo: 'FINAL', lugarId: tr.lugarId,
      periodoFin: periodoQueContiene(lugar.reglasCierre, tr.fecha).fin,
      fecha, monto, nota: '', creadoEn: ahoraISO(),
    };
    await db.pagos.add(pago);
    await db.trabajos.update(trabajoId, { estado: 'PAGADO', pagoId: pago.id });
    return pago.id;
  });
}

/** Pago FINAL sin trabajos: salda una diferencia en plata de un período. */
export async function saldarDiferencia(lugarId: string, periodoFin: FechaISO, fecha: FechaISO, monto: Centavos): Promise<string> {
  const pago: Pago = { id: nuevoId(), tipo: 'FINAL', lugarId, periodoFin, fecha, monto, nota: '', creadoEn: ahoraISO() };
  await db.pagos.add(pago);
  return pago.id;
}

/** Borrar un pago devuelve sus trabajos a PENDIENTE. */
export async function borrarPago(id: string): Promise<void> {
  await db.transaction('rw', db.pagos, db.trabajos, async () => {
    await db.trabajos.where('pagoId').equals(id).modify({ estado: 'PENDIENTE', pagoId: null });
    await db.pagos.delete(id);
  });
}

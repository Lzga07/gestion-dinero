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

/** "Volver a pendiente": un NO_PAGADO vuelve a PENDIENTE (deja de ser deuda); en cualquier otro estado no hace nada. */
export async function volverAPendiente(trabajoId: string): Promise<void> {
  await db.transaction('rw', db.trabajos, async () => {
    const tr = await db.trabajos.get(trabajoId);
    if (tr && tr.estado === 'NO_PAGADO') await db.trabajos.update(trabajoId, { estado: 'PENDIENTE', pagoId: null });
  });
}

/**
 * "Ya no me van a pagar más": cierra el período con un pago FINAL de $ 0 y pasa sus PENDIENTE a NO_PAGADO,
 * en una transacción. Con el pago FINAL, lo que faltaba cobrar "a cuenta" pasa a ser deuda reclamable en
 * plata del período (`resumenPeriodo().deudaPlata`). Es el único pago de $ 0 que se registra.
 */
export async function cerrarPeriodo(lugarId: string, periodoFin: FechaISO, fecha: FechaISO): Promise<string> {
  return db.transaction('rw', db.pagos, db.trabajos, db.lugares, async () => {
    const lugar = await db.lugares.get(lugarId);
    if (!lugar) throw new ErrorDatos('LUGAR_INEXISTENTE');
    await db.trabajos
      .where('lugarId').equals(lugarId)
      .filter(tr => tr.estado === 'PENDIENTE' && periodoQueContiene(lugar.reglasCierre, tr.fecha).fin === periodoFin)
      .modify({ estado: 'NO_PAGADO' });
    const pago: Pago = { id: nuevoId(), tipo: 'FINAL', lugarId, periodoFin, fecha, monto: 0, nota: '', creadoEn: ahoraISO() };
    await db.pagos.add(pago);
    return pago.id;
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

/**
 * "Ya me lo pagaron" desde el aviso de deuda: lo elegido (trabajos NO_PAGADO del lugar, de cualquier período,
 * y diferencias en plata) se registra con un pago FINAL adicional por período, por lo que valía cada cosa, en
 * una transacción. Los trabajos quedan PAGADO en el pago de su período. Devuelve los ids de los pagos.
 */
export async function cobrarDeuda(
  lugarId: string,
  fecha: FechaISO,
  elegidos: { trabajos: string[]; diferencias: { periodoFin: FechaISO; monto: Centavos }[] },
): Promise<string[]> {
  return db.transaction('rw', db.pagos, db.trabajos, db.lugares, async () => {
    const lugar = await db.lugares.get(lugarId);
    if (!lugar) throw new ErrorDatos('LUGAR_INEXISTENTE');
    const trabajos = await db.trabajos.bulkGet(elegidos.trabajos);
    if (trabajos.some(tr => !tr || tr.lugarId !== lugarId || tr.estado !== 'NO_PAGADO')) {
      throw new ErrorDatos('TRABAJO_INEXISTENTE');
    }
    const porPeriodo = new Map<FechaISO, { monto: Centavos; trabajos: string[] }>();
    const grupo = (fin: FechaISO) => {
      const g = porPeriodo.get(fin) ?? { monto: 0, trabajos: [] };
      porPeriodo.set(fin, g);
      return g;
    };
    for (const tr of trabajos) {
      const g = grupo(periodoQueContiene(lugar.reglasCierre, tr!.fecha).fin);
      g.monto += tr!.monto;
      g.trabajos.push(tr!.id);
    }
    for (const d of elegidos.diferencias) grupo(d.periodoFin).monto += d.monto;

    const ids: string[] = [];
    for (const [periodoFin, g] of porPeriodo) {
      const pago: Pago = { id: nuevoId(), tipo: 'FINAL', lugarId, periodoFin, fecha, monto: g.monto, nota: '', creadoEn: ahoraISO() };
      await db.pagos.add(pago);
      for (const id of g.trabajos) await db.trabajos.update(id, { estado: 'PAGADO', pagoId: pago.id });
      ids.push(pago.id);
    }
    return ids;
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

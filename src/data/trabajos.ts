import { periodoQueContiene } from '../domain/periodos';
import type { Trabajo } from '../domain/types';
import { ahoraISO, db, nuevoId } from './db';
import { ErrorDatos } from './errores';

type EntradaTrabajo = Omit<Trabajo, 'id' | 'creadoEn' | 'actualizadoEn' | 'estado' | 'pagoId'> & { id?: string };

/**
 * Crea (PENDIENTE) o edita (conserva estado, pago y creación) un trabajo.
 * `periodoYaPagado`: el período de la fecha ya tiene algún pago y el trabajo es nuevo o cambió de período.
 */
export async function guardarTrabajo(t: EntradaTrabajo): Promise<{ id: string; periodoYaPagado: boolean }> {
  return db.transaction('rw', db.trabajos, db.lugares, db.pagos, async () => {
    const lugar = await db.lugares.get(t.lugarId);
    if (!lugar) throw new ErrorDatos('LUGAR_INEXISTENTE');
    const previo = t.id ? await db.trabajos.get(t.id) : undefined;
    if (t.id && !previo) throw new ErrorDatos('TRABAJO_INEXISTENTE');

    const ahora = ahoraISO();
    const id = previo ? previo.id : nuevoId();
    const fin = periodoQueContiene(lugar.reglasCierre, t.fecha).fin;
    await db.trabajos.put(
      previo
        ? { ...t, id, estado: previo.estado, pagoId: previo.pagoId, creadoEn: previo.creadoEn, actualizadoEn: ahora }
        : { ...t, id, estado: 'PENDIENTE', pagoId: null, creadoEn: ahora, actualizadoEn: ahora },
    );

    let cambioDePeriodo = true;
    if (previo) {
      const lugarPrevio = previo.lugarId === lugar.id ? lugar : await db.lugares.get(previo.lugarId);
      cambioDePeriodo =
        !lugarPrevio ||
        lugarPrevio.id !== lugar.id ||
        periodoQueContiene(lugarPrevio.reglasCierre, previo.fecha).fin !== fin;
    }
    const pagosDelPeriodo = cambioDePeriodo
      ? await db.pagos.where('lugarId').equals(lugar.id).filter(p => p.periodoFin === fin).count()
      : 0;
    return { id, periodoYaPagado: pagosDelPeriodo > 0 };
  });
}

/** Borra el trabajo; si estaba en un pago, el pago sigue y la conciliación se recalcula. */
export async function borrarTrabajo(id: string): Promise<void> {
  await db.trabajos.delete(id);
}

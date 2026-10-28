import type { Copia, Datos } from '../domain/copia';
import { db } from './db';

export { ErrorDatos } from './errores';

/** Ajustes propios de cada dispositivo: la restauración los conserva y nunca los toma del archivo. */
const AJUSTES_DEL_DISPOSITIVO = ['pinHash', 'pinSalt'];

export async function exportarDatos(): Promise<Datos> {
  return db.transaction('r', db.tables, async () => ({
    lugares: await db.lugares.toArray(),
    tiposTrabajo: await db.tiposTrabajo.toArray(),
    trabajos: await db.trabajos.toArray(),
    pagos: await db.pagos.toArray(),
    movimientos: await db.movimientos.toArray(),
    categorias: await db.categorias.toArray(),
    ajustes: await db.ajustes.toArray(),
  }));
}

/**
 * Reemplaza todos los datos por los de la copia, en una sola transacción: si algo falla, Dexie la aborta y
 * los datos actuales quedan intactos. El PIN del dispositivo se conserva y el que venga en el archivo se descarta.
 * La copia ya debe venir validada con `leerCopia`.
 */
export async function restaurarDatos(c: Copia): Promise<void> {
  const d = c.datos;
  await db.transaction('rw', db.tables, async () => {
    const pinActual = (await db.ajustes.bulkGet(AJUSTES_DEL_DISPOSITIVO)).filter(a => a !== undefined);
    for (const t of db.tables) await t.clear();
    await db.lugares.bulkAdd(d.lugares);
    await db.tiposTrabajo.bulkAdd(d.tiposTrabajo);
    await db.trabajos.bulkAdd(d.trabajos);
    await db.pagos.bulkAdd(d.pagos);
    await db.movimientos.bulkAdd(d.movimientos);
    await db.categorias.bulkAdd(d.categorias);
    await db.ajustes.bulkAdd(d.ajustes.filter(a => !AJUSTES_DEL_DISPOSITIVO.includes(a.clave)));
    await db.ajustes.bulkPut(pinActual);
  });
}

import type { FechaISO } from '../domain/dates';
import { type DiaCierre, INICIO_DE_LOS_TIEMPOS, cambiarDiaCierre } from '../domain/periodos';
import type { Lugar, TipoTrabajo } from '../domain/types';
import { ahoraISO, db, nuevoId } from './db';
import { ErrorDatos } from './errores';

export async function crearLugar(
  d: Omit<Lugar, 'id' | 'creadoEn' | 'archivado' | 'reglasCierre'> & { diaCierre: DiaCierre },
): Promise<string> {
  const { diaCierre, ...resto } = d;
  const id = nuevoId();
  await db.lugares.add({
    ...resto,
    id,
    reglasCierre: [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: diaCierre }],
    archivado: false,
    creadoEn: ahoraISO(),
  });
  return id;
}

export async function actualizarLugar(
  id: string,
  cambios: Partial<Omit<Lugar, 'reglasCierre'>> & { diaCierre?: DiaCierre },
  hoy: FechaISO,
): Promise<void> {
  await db.transaction('rw', db.lugares, async () => {
    const lugar = await db.lugares.get(id);
    if (!lugar) throw new ErrorDatos('LUGAR_INEXISTENTE');
    const { diaCierre, id: _id, ...planos } = cambios;
    const actualizado: Lugar = { ...lugar, ...planos };
    if (diaCierre !== undefined) {
      // La regla más reciente (por vigenteDesde) es la que manda; si ya es ese día, no se agrega otra.
      const ultima = lugar.reglasCierre.reduce((a, r) => (r.vigenteDesde >= a.vigenteDesde ? r : a));
      if (ultima.dia !== diaCierre) actualizado.reglasCierre = cambiarDiaCierre(lugar.reglasCierre, diaCierre, hoy);
    }
    await db.lugares.put(actualizado);
  });
}

export async function archivarLugar(id: string, archivado: boolean): Promise<void> {
  const n = await db.lugares.update(id, { archivado });
  if (n === 0) throw new ErrorDatos('LUGAR_INEXISTENTE');
}

/**
 * Un lugar con trabajos o con pagos no se borra (se archiva): un pago sin lugar quedaría contando en los
 * totales sin que ninguna pantalla pueda mostrarlo. Sin ninguno, se borra junto con su lista de trabajos.
 */
export async function borrarLugar(id: string): Promise<void> {
  await db.transaction('rw', db.lugares, db.tiposTrabajo, db.trabajos, db.pagos, async () => {
    if ((await db.trabajos.where('lugarId').equals(id).count()) > 0) throw new ErrorDatos('LUGAR_CON_TRABAJOS');
    if ((await db.pagos.where('lugarId').equals(id).count()) > 0) throw new ErrorDatos('LUGAR_CON_PAGOS');
    await db.tiposTrabajo.where('lugarId').equals(id).delete();
    await db.lugares.delete(id);
  });
}

export async function guardarTipoTrabajo(t: Omit<TipoTrabajo, 'id'> & { id?: string }): Promise<string> {
  const id = t.id ?? nuevoId();
  await db.tiposTrabajo.put({ ...t, id });
  return id;
}

/** Los trabajos ya anotados conservan su copia del precio y no se tocan. */
export async function borrarTipoTrabajo(id: string): Promise<void> {
  await db.tiposTrabajo.delete(id);
}

export type DatosLugar = Parameters<typeof crearLugar>[0];
export interface TipoEnForm { id?: string; nombre: string; precio: number }

/**
 * Guarda el lugar (alta si no hay `id`, edición si lo hay) y su lista de precios en UNA transacción:
 * si algo falla no queda un lugar a medias ni se pierden precios. `tipos` es la lista final (en orden);
 * los tipos guardados que no estén en ella se borran. Con `tipos: null` (cobro por porcentaje) no se tocan.
 */
export async function guardarLugarConTipos(
  args: { id?: string; datos: DatosLugar; tipos: TipoEnForm[] | null; hoy: FechaISO },
): Promise<string> {
  return db.transaction('rw', db.lugares, db.tiposTrabajo, async () => {
    let id: string;
    if (args.id) {
      id = args.id;
      await actualizarLugar(id, args.datos, args.hoy);
    } else {
      id = await crearLugar(args.datos);
    }
    if (args.tipos) {
      const quedan = new Set(args.tipos.map(t => t.id));
      for (const t of await db.tiposTrabajo.where('lugarId').equals(id).toArray()) {
        if (!quedan.has(t.id)) await borrarTipoTrabajo(t.id);
      }
      for (const [orden, t] of args.tipos.entries()) {
        await guardarTipoTrabajo({ id: t.id, lugarId: id, nombre: t.nombre, precio: t.precio, orden });
      }
    }
    return id;
  });
}

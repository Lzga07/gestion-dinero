import type { Movimiento } from '../domain/types';
import { ahoraISO, db, nuevoId } from './db';
import { ErrorDatos } from './errores';

export async function guardarMovimiento(m: Omit<Movimiento, 'id' | 'creadoEn'> & { id?: string }): Promise<string> {
  return db.transaction('rw', db.movimientos, db.categorias, async () => {
    if (!(await db.categorias.get(m.categoriaId))) throw new ErrorDatos('CATEGORIA_INEXISTENTE');
    const previo = m.id ? await db.movimientos.get(m.id) : undefined;
    const id = m.id ?? nuevoId();
    await db.movimientos.put({ ...m, id, creadoEn: previo?.creadoEn ?? ahoraISO() });
    return id;
  });
}

export async function borrarMovimiento(id: string): Promise<void> {
  await db.movimientos.delete(id);
}

import type { Categoria } from '../domain/types';
import { db, nuevoId } from './db';
import { ErrorDatos } from './errores';

export async function guardarCategoria(c: Omit<Categoria, 'id'> & { id?: string }): Promise<string> {
  const id = c.id ?? nuevoId();
  await db.categorias.put({ ...c, id });
  return id;
}

/** Si tiene movimientos hay que elegir otra categoría (`moverA`) a la que pasarlos; sin movimientos se borra directo. */
export async function borrarCategoria(id: string, moverA: string | null): Promise<void> {
  await db.transaction('rw', db.categorias, db.movimientos, async () => {
    const usados = db.movimientos.where('categoriaId').equals(id);
    if ((await usados.count()) > 0) {
      if (moverA === null) throw new ErrorDatos('CATEGORIA_EN_USO');
      if (moverA === id || !(await db.categorias.get(moverA))) throw new ErrorDatos('CATEGORIA_INEXISTENTE');
      await usados.modify({ categoriaId: moverA });
    }
    await db.categorias.delete(id);
  });
}

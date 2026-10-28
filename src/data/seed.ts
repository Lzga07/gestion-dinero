import type { Categoria } from '../domain/types';
import { db, nuevoId } from './db';

type Inicial = Omit<Categoria, 'id' | 'orden'>;

/** Categorías iniciales del spec §4.5 (editables y borrables). */
const INICIALES: Inicial[] = [
  { nombre: 'Materiales', tipo: 'GASTO', ambito: 'TRABAJO', icono: '🧰', color: '#9e4430' },
  { nombre: 'Traslado', tipo: 'GASTO', ambito: 'TRABAJO', icono: '🚌', color: '#b8693f' },
  { nombre: 'Cursos', tipo: 'GASTO', ambito: 'TRABAJO', icono: '🎓', color: '#7a4a8c' },
  { nombre: 'Otros de trabajo', tipo: 'GASTO', ambito: 'TRABAJO', icono: '🧾', color: '#8a6d3b' },
  { nombre: 'Supermercado', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🛒', color: '#c0562f' },
  { nombre: 'Alquiler', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🏠', color: '#5b6f9e' },
  { nombre: 'Servicios', tipo: 'GASTO', ambito: 'PERSONAL', icono: '💡', color: '#b08a1e' },
  { nombre: 'Salud', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🩺', color: '#a8435c' },
  { nombre: 'Ocio', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🎬', color: '#6a5acd' },
  { nombre: 'Otros personales', tipo: 'GASTO', ambito: 'PERSONAL', icono: '📦', color: '#7d7468' },
  { nombre: 'Otros ingresos', tipo: 'INGRESO', ambito: null, icono: '💰', color: '#25685b' },
];

/** Carga las categorías iniciales solo si la tabla está vacía (así una categoría borrada no reaparece). */
export async function asegurarCategoriasIniciales(): Promise<void> {
  await db.transaction('rw', db.categorias, async () => {
    if ((await db.categorias.count()) > 0) return;
    await db.categorias.bulkAdd(INICIALES.map((c, orden) => ({ ...c, id: nuevoId(), orden })));
  });
}

import Dexie, { type EntityTable } from 'dexie';
import type { Ajuste, Categoria, Lugar, Movimiento, Pago, TipoTrabajo, Trabajo } from '../domain/types';

export type GestionDB = Dexie & {
  lugares: EntityTable<Lugar, 'id'>;
  tiposTrabajo: EntityTable<TipoTrabajo, 'id'>;
  trabajos: EntityTable<Trabajo, 'id'>;
  pagos: EntityTable<Pago, 'id'>;
  movimientos: EntityTable<Movimiento, 'id'>;
  categorias: EntityTable<Categoria, 'id'>;
  ajustes: EntityTable<Ajuste, 'clave'>;
};

export const db = new Dexie('gestion-dinero') as GestionDB;
db.version(1).stores({
  lugares: 'id',
  tiposTrabajo: 'id, lugarId',
  trabajos: 'id, lugarId, fecha, estado, pagoId',
  pagos: 'id, lugarId, periodoFin',
  movimientos: 'id, fecha, tipo, categoriaId',
  categorias: 'id, tipo',
  ajustes: 'clave',
});

export function nuevoId(): string {
  return crypto.randomUUID();
}

export function ahoraISO(): string {
  return new Date().toISOString();
}

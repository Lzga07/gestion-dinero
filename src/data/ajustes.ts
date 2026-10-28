import { db } from './db';

/** Claves: 'ultimaCopia' (ISO), 'recordatorioCopiaDias' (por defecto 7), 'ultimoLugarId', 'pinHash', 'pinSalt'. */
export async function leerAjuste<T>(clave: string, porDefecto: T): Promise<T> {
  const fila = await db.ajustes.get(clave);
  return fila ? (fila.valor as T) : porDefecto;
}

export async function guardarAjuste(clave: string, valor: unknown): Promise<void> {
  await db.ajustes.put({ clave, valor });
}

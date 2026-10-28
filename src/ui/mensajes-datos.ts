import { ErrorDatos } from '../data/errores'

const MENSAJES: Record<string, string> = {
  CATEGORIA_INEXISTENTE: 'Esa categoría ya no existe. Elegí otra.',
  CATEGORIA_EN_USO: 'Esa categoría tiene movimientos: elegí a qué categoría pasarlos.',
}

/** Mensaje en castellano para un error de la capa de datos; si no es uno conocido, `porDefecto`. */
export function mensajeErrorDatos(e: unknown, porDefecto: string): string {
  return (e instanceof ErrorDatos && MENSAJES[e.codigo]) || porDefecto
}

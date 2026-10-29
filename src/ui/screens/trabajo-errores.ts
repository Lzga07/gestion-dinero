import { calcularTrabajo, type EntradaTrabajo, type ErrorTrabajo } from '../../domain/trabajos'

/** Los avisos en línea de los formularios de trabajo ("Nuevo trabajo" y la fila de carga de meses anteriores). */
export const MENSAJES: Record<ErrorTrabajo, string> = {
  FALTA_TIPO: 'Elegí qué hiciste',
  FALTA_DESCRIPCION: 'Escribí qué hiciste',
  MONTO_INVALIDO: 'Ingresá un monto mayor a 0',
  DESCUENTO_MAYOR: 'El descuento tiene que ser menor a lo que pagó el cliente',
  PORCENTAJE_INVALIDO: 'Revisá el porcentaje del lugar',
}

/** Todos los errores a la vez: si falta la descripción, igual se revisa lo demás. */
export function erroresDe(entrada: EntradaTrabajo): Set<ErrorTrabajo> {
  const errores = new Set<ErrorTrabajo>()
  let actual = entrada
  for (let i = 0; i < 2; i++) {
    const r = calcularTrabajo(actual)
    if (r.ok) break
    errores.add(r.error)
    if (r.error !== 'FALTA_DESCRIPCION') break
    actual =
      actual.forma === 'ARANCEL_FIJO' ? { ...actual, otroNombre: 'x' } : { ...actual, descripcion: 'x' }
  }
  return errores
}

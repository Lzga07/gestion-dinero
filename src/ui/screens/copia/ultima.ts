import { diasEntre, hoy as fechaLocal, type FechaISO } from '../../../domain/dates'
import { plural } from '../periodo/utils'

/** Días de calendario (en hora local) desde la última copia; null si nunca hubo o la fecha guardada no se puede leer. */
export function diasDesdeCopia(ultimaCopia: string | null, hoy: FechaISO): number | null {
  if (ultimaCopia === null) return null
  const cuando = new Date(ultimaCopia)
  if (Number.isNaN(cuando.getTime())) return null
  return Math.max(0, diasEntre(fechaLocal(cuando), hoy))
}

export function textoUltimaCopia(dias: number | null): string {
  if (dias === null) return 'Nunca hiciste una copia'
  if (dias === 0) return 'Última copia: hoy'
  if (dias === 1) return 'Última copia: ayer'
  return `Última copia: hace ${plural(dias, 'día', 'días')}`
}

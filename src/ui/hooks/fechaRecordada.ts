import { hoy, type FechaISO } from '../../domain/dates'

/** Clave de `sessionStorage`: es solo una comodidad de la sesión, no va a la base ni a la copia. */
export const CLAVE_FECHA_RECORDADA = 'gd:ultimaFechaTrabajo'

/** Cuánto tiempo se acuerda de la fecha del último trabajo guardado. */
export const VIGENCIA_FECHA_MS = 30 * 60_000

/** Fecha del último trabajo guardado en los últimos 30 minutos, si no es hoy. Sin storage, null. */
export function leerFechaRecordada(ahora: number = Date.now()): FechaISO | null {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_FECHA_RECORDADA)
    if (crudo === null) return null
    const { fecha, en } = JSON.parse(crudo) as { fecha?: unknown; en?: unknown }
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || typeof en !== 'number') return null
    if (ahora - en > VIGENCIA_FECHA_MS || ahora < en) return null
    return fecha === hoy(new Date(ahora)) ? null : fecha
  } catch {
    return null
  }
}

/** Recuerda la fecha del trabajo recién guardado (también si es hoy, para olvidar una anterior). */
export function recordarFecha(fecha: FechaISO, ahora: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(CLAVE_FECHA_RECORDADA, JSON.stringify({ fecha, en: ahora }))
  } catch {
    // Sin storage: el trabajo igual quedó guardado y la próxima fecha arranca en hoy.
  }
}

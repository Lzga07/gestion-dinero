import type { DiaCierre } from '../../domain/periodos'
import type { Lugar } from '../../domain/types'

/** Día de cierre vigente: el de la regla con `vigenteDesde` más reciente. */
export function diaCierreActual(lugar: Lugar): DiaCierre {
  return lugar.reglasCierre.reduce((a, r) => (r.vigenteDesde >= a.vigenteDesde ? r : a)).dia
}

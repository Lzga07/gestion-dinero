import { diaAcotado, parseFecha, sumarMeses, type FechaISO } from '../../../domain/dates'
import { periodoQueContiene, type Periodo } from '../../../domain/periodos'
import type { Lugar } from '../../../domain/types'

/** Hasta cuántos meses atrás se puede cargar (5 años). */
const MESES_ATRAS = 60

/** Fecha más vieja cuyo período se ofrece: el mismo día de hoy, 5 años atrás (acotado a fin de mes). */
function limiteAtras(hoy: FechaISO): FechaISO {
  const { y, m, d } = parseFecha(hoy)
  const l = sumarMeses(y, m, -MESES_ATRAS)
  return diaAcotado(l.y, l.m, d)
}

/** El período se puede cargar si ya terminó (no es el de hoy) y no pasó el límite de 5 años. */
export function periodoOfrecido(lugar: Lugar, periodo: Periodo, hoy: FechaISO): boolean {
  return periodo.fin < periodoQueContiene(lugar.reglasCierre, hoy).inicio && periodo.fin >= limiteAtras(hoy)
}

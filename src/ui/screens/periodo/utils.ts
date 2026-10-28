import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../data/db'
import { formatFechaCorta, sumarDias, type FechaISO } from '../../../domain/dates'
import type { Centavos } from '../../../domain/money'
import { periodoQueContiene, type Periodo } from '../../../domain/periodos'
import type { Lugar, Pago, Trabajo } from '../../../domain/types'

export interface DatosLugar {
  lugar: Lugar | undefined
  trabajos: Trabajo[]
  pagos: Pago[]
}

/** El lugar con todos sus trabajos y pagos, siempre al día. `undefined` mientras carga. */
export function useDatosLugar(id: string | undefined): DatosLugar | undefined {
  return useLiveQuery(
    async (): Promise<DatosLugar> => {
      if (!id) return { lugar: undefined, trabajos: [], pagos: [] }
      return {
        lugar: await db.lugares.get(id),
        trabajos: await db.trabajos.where('lugarId').equals(id).toArray(),
        pagos: await db.pagos.where('lugarId').equals(id).toArray(),
      }
    },
    [id],
  )
}

/** Período pedido en `?periodo=<fin>` (cualquier fecha que caiga en él); si falta o no es válido, el de hoy. */
export function periodoPedido(lugar: Lugar, pedido: string | null, hoyISO: FechaISO): Periodo {
  const valido = pedido !== null && /^\d{4}-\d{2}-\d{2}$/.test(pedido) && sumarDias(pedido, 0) === pedido
  return periodoQueContiene(lugar.reglasCierre, valido ? pedido : hoyISO)
}

export const finDe = (lugar: Lugar, tr: Trabajo): FechaISO => periodoQueContiene(lugar.reglasCierre, tr.fecha).fin

/** Del más nuevo al más viejo; a igual fecha, en el orden en que se anotaron. */
export function ordenarTrabajos(trabajos: Trabajo[]): Trabajo[] {
  return [...trabajos].sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0,
  )
}

export const sumaMontos = (trabajos: Trabajo[]): Centavos => trabajos.reduce((s, tr) => s + tr.monto, 0)

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** "26 sep · Corona" */
export const etiquetaTrabajo = (tr: Trabajo) => `${formatFechaCorta(tr.fecha)} · ${tr.descripcion}`

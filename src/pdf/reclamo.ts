import type { Aviso } from '../domain/avisos'
import type { FechaISO } from '../domain/dates'
import type { Periodo } from '../domain/periodos'
import type { Lugar, Pago } from '../domain/types'
import type { DatosListado } from './listado'

type AvisoDeuda = Extract<Aviso, { tipo: 'DEUDA' }>

/**
 * Fecha del pago FINAL que dejó la diferencia en plata del período: el primero (por fecha y, a igual fecha,
 * el que se registró antes). Los FINAL posteriores son cobros adicionales ("Ya me lo pagaron").
 */
function fechaDelPagoFinal(lugarId: string, periodo: Periodo, pagos: Pago[], respaldo: FechaISO): FechaISO {
  const finales = pagos
    .filter((p) => p.lugarId === lugarId && p.periodoFin === periodo.fin && p.tipo === 'FINAL')
    .sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.creadoEn < b.creadoEn ? -1 : 1))
  return finales[0]?.fecha ?? respaldo
}

/** Datos del reclamo de un lugar a partir de su aviso de deuda: todo lo `NO_PAGADO` y las diferencias en plata. */
export function datosReclamo(lugar: Lugar, aviso: AvisoDeuda, pagos: Pago[], hoy: FechaISO): DatosListado {
  return {
    lugar,
    periodo: null,
    resumen: null,
    trabajos: aviso.noPagados,
    deudasPlata: aviso.deudasPlata.map((d) => ({
      periodo: d.periodo,
      monto: d.monto,
      fechaPago: fechaDelPagoFinal(lugar.id, d.periodo, pagos, d.periodo.fin),
    })),
    incluirNotas: true,
    tipo: 'RECLAMO',
    hoy,
  }
}

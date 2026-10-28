import { vi } from 'vitest'
import { guardarTrabajo } from '../../../data/trabajos'
import type { FechaISO } from '../../../domain/dates'

/** Anota un trabajo de arancel fijo con descripción; `pesos` en pesos enteros. */
export async function anotar(lugarId: string, fecha: FechaISO, descripcion: string, pesos: number): Promise<string> {
  // Con la fecha simulada el reloj no avanza: se lo mueve 1 ms para que `creadoEn` ordene los trabajos.
  if (vi.isFakeTimers()) vi.advanceTimersByTime(1)
  const monto = pesos * 100
  const { id } = await guardarTrabajo({
    lugarId, fecha, descripcion, tipoTrabajoId: null, precioLista: monto,
    montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null, monto, nota: '',
  })
  return id
}

/** Septiembre de la maqueta: 4 trabajos, $ 138.000 en total (período 1 – 30 sep). */
export async function septiembre(lugarId: string) {
  return {
    arreglo: await anotar(lugarId, '2026-09-29', 'Arreglo', 38000),
    corona: await anotar(lugarId, '2026-09-26', 'Corona', 45000),
    limpieza: await anotar(lugarId, '2026-09-25', 'Limpieza', 25000),
    extraccion: await anotar(lugarId, '2026-09-22', 'Extracción', 30000),
  }
}

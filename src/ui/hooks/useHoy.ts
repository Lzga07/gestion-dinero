import { useEffect, useState } from 'react'
import { hoy, type FechaISO } from '../../domain/dates'

/**
 * La fecha de hoy. Se recalcula cuando la app vuelve a primer plano, para que una app que quedó
 * abierta de un día para el otro no siga mostrando (ni calculando avisos de) la fecha vieja.
 */
export function useHoy(): FechaISO {
  const [fecha, setFecha] = useState<FechaISO>(() => hoy())
  useEffect(() => {
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') setFecha(hoy())
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [])
  return fecha
}

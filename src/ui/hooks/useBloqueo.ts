import { useCallback, useEffect, useRef, useState } from 'react'
import { tienePin } from '../../data/pin'
import { BLOQUEO_TRAS_MS } from '../../platform/pin'

/**
 * - `cargando`: todavía no se sabe si hay PIN (no se dibuja nada).
 * - `error`: no se pudo leer la base; por las dudas no se abre (nunca se supone "sin PIN").
 * - `bloqueada`: hay que ingresar el PIN.
 * - `abierta`: sin PIN, o ya desbloqueada.
 */
export type FaseBloqueo = 'cargando' | 'error' | 'bloqueada' | 'abierta'

export interface Bloqueo {
  fase: FaseBloqueo
  /** True desde que la app se abrió por primera vez: de ahí en más se mantiene montada aunque se vuelva a bloquear. */
  appMontada: boolean
  desbloquear: () => void
  /** Vuelve a leer si hay PIN (después de un error). */
  reintentar: () => void
}

/**
 * Estado del bloqueo con PIN. Al cargar bloquea si hay `pinHash`; al volver a `visible` después de más de
 * `BLOQUEO_TRAS_MS` oculta, lo vuelve a mirar y bloquea si sigue habiendo PIN. El tiempo oculta se mide
 * con la hora (`Date.now()`) y no con un temporizador, porque el celular duerme los temporizadores.
 */
export function useBloqueo(): Bloqueo {
  const [fase, setFase] = useState<FaseBloqueo>('cargando')
  const [appMontada, setAppMontada] = useState(false)
  const faseActual = useRef(fase)
  // Cada lectura que empieza invalida a la anterior, para que una respuesta vieja no pise a una nueva.
  const lecturaActual = useRef(0)
  // Lo último que se supo de la base. Si había PIN, al volver se tapa al instante, sin esperar la lectura.
  const habiaPin = useRef(false)

  const cambiarFase = useCallback((nueva: FaseBloqueo) => {
    faseActual.current = nueva
    setFase(nueva)
    if (nueva === 'abierta') setAppMontada(true)
  }, [])

  const leer = useCallback(() => {
    const numero = ++lecturaActual.current
    tienePin().then(
      (hay) => {
        if (numero !== lecturaActual.current) return
        habiaPin.current = hay
        cambiarFase(hay ? 'bloqueada' : 'abierta')
      },
      (e: unknown) => {
        console.error('No se pudo leer el PIN', e)
        if (numero === lecturaActual.current) cambiarFase('error')
      },
    )
  }, [cambiarFase])

  useEffect(() => {
    const lecturas = lecturaActual
    leer()
    return () => {
      lecturas.current++ // al desmontar, ninguna lectura pendiente toca el estado
    }
  }, [leer])

  useEffect(() => {
    let ocultaDesde: number | null = null
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') {
        ocultaDesde ??= Date.now()
        return
      }
      const desde = ocultaDesde
      ocultaDesde = null
      if (desde === null || faseActual.current !== 'abierta' || Date.now() - desde <= BLOQUEO_TRAS_MS) return
      // Se vuelve a mirar la base (el PIN pudo cambiar), pero si había uno se tapa ya mismo: sin destello de datos.
      if (habiaPin.current) cambiarFase('bloqueada')
      leer()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [leer, cambiarFase])

  const desbloquear = useCallback(() => {
    lecturaActual.current++
    cambiarFase('abierta')
  }, [cambiarFase])

  return { fase, appMontada, desbloquear, reintentar: leer }
}

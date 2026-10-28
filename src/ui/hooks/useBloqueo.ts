import { useCallback, useEffect, useRef, useState } from 'react'
import { tienePin } from '../../data/pin'
import { BLOQUEO_TRAS_MS } from '../../platform/pin'

/**
 * - `cargando`: todavía no se sabe si hay PIN (no se dibuja nada).
 * - `error`: no se pudo leer la base; por las dudas no se abre (nunca se supone "sin PIN").
 * - `comprobando`: se volvió a la app tras mucho tiempo y se está mirando si hay PIN; mientras tanto la app queda tapada.
 * - `bloqueada`: hay que ingresar el PIN.
 * - `abierta`: sin PIN, o ya desbloqueada.
 */
export type FaseBloqueo = 'cargando' | 'error' | 'comprobando' | 'bloqueada' | 'abierta'

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
      // Se tapa ya mismo, sin depender de lo que se supiera antes (el PIN pudo crearse o quitarse en esta
      // sesión): así no hay destello de datos mientras se lee la base. Después se bloquea o se destapa.
      cambiarFase('comprobando')
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

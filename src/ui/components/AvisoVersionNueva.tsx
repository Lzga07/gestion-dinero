import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * La versión nueva de la app (después de publicar) se descarga sola pero no se aplica en medio del uso:
 * espera al próximo arranque en frío o a que la persona toque "Actualizar". Aplicarla sola a mitad de uso
 * borraba los archivos viejos que la página abierta todavía pedía (p. ej. el que arma los PDF).
 */
export default function AvisoVersionNueva() {
  const registro = useRef<ServiceWorkerRegistration | null>(null)
  const {
    needRefresh: [hayNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      registro.current = r ?? null
    },
  })

  // Instalada en el celular la app puede quedar abierta días: al volver a primer plano se busca la versión nueva.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === 'visible') registro.current?.update().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  // La región queda siempre puesta (vacía) para que el lector de pantalla anuncie el aviso cuando aparece.
  return (
    <div role="status">
      {hayNueva && (
        <p className="version-nueva">
          <span>Hay una versión nueva</span>
          <span aria-hidden="true"> · </span>
          <button type="button" className="version-nueva__boton" onClick={() => void updateServiceWorker(true)}>
            Actualizar
          </button>
        </p>
      )}
    </div>
  )
}

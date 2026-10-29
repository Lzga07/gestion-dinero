import { useEffect, useState } from 'react'
import Button from './Button'

/** Pasado este tiempo sin datos, se avisa en vez de seguir con la pantalla vacía. */
export const DEMORA_CARGA_MS = 4000

/**
 * Lo que se ve mientras una pantalla lee la base: nada al principio (casi siempre carga al instante) y, si
 * tarda, un aviso con "Reintentar". En Android la base del navegador llegó a trabarse unos minutos: la app
 * quedaba en blanco sin explicar nada. Reintentar recarga la app (una conexión nueva a la base).
 */
export default function Cargando({ onReintentar = () => window.location.reload() }: { onReintentar?: () => void }) {
  const [demorado, setDemorado] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      console.warn(`La base no respondió en ${DEMORA_CARGA_MS / 1000} s`, window.location.hash || '#/')
      setDemorado(true)
    }, DEMORA_CARGA_MS)
    return () => clearTimeout(t)
  }, [])

  if (!demorado) return null
  return (
    <div className="cargando" role="alert">
      <p className="cargando__titulo">Tus datos están tardando en cargar</p>
      <p className="muted">No se perdió nada. Si sigue así, cerrá la app y volvé a abrirla en unos minutos.</p>
      <Button onClick={onReintentar}>Reintentar</Button>
    </div>
  )
}

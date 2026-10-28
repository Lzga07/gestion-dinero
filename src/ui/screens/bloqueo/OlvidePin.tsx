import { useEffect, useRef, useState } from 'react'
import { quitarPin } from '../../../data/pin'
import Button from '../../components/Button'

const ESPERA_MS = 60_000

interface OlvidePinProps {
  /** Cancela todo (también la cuenta regresiva) y vuelve al teclado. */
  onVolver: () => void
  /** El PIN ya se quitó: hay que abrir la app. */
  onQuitado: () => void
}

/**
 * "Olvidé mi PIN": explica que el PIN no cifra nada, pide confirmación y hace esperar 1 minuto (cuenta
 * regresiva visible) antes de habilitar "Quitar PIN". Quitar el PIN nunca borra datos.
 */
export default function OlvidePin({ onVolver, onQuitado }: OlvidePinProps) {
  // `fin` es la hora en que se habilita el botón; null mientras no confirmó. La cuenta sale de la hora, no de contar ticks.
  const [fin, setFin] = useState<number | null>(null)
  const [ahora, setAhora] = useState(0)
  const [quitando, setQuitando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const confirmado = fin !== null

  // Al cambiar de paso el foco vuelve al título, para que el lector de pantalla lea el paso nuevo.
  useEffect(() => titulo.current?.focus(), [confirmado])

  useEffect(() => {
    if (fin === null) return
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [fin])

  function confirmar() {
    const t = Date.now()
    setAhora(t)
    setFin(t + ESPERA_MS)
  }

  const restante = fin === null ? null : Math.max(0, Math.ceil((fin - ahora) / 1000))

  async function quitar() {
    if (fin === null || Date.now() < fin || quitando) return
    setQuitando(true)
    setError(null)
    try {
      await quitarPin()
      onQuitado()
    } catch (e) {
      console.error('No se pudo quitar el PIN', e)
      setError('No se pudo quitar el PIN. Probá de nuevo.')
      setQuitando(false)
    }
  }

  return (
    <div className="bloqueo__contenido bloqueo__contenido--texto">
      <h1 className="bloqueo__titulo" id="bloqueo-titulo" ref={titulo} tabIndex={-1}>
        Olvidé mi PIN
      </h1>
      {restante === null ? (
        <>
          <p className="bloqueo__texto">
            El PIN es una pantalla de privacidad: no cifra tus datos. Si lo quitás, la app se abre sin pedirlo y todos
            tus datos quedan como están: no se borra nada.
          </p>
          <p className="bloqueo__texto">
            Para que no lo pueda quitar cualquiera que agarre tu celular, antes esperás un minuto.
          </p>
          <Button block onClick={confirmar}>
            Quiero quitar el PIN
          </Button>
        </>
      ) : (
        <>
          <p className="bloqueo__cuenta">
            {restante > 0 ? `Podés quitar el PIN en ${restante} s` : 'Ya podés quitar el PIN'}
          </p>
          <p className="bloqueo__texto">Tus datos no se borran: solo se saca el PIN.</p>
          {error && (
            <p className="bloqueo__error" role="alert">
              {error}
            </p>
          )}
          <Button block variante="peligro" disabled={restante > 0 || quitando} onClick={() => void quitar()}>
            Quitar PIN
          </Button>
        </>
      )}
      <Button block variante="secundario" onClick={onVolver} disabled={quitando}>
        Volver
      </Button>
    </div>
  )
}

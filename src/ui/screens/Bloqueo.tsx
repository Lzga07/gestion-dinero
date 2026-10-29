import { useEffect, useRef, useState } from 'react'
import { verificarPinGuardado } from '../../data/pin'
import { pinValido } from '../../platform/pin'
import Button from '../components/Button'
import { useDialogoModal } from '../components/useDialogoModal'
import OlvidePin from './bloqueo/OlvidePin'

const MAX_DIGITOS = 6
const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const sinAccion = () => undefined

interface BloqueoProps {
  /** La persona ingresó el PIN correcto (o lo quitó con "Olvidé mi PIN"). */
  onDesbloquear: () => void
}

/**
 * Pantalla de privacidad que tapa toda la app hasta ingresar el PIN: teclado numérico grande y puntos que se
 * llenan (nunca se muestran los dígitos). No cifra nada: solo evita la mirada casual.
 */
export default function Bloqueo({ onDesbloquear }: BloqueoProps) {
  const [olvido, setOlvido] = useState(false)
  const [digitos, setDigitos] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Escape no cierra nada acá: el modal solo aporta el foco adentro y el ciclo de Tab.
  const { caja, alTeclear } = useDialogoModal(sinAccion)
  const pantalla = useRef<HTMLDivElement>(null)

  async function entrar() {
    if (!pinValido(digitos) || verificando) return
    setVerificando(true)
    setError(null)
    try {
      if (await verificarPinGuardado(digitos)) {
        onDesbloquear()
        return
      }
      setError('PIN incorrecto')
    } catch (e) {
      console.error('No se pudo verificar el PIN', e)
      setError('No pudimos verificar tu PIN. Probá de nuevo.')
    }
    setDigitos('')
    setVerificando(false)
    pantalla.current?.focus()
  }

  const agregar = (d: string) => setDigitos((actual) => (actual.length < MAX_DIGITOS ? actual + d : actual))
  const borrar = () => setDigitos((actual) => actual.slice(0, -1))

  // Al volver del "Olvidé mi PIN" el foco vuelve a los puntos (el botón que lo tenía ya no existe).
  useEffect(() => {
    if (!olvido) pantalla.current?.focus()
  }, [olvido])

  // Teclado físico (computadora o teclado Bluetooth). Enter sobre un botón ya lo maneja el propio botón.
  useEffect(() => {
    if (olvido || verificando) return
    const alPresionar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^\d$/.test(e.key)) agregar(e.key)
      else if (e.key === 'Backspace') borrar()
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) void entrar()
    }
    document.addEventListener('keydown', alPresionar)
    return () => document.removeEventListener('keydown', alPresionar)
  })

  const n = digitos.length

  return (
    <div className="bloqueo" role="dialog" aria-modal="true" aria-labelledby="bloqueo-titulo" ref={caja} onKeyDown={alTeclear}>
      {olvido ? (
        <OlvidePin onVolver={() => setOlvido(false)} onQuitado={onDesbloquear} />
      ) : (
        <div className="bloqueo__contenido">
          <h1 className="bloqueo__titulo" id="bloqueo-titulo">
            Ingresá tu PIN
          </h1>
          {/* Un punto por dígito sobre una línea, como un campo de texto: no hay lugares vacíos que delaten el largo. */}
          <div
            ref={pantalla}
            className="pin-linea"
            role="group"
            aria-label={`${n} ${n === 1 ? 'dígito ingresado' : 'dígitos ingresados'}`}
            tabIndex={-1}
            data-foco-inicial
          >
            <span aria-hidden="true">{'●'.repeat(n)}</span>
          </div>
          <p className="bloqueo__error" role={error ? 'alert' : undefined}>
            {error}
          </p>

          <div className="teclado">
            {DIGITOS.map((d) => (
              <button key={d} type="button" className="teclado__tecla" disabled={verificando} onClick={() => agregar(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="teclado__tecla teclado__tecla--texto" disabled={verificando || n === 0} onClick={borrar}>
              Borrar
            </button>
            <button type="button" className="teclado__tecla" disabled={verificando} onClick={() => agregar('0')}>
              0
            </button>
            <button
              type="button"
              className="teclado__tecla teclado__tecla--texto teclado__tecla--entrar"
              disabled={verificando || !pinValido(digitos)}
              onClick={() => void entrar()}
            >
              Entrar
            </button>
          </div>

          <Button variante="texto" onClick={() => setOlvido(true)} disabled={verificando}>
            Olvidé mi PIN
          </Button>
        </div>
      )}
    </div>
  )
}

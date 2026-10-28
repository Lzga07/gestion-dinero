import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import Button from './Button'

interface ConfirmDialogProps {
  titulo: string
  texto: string
  confirmar: string
  onConfirm: () => void
  onCancel: () => void
  /** Acción destructiva: el botón de confirmar va en terracota. */
  peligro?: boolean
  /** Texto del botón de cancelar; null lo oculta (aviso con un solo botón). */
  cancelar?: string | null
  /** Tercera respuesta (botón secundario entre "Cancelar" y "Confirmar"), p. ej. Sí / No / Todavía no sé. */
  alternativa?: { texto: string; onClick: () => void }
}

const FOCUSABLES = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Diálogo propio (no usa window.confirm): foco atrapado; Escape y tocar el fondo cancelan. */
export default function ConfirmDialog({
  titulo,
  texto,
  confirmar,
  onConfirm,
  onCancel,
  peligro = false,
  cancelar = 'Cancelar',
  alternativa,
}: ConfirmDialogProps) {
  const id = useId()
  const caja = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    // Lo seguro primero: el foco empieza en "Cancelar" si existe.
    const inicial = cancelRef.current ?? confirmRef.current
    inicial?.focus()
    return () => previo?.focus?.()
  }, [])

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key !== 'Tab' || !caja.current) return
    const items = Array.from(caja.current.querySelectorAll<HTMLElement>(FOCUSABLES))
    if (items.length === 0) return
    const primero = items[0]
    const ultimo = items[items.length - 1]
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primero.focus()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={caja}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-texto`}
        onKeyDown={alTeclear}
      >
        <h2 className="dialog__title" id={`${id}-titulo`}>
          {titulo}
        </h2>
        <p className="dialog__text" id={`${id}-texto`}>
          {texto}
        </p>
        <div className="dialog__actions">
          {cancelar !== null && (
            <Button ref={cancelRef} variante="secundario" onClick={onCancel}>
              {cancelar}
            </Button>
          )}
          {alternativa && (
            <Button variante="secundario" onClick={alternativa.onClick}>
              {alternativa.texto}
            </Button>
          )}
          <Button ref={confirmRef} variante={peligro ? 'peligro' : 'primario'} onClick={onConfirm}>
            {confirmar}
          </Button>
        </div>
      </div>
    </div>
  )
}

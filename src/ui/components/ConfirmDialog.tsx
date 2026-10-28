import { useId, type ReactNode } from 'react'
import Button from './Button'
import { useDialogoModal } from './useDialogoModal'

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
  /** Contenido propio (campos, avisos) entre el texto y los botones. */
  children?: ReactNode
}

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
  children,
}: ConfirmDialogProps) {
  const id = useId()
  const { caja, alTeclear, alTocarFondo } = useDialogoModal(onCancel)

  return (
    <div className="dialog-backdrop" onMouseDown={alTocarFondo}>
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
        {children}
        <div className="dialog__actions">
          {cancelar !== null && (
            <Button data-foco-inicial variante="secundario" onClick={onCancel}>
              {cancelar}
            </Button>
          )}
          {alternativa && (
            <Button variante="secundario" onClick={alternativa.onClick}>
              {alternativa.texto}
            </Button>
          )}
          <Button
            data-foco-inicial={cancelar === null ? true : undefined}
            variante={peligro ? 'peligro' : 'primario'}
            onClick={onConfirm}
          >
            {confirmar}
          </Button>
        </div>
      </div>
    </div>
  )
}

import Button from '../../components/Button'
import { useDialogoModal } from '../../components/useDialogoModal'

const sinAccion = () => undefined

/** No se pudo leer si hay PIN: la app queda tapada (nunca se supone "sin PIN") y se puede reintentar. */
export default function ErrorApertura({ onReintentar }: { onReintentar: () => void }) {
  const { caja, alTeclear } = useDialogoModal(sinAccion)
  return (
    <div className="bloqueo" role="dialog" aria-modal="true" aria-label="No se pudo abrir la app" ref={caja} onKeyDown={alTeclear}>
      <div className="bloqueo__contenido bloqueo__contenido--texto">
        <p className="bloqueo__texto" role="alert">
          No pudimos abrir tus datos. Probá de nuevo.
        </p>
        <Button block onClick={onReintentar}>
          Reintentar
        </Button>
      </div>
    </div>
  )
}

import { useId } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button'
import { useDialogoModal } from '../../components/useDialogoModal'

const OPCIONES = [
  { texto: 'Trabajo', a: '/trabajo/nuevo' },
  { texto: 'Gasto', a: '/movimiento/nuevo?tipo=GASTO' },
  { texto: 'Otro ingreso', a: '/movimiento/nuevo?tipo=INGRESO' },
]

/** "+ Nuevo": hoja inferior que pregunta qué se quiere cargar. Escape, tocar el fondo o Cancelar la cierran. */
export default function MenuNuevo({ onCerrar }: { onCerrar: () => void }) {
  const id = useId()
  const { caja, alTeclear, alTocarFondo } = useDialogoModal(onCerrar)

  return (
    <div className="dialog-backdrop dialog-backdrop--hoja" onMouseDown={alTocarFondo}>
      <div
        ref={caja}
        className="dialog dialog--hoja"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        onKeyDown={alTeclear}
      >
        <h2 className="dialog__title" id={`${id}-titulo`}>
          ¿Qué querés cargar?
        </h2>
        <div className="menu-nuevo">
          {OPCIONES.map((o) => (
            <Link key={o.a} className="btn btn--secundario btn--block" to={o.a}>
              {o.texto}
            </Link>
          ))}
          <Button variante="texto" block onClick={onCerrar}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}

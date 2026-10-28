import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button'

const OPCIONES = [
  { texto: 'Trabajo', a: '/trabajo/nuevo' },
  { texto: 'Gasto', a: '/movimiento/nuevo?tipo=GASTO' },
  { texto: 'Otro ingreso', a: '/movimiento/nuevo?tipo=INGRESO' },
]

/** "+ Nuevo": pregunta qué se quiere cargar. Escape y tocar el fondo lo cierran. */
export default function MenuNuevo({ onCerrar }: { onCerrar: () => void }) {
  const id = useId()
  const primero = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    primero.current?.focus()
    return () => previo?.focus?.()
  }, [])

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCerrar()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`} onKeyDown={alTeclear}>
        <h2 className="dialog__title" id={`${id}-titulo`}>
          ¿Qué querés cargar?
        </h2>
        <div className="menu-nuevo">
          {OPCIONES.map((o, i) => (
            <Link key={o.a} ref={i === 0 ? primero : undefined} className="btn btn--secundario btn--block" to={o.a}>
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

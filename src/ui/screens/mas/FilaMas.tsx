import { useId } from 'react'
import { Link } from 'react-router-dom'

interface FilaMasProps {
  nombre: string
  detalle: string
  /** Sin `to` la fila se ve pero no se puede abrir (todavía no existe o no hay nada que mostrar). */
  to?: string
}

/** Una fila de la lista de Más. La ayuda va como descripción: el nombre accesible es solo el título. */
export default function FilaMas({ nombre, detalle, to }: FilaMasProps) {
  const id = useId()
  const contenido = (
    <>
      <span className="lugar-row__nombre" id={`${id}-nombre`}>
        {nombre}
      </span>
      <span className="lugar-row__detalle" id={`${id}-detalle`}>
        {detalle}
      </span>
    </>
  )
  const atributos = { 'aria-labelledby': `${id}-nombre`, 'aria-describedby': `${id}-detalle` }
  return to ? (
    <Link className="lugar-row" to={to} {...atributos}>
      {contenido}
    </Link>
  ) : (
    <button type="button" className="lugar-row" disabled {...atributos}>
      {contenido}
    </button>
  )
}

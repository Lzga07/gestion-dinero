import { Link } from 'react-router-dom'
import type { Centavos } from '../../domain/money'
import { pesosJuntos } from '../pesos'

export interface ItemRanking {
  clave: string
  nombre: string
  monto: Centavos
  /** A dónde lleva tocar la fila. */
  destino: string
}

interface Props {
  /** Nombre de la lista (lo leen los lectores de pantalla). */
  nombre: string
  /** Ya ordenados de mayor a menor. */
  items: ItemRanking[]
}

/** Ranking en barras horizontales: nombre y monto de cada fila, y una barra proporcional a la mayor. */
export default function BarrasHorizontales({ nombre, items }: Props) {
  const maximo = Math.max(...items.map((i) => i.monto), 0)
  return (
    <ul className="ranking" aria-label={nombre}>
      {items.map((i) => (
        <li key={i.clave}>
          <Link className="ranking__fila" to={i.destino}>
            <span className="ranking__texto">
              <span className="ranking__nombre">{i.nombre}</span>
              <span className="ranking__monto">{pesosJuntos(i.monto)}</span>
            </span>
            <span className="ranking__pista" aria-hidden="true">
              <span className="ranking__relleno" style={{ width: `${(i.monto / maximo) * 100}%` }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

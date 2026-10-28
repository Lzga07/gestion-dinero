import { formatPesos } from '../../../domain/money'
import type { Trabajo } from '../../../domain/types'
import { etiquetaTrabajo } from './utils'

interface ListaTildableProps {
  trabajos: Trabajo[]
  tildados: Set<string>
  onCambiar: (id: string, tildado: boolean) => void
}

/** Un trabajo por fila con su casilla; lo destildado se resalta en terracota. */
export default function ListaTildable({ trabajos, tildados, onCambiar }: ListaTildableProps) {
  return (
    <ul className="tildable">
      {trabajos.map((tr) => {
        const tildado = tildados.has(tr.id)
        return (
          <li key={tr.id}>
            <label className={tildado ? 'tilde' : 'tilde tilde--no'}>
              <input
                className="tilde__caja"
                type="checkbox"
                checked={tildado}
                onChange={(e) => onCambiar(tr.id, e.target.checked)}
              />
              <span className="tilde__nombre">
                {etiquetaTrabajo(tr)}
                {tr.estado === 'NO_PAGADO' && <small className="tilde__estado"> · sin pagar</small>}
              </span>
              <span className="tilde__monto">{formatPesos(tr.monto)}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

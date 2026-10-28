import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../../data/db'
import { formatPorcentaje } from '../../domain/money'
import type { Lugar } from '../../domain/types'
import Card from '../components/Card'
import { diaCierreActual } from './lugar-utils'

function resumen(l: Lugar): string {
  const cobro = l.formaCobro === 'PORCENTAJE' && l.porcentajeBp !== null ? formatPorcentaje(l.porcentajeBp) : 'Arancel fijo'
  const dia = diaCierreActual(l)
  return `${cobro} · Cierra ${dia === 'ULTIMO' ? 'el último día' : `el día ${dia}`}`
}

function FilaLugar({ lugar }: { lugar: Lugar }) {
  return (
    <Link className="lugar-row" to={`/lugares/${lugar.id}`}>
      <span className="lugar-row__nombre">{lugar.nombre}</span>
      <span className="lugar-row__detalle">{resumen(lugar)}</span>
    </Link>
  )
}

export default function Lugares() {
  const lugares = useLiveQuery(() => db.lugares.toArray(), [])
  const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es')
  const activos = lugares?.filter((l) => !l.archivado).sort(porNombre) ?? []
  const archivados = lugares?.filter((l) => l.archivado).sort(porNombre) ?? []

  return (
    <section>
      <h1 className="screen-title">Lugares</h1>

      {lugares && activos.length === 0 && (
        <Card>
          <p className="muted">Todavía no cargaste ningún lugar. Agregá el primero para empezar a anotar trabajos.</p>
        </Card>
      )}
      {activos.length > 0 && (
        <Card flush as="ul" className="lista">
          {activos.map((l) => (
            <li key={l.id}>
              <FilaLugar lugar={l} />
            </li>
          ))}
        </Card>
      )}

      <Link className="btn btn--primario btn--block lugares__agregar" to="/lugares/nuevo">
        + Agregar lugar
      </Link>

      {archivados.length > 0 && (
        <details className="archivados">
          <summary>Archivados ({archivados.length})</summary>
          <Card flush as="ul" className="lista">
            {archivados.map((l) => (
              <li key={l.id}>
                <FilaLugar lugar={l} />
              </li>
            ))}
          </Card>
        </details>
      )}
    </section>
  )
}

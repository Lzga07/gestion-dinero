import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import type { Lugar } from '../../domain/types'
import Card from '../components/Card'
import { useHoy } from '../hooks/useHoy'
import FilaMas from './mas/FilaMas'
import RecordatoriosCalendario from './mas/RecordatoriosCalendario'
import { plural } from './periodo/utils'

const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es')

/** Más: copia de seguridad, categorías, PIN, lugares archivados, recordatorios del calendario e instalación. */
export default function Mas() {
  const hoy = useHoy()
  const lugares = useLiveQuery(() => db.lugares.toArray(), [])
  if (lugares === undefined) return null // cargando

  const activos = lugares.filter((l) => !l.archivado).sort(porNombre)
  const archivados = lugares.filter((l) => l.archivado).length

  return (
    <section>
      <h1 className="screen-title">Más</h1>
      <Card flush as="ul" className="lista">
        <li>
          <FilaMas nombre="Copia de seguridad" detalle="Guardá tus datos fuera del celular" to="/mas/copia" />
        </li>
        <li>
          <FilaMas nombre="Categorías" detalle="Gastos e ingresos" to="/mas/categorias" />
        </li>
        <li>
          <FilaMas nombre="PIN" detalle="Disponible pronto" />
        </li>
        <li>
          <FilaMas
            nombre="Lugares archivados"
            detalle={archivados > 0 ? plural(archivados, 'archivado', 'archivados') : 'Ninguno'}
            to={archivados > 0 ? '/lugares?archivados=1' : undefined}
          />
        </li>
        <li>
          <FilaMas nombre="Cómo instalar la app" detalle="Para usarla como app en tu celular" to="/mas/instalar" />
        </li>
      </Card>

      <RecordatoriosCalendario lugares={activos} hoy={hoy} />
    </section>
  )
}

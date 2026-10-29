import { useLiveQuery } from 'dexie-react-hooks'
import { Link, Navigate } from 'react-router-dom'
import { db } from '../../../data/db'
import type { Lugar } from '../../../domain/types'
import Card from '../../components/Card'
import Cargando from '../../components/Cargando'
import Encabezado from '../../components/Encabezado'
import useVolver from '../../components/useVolver'

const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es')

/**
 * Cargar meses anteriores desde Más (`/mas/anteriores`): elegir en qué lugar. Con un solo lugar activo va directo
 * a su pantalla; los archivados no se ofrecen (se desarchivan para cargarles meses).
 */
export default function ElegirLugar() {
  const volver = useVolver('/mas')
  const lugares = useLiveQuery(() => db.lugares.toArray(), [])
  const activos = lugares?.filter((l) => !l.archivado).sort(porNombre)

  // `replace`: así "atrás" desde la pantalla del lugar no vuelve acá y rebota.
  if (activos?.length === 1) return <Navigate to={`/lugares/${activos[0].id}/anteriores`} replace />

  return (
    <section>
      <Encabezado titulo="Cargar meses anteriores" onCerrar={volver} />
      {activos === undefined ? (
        <Cargando />
      ) : activos.length === 0 ? (
        <Card className="vacio">
          <p className="vacio__texto">Primero agregá un lugar donde trabajás</p>
          <Link className="btn btn--primario" to="/lugares/nuevo">
            + Agregar lugar
          </Link>
        </Card>
      ) : (
        <>
          <p className="muted">¿En qué lugar?</p>
          <Card flush as="ul" className="lista">
            {activos.map((l) => (
              <li key={l.id}>
                <Link className="lugar-row" to={`/lugares/${l.id}/anteriores`}>
                  <span className="lugar-row__nombre">{l.nombre}</span>
                </Link>
              </li>
            ))}
          </Card>
        </>
      )}
    </section>
  )
}

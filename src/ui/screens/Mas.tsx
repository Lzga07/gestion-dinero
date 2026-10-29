import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tienePin } from '../../data/pin'
import { db } from '../../data/db'
import type { Lugar } from '../../domain/types'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import { useHoy } from '../hooks/useHoy'
import FilaMas from './mas/FilaMas'
import RecordatoriosCalendario from './mas/RecordatoriosCalendario'
import { plural } from './periodo/utils'

const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es')

/**
 * El aviso que dejó la pantalla anterior al volver acá (p. ej. "PIN creado"). Se lee una vez y se saca del
 * historial, para que no reaparezca al recargar.
 */
function useAvisoDeNavegacion(): string | null {
  const { state, pathname } = useLocation()
  const navigate = useNavigate()
  const [aviso] = useState<string | null>(() => (state as { aviso?: string } | null)?.aviso ?? null)
  useEffect(() => {
    if (state) navigate(pathname, { replace: true, state: null })
  }, [state, pathname, navigate])
  return aviso
}

/** Más: copia de seguridad, categorías, PIN, lugares archivados, recordatorios del calendario e instalación. */
export default function Mas() {
  const hoy = useHoy()
  const lugares = useLiveQuery(() => db.lugares.toArray(), [])
  const conPin = useLiveQuery(() => tienePin(), [])
  const aviso = useAvisoDeNavegacion()
  if (lugares === undefined || conPin === undefined) return <Cargando />

  const activos = lugares.filter((l) => !l.archivado).sort(porNombre)
  const archivados = lugares.filter((l) => l.archivado).length

  return (
    <section>
      <h1 className="screen-title">Más</h1>
      {aviso && (
        <p className="aviso-confirmacion" role="status">
          {aviso}
        </p>
      )}
      <Card flush as="ul" className="lista">
        <li>
          <FilaMas nombre="Copia de seguridad" detalle="Guardá tus datos fuera del celular" to="/mas/copia" />
        </li>
        <li>
          <FilaMas nombre="Categorías" detalle="Gastos e ingresos" to="/mas/categorias" />
        </li>
        <li>
          <FilaMas nombre="PIN" detalle={conPin ? 'Activado' : 'Desactivado'} to="/mas/pin" />
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

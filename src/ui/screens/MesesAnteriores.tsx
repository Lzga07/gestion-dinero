import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { mesCerrado } from '../../data/mesesAnteriores'
import { resumenPeriodo } from '../../domain/conciliacion'
import { periodoAnterior, periodoQueContiene, type Periodo } from '../../domain/periodos'
import type { Lugar, Pago, Trabajo } from '../../domain/types'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import Encabezado from '../components/Encabezado'
import useVolver from '../components/useVolver'
import { useHoy } from '../hooks/useHoy'
import { pesosJuntos } from '../pesos'
import SelectorMes from './anteriores/SelectorMes'
import { periodoOfrecido } from './anteriores/utils'
import { etiquetaTrabajo, finDe, periodoPedido, plural, sumaMontos, useDatosLugar } from './periodo/utils'

/** Del más viejo al más nuevo (el cuaderno va en orden); a igual fecha, en el orden en que se anotaron. */
function enOrden(trabajos: Trabajo[]): Trabajo[] {
  return [...trabajos].sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0,
  )
}

/** Cargar meses anteriores (`/lugares/:id/anteriores?periodo=<fin>`): elegir un mes ya pasado de un lugar y ver lo cargado. */
export default function MesesAnteriores() {
  const { id } = useParams()
  const volver = useVolver(id ? `/lugares/${id}` : '/lugares')
  const datos = useDatosLugar(id)
  return (
    <section>
      <Encabezado titulo="Cargar meses anteriores" onCerrar={volver} />
      {datos === undefined ? (
        <Cargando />
      ) : !datos.lugar || datos.lugar.archivado ? (
        <Card>
          <p className="muted">{datos.lugar ? 'Este lugar está archivado.' : 'No encontramos este lugar.'}</p>
        </Card>
      ) : (
        <Vista key={datos.lugar.id} lugar={datos.lugar} trabajos={datos.trabajos} pagos={datos.pagos} />
      )}
    </section>
  )
}

function Vista({ lugar, trabajos, pagos }: { lugar: Lugar; trabajos: Trabajo[]; pagos: Pago[] }) {
  const hoy = useHoy()
  const [params] = useSearchParams()
  // Arranca en `?periodo=` si es un mes ya pasado que se puede cargar; si no, en el anterior al actual.
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    const pedido = periodoPedido(lugar, params.get('periodo'), hoy)
    return periodoOfrecido(lugar, pedido, hoy)
      ? pedido
      : periodoAnterior(lugar.reglasCierre, periodoQueContiene(lugar.reglasCierre, hoy))
  })

  const resumen = resumenPeriodo(lugar, periodo, trabajos, pagos)
  const delMes = enOrden(trabajos.filter((tr) => finDe(lugar, tr) === periodo.fin))
  const cerrado = mesCerrado(resumen)

  return (
    <>
      <p className="muted">{lugar.nombre}</p>

      <SelectorMes lugar={lugar} periodo={periodo} hoy={hoy} cantidad={delMes.length} onCambiar={setPeriodo} />

      {cerrado && (
        <Card>
          <p>Este mes ya está cerrado.</p>
          <Link className="enlace-deudas" to={`/lugares/${lugar.id}?periodo=${periodo.fin}`}>
            Ver el período
          </Link>
        </Card>
      )}

      {/* Acá va la fila para cargar un trabajo (solo si el mes no está cerrado). */}

      {delMes.length > 0 && (
        <>
          <h2 className="section-title">{`${plural(delMes.length, 'trabajo', 'trabajos')} · ${pesosJuntos(sumaMontos(delMes))}`}</h2>
          <Card flush as="ul" className="lista trabajos" aria-label="Trabajos del mes">
            {delMes.map((tr) => (
              <li key={tr.id} className="trabajo">
                <Link className="trabajo__datos" to={`/trabajo/${tr.id}`}>
                  <span className="trabajo__nombre">{etiquetaTrabajo(tr)}</span>
                  <span>{pesosJuntos(tr.monto)}</span>
                </Link>
              </li>
            ))}
          </Card>
        </>
      )}

      {/* Acá va "¿Cómo terminó este mes?" (solo si el mes no está cerrado y tiene trabajos pendientes). */}
    </>
  )
}

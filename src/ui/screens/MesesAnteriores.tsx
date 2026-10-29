import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../../data/db'
import { mesCerrado } from '../../data/mesesAnteriores'
import { resumenPeriodo } from '../../domain/conciliacion'
import { nombrePeriodo, periodoAnterior, periodoQueContiene, periodoSiguiente, type Periodo } from '../../domain/periodos'
import type { Lugar, Pago, Trabajo } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import Encabezado from '../components/Encabezado'
import useVolver from '../components/useVolver'
import { useHoy } from '../hooks/useHoy'
import { pesosJuntos } from '../pesos'
import CierreMes from './anteriores/CierreMes'
import FilaCarga from './anteriores/FilaCarga'
import SelectorMes from './anteriores/SelectorMes'
import { periodoOfrecido } from './anteriores/utils'
import { etiquetaTrabajo, finDe, periodoPedido, plural, sumaMontos, useDatosLugar } from './periodo/utils'

/** Del más viejo al más nuevo (el cuaderno va en orden); a igual fecha, en el orden en que se anotaron. */
function enOrden(trabajos: Trabajo[]): Trabajo[] {
  return [...trabajos].sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0,
  )
}

/** `?porcentaje=<bp>`: puntos básicos enteros en el rango que acepta la fila (más de 0 y hasta 100 %); si no, null. */
function porcentajePedido(pedido: string | null): number | null {
  if (pedido === null || !/^\d+$/.test(pedido)) return null
  const bp = Number(pedido)
  return bp > 0 && bp <= 10000 ? bp : null
}

/** Cargar meses anteriores (`/lugares/:id/anteriores?periodo=<fin>&porcentaje=<bp>&modo=CLIENTE|DIRECTO`): elegir un mes ya pasado de un lugar y ver lo cargado. */
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
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // El mes, el porcentaje y el modo viven en la URL (`?periodo=&porcentaje=&modo=`): así sobreviven a tocar un trabajo y volver.
  // Mes: `?periodo=` si es un mes ya pasado que se puede cargar; si no, el anterior al actual.
  const pedido = periodoPedido(lugar, params.get('periodo'), hoy)
  const periodo = periodoOfrecido(lugar, pedido, hoy)
    ? pedido
    : periodoAnterior(lugar.reglasCierre, periodoQueContiene(lugar.reglasCierre, hoy))
  // El porcentaje y el modo de carga son del mes que se está cargando (no del lugar) y se recuerdan al cambiar de mes.
  const porcentajeBp = porcentajePedido(params.get('porcentaje')) ?? lugar.porcentajeBp ?? 0
  const modo = params.get('modo') === 'DIRECTO' ? 'DIRECTO' : 'CLIENTE'
  const cambiarUrl = (cambios: Record<string, string>) =>
    setParams(
      (actual) => {
        const nuevos = new URLSearchParams(actual)
        for (const [clave, valor] of Object.entries(cambios)) nuevos.set(clave, valor)
        return nuevos
      },
      { replace: true },
    )
  const irAlPeriodo = (p: Periodo) => cambiarUrl({ periodo: p.fin })
  /** Fin del período que se acaba de dar por terminado: ofrece seguir con el mes siguiente o terminar. */
  const [terminadoFin, setTerminadoFin] = useState<string | null>(null)
  const tipos = useLiveQuery(() => db.tiposTrabajo.where('lugarId').equals(lugar.id).sortBy('orden'), [lugar.id])

  const resumen = resumenPeriodo(lugar, periodo, trabajos, pagos)
  const delMes = enOrden(trabajos.filter((tr) => finDe(lugar, tr) === periodo.fin))
  const cerrado = mesCerrado(resumen)
  const siguiente = periodoSiguiente(lugar.reglasCierre, periodo)

  return (
    <>
      <p className="muted">{lugar.nombre}</p>

      <SelectorMes lugar={lugar} periodo={periodo} hoy={hoy} cantidad={delMes.length} onCambiar={irAlPeriodo} />

      {cerrado && (
        <Card>
          <p>Este mes ya está cerrado.</p>
          <Link className="enlace-deudas" to={`/lugares/${lugar.id}?periodo=${periodo.fin}`}>
            Ver el período
          </Link>
        </Card>
      )}

      {!cerrado &&
        (tipos === undefined ? (
          <Cargando />
        ) : (
          <FilaCarga
            key={periodo.fin}
            lugar={lugar}
            tipos={tipos}
            periodo={periodo}
            hoy={hoy}
            porcentajeBp={porcentajeBp}
            onPorcentaje={(bp) => cambiarUrl({ porcentaje: String(bp) })}
            modo={modo}
            onModo={(m) => cambiarUrl({ modo: m })}
          />
        ))}

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

      {!cerrado && delMes.length > 0 && (
        <CierreMes
          key={`cierre-${periodo.fin}`}
          lugar={lugar}
          periodo={periodo}
          hoy={hoy}
          total={sumaMontos(delMes)}
          onTerminado={() => setTerminadoFin(periodo.fin)}
        />
      )}

      {terminadoFin === periodo.fin && (
        <div className="cierre__acciones">
          {/* El mes en curso no se puede cargar: ahí solo queda terminar. */}
          {periodoOfrecido(lugar, siguiente, hoy) && (
            <Button onClick={() => irAlPeriodo(siguiente)}>{`Seguir con ${nombrePeriodo(siguiente)} ${siguiente.fin.slice(0, 4)}`}</Button>
          )}
          <Button variante="secundario" onClick={() => navigate(`/lugares/${lugar.id}`)}>
            Terminar
          </Button>
        </div>
      )}
    </>
  )
}

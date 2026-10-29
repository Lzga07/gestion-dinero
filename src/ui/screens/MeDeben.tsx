import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useMemo, useState } from 'react'
import { db } from '../../data/db'
import { cobrarDeuda } from '../../data/pagos'
import { avisoDeuda, deudasPorLugar, soloPeriodo, type DeudaPeriodo, type DeudasLugar } from '../../domain/deudas'
import type { FechaISO } from '../../domain/dates'
import { nombrePeriodo } from '../../domain/periodos'
import type { Lugar, Pago, Trabajo } from '../../domain/types'
import { datosReclamo } from '../../pdf/reclamo'
import type { DatosListado } from '../../pdf/listado'
import Button from '../components/Button'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import DialogCompartir from '../components/DialogCompartir'
import DialogoCobrarDeuda from '../components/DialogoCobrarDeuda'
import Encabezado from '../components/Encabezado'
import useVolver from '../components/useVolver'
import { useHoy } from '../hooks/useHoy'
import { pesosJuntos } from '../pesos'
import { etiquetaTrabajo } from './periodo/utils'

interface Datos {
  lugares: Lugar[]
  trabajos: Trabajo[]
  pagos: Pago[]
}

/** Lugares, trabajos y pagos, siempre al día. `undefined` mientras carga. */
function useDatos(): Datos | undefined {
  return useLiveQuery(
    async (): Promise<Datos> => ({
      lugares: await db.lugares.toArray(),
      trabajos: await db.trabajos.toArray(),
      pagos: await db.pagos.toArray(),
    }),
    [],
  )
}

/** Me deben: todo lo que te deben, por lugar y por período, con "Ya me lo pagaron" y el reclamo. */
export default function MeDeben() {
  const volver = useVolver('/mas')
  const hoy = useHoy()
  const datos = useDatos()
  return (
    <section>
      <Encabezado titulo="Me deben" onCerrar={volver} />
      {datos === undefined ? <Cargando /> : <Deudas datos={datos} hoy={hoy} />}
    </section>
  )
}

function Deudas({ datos, hoy }: { datos: Datos; hoy: FechaISO }) {
  const [cobrando, setCobrando] = useState<DeudasLugar | null>(null)
  const [reclamo, setReclamo] = useState<Omit<DatosListado, 'incluirNotas'> | null>(null)
  const { lugares, trabajos, pagos } = datos
  const deudas = useMemo(() => deudasPorLugar({ hoy, lugares, trabajos, pagos }), [hoy, lugares, trabajos, pagos])
  const aviso = cobrando ? avisoDeuda(cobrando) : null

  return (
    <>
      {deudas.length === 0 && (
        <Card className="vacio">
          <p className="vacio__texto">No te deben nada</p>
        </Card>
      )}

      {deudas.map((d) => (
        <BloqueLugar
          key={d.lugar.id}
          deuda={d}
          onCobrar={() => setCobrando(d)}
          onReclamo={(deuda) => setReclamo(datosReclamo(d.lugar, avisoDeuda(deuda), pagos, hoy))}
        />
      ))}

      {reclamo && <DialogCompartir datos={reclamo} onCerrar={() => setReclamo(null)} />}

      {cobrando && aviso && (
        <DialogoCobrarDeuda
          noPagados={aviso.noPagados}
          diferencias={aviso.deudasPlata}
          onCancel={() => setCobrando(null)}
          onGuardar={async (fecha, trabajosIds, diferencias) => {
            await cobrarDeuda(cobrando.lugar.id, fecha, { trabajos: trabajosIds, diferencias })
            setCobrando(null)
          }}
        />
      )}
    </>
  )
}

interface BloqueLugarProps {
  deuda: DeudasLugar
  onCobrar: () => void
  /** El reclamo de la deuda que se le pasa: la de todo el lugar o la de uno de sus períodos. */
  onReclamo: (deuda: DeudasLugar) => void
}

function BloqueLugar({ deuda, onCobrar, onReclamo }: BloqueLugarProps) {
  return (
    <Card as="section" className="me-deben" aria-label={deuda.lugar.nombre}>
      <header className="me-deben__cabecera">
        <h2 className="me-deben__lugar">{deuda.lugar.nombre}</h2>
        <p className="me-deben__total">{`Te deben ${pesosJuntos(deuda.monto)}`}</p>
      </header>
      {deuda.periodos.map((p) => (
        <PeriodoDeuda key={p.periodo.fin} p={p} onReclamo={() => onReclamo(soloPeriodo(deuda, p))} />
      ))}
      <div className="me-deben__acciones">
        <Button variante="secundario" onClick={onCobrar}>
          Ya me lo pagaron
        </Button>
        <Button variante="secundario" onClick={() => onReclamo(deuda)}>
          Compartir reclamo
        </Button>
      </div>
    </Card>
  )
}

function PeriodoDeuda({ p, onReclamo }: { p: DeudaPeriodo; onReclamo: () => void }) {
  const idNombre = useId()
  return (
    <div className="me-deben__periodo" role="group" aria-labelledby={idNombre}>
      <h3 id={idNombre} className="me-deben__periodo-nombre">{`${nombrePeriodo(p.periodo)} ${p.periodo.fin.slice(0, 4)}`}</h3>
      <ul className="me-deben__items">
        {p.noPagados.map((tr) => (
          <li key={tr.id} className="me-deben__item">
            <span>{etiquetaTrabajo(tr)}</span>
            <span>{pesosJuntos(tr.monto)}</span>
          </li>
        ))}
        {p.plata > 0 && (
          <li className="me-deben__item">
            <span>{`Diferencia en pago: ${pesosJuntos(p.plata)}`}</span>
          </li>
        )}
      </ul>
      <Button variante="secundario" className="me-deben__reclamo-mes" onClick={onReclamo}>
        Compartir reclamo de este mes
      </Button>
    </div>
  )
}

import { useState } from 'react'
import { hoy, sumarDias, type FechaISO } from '../../../domain/dates'
import { formatPesos } from '../../../domain/money'
import { nombrePeriodo, periodoQueContiene, periodosEntre, type Periodo } from '../../../domain/periodos'
import type { Lugar, Trabajo } from '../../../domain/types'
import Card from '../../components/Card'
import { finDe, sumaMontos } from './utils'

interface SelectorPeriodoProps {
  lugar: Lugar
  trabajos: Trabajo[]
  seleccionado: Periodo
  onElegir: (fin: FechaISO) => void
}

/** Los 2 períodos más recientes como pestañas y "Historial" con todos los demás desde el primer trabajo. */
export default function SelectorPeriodo({ lugar, trabajos, seleccionado, onElegir }: SelectorPeriodoProps) {
  const [verHistorial, setVerHistorial] = useState(false)
  const reglas = lugar.reglasCierre
  const hoyISO = hoy()
  const actual = periodoQueContiene(reglas, hoyISO)
  const anterior = periodoQueContiene(reglas, sumarDias(actual.inicio, -1))
  const enPestana = seleccionado.fin === actual.fin || seleccionado.fin === anterior.fin

  function elegir(fin: FechaISO) {
    setVerHistorial(false)
    onElegir(fin)
  }

  const pestana = (p: Periodo) => (
    <button
      key={p.fin}
      type="button"
      className="pestana"
      aria-pressed={seleccionado.fin === p.fin}
      onClick={() => elegir(p.fin)}
    >
      {nombrePeriodo(p)}
    </button>
  )

  return (
    <>
      <div className="pestanas" role="group" aria-label="Período">
        {pestana(anterior)}
        {pestana(actual)}
        <button
          type="button"
          className="pestana"
          aria-pressed={!enPestana}
          aria-expanded={verHistorial}
          onClick={() => setVerHistorial((v) => !v)}
        >
          Historial
        </button>
      </div>
      {!enPestana && !verHistorial && <p className="periodo-elegido muted">Período {nombrePeriodo(seleccionado)}</p>}
      {verHistorial && <Historial lugar={lugar} trabajos={trabajos} seleccionado={seleccionado} hoyISO={hoyISO} onElegir={elegir} />}
    </>
  )
}

function Historial({
  lugar, trabajos, seleccionado, hoyISO, onElegir,
}: Omit<SelectorPeriodoProps, 'onElegir'> & { hoyISO: FechaISO; onElegir: (fin: FechaISO) => void }) {
  const primera = trabajos.reduce<FechaISO>((m, tr) => (tr.fecha < m ? tr.fecha : m), hoyISO)
  const periodos = periodosEntre(lugar.reglasCierre, primera, hoyISO)
  const total = (p: Periodo) => sumaMontos(trabajos.filter((tr) => finDe(lugar, tr) === p.fin))
  return (
    <Card flush as="ul" className="lista historial" aria-label="Historial de períodos">
      {periodos.map((p) => (
        <li key={p.fin}>
          <button
            type="button"
            className="historial__fila"
            aria-current={seleccionado.fin === p.fin ? 'true' : undefined}
            onClick={() => onElegir(p.fin)}
          >
            <span>{nombrePeriodo(p)}</span>
            <strong>{formatPesos(total(p))}</strong>
          </button>
        </li>
      ))}
    </Card>
  )
}

import { useState } from 'react'
import { hoy, sumarDias, type FechaISO } from '../../../domain/dates'
import { nombrePeriodo, periodoQueContiene, periodosEntre, type Periodo } from '../../../domain/periodos'
import { conciliacionDelLugar } from '../../../domain/conciliacion'
import type { Lugar, Pago, Trabajo } from '../../../domain/types'
import Card from '../../components/Card'
import { sumaMontos } from './utils'
import { pesosJuntos } from '../../pesos'

interface SelectorPeriodoProps {
  lugar: Lugar
  trabajos: Trabajo[]
  /** Para marcar en el Historial los períodos con deuda. */
  pagos: Pago[]
  seleccionado: Periodo
  onElegir: (fin: FechaISO) => void
}

/** Los 2 períodos más recientes como pestañas y "Historial" con todos los demás desde el primer trabajo. */
export default function SelectorPeriodo({ lugar, trabajos, pagos, seleccionado, onElegir }: SelectorPeriodoProps) {
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
      {verHistorial && (
        <Historial lugar={lugar} trabajos={trabajos} pagos={pagos} seleccionado={seleccionado} hoyISO={hoyISO} onElegir={elegir} />
      )}
    </>
  )
}

function Historial({
  lugar, trabajos, pagos, seleccionado, hoyISO, onElegir,
}: Omit<SelectorPeriodoProps, 'onElegir'> & { hoyISO: FechaISO; onElegir: (fin: FechaISO) => void }) {
  const primera = trabajos.reduce<FechaISO>((m, tr) => (tr.fecha < m ? tr.fecha : m), hoyISO)
  const periodos = periodosEntre(lugar.reglasCierre, primera, hoyISO)
  const conciliacion = conciliacionDelLugar(lugar, trabajos, pagos)
  const total = (p: Periodo) => conciliacion.resumen(p).teCorresponde
  /** Lo que le deben del período: trabajos sin pagar y diferencia en plata. */
  const deuda = (p: Periodo) => {
    const r = conciliacion.resumen(p)
    return sumaMontos(r.noPagados) + r.deudaPlata
  }
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
            <span className="historial__periodo">
              {nombrePeriodo(p)}
              {deuda(p) > 0 && <small className="historial__deuda">{`Te deben ${pesosJuntos(deuda(p))}`}</small>}
            </span>
            <strong>{pesosJuntos(total(p))}</strong>
          </button>
        </li>
      ))}
    </Card>
  )
}

import type { FechaISO } from '../../../domain/dates'
import { nombrePeriodo, periodoAnterior, periodoSiguiente, type Periodo } from '../../../domain/periodos'
import type { Lugar } from '../../../domain/types'
import { plural } from '../periodo/utils'
import { periodoOfrecido } from './utils'

interface SelectorMesProps {
  lugar: Lugar
  periodo: Periodo
  hoy: FechaISO
  /** Cuántos trabajos tiene el lugar en `periodo`. */
  cantidad: number
  onCambiar: (periodo: Periodo) => void
}

/** Elegir el mes (el período del lugar) con ‹ ›, como el calendario del selector de fecha; solo períodos ya terminados. */
export default function SelectorMes({ lugar, periodo, hoy, cantidad, onCambiar }: SelectorMesProps) {
  const anterior = periodoAnterior(lugar.reglasCierre, periodo)
  const siguiente = periodoSiguiente(lugar.reglasCierre, periodo)

  return (
    <div className="selector-mes" role="group" aria-label="Mes">
      <button
        type="button"
        className="calendario__flecha"
        aria-label="Mes anterior"
        disabled={!periodoOfrecido(lugar, anterior, hoy)}
        onClick={() => onCambiar(anterior)}
      >
        ‹
      </button>
      <div className="selector-mes__periodo" aria-live="polite">
        <span className="selector-mes__nombre">{`${nombrePeriodo(periodo)} ${periodo.fin.slice(0, 4)}`}</span>
        <span className="selector-mes__cantidad">{cantidad === 0 ? 'Sin trabajos' : plural(cantidad, 'trabajo', 'trabajos')}</span>
      </div>
      <button
        type="button"
        className="calendario__flecha"
        aria-label="Mes siguiente"
        disabled={!periodoOfrecido(lugar, siguiente, hoy)}
        onClick={() => onCambiar(siguiente)}
      >
        ›
      </button>
    </div>
  )
}

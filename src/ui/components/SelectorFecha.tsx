import { useId, useState } from 'react'
import {
  aFecha,
  diaDeSemana,
  diasEnMes,
  formatFechaConDia,
  formatFechaLarga,
  mesClave,
  moverMes,
  nombreMes,
  sumarDias,
  type FechaISO,
} from '../../domain/dates'
import { useHoy } from '../hooks/useHoy'

const INICIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface SelectorFechaProps {
  label: string
  value: FechaISO
  onChange: (fecha: FechaISO) => void
}

/**
 * Elegir una fecha sin escribirla: "Hoy" y "Ayer" con un toque y, para otra, "Otro día…" abre un calendario
 * del mes (con flechas para cambiar de mes) donde se toca el día. Los días futuros no se pueden elegir.
 * Reemplaza al `<input type="date">`, que en Android obligaba a escribir la fecha exacta (el mes como "02").
 */
export default function SelectorFecha({ label, value, onChange }: SelectorFechaProps) {
  const nombre = useId()
  const hoy = useHoy()
  const ayer = sumarDias(hoy, -1)
  const [abierto, setAbierto] = useState(false)
  /** Mes que muestra el calendario ('YYYY-MM'). */
  const [mes, setMes] = useState(() => mesClave(value))
  // Con el calendario abierto queda marcado "Otro día…", aunque todavía no se haya tocado ningún día.
  const atajo = abierto ? 'otro' : value === hoy ? 'hoy' : value === ayer ? 'ayer' : 'otro'

  function elegir(fecha: FechaISO) {
    setAbierto(false)
    onChange(fecha)
  }

  // Con onClick y no onChange: tocar "Otro día…" cuando ya está marcado igual abre (o cierra) el calendario.
  function alternarCalendario() {
    if (!abierto) setMes(mesClave(value))
    setAbierto(!abierto)
  }

  return (
    <fieldset className="field selector-fecha">
      <legend className="field__label">{label}</legend>
      <div className="chips">
        <Atajo nombre={nombre} texto="Hoy" marcado={atajo === 'hoy'} onClick={() => elegir(hoy)} />
        <Atajo nombre={nombre} texto="Ayer" marcado={atajo === 'ayer'} onClick={() => elegir(ayer)} />
        <Atajo nombre={nombre} texto="Otro día…" marcado={atajo === 'otro'} onClick={alternarCalendario} />
      </div>
      <p className="selector-fecha__elegida">
        <time dateTime={value}>{formatFechaConDia(value, hoy)}</time>
      </p>
      {abierto && <Calendario mes={mes} setMes={setMes} value={value} hoy={hoy} onElegir={elegir} />}
    </fieldset>
  )
}

function Atajo({ nombre, texto, marcado, onClick }: { nombre: string; texto: string; marcado: boolean; onClick: () => void }) {
  return (
    <label className="chip">
      <input className="chip__input" type="radio" name={nombre} checked={marcado} onChange={() => undefined} onClick={onClick} />
      <span className="chip__text">{texto}</span>
    </label>
  )
}

interface CalendarioProps {
  mes: string
  setMes: (mes: string) => void
  value: FechaISO
  hoy: FechaISO
  onElegir: (fecha: FechaISO) => void
}

function Calendario({ mes, setMes, value, hoy, onElegir }: CalendarioProps) {
  const [y, m] = mes.split('-').map(Number)
  const primero = aFecha(y, m, 1)
  const dias = Array.from({ length: diasEnMes(y, m) }, (_, i) => aFecha(y, m, i + 1))

  return (
    <div className="calendario">
      <div className="calendario__cabecera">
        <button type="button" className="calendario__flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>
          ‹
        </button>
        <time className="calendario__mes" dateTime={mes} aria-live="polite">
          {`${nombreMes(primero)} ${y}`}
        </time>
        <button
          type="button"
          className="calendario__flecha"
          aria-label="Mes siguiente"
          disabled={mes >= mesClave(hoy)}
          onClick={() => setMes(moverMes(mes, 1))}
        >
          ›
        </button>
      </div>
      <div className="calendario__grilla">
        {INICIALES.map((d, i) => (
          <span key={i} className="calendario__dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {/* El 1 cae en su columna del día de la semana (la semana empieza el lunes). */}
        {dias.map((f, i) => (
          <button
            key={f}
            type="button"
            className="calendario__dia"
            style={i === 0 ? { gridColumnStart: diaDeSemana(f) + 1 } : undefined}
            aria-label={formatFechaLarga(f)}
            aria-pressed={f === value}
            aria-current={f === hoy ? 'date' : undefined}
            disabled={f > hoy}
            onClick={() => onElegir(f)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

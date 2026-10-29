import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cerrarMes, type CierreMes as Cierre } from '../../../data/mesesAnteriores'
import type { FechaISO } from '../../../domain/dates'
import { MAX_CENTAVOS, type Centavos } from '../../../domain/money'
import { fechaPagoPropuesta, type Periodo } from '../../../domain/periodos'
import type { Lugar } from '../../../domain/types'
import Button from '../../components/Button'
import Card from '../../components/Card'
import MoneyInput, { ERROR_MONTO } from '../../components/MoneyInput'
import SelectorFecha from '../../components/SelectorFecha'
import { pesosJuntos } from '../../pesos'

type Opcion = 'TODO' | 'PARTE' | 'NADA' | 'NOSE'

const OPCIONES: { valor: Opcion; texto: string }[] = [
  { valor: 'TODO', texto: 'Me pagaron todo' },
  { valor: 'PARTE', texto: 'Me pagaron una parte' },
  { valor: 'NADA', texto: 'No me pagaron' },
  { valor: 'NOSE', texto: 'Todavía no sé' },
]

interface CierreMesProps {
  lugar: Lugar
  periodo: Periodo
  hoy: FechaISO
  /** Lo que suman los trabajos del mes. */
  total: Centavos
  /** Se llama al confirmar (también con "Todavía no sé", que no escribe nada). */
  onTerminado: () => void
}

/** Cómo terminó un mes ya pasado: lo pagaron todo, una parte, nada, o todavía no se sabe. */
export default function CierreMes({ lugar, periodo, hoy, total, onTerminado }: CierreMesProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const guardandoRef = useRef(false)
  const [opcion, setOpcion] = useState<Opcion | null>(null)
  const [fecha, setFecha] = useState<FechaISO>(() => fechaPagoPropuesta(periodo, lugar.pagoDesdeDia, lugar.pagoHastaDia, hoy))
  const [monto, setMonto] = useState<Centavos | null>(null)
  const [montoInvalido, setMontoInvalido] = useState(false)
  const [intentado, setIntentado] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mismo criterio que un monto de trabajo; `cerrarMes` solo rechaza <= 0 y un NaN llegaría a la base.
  const montoOk = monto !== null && Number.isInteger(monto) && monto > 0 && monto <= MAX_CENTAVOS ? monto : null
  const ver = intentado > 0
  const errOpcion = ver && opcion === null ? 'Elegí cómo terminó este mes' : null
  const errMonto = !ver || opcion !== 'PARTE' ? null : montoInvalido ? ERROR_MONTO : montoOk === null ? 'Ingresá un monto mayor a 0' : null
  const pideFecha = opcion === 'TODO' || opcion === 'PARTE'

  // Al fallar el intento, el foco va al primer campo inválido.
  useEffect(() => {
    if (intentado > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [intentado])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (guardandoRef.current) return
    setError(null)
    if (opcion === null || (opcion === 'PARTE' && montoOk === null)) {
      setIntentado((n) => n + 1)
      return
    }
    if (opcion === 'NOSE') {
      onTerminado() // no se registra nada: los trabajos siguen pendientes
      return
    }
    const cierre: Cierre =
      opcion === 'TODO' ? { tipo: 'TODO', fecha } : opcion === 'PARTE' ? { tipo: 'PARTE', fecha, monto: montoOk! } : { tipo: 'NADA' }
    guardandoRef.current = true
    setGuardando(true)
    try {
      await cerrarMes(lugar.id, periodo, cierre)
      onTerminado()
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Card>
      <form ref={formRef} className="cierre" onSubmit={enviar} noValidate>
        <fieldset className="cierre__opciones">
          <legend className="cierre__titulo">¿Cómo terminó este mes?</legend>
          {OPCIONES.map((o) => (
            <label key={o.valor} className="cierre__opcion">
              <input
                className="cierre__radio"
                type="radio"
                name="cierre"
                value={o.valor}
                checked={opcion === o.valor}
                onChange={() => setOpcion(o.valor)}
              />
              <span>{o.texto}</span>
            </label>
          ))}
          {errOpcion && (
            <p className="field__error" role="alert">
              {errOpcion}
            </p>
          )}
        </fieldset>

        {opcion === 'PARTE' && (
          <MoneyInput
            label="¿Cuánto te pagaron?"
            hint={`Los trabajos suman ${pesosJuntos(total)}`}
            value={monto}
            onChange={setMonto}
            onInvalidChange={setMontoInvalido}
            error={errMonto}
          />
        )}
        {pideFecha && <SelectorFecha label="Fecha del pago" value={fecha} onChange={setFecha} />}
        {opcion === 'NOSE' && (
          <p className="field__hint cierre__aviso">Este mes va a aparecer en Inicio como pago atrasado hasta que lo resuelvas.</p>
        )}

        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={guardando}>
          Listo
        </Button>
      </form>
    </Card>
  )
}

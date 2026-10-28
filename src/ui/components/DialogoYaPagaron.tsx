import { useRef, useState } from 'react'
import { hoy, type FechaISO } from '../../domain/dates'
import type { Centavos } from '../../domain/money'
import ConfirmDialog from './ConfirmDialog'
import Field from './Field'
import MoneyInput, { ERROR_MONTO } from './MoneyInput'

interface DialogoYaPagaronProps {
  /** Qué se está cobrando, p. ej. «Corona» del 26 sep. */
  texto: string
  /** Monto propuesto: lo que valía el trabajo o la diferencia a saldar. */
  montoInicial: Centavos
  /** Registra el cobro. Si falla, el diálogo queda abierto con el error; si anda, el que lo abrió lo cierra. */
  onGuardar: (fecha: FechaISO, monto: Centavos) => Promise<void>
  onCancel: () => void
}

/** "Ya me lo pagaron": pide la fecha (hoy) y el monto (el propuesto) antes de registrar el cobro. */
export default function DialogoYaPagaron({ texto, montoInicial, onGuardar, onCancel }: DialogoYaPagaronProps) {
  const guardandoRef = useRef(false)
  const [fecha, setFecha] = useState(hoy())
  const [monto, setMonto] = useState<Centavos | null>(montoInicial)
  const [invalido, setInvalido] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errFecha = intentado && fecha === '' ? 'Elegí la fecha' : null
  const errMonto = !intentado ? null : invalido ? ERROR_MONTO : monto === null || monto <= 0 ? 'Ingresá un monto mayor a 0' : null

  async function guardar() {
    if (guardandoRef.current) return
    setError(null)
    if (fecha === '' || invalido || monto === null || monto <= 0) {
      setIntentado(true)
      return
    }
    guardandoRef.current = true
    try {
      await onGuardar(fecha, monto)
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
      guardandoRef.current = false
    }
  }

  return (
    <ConfirmDialog
      titulo="Ya me lo pagaron"
      texto={texto}
      confirmar="Guardar"
      onConfirm={guardar}
      onCancel={onCancel}
    >
      <div className="dialog__campos">
        <Field label="Fecha del pago" error={errFecha}>
          {(control) => <input {...control} className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
        </Field>
        <MoneyInput label="Monto" value={monto} onChange={setMonto} onInvalidChange={setInvalido} error={errMonto} />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  )
}

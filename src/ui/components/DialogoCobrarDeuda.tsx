import { useId, useRef, useState } from 'react'
import { hoy, type FechaISO } from '../../domain/dates'
import type { Centavos } from '../../domain/money'
import { nombrePeriodo, type Periodo } from '../../domain/periodos'
import type { Trabajo } from '../../domain/types'
import { etiquetaTrabajo } from '../screens/periodo/utils'
import { pesosJuntos } from '../pesos'
import ConfirmDialog from './ConfirmDialog'
import SelectorFecha from './SelectorFecha'

interface DialogoCobrarDeudaProps {
  /** Trabajos NO_PAGADO del lugar, de todos los períodos. */
  noPagados: Trabajo[]
  /** Diferencias en plata de períodos cerrados con menos de lo que correspondía. */
  diferencias: { periodo: Periodo; monto: Centavos }[]
  /** Registra lo elegido. Si falla, el diálogo queda abierto con el error; si anda, el que lo abrió lo cierra. */
  onGuardar: (fecha: FechaISO, trabajos: string[], diferencias: { periodoFin: FechaISO; monto: Centavos }[]) => Promise<void>
  onCancel: () => void
}

interface Opcion {
  clave: string
  texto: string
  nota: string
  monto: Centavos
}

/**
 * "Ya me lo pagaron" desde el aviso de deuda: la persona elige qué le pagaron (trabajos sin pagar y
 * diferencias en plata) y la fecha. Nada viene elegido salvo que haya una sola cosa: así no se da por
 * cobrado algo sin querer.
 */
export default function DialogoCobrarDeuda({ noPagados, diferencias, onGuardar, onCancel }: DialogoCobrarDeudaProps) {
  const id = useId()
  const guardandoRef = useRef(false)
  const opciones: Opcion[] = [
    ...[...noPagados]
      .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
      .map((tr) => ({ clave: `t:${tr.id}`, texto: etiquetaTrabajo(tr), nota: tr.nota, monto: tr.monto })),
    ...diferencias.map((d) => ({
      clave: `d:${d.periodo.fin}`,
      texto: `Diferencia en pago de ${nombrePeriodo(d.periodo)}`,
      nota: '',
      monto: d.monto,
    })),
  ]
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(opciones.length === 1 ? [opciones[0].clave] : []))
  const [fecha, setFecha] = useState(hoy())
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = opciones.filter((o) => elegidos.has(o.clave)).reduce((s, o) => s + o.monto, 0)
  const errNada = intentado && elegidos.size === 0 ? 'Elegí lo que te pagaron' : null

  function cambiar(clave: string, tildado: boolean) {
    setElegidos((actual) => {
      const nuevo = new Set(actual)
      if (tildado) nuevo.add(clave)
      else nuevo.delete(clave)
      return nuevo
    })
  }

  async function guardar() {
    if (guardandoRef.current) return
    setError(null)
    if (elegidos.size === 0) {
      setIntentado(true)
      return
    }
    guardandoRef.current = true
    const trabajos = noPagados.filter((tr) => elegidos.has(`t:${tr.id}`)).map((tr) => tr.id)
    const difs = diferencias
      .filter((d) => elegidos.has(`d:${d.periodo.fin}`))
      .map((d) => ({ periodoFin: d.periodo.fin, monto: d.monto }))
    try {
      await onGuardar(fecha, trabajos, difs)
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
      guardandoRef.current = false
    }
  }

  return (
    <ConfirmDialog
      titulo="Ya me lo pagaron"
      texto="Elegí lo que te pagaron. Cada cosa se registra por lo que valía."
      confirmar="Guardar"
      onConfirm={guardar}
      onCancel={onCancel}
    >
      <div className="dialog__campos">
        <fieldset className="field" aria-describedby={errNada ? `${id}-error` : undefined}>
          <legend className="sr-only">Qué te pagaron</legend>
          <ul className="tildable cobro-deuda">
            {opciones.map((o) => (
              <li key={o.clave}>
                <label className="tilde">
                  <input
                    className="tilde__caja"
                    type="checkbox"
                    checked={elegidos.has(o.clave)}
                    onChange={(e) => cambiar(o.clave, e.target.checked)}
                  />
                  <span className="tilde__nombre">
                    {o.texto}
                    {o.nota && <small className="nota-trabajo">{o.nota}</small>}
                  </span>
                  <span className="tilde__monto">{pesosJuntos(o.monto)}</span>
                </label>
              </li>
            ))}
          </ul>
          {errNada && (
            <p className="field__error" id={`${id}-error`} role="alert">
              {errNada}
            </p>
          )}
        </fieldset>
        <p className="cobro-deuda__total">{`Total: ${pesosJuntos(total)}`}</p>
        <SelectorFecha label="Fecha del pago" value={fecha} onChange={setFecha} />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  )
}

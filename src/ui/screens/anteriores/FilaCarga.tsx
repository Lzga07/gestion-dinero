import { useEffect, useRef, useState, type FormEvent } from 'react'
import { guardarTrabajo } from '../../../data/trabajos'
import { formatFechaCorta, mesClave, type FechaISO } from '../../../domain/dates'
import { formatPorcentaje, parsePorcentaje, type Centavos } from '../../../domain/money'
import { diasDelPeriodo, type Periodo } from '../../../domain/periodos'
import { calcularTrabajo, type EntradaTrabajo } from '../../../domain/trabajos'
import type { Lugar, TipoTrabajo } from '../../../domain/types'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Field from '../../components/Field'
import MoneyInput, { ERROR_MONTO } from '../../components/MoneyInput'
import { pesosJuntos } from '../../pesos'
import { erroresDe, MENSAJES } from '../trabajo-errores'

type Modo = 'CLIENTE' | 'DIRECTO'

interface FilaCargaProps {
  lugar: Lugar
  /** La lista de trabajos y precios del lugar (arancel fijo). */
  tipos: TipoTrabajo[]
  periodo: Periodo
  hoy: FechaISO
  /** El porcentaje de este mes y el modo viven afuera para recordarse al pasar de mes; cambiarlos no toca el lugar. */
  porcentajeBp: number
  onPorcentaje: (bp: number) => void
  modo: Modo
  onModo: (modo: Modo) => void
}

/** Valor de "Otro…" en "¿Qué hiciste?" (los ids de tipos son UUID: no chocan). */
const OTRO = '__otro__'

/** Fila para cargar de corrido los trabajos de un mes: se guarda cada uno al "Agregar" y la fila queda lista para el siguiente. */
export default function FilaCarga({ lugar, tipos, periodo, hoy, porcentajeBp, onPorcentaje, modo, onModo }: FilaCargaProps) {
  const filaRef = useRef<HTMLFormElement>(null)
  const guardandoRef = useRef(false)
  const dias = diasDelPeriodo(periodo, hoy)
  // Si el período cae en un solo mes alcanza con el número; si cruza de mes hace falta el mes ("16 dic").
  const unSoloMes = mesClave(periodo.inicio) === mesClave(periodo.fin)

  const esPorcentaje = lugar.formaCobro === 'PORCENTAJE'
  const porCliente = esPorcentaje && modo === 'CLIENTE'
  const directo = esPorcentaje && modo === 'DIRECTO'

  const [fecha, setFecha] = useState<FechaISO>(periodo.inicio) // sigue en el día del último agregado
  const [pctTexto, setPctTexto] = useState(() => formatPorcentaje(porcentajeBp).replace(/\s*%$/, ''))
  const [sel, setSel] = useState('')
  const [otroNombre, setOtroNombre] = useState('')
  /** Precio del arancel fijo o "lo que me tocó": los dos usan el mismo campo. */
  const [monto, setMonto] = useState<Centavos | null>(null)
  const [montoInvalido, setMontoInvalido] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [montoCliente, setMontoCliente] = useState<Centavos | null>(null)
  const [clienteInvalido, setClienteInvalido] = useState(false)
  const [descuento, setDescuento] = useState<Centavos | null>(null)
  const [descuentoInvalido, setDescuentoInvalido] = useState(false)
  const [intentado, setIntentado] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  /** Cuántos trabajos se agregaron: remonta los campos de monto (que guardan su propio texto) y lleva el foco. */
  const [agregados, setAgregados] = useState(0)

  const seleccion = tipos.length === 0 ? OTRO : sel
  const tipoElegido = tipos.find((t) => t.id === seleccion) ?? null
  const bp = parsePorcentaje(pctTexto) ?? 0 // 0 = inválido: calcularTrabajo lo avisa

  // ---- Cálculo y validación ----
  let entrada: EntradaTrabajo
  if (directo) entrada = { forma: 'MONTO_DIRECTO', descripcion, monto }
  else if (porCliente) entrada = { forma: 'PORCENTAJE', descripcion, montoCliente, descuento, porcentajeBp: bp }
  else if (seleccion === OTRO) entrada = { forma: 'ARANCEL_FIJO', tipo: null, otroNombre, otroMonto: monto }
  else entrada = { forma: 'ARANCEL_FIJO', tipo: tipoElegido && { ...tipoElegido, precio: monto ?? 0 } }
  const res = calcularTrabajo(entrada)
  const errores = erroresDe(entrada)
  const hayInvalido = porCliente ? clienteInvalido || descuentoInvalido : montoInvalido
  const hayErrores = errores.size > 0 || hayInvalido
  const ver = intentado > 0

  const errTipo = ver && errores.has('FALTA_TIPO') ? MENSAJES.FALTA_TIPO : null
  const errDescripcion = ver && errores.has('FALTA_DESCRIPCION') ? MENSAJES.FALTA_DESCRIPCION : null
  const errMonto = (invalido: boolean) =>
    !ver ? null : invalido ? ERROR_MONTO : errores.has('MONTO_INVALIDO') ? MENSAJES.MONTO_INVALIDO : null
  const errDescuento = !ver ? null : descuentoInvalido ? ERROR_MONTO : errores.has('DESCUENTO_MAYOR') ? MENSAJES.DESCUENTO_MAYOR : null
  // El campo es del mes, no del lugar: no repite el texto de FormTrabajo ("…del lugar").
  const errPorcentaje = ver && errores.has('PORCENTAJE_INVALIDO') ? 'Revisá el porcentaje de este mes' : null

  // Al fallar el intento, el foco va al primer campo inválido.
  useEffect(() => {
    if (intentado > 0) filaRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [intentado])

  // Después de agregar, el foco va a "¿Qué hiciste?": el día ya está elegido.
  useEffect(() => {
    if (agregados > 0) filaRef.current?.querySelector<HTMLElement>('[name="que"]')?.focus()
  }, [agregados])

  function elegirTipo(valor: string) {
    setSel(valor)
    setMonto(tipos.find((t) => t.id === valor)?.precio ?? null) // el precio de la lista, que se puede cambiar
    setMontoInvalido(false)
  }

  function cambiarPorcentaje(texto: string) {
    setPctTexto(texto)
    const nuevo = parsePorcentaje(texto)
    if (nuevo !== null) onPorcentaje(nuevo)
  }

  function cambiarModo(nuevo: Modo) {
    onModo(nuevo)
    setMonto(null)
    setMontoInvalido(false)
    setMontoCliente(null)
    setClienteInvalido(false)
    setDescuento(null)
    setDescuentoInvalido(false)
    setIntentado(0)
  }

  /** Deja la fila lista para el siguiente: mismo día, el resto vacío. */
  function limpiar() {
    setSel('')
    setOtroNombre('')
    setMonto(null)
    setMontoInvalido(false)
    setDescripcion('')
    setMontoCliente(null)
    setClienteInvalido(false)
    setDescuento(null)
    setDescuentoInvalido(false)
    setIntentado(0)
    setAgregados((n) => n + 1)
  }

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (guardandoRef.current) return
    setErrorGeneral(null)
    if (hayErrores || !res.ok) {
      setIntentado((n) => n + 1)
      return
    }
    guardandoRef.current = true
    setGuardando(true)
    const conDescuento = porCliente && descuento !== null && descuento > 0
    try {
      await guardarTrabajo({
        lugarId: lugar.id,
        fecha,
        descripcion: res.descripcion,
        tipoTrabajoId: tipoElegido?.id ?? null,
        precioLista: tipoElegido ? res.monto : null, // el precio que tenía al hacerse el trabajo
        montoCliente: porCliente ? montoCliente : null,
        descuento: conDescuento ? descuento : null,
        descuentoMotivo: null,
        porcentajeBp: porCliente ? bp : null,
        monto: res.monto,
        nota: '',
      })
      limpiar()
    } catch {
      setErrorGeneral('No se pudo guardar. Probá de nuevo.')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const campoQue = (
    <Field label="¿Qué hiciste?" error={errDescripcion}>
      {(control) => (
        <input
          {...control}
          name="que"
          className="input"
          type="text"
          autoComplete="off"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      )}
    </Field>
  )

  return (
    <Card>
      <form ref={filaRef} className="fila-carga" onSubmit={agregar} noValidate>
        {esPorcentaje && (
          <div className="fila-carga__campos">
            {porCliente && (
              <Field label="Porcentaje de este mes" error={errPorcentaje}>
                {(control) => (
                  <input
                    {...control}
                    className="input input--short"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={pctTexto}
                    onChange={(e) => cambiarPorcentaje(e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field label="Anoté:">
              {(control) => (
                <select {...control} className="input" value={modo} onChange={(e) => cambiarModo(e.target.value as Modo)}>
                  <option value="CLIENTE">Lo que pagó el cliente</option>
                  <option value="DIRECTO">Lo que me tocó</option>
                </select>
              )}
            </Field>
          </div>
        )}

        <div className="fila-carga__campos">
          <Field label="Día">
            {(control) => (
              <select {...control} className="input" value={fecha} onChange={(e) => setFecha(e.target.value)}>
                {dias.map((d) => (
                  <option key={d} value={d}>
                    {unSoloMes ? Number(d.slice(8)) : formatFechaCorta(d)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {esPorcentaje ? (
            campoQue
          ) : (
            tipos.length > 0 && (
              <Field label="¿Qué hiciste?" error={errTipo}>
                {(control) => (
                  <select {...control} name="que" className="input" value={sel} onChange={(e) => elegirTipo(e.target.value)}>
                    <option value="">Elegí…</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                    <option value={OTRO}>Otro…</option>
                  </select>
                )}
              </Field>
            )
          )}
        </div>

        {!esPorcentaje && seleccion === OTRO && (
          <Field label="Descripción" error={errDescripcion}>
            {(control) => (
              <input
                {...control}
                name={tipos.length === 0 ? 'que' : undefined}
                className="input"
                type="text"
                autoComplete="off"
                value={otroNombre}
                onChange={(e) => setOtroNombre(e.target.value)}
              />
            )}
          </Field>
        )}

        {porCliente ? (
          <>
            <MoneyInput
              key={`cliente-${agregados}`}
              label="Lo que pagó el cliente"
              value={montoCliente}
              onChange={setMontoCliente}
              onInvalidChange={setClienteInvalido}
              error={errMonto(clienteInvalido)}
            />
            <MoneyInput
              key={`descuento-${agregados}`}
              label="Descuento antes del % (opcional)"
              value={descuento}
              onChange={setDescuento}
              onInvalidChange={setDescuentoInvalido}
              error={errDescuento}
            />
            {res.ok && (
              <p className="fila-carga__cuenta">
                <span>{res.detalle}</span>
                <strong>{pesosJuntos(res.monto)}</strong>
              </p>
            )}
          </>
        ) : (
          (directo || seleccion !== '') && (
            <MoneyInput
              key={`monto-${agregados}-${seleccion}`}
              label={directo ? 'Lo que te tocó' : 'Precio'}
              value={monto}
              onChange={setMonto}
              onInvalidChange={setMontoInvalido}
              error={errMonto(montoInvalido)}
            />
          )
        )}

        {errorGeneral && (
          <p className="field__error" role="alert">
            {errorGeneral}
          </p>
        )}
        <Button type="submit" block disabled={guardando}>
          Agregar
        </Button>
      </form>
    </Card>
  )
}

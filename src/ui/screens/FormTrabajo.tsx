import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { guardarAjuste, leerAjuste } from '../../data/ajustes'
import { db } from '../../data/db'
import { marcarNoPagado, yaMeLoPagaron } from '../../data/pagos'
import { borrarTrabajo, guardarTrabajo } from '../../data/trabajos'
import { formatFechaCorta, hoy } from '../../domain/dates'
import { formatPorcentaje, type Centavos } from '../../domain/money'
import {
  calcularTrabajo,
  type EntradaTrabajo,
  type ErrorTrabajo,
  type ResultadoTrabajo,
} from '../../domain/trabajos'
import type { Lugar, TipoTrabajo, Trabajo } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import ConfirmDialog from '../components/ConfirmDialog'
import Encabezado from '../components/Encabezado'
import Field from '../components/Field'
import MoneyInput, { ERROR_MONTO } from '../components/MoneyInput'
import SelectorFecha from '../components/SelectorFecha'
import useVolver from '../components/useVolver'
import { leerFechaRecordada, recordarFecha } from '../hooks/fechaRecordada'
import { pesosJuntos } from '../pesos'

const AVISO_EN_PAGO = 'Este trabajo ya está en un pago: cambiarlo modifica la conciliación de ese período'

const MENSAJES: Record<ErrorTrabajo, string> = {
  FALTA_TIPO: 'Elegí qué hiciste',
  FALTA_DESCRIPCION: 'Escribí qué hiciste',
  MONTO_INVALIDO: 'Ingresá un monto mayor a 0',
  DESCUENTO_MAYOR: 'El descuento tiene que ser menor a lo que pagó el cliente',
  PORCENTAJE_INVALIDO: 'Revisá el porcentaje del lugar',
}

/** Valor del chip "Otro…" (los ids de tipos son UUID: no chocan). */
const OTRO = '__otro__'

interface Datos {
  lugares: Lugar[]
  tipos: TipoTrabajo[]
  trabajo: Trabajo | null
  ultimoLugarId: string | null
}

const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es')

/** Pantalla de alta (`/trabajo/nuevo?lugar=<id>`) y de edición (`/trabajo/:id`). */
export default function FormTrabajo() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const volver = useVolver()
  const datos = useLiveQuery(
    async (): Promise<Datos> => ({
      lugares: await db.lugares.toArray(),
      tipos: (await db.tiposTrabajo.toArray()).sort((a, b) => a.orden - b.orden),
      trabajo: id ? ((await db.trabajos.get(id)) ?? null) : null,
      ultimoLugarId: await leerAjuste<string | null>('ultimoLugarId', null),
    }),
    [id],
  )

  if (datos === undefined) return <Cargando />
  if (id && !datos.trabajo) {
    return (
      <section>
        <Encabezado titulo="Editar trabajo" onCerrar={volver} />
        <Card>
          <p className="muted">No encontramos este trabajo.</p>
        </Card>
      </section>
    )
  }
  if (!id && !datos.lugares.some((l) => !l.archivado)) {
    return (
      <section>
        <Encabezado titulo="Nuevo trabajo" onCerrar={volver} />
        <Card>
          <p className="muted">Primero agregá un lugar donde trabajás</p>
        </Card>
        <Link className="btn btn--primario btn--block lugares__agregar" to="/lugares/nuevo">
          Agregar lugar
        </Link>
      </section>
    )
  }
  return <Formulario key={id ?? 'nuevo'} datos={datos} lugarPedido={params.get('lugar')} />
}

/** Qué pasa al mudar de lugar un trabajo que ya estaba pagado o marcado como no pagado. */
function textoMudanza(trabajo: Trabajo, de: string, a: string): string {
  return trabajo.estado === 'PAGADO'
    ? `Este trabajo estaba pagado en ${de}. Al moverlo vuelve a pendiente en ${a} y el pago de ${de} queda con esa diferencia.`
    : `Este trabajo estaba marcado como no pagado en ${de}. Al moverlo vuelve a pendiente en ${a} y deja de ser una deuda de ${de}.`
}

/** Todos los errores a la vez: si falta la descripción, igual se revisa lo demás. */
function erroresDe(entrada: EntradaTrabajo): Set<ErrorTrabajo> {
  const errores = new Set<ErrorTrabajo>()
  let actual = entrada
  for (let i = 0; i < 2; i++) {
    const r = calcularTrabajo(actual)
    if (r.ok) break
    errores.add(r.error)
    if (r.error !== 'FALTA_DESCRIPCION') break
    actual =
      actual.forma === 'ARANCEL_FIJO' ? { ...actual, otroNombre: 'x' } : { ...actual, descripcion: 'x' }
  }
  return errores
}

function Formulario({ datos, lugarPedido }: { datos: Datos; lugarPedido: string | null }) {
  const volver = useVolver()
  const formRef = useRef<HTMLFormElement>(null)
  const guardandoRef = useRef(false)
  /** Id del trabajo ya guardado: si algo falla después, un nuevo "Guardar" edita en vez de duplicar. */
  const idGuardado = useRef<string | null>(null)
  const { lugares, tipos } = datos
  const [trabajo] = useState(datos.trabajo) // lo que se está editando, tal como se abrió

  const activos = lugares.filter((l) => !l.archivado).sort(porNombre)
  const actual = trabajo ? lugares.find((l) => l.id === trabajo.lugarId) : undefined
  const opciones = actual?.archivado ? [...activos, actual] : activos

  const [lugarId, setLugarId] = useState(() => {
    if (trabajo) return trabajo.lugarId
    const candidatos = [lugarPedido, datos.ultimoLugarId]
    return candidatos.find((c) => activos.some((l) => l.id === c)) ?? activos[0].id
  })
  // Un trabajo nuevo arranca en la fecha del último guardado hace poco (carga de trabajos atrasados).
  const [fecha, setFecha] = useState(() => trabajo?.fecha ?? leerFechaRecordada() ?? hoy())
  const [nota, setNota] = useState(trabajo?.nota ?? '')

  // Arancel fijo
  const tiposDeInicio = trabajo ? tipos.filter((t) => t.lugarId === trabajo.lugarId) : []
  const [sel, setSel] = useState<string | null>(() =>
    trabajo ? (tiposDeInicio.some((t) => t.id === trabajo.tipoTrabajoId) ? trabajo.tipoTrabajoId : OTRO) : null,
  )
  const eraFijo = !!trabajo && trabajo.montoCliente === null
  const [otroNombre, setOtroNombre] = useState(trabajo?.descripcion ?? '')
  const [otroMonto, setOtroMonto] = useState<Centavos | null>(eraFijo ? trabajo.monto : null)
  const [otroInvalido, setOtroInvalido] = useState(false)

  // Porcentaje
  const [descripcion, setDescripcion] = useState(trabajo?.descripcion ?? '')
  const [montoCliente, setMontoCliente] = useState<Centavos | null>(trabajo?.montoCliente ?? null)
  const [clienteInvalido, setClienteInvalido] = useState(false)
  const [descuento, setDescuento] = useState<Centavos | null>(trabajo?.descuento ?? null)
  const [descuentoInvalido, setDescuentoInvalido] = useState(false)
  const [motivo, setMotivo] = useState(trabajo?.descuentoMotivo ?? '')

  const [intentado, setIntentado] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<'borrar' | 'mover' | null>(null)
  /** `confirmacion`: aviso de "Guardado: …" si se tocó "Guardar y anotar otro" (null: vuelve al terminar). */
  const [pregunta, setPregunta] = useState<{ id: string; monto: Centavos; confirmacion: string | null } | null>(null)
  /** Aviso de lo último que se guardó con "Guardar y anotar otro"; vive en una región `status` permanente. */
  const [confirmacion, setConfirmacion] = useState('')
  /** Cuántas veces se preparó otro trabajo: remonta los campos de monto (que guardan su propio texto). */
  const [otroN, setOtroN] = useState(0)

  const lugar = lugares.find((l) => l.id === lugarId) as Lugar
  const esPorcentaje = lugar.formaCobro === 'PORCENTAJE'
  /** El trabajo editado cambia a otro lugar estando pagado o no pagado (vuelve a pendiente al guardar). */
  const mudanza = !!trabajo && trabajo.lugarId !== lugarId && trabajo.estado !== 'PENDIENTE'
  const tiposLugar = tipos
    .filter((t) => t.lugarId === lugarId)
    .map((t) =>
      // El trabajo editado mantiene el precio de lista que tenía al anotarse.
      trabajo && trabajo.lugarId === lugarId && t.id === trabajo.tipoTrabajoId && trabajo.precioLista !== null
        ? { ...t, precio: trabajo.precioLista }
        : t,
    )
  const seleccion = tiposLugar.length === 0 ? OTRO : sel
  const tipoElegido = tiposLugar.find((t) => t.id === seleccion) ?? null
  /** Al editar sigue elegido el mismo tipo: conserva su descripción aunque el tipo haya cambiado de nombre. */
  const mismoTipo =
    !!trabajo && !esPorcentaje && trabajo.lugarId === lugarId && tipoElegido !== null && tipoElegido.id === trabajo.tipoTrabajoId
  const bp =
    trabajo && trabajo.lugarId === lugarId && trabajo.porcentajeBp !== null
      ? trabajo.porcentajeBp
      : (lugar.porcentajeBp ?? 0)

  // ---- Cálculo y validación ----
  let entrada: EntradaTrabajo
  if (esPorcentaje) {
    entrada = { forma: 'PORCENTAJE', descripcion, montoCliente, descuento, porcentajeBp: bp }
  } else if (seleccion === OTRO) {
    entrada = { forma: 'ARANCEL_FIJO', tipo: null, otroNombre, otroMonto }
  } else {
    entrada = { forma: 'ARANCEL_FIJO', tipo: tipoElegido }
  }
  const res: ResultadoTrabajo = calcularTrabajo(entrada)
  const errores = erroresDe(entrada)
  const hayInvalido = esPorcentaje ? clienteInvalido || descuentoInvalido : seleccion === OTRO && otroInvalido
  const hayErrores = errores.size > 0 || hayInvalido
  const ver = intentado > 0

  const errTipo = ver && errores.has('FALTA_TIPO') ? MENSAJES.FALTA_TIPO : null
  const errDescripcion = ver && errores.has('FALTA_DESCRIPCION') ? MENSAJES.FALTA_DESCRIPCION : null
  const errMonto = (invalido: boolean) =>
    !ver ? null : invalido ? ERROR_MONTO : errores.has('MONTO_INVALIDO') ? MENSAJES.MONTO_INVALIDO : null
  const errDescuento = !ver
    ? null
    : descuentoInvalido
      ? ERROR_MONTO
      : errores.has('DESCUENTO_MAYOR')
        ? MENSAJES.DESCUENTO_MAYOR
        : null
  const errPorcentaje = ver && esPorcentaje && errores.has('PORCENTAJE_INVALIDO') ? MENSAJES.PORCENTAJE_INVALIDO : null

  // Al fallar el guardado, el foco va al primer campo inválido.
  useEffect(() => {
    if (intentado > 0)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalido="true"]')?.focus()
  }, [intentado])

  // Después de "Guardar y anotar otro", el foco va al primer campo a completar: el primer tipo de la lista
  // o, si el lugar no tiene lista (solo "Otro…") o cobra por porcentaje, la descripción.
  useEffect(() => {
    if (otroN === 0 || !formRef.current) return
    const tipos = formRef.current.querySelectorAll<HTMLElement>('input[name="tipo"]')
    const primero = tipos.length > 1 ? tipos[0] : formRef.current.querySelector<HTMLElement>('input[type="text"]')
    primero?.focus()
  }, [otroN])

  function cambiarLugar(nuevo: string) {
    setLugarId(nuevo)
    setSel(null)
    setOtroInvalido(false)
    setClienteInvalido(false)
    setDescuentoInvalido(false)
    setIntentado(0)
    setErrorGeneral(null)
  }

  function elegirTipo(valor: string) {
    setSel(valor)
    setOtroInvalido(false)
  }

  // ---- Acciones ----
  function enviar(e: FormEvent) {
    e.preventDefault()
    return guardar(false)
  }

  async function guardar(anotarOtro: boolean) {
    if (guardandoRef.current) return
    setErrorGeneral(null)
    if (hayErrores || !res.ok) {
      setIntentado((n) => n + 1)
      return
    }
    // Mudar de lugar un trabajo ya resuelto (pagado o no pagado) lo vuelve a pendiente: se avisa antes.
    if (mudanza && !idGuardado.current) {
      setDialogo('mover')
      return
    }
    await grabar(anotarOtro)
  }

  /** Deja el formulario listo para el siguiente trabajo: mismo lugar y fecha, el resto vacío. */
  function prepararOtro(mensaje: string) {
    setSel(null)
    setOtroNombre('')
    setOtroMonto(null)
    setOtroInvalido(false)
    setDescripcion('')
    setMontoCliente(null)
    setClienteInvalido(false)
    setDescuento(null)
    setDescuentoInvalido(false)
    setMotivo('')
    setNota('')
    setIntentado(0)
    setErrorGeneral(null)
    idGuardado.current = null // el próximo "Guardar" crea otro trabajo, no edita este
    guardandoRef.current = false
    setGuardando(false)
    setConfirmacion(mensaje)
    setOtroN((n) => n + 1)
  }

  /** Último paso de un guardado: vuelve a la pantalla anterior o, con "anotar otro", prepara el siguiente. */
  function terminar(confirmacionOtro: string | null) {
    if (confirmacionOtro === null) volver()
    else prepararOtro(confirmacionOtro)
  }

  async function grabar(anotarOtro: boolean) {
    if (guardandoRef.current || !res.ok) return
    setDialogo(null)
    guardandoRef.current = true
    setGuardando(true)
    setConfirmacion('')
    const conDescuento = esPorcentaje && descuento !== null && descuento > 0
    try {
      const { id, periodoYaPagado } = await guardarTrabajo({
        id: trabajo?.id ?? idGuardado.current ?? undefined,
        lugarId,
        fecha,
        descripcion: mismoTipo && trabajo ? trabajo.descripcion : res.descripcion,
        tipoTrabajoId: tipoElegido && !esPorcentaje ? tipoElegido.id : null,
        precioLista: tipoElegido && !esPorcentaje ? tipoElegido.precio : null,
        montoCliente: esPorcentaje ? montoCliente : null,
        descuento: conDescuento ? descuento : null,
        descuentoMotivo: conDescuento && motivo.trim() !== '' ? motivo.trim() : null,
        porcentajeBp: esPorcentaje ? bp : null,
        monto: res.monto,
        nota: nota.trim(),
      })
      idGuardado.current = id
      if (!trabajo) {
        // Solo una comodidad: si no se puede recordar, el trabajo igual quedó guardado.
        await guardarAjuste('ultimoLugarId', lugarId).catch(() => undefined)
        recordarFecha(fecha)
      }
      const aviso = anotarOtro ? `Guardado: ${res.descripcion} · ${pesosJuntos(res.monto)} · ${formatFechaCorta(fecha)}` : null
      // Solo se pregunta por trabajos olvidados (nuevos, mudados de lugar o todavía sin resolver): uno ya
      // pagado, o ya marcado como no pagado, no se vuelve a preguntar al editarlo.
      const sinResolver =
        !trabajo || trabajo.lugarId !== lugarId || (trabajo.estado === 'PENDIENTE' && trabajo.pagoId === null)
      if (periodoYaPagado && sinResolver) setPregunta({ id, monto: res.monto, confirmacion: aviso })
      else terminar(aviso)
    } catch {
      setErrorGeneral('No se pudo guardar. Probá de nuevo.')
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  async function responder(respuesta: 'si' | 'no' | 'nose') {
    if (!pregunta) return
    const { id, monto, confirmacion: aviso } = pregunta
    setPregunta(null)
    try {
      if (respuesta === 'si') await yaMeLoPagaron(id, hoy(), monto)
      else if (respuesta === 'no') await marcarNoPagado(id)
    } catch {
      setErrorGeneral('El trabajo se guardó, pero no pudimos registrar si te lo pagaron.')
      guardandoRef.current = false
      setGuardando(false)
      return
    }
    terminar(aviso)
  }

  async function borrar() {
    if (!trabajo) return
    setDialogo(null)
    try {
      await borrarTrabajo(trabajo.id)
      volver()
    } catch {
      setErrorGeneral('No se pudo borrar. Probá de nuevo.')
    }
  }

  return (
    <section>
      <Encabezado titulo={trabajo ? 'Editar trabajo' : 'Nuevo trabajo'} onCerrar={volver} />

      {trabajo?.pagoId && (
        <Card className="aviso">
          <p>{AVISO_EN_PAGO}</p>
        </Card>
      )}

      <form ref={formRef} className="form--con-barra" onSubmit={enviar} noValidate>
        <Card>
          <Field label="Lugar">
            {(control) => (
              <select {...control} className="input" value={lugarId} onChange={(e) => cambiarLugar(e.target.value)}>
                {opciones.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                    {l.formaCobro === 'PORCENTAJE' && l.porcentajeBp !== null
                      ? ` · ${formatPorcentaje(l.porcentajeBp)}`
                      : ' · arancel fijo'}
                    {l.archivado ? ' (archivado)' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <SelectorFecha label="Fecha" value={fecha} onChange={setFecha} />

          {esPorcentaje ? (
            <>
              <Field label="¿Qué hiciste?" error={errDescripcion}>
                {(control) => (
                  <input
                    {...control}
                    className="input"
                    type="text"
                    autoComplete="off"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                )}
              </Field>
              <MoneyInput
                key={`cliente-${otroN}`}
                label="Lo que pagó el cliente"
                value={montoCliente}
                onChange={setMontoCliente}
                onInvalidChange={setClienteInvalido}
                error={errMonto(clienteInvalido)}
              />
              <MoneyInput
                key={`descuento-${otroN}`}
                label="Descuento antes del % (opcional)"
                hint="Se resta de lo que pagó el cliente antes de aplicar el porcentaje."
                value={descuento}
                onChange={setDescuento}
                onInvalidChange={setDescuentoInvalido}
                error={errDescuento}
              />
              {(descuento !== null || descuentoInvalido) && (
                <Field label="Motivo del descuento (opcional)">
                  {(control) => (
                    <input
                      {...control}
                      className="input"
                      type="text"
                      autoComplete="off"
                      placeholder="Ej: laboratorio"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                  )}
                </Field>
              )}
            </>
          ) : (
            <>
              <fieldset className="field">
                <legend className="field__label">¿Qué hiciste?</legend>
                <div className="chips">
                  {tiposLugar.map((t, i) => (
                    <label key={t.id} className="chip">
                      <input
                        className="chip__input"
                        type="radio"
                        name="tipo"
                        value={t.id}
                        checked={seleccion === t.id}
                        data-invalido={i === 0 && errTipo ? 'true' : undefined}
                        aria-describedby={errTipo ? 'tipo-error' : undefined}
                        onChange={() => elegirTipo(t.id)}
                      />
                      <span className="chip__text">
                        {t.nombre} <small>{pesosJuntos(t.precio)}</small>
                      </span>
                    </label>
                  ))}
                  <label className="chip">
                    <input
                      className="chip__input"
                      type="radio"
                      name="tipo"
                      value={OTRO}
                      checked={seleccion === OTRO}
                      onChange={() => elegirTipo(OTRO)}
                    />
                    <span className="chip__text">Otro…</span>
                  </label>
                </div>
                {errTipo && (
                  <p className="field__error" id="tipo-error" role="alert">
                    {errTipo}
                  </p>
                )}
              </fieldset>
              {seleccion === OTRO && (
                <>
                  <Field label="Descripción" error={errDescripcion}>
                    {(control) => (
                      <input
                        {...control}
                        className="input"
                        type="text"
                        autoComplete="off"
                        value={otroNombre}
                        onChange={(e) => setOtroNombre(e.target.value)}
                      />
                    )}
                  </Field>
                  <MoneyInput
                    key={`otro-${otroN}`}
                    label="Monto que te corresponde"
                    value={otroMonto}
                    onChange={setOtroMonto}
                    onInvalidChange={setOtroInvalido}
                    error={errMonto(otroInvalido)}
                  />
                </>
              )}
            </>
          )}

          <Field label="Nota (opcional)">
            {(control) => (
              <input
                {...control}
                className="input"
                type="text"
                autoComplete="off"
                placeholder="Ej: nombre o referencia"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            )}
          </Field>
        </Card>

        {errorGeneral && (
          <p className="field__error form__error" role="alert">
            {errorGeneral}
          </p>
        )}

        {/* "Te corresponde" y Guardar quedan fijos abajo, a la vista mientras se tipean los montos. */}
        <div className="form__barra">
          <div className="resultado">
            {res.ok && res.detalle && <p className="resultado__detalle">{res.detalle}</p>}
            <div className="resultado__fila">
              <span className="resultado__etiqueta">Te corresponde</span>
              <strong className="resultado__monto">{res.ok ? pesosJuntos(res.monto) : '—'}</strong>
            </div>
            {errPorcentaje && (
              <p className="field__error" role="alert">
                {errPorcentaje}
              </p>
            )}
          </div>
          {!trabajo && (
            <p className="form__guardado" role="status">
              {confirmacion}
            </p>
          )}
          <div className={trabajo ? undefined : 'form__acciones'}>
            <Button type="submit" block disabled={guardando} className="form__guardar">
              Guardar
            </Button>
            {!trabajo && (
              <Button
                variante="secundario"
                block
                disabled={guardando}
                className="form__guardar"
                onClick={() => guardar(true)}
              >
                Guardar y anotar otro
              </Button>
            )}
          </div>
        </div>

        {trabajo && (
          <div className="zona-lugar">
            <Button variante="peligro" block onClick={() => setDialogo('borrar')}>
              Borrar trabajo
            </Button>
          </div>
        )}
      </form>

      {dialogo === 'mover' && trabajo && (
        <ConfirmDialog
          titulo={`¿Mover el trabajo a ${lugar.nombre}?`}
          texto={textoMudanza(trabajo, actual?.nombre ?? 'el otro lugar', lugar.nombre)}
          confirmar="Mover"
          onConfirm={() => grabar(false)}
          onCancel={() => setDialogo(null)}
        />
      )}
      {dialogo === 'borrar' && (
        <ConfirmDialog
          titulo="¿Borrar este trabajo?"
          texto={
            trabajo?.pagoId
              ? 'Se borra el trabajo. El pago queda registrado y la conciliación de ese período se recalcula. No se puede deshacer.'
              : 'No se puede deshacer.'
          }
          confirmar="Borrar"
          peligro
          onConfirm={borrar}
          onCancel={() => setDialogo(null)}
        />
      )}
      {pregunta && (
        <ConfirmDialog
          titulo="¿Este trabajo ya te lo pagaron?"
          texto="La fecha cae en un período en el que ya registraste un pago."
          confirmar="Sí"
          onConfirm={() => responder('si')}
          alternativa={{ texto: 'No', onClick: () => responder('no') }}
          cancelar="Todavía no sé"
          onCancel={() => responder('nose')}
        />
      )}
    </section>
  )
}

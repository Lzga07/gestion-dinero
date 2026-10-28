import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../../data/db'
import { ErrorDatos } from '../../data/errores'
import { archivarLugar, borrarLugar, guardarLugarConTipos } from '../../data/lugares'
import { formatFechaCorta, hoy } from '../../domain/dates'
import { formatPorcentaje, parsePorcentaje, type Centavos } from '../../domain/money'
import { periodoQueContiene, type DiaCierre } from '../../domain/periodos'
import type { FormaCobro, Lugar, TipoTrabajo } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import Field from '../components/Field'
import MoneyInput from '../components/MoneyInput'
import Segmented from '../components/Segmented'
import { diaCierreActual } from './lugar-utils'

const ERROR_PORCENTAJE = 'Porcentaje inválido (ej: 40 o 37,5)'
const AVISO_HISTORIAL = 'Este lugar tiene historial. Podés archivarlo para que no aparezca más.'
const AVISO_CALENDARIO =
  'Si agregaste el recordatorio al calendario, volvé a agregarlo desde Más → Recordatorios en el calendario.'

const OPCIONES_COBRO: { value: FormaCobro; label: string }[] = [
  { value: 'ARANCEL_FIJO', label: 'Arancel fijo' },
  { value: 'PORCENTAJE', label: 'Porcentaje' },
]

interface FilaTrabajo {
  clave: string
  /** Id del TipoTrabajo guardado; undefined si es nuevo. */
  id?: string
  nombre: string
  precio: Centavos | null
  /** El texto del precio no se pudo interpretar: la fila cuenta como cargada (y con error). */
  precioInvalido?: boolean
}

interface Datos {
  lugar: Lugar | undefined
  tipos: TipoTrabajo[]
  nTrabajos: number
  nPagos: number
}

/** Pantalla de alta (`/lugares/nuevo`) y de configuración (`/lugares/:id/config`). */
export default function ConfigLugar() {
  const { id } = useParams()
  const datos = useLiveQuery(async (): Promise<Datos | null> => {
    if (!id) return null
    return {
      lugar: await db.lugares.get(id),
      tipos: await db.tiposTrabajo.where('lugarId').equals(id).sortBy('orden'),
      nTrabajos: await db.trabajos.where('lugarId').equals(id).count(),
      nPagos: await db.pagos.where('lugarId').equals(id).count(),
    }
  }, [id])

  if (!id) return <Formulario key="nuevo" datos={null} />
  if (datos === undefined) return null // cargando
  if (datos !== null && !datos.lugar) {
    return (
      <section>
        <Encabezado titulo="Configurar lugar" />
        <Card>
          <p className="muted">No encontramos este lugar.</p>
        </Card>
      </section>
    )
  }
  return <Formulario key={id} datos={datos ?? null} />
}

function Encabezado({ titulo }: { titulo: string }) {
  return (
    <header className="screen-header">
      <Link className="screen-header__back" to="/lugares" aria-label="Volver a Lugares">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Link>
      <h1 className="screen-title screen-title--inline">{titulo}</h1>
    </header>
  )
}

/** Texto de un día (entero 1–31) o null si no lo es. */
function parseDia(s: string): number | null {
  const t = s.trim()
  return /^\d{1,2}$/.test(t) ? Number(t) : null
}

function bpATexto(bp: number | null): string {
  return bp === null ? '' : formatPorcentaje(bp).replace(/\s*%$/, '')
}

function parseDiaCierre(valor: string): DiaCierre {
  return valor === 'ULTIMO' ? 'ULTIMO' : Number(valor)
}

let contador = 0
const nuevaClave = () => `fila-${++contador}`

function Formulario({ datos }: { datos: Datos | null }) {
  const navigate = useNavigate()
  const lugar = datos?.lugar
  const formRef = useRef<HTMLFormElement>(null)

  const [nombre, setNombre] = useState(lugar?.nombre ?? '')
  const [formaCobro, setFormaCobro] = useState<FormaCobro>(lugar?.formaCobro ?? 'ARANCEL_FIJO')
  const [pctTexto, setPctTexto] = useState(bpATexto(lugar?.porcentajeBp ?? null))
  const [pctTocado, setPctTocado] = useState(false)
  const [diaCierre, setDiaCierre] = useState<string>(lugar ? String(diaCierreActual(lugar)) : 'ULTIMO')
  const [desdeTexto, setDesdeTexto] = useState(String(lugar?.pagoDesdeDia ?? 1))
  const [hastaTexto, setHastaTexto] = useState(String(lugar?.pagoHastaDia ?? 10))
  const [filas, setFilas] = useState<FilaTrabajo[]>(() =>
    (datos?.tipos ?? []).map((t) => ({ clave: nuevaClave(), id: t.id, nombre: t.nombre, precio: t.precio })),
  )

  const [intentado, setIntentado] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<'archivar' | 'borrar' | 'calendario' | null>(null)

  // ---- Validación ----
  const esPorcentaje = formaCobro === 'PORCENTAJE'
  const bp = parsePorcentaje(pctTexto)
  const desde = parseDia(desdeTexto)
  const hasta = parseDia(hastaTexto)

  const errNombre = nombre.trim() === '' ? 'Poné un nombre para el lugar' : null
  const errPorcentaje = !esPorcentaje
    ? null
    : pctTexto.trim() === ''
      ? 'Ingresá el porcentaje que te corresponde'
      : bp === null
        ? ERROR_PORCENTAJE
        : null
  let errPago: string | null = null
  if (desde === null || hasta === null || desde < 1 || desde > 31 || hasta < 1 || hasta > 31) {
    errPago = 'Los días van de 1 a 31.'
  } else if (desde > hasta) {
    errPago = 'El primer día no puede ser mayor que el último.'
  }
  const filasCargadas = filas.filter((f) => f.nombre.trim() !== '' || f.precio !== null || f.precioInvalido)
  const filaCompleta = (f: FilaTrabajo) => f.nombre.trim() !== '' && f.precio !== null && f.precio > 0
  const errFila = (f: FilaTrabajo) =>
    f.nombre.trim() === '' && f.precio === null && !f.precioInvalido
      ? null
      : filaCompleta(f)
        ? null
        : 'Completá el nombre y un precio mayor a 0'
  const errTrabajos =
    formaCobro === 'ARANCEL_FIJO' && !filasCargadas.some(filaCompleta)
      ? 'Agregá al menos un trabajo con su precio'
      : null
  const hayErrores = !!(
    errNombre ||
    errPorcentaje ||
    errPago ||
    errTrabajos ||
    (formaCobro === 'ARANCEL_FIJO' && filas.some((f) => errFila(f)))
  )
  const ver = intentado > 0
  const verPago = ver && errPago !== null

  // Al fallar el guardado, el foco va al primer campo inválido.
  useEffect(() => {
    if (intentado > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [intentado])

  // ---- Día de cierre ----
  const diaOriginal = lugar ? String(diaCierreActual(lugar)) : null
  const cambiaCierre = !!lugar && diaOriginal !== diaCierre
  const finActual = lugar ? formatFechaCorta(periodoQueContiene(lugar.reglasCierre, hoy()).fin) : ''

  // ---- Acciones ----
  async function guardar(e: FormEvent) {
    e.preventDefault()
    setErrorGeneral(null)
    if (hayErrores) {
      setIntentado((n) => n + 1)
      return
    }
    setGuardando(true)
    try {
      // Un solo guardado transaccional: lugar y lista de precios entran juntos o no entra nada.
      await guardarLugarConTipos({
        id: lugar?.id,
        hoy: hoy(),
        datos: {
          nombre: nombre.trim(),
          formaCobro,
          porcentajeBp: esPorcentaje ? bp : null,
          pagoDesdeDia: desde as number,
          pagoHastaDia: hasta as number,
          diaCierre: parseDiaCierre(diaCierre),
        },
        tipos: esPorcentaje
          ? null
          : filas
              .filter(filaCompleta)
              .map((f) => ({ id: f.id, nombre: f.nombre.trim(), precio: f.precio as Centavos })),
      })
      const cambioPago = !!lugar && (lugar.pagoDesdeDia !== desde || lugar.pagoHastaDia !== hasta)
      if (cambioPago) setDialogo('calendario')
      else navigate('/lugares')
    } catch {
      setErrorGeneral('No se pudo guardar. Probá de nuevo.')
      setGuardando(false)
    }
  }

  async function archivar(archivado: boolean) {
    if (!lugar) return
    setDialogo(null)
    try {
      await archivarLugar(lugar.id, archivado)
      navigate('/lugares')
    } catch {
      setErrorGeneral('No se pudo archivar. Probá de nuevo.')
    }
  }

  async function borrar() {
    if (!lugar) return
    setDialogo(null)
    try {
      await borrarLugar(lugar.id)
      navigate('/lugares')
    } catch (e) {
      setErrorGeneral(
        e instanceof ErrorDatos && (e.codigo === 'LUGAR_CON_TRABAJOS' || e.codigo === 'LUGAR_CON_PAGOS')
          ? AVISO_HISTORIAL
          : 'No se pudo borrar. Probá de nuevo.',
      )
    }
  }

  function actualizarFila(clave: string, cambios: Partial<FilaTrabajo>) {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))
  }

  const sinHistorial = !!datos && datos.nTrabajos === 0 && datos.nPagos === 0

  return (
    <section>
      <Encabezado titulo={lugar ? 'Configurar lugar' : 'Nuevo lugar'} />

      <form ref={formRef} onSubmit={guardar} noValidate>
        <Card>
          <Field label="Nombre" error={ver ? errNombre : null}>
            {(control) => (
              <input
                {...control}
                className="input"
                type="text"
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            )}
          </Field>

          <Segmented legend="Cómo cobra" options={OPCIONES_COBRO} value={formaCobro} onChange={setFormaCobro} />

          {esPorcentaje && (
            <Field
              label="Porcentaje que te corresponde"
              hint="Es lo que te queda de lo que pagó el cliente. Ej: 40 o 37,5"
              error={ver || (pctTocado && pctTexto.trim() !== '') ? errPorcentaje : null}
            >
              {(control) => (
                <input
                  {...control}
                  className="input input--short"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="40"
                  value={pctTexto}
                  onChange={(e) => setPctTexto(e.target.value)}
                  onBlur={() => setPctTocado(true)}
                />
              )}
            </Field>
          )}
        </Card>

        {formaCobro === 'ARANCEL_FIJO' && (
          <>
            <h2 className="section-title">Lista de trabajos y precios</h2>
            <Card>
              {filas.map((f, i) => (
                <div className="trabajo-fila" key={f.clave} role="group" aria-label={`Trabajo ${i + 1}`}>
                  <div className="trabajo-fila__campos">
                    <Field label="Trabajo" error={ver ? errFila(f) : null}>
                      {(control) => (
                        <input
                          {...control}
                          className="input"
                          type="text"
                          autoComplete="off"
                          value={f.nombre}
                          onChange={(e) => actualizarFila(f.clave, { nombre: e.target.value })}
                        />
                      )}
                    </Field>
                    <MoneyInput
                      label="Precio"
                      value={f.precio}
                      onChange={(precio) => actualizarFila(f.clave, { precio })}
                      onInvalidChange={(precioInvalido) => actualizarFila(f.clave, { precioInvalido })}
                    />
                  </div>
                  <Button
                    variante="texto"
                    className="trabajo-fila__quitar"
                    aria-label={`Quitar ${f.nombre.trim() || `trabajo ${i + 1}`}`}
                    onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
              <Button
                variante="texto"
                onClick={() => setFilas((fs) => [...fs, { clave: nuevaClave(), nombre: '', precio: null }])}
              >
                + Agregar trabajo
              </Button>
              {ver && errTrabajos && (
                <p className="field__error" role="alert">
                  {errTrabajos}
                </p>
              )}
            </Card>
            <p className="muted nota">Si cambiás un precio, los trabajos ya anotados mantienen el precio que tenían.</p>
          </>
        )}

        <h2 className="section-title">Período y pago</h2>
        <Card>
          <Field label="Cierra el período el día">
            {(control) => (
              <select {...control} className="input" value={diaCierre} onChange={(e) => setDiaCierre(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {i + 1}
                  </option>
                ))}
                <option value="ULTIMO">Último día del mes</option>
              </select>
            )}
          </Field>
          {cambiaCierre && (
            <p className="field__hint field__hint--aviso">
              El cambio rige desde el próximo período (después del {finActual}).
            </p>
          )}

          <fieldset className="field">
            <legend className="field__label">Cuándo te pagan</legend>
            <p className="field__hint">
              Te pagan entre el día {desde ?? '…'} y el {hasta ?? '…'} del mes siguiente.
            </p>
            <div className="pago-rango">
              <Field label="Desde el día">
                {(control) => (
                  <input
                    {...control}
                    aria-invalid={verPago || undefined}
                    aria-describedby={verPago ? 'pago-error' : undefined}
                    className="input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={desdeTexto}
                    onChange={(e) => setDesdeTexto(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Hasta el día">
                {(control) => (
                  <input
                    {...control}
                    aria-invalid={verPago || undefined}
                    aria-describedby={verPago ? 'pago-error' : undefined}
                    className="input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={hastaTexto}
                    onChange={(e) => setHastaTexto(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {verPago && (
              <p className="field__error" id="pago-error" role="alert">
                {errPago}
              </p>
            )}
          </fieldset>
        </Card>

        {errorGeneral && (
          <p className="field__error form__error" role="alert">
            {errorGeneral}
          </p>
        )}

        <Button type="submit" block disabled={guardando} className="form__guardar">
          Guardar
        </Button>

        {lugar && (
          <div className="zona-lugar">
            {lugar.archivado ? (
              <Button variante="secundario" block onClick={() => archivar(false)}>
                Desarchivar lugar
              </Button>
            ) : (
              <Button variante="secundario" block onClick={() => setDialogo('archivar')}>
                Archivar lugar
              </Button>
            )}
            {sinHistorial && (
              <Button variante="peligro" block onClick={() => setDialogo('borrar')}>
                Borrar lugar
              </Button>
            )}
          </div>
        )}
      </form>

      {dialogo === 'archivar' && (
        <ConfirmDialog
          titulo="¿Archivar este lugar?"
          texto="Deja de aparecer en la lista, pero conservás todo su historial. Podés desarchivarlo cuando quieras."
          confirmar="Archivar"
          onConfirm={() => archivar(true)}
          onCancel={() => setDialogo(null)}
        />
      )}
      {dialogo === 'borrar' && (
        <ConfirmDialog
          titulo="¿Borrar este lugar?"
          texto="Se borran el lugar y su lista de precios. No se puede deshacer."
          confirmar="Borrar"
          peligro
          onConfirm={borrar}
          onCancel={() => setDialogo(null)}
        />
      )}
      {dialogo === 'calendario' && (
        <ConfirmDialog
          titulo="Cambiaste el rango de pago"
          texto={AVISO_CALENDARIO}
          confirmar="Entendido"
          cancelar={null}
          onConfirm={() => navigate('/lugares')}
          onCancel={() => navigate('/lugares')}
        />
      )}
    </section>
  )
}

import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { registrarPago } from '../../data/pagos'
import { requierePregunta, trabajosOfrecidosParaPago } from '../../domain/conciliacion'
import { hoy } from '../../domain/dates'
import { formatPesos, type Centavos } from '../../domain/money'
import { nombrePeriodo, type Periodo } from '../../domain/periodos'
import type { Lugar, TipoPago, Trabajo } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import Encabezado from '../components/Encabezado'
import Field from '../components/Field'
import MoneyInput, { ERROR_MONTO } from '../components/MoneyInput'
import useVolver from '../components/useVolver'
import ListaTildable from './periodo/ListaTildable'
import { ordenarTrabajos, periodoPedido, plural, sumaMontos, useDatosLugar } from './periodo/utils'

/** Registrar un pago (`/lugares/:id/pago?periodo=<fin>`): monto, fecha y qué trabajos cubre. */
export default function RegistrarPago() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const volver = useVolver(id ? `/lugares/${id}` : '/lugares')
  const datos = useDatosLugar(id)
  if (datos === undefined) return null // cargando
  if (!datos.lugar) {
    return (
      <section>
        <Encabezado titulo="Registrar pago" onCerrar={volver} />
        <Card>
          <p className="muted">No encontramos este lugar.</p>
        </Card>
      </section>
    )
  }
  const periodo = periodoPedido(datos.lugar, params.get('periodo'), hoy())
  return <Formulario key={`${datos.lugar.id}${periodo.fin}`} lugar={datos.lugar} trabajos={datos.trabajos} periodo={periodo} />
}

function Formulario({ lugar, trabajos, periodo }: { lugar: Lugar; trabajos: Trabajo[]; periodo: Periodo }) {
  const navigate = useNavigate()
  const volver = useVolver(`/lugares/${lugar.id}`)
  const guardandoRef = useRef(false)

  // Lo que se ofrece queda fijo al abrir: al guardar los trabajos cambian de estado y la lista no debe saltar.
  const [ofrecidos] = useState(() => {
    const o = trabajosOfrecidosParaPago(lugar, periodo.fin, trabajos)
    return { delPeriodo: ordenarTrabajos(o.delPeriodo), anteriores: o.anteriores.map((g) => ({ ...g, trabajos: ordenarTrabajos(g.trabajos) })) }
  })
  const [tildados, setTildados] = useState(() => new Set(ofrecidos.delPeriodo.map((tr) => tr.id)))
  const [monto, setMonto] = useState<Centavos | null>(null)
  const [montoInvalido, setMontoInvalido] = useState(false)
  const [fecha, setFecha] = useState(hoy())
  const [nota, setNota] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [pregunta, setPregunta] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todos = [...ofrecidos.delPeriodo, ...ofrecidos.anteriores.flatMap((g) => g.trabajos)]
  const esperado = sumaMontos(todos.filter((tr) => tildados.has(tr.id)))
  const sinTildar = ofrecidos.delPeriodo.filter((tr) => !tildados.has(tr.id))
  const recibido = monto !== null && monto > 0 ? monto : null

  const errMonto = !intentado ? null : montoInvalido ? ERROR_MONTO : recibido === null ? 'Ingresá un monto mayor a 0' : null
  const errFecha = intentado && fecha === '' ? 'Elegí la fecha' : null

  function cambiar(id: string, tildado: boolean) {
    setTildados((previo) => {
      const nuevo = new Set(previo)
      if (tildado) nuevo.add(id)
      else nuevo.delete(id)
      return nuevo
    })
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (guardandoRef.current) return
    setError(null)
    if (recibido === null || montoInvalido || fecha === '') {
      setIntentado(true)
      return
    }
    if (requierePregunta(esperado, recibido, sinTildar.length)) setPregunta(true)
    else void guardar('FINAL')
  }

  async function guardar(tipo: TipoPago) {
    if (guardandoRef.current || recibido === null) return
    guardandoRef.current = true
    setGuardando(true)
    setPregunta(false)
    try {
      await registrarPago({
        lugarId: lugar.id,
        periodoFin: periodo.fin,
        fecha,
        monto: recibido,
        tipo,
        nota: nota.trim(),
        tildados: todos.filter((tr) => tildados.has(tr.id)).map((tr) => tr.id),
        // Solo los del período: lo atrasado que no se tilda sigue como estaba.
        destildados: sinTildar.map((tr) => tr.id),
      })
      navigate(`/lugares/${lugar.id}?periodo=${periodo.fin}`, { replace: true })
    } catch {
      setError('No se pudo guardar el pago. Probá de nuevo.')
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const diferencia = recibido === null ? 0 : recibido - esperado

  return (
    <section>
      <Encabezado titulo={`Pago · ${lugar.nombre}`} onCerrar={volver} />
      <p className="muted periodo-elegido">Período {nombrePeriodo(periodo)}</p>

      <form onSubmit={enviar} noValidate>
        <Card>
          <MoneyInput
            label="¿Cuánto te pagaron?"
            value={monto}
            onChange={setMonto}
            onInvalidChange={setMontoInvalido}
            error={errMonto}
          />
          <Field label="Fecha del pago" error={errFecha}>
            {(control) => <input {...control} className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
          </Field>
          <Field label="Nota (opcional)">
            {(control) => (
              <input {...control} className="input" type="text" autoComplete="off" placeholder="Ej: transferencia" value={nota} onChange={(e) => setNota(e.target.value)} />
            )}
          </Field>
        </Card>

        <fieldset className="grupo-tildable">
          <legend className="section-title">Trabajos pagados</legend>
          <p className="field__hint grupo-tildable__ayuda">Destildá los que NO te pagaron.</p>
          {ofrecidos.delPeriodo.length === 0 ? (
            <Card>
              <p className="muted">No hay trabajos sin pagar en este período.</p>
            </Card>
          ) : (
            <Card flush>
              <ListaTildable trabajos={ofrecidos.delPeriodo} tildados={tildados} onCambiar={cambiar} />
            </Card>
          )}
        </fieldset>

        {ofrecidos.anteriores.length > 0 && (
          <fieldset className="grupo-tildable">
            <legend className="section-title">De períodos anteriores</legend>
            <p className="field__hint grupo-tildable__ayuda">Tildá los que este pago también cubre.</p>
            {ofrecidos.anteriores.map((g) => (
              <Card flush key={g.periodo.fin}>
                <h3 className="tildable__periodo">{nombrePeriodo(g.periodo)}</h3>
                <ListaTildable trabajos={g.trabajos} tildados={tildados} onCambiar={cambiar} />
              </Card>
            ))}
          </fieldset>
        )}

        <div className={`diferencia-viva${recibido !== null && diferencia === 0 && sinTildar.length === 0 ? ' diferencia-viva--ok' : ''}`} aria-live="polite">
          <p>{recibido === null ? `Esperabas ${formatPesos(esperado)}` : `Esperabas ${formatPesos(esperado)} · te pagaron ${formatPesos(recibido)}`}</p>
          {diferencia < 0 && <p className="diferencia-viva__linea">{`Te pagaron ${formatPesos(-diferencia)} menos de lo esperado`}</p>}
          {diferencia > 0 && <p className="diferencia-viva__linea">{`Te pagaron ${formatPesos(diferencia)} de más`}</p>}
          {sinTildar.length > 0 && (
            <p className="diferencia-viva__linea">
              <strong>{`Falta: ${plural(sinTildar.length, 'trabajo', 'trabajos')}, ${formatPesos(sumaMontos(sinTildar))}`}</strong>
            </p>
          )}
        </div>

        {error && (
          <p className="field__error form__error" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" block disabled={guardando} className="form__guardar form__guardar--fijo">
          Guardar pago
        </Button>
      </form>

      {pregunta && recibido !== null && (
        <ConfirmDialog
          titulo="¿Es todo lo que te van a pagar?"
          texto={`Esperabas ${formatPesos(esperado)} y te pagaron ${formatPesos(recibido)}${sinTildar.length > 0 ? `; ${plural(sinTildar.length, 'trabajo quedó', 'trabajos quedaron')} sin tildar` : ''}.`}
          cancelar="Volver"
          onCancel={() => setPregunta(false)}
          alternativa={{ texto: 'Es un pago a cuenta, falta el resto', onClick: () => void guardar('A_CUENTA') }}
          confirmar="Es todo lo que me van a pagar"
          onConfirm={() => void guardar('FINAL')}
        />
      )}
    </section>
  )
}

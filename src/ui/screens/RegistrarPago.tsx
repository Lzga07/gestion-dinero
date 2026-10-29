import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { registrarPago } from '../../data/pagos'
import { requierePregunta, resumenPeriodo, trabajosOfrecidosParaPago } from '../../domain/conciliacion'
import { hoy } from '../../domain/dates'
import type { Centavos } from '../../domain/money'
import { nombrePeriodo, type Periodo } from '../../domain/periodos'
import type { Lugar, Pago, TipoPago, Trabajo } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import ConfirmDialog from '../components/ConfirmDialog'
import Encabezado from '../components/Encabezado'
import Field from '../components/Field'
import MoneyInput, { ERROR_MONTO } from '../components/MoneyInput'
import useVolver from '../components/useVolver'
import { pesosJuntos } from '../pesos'
import ListaTildable from './periodo/ListaTildable'
import { ordenarTrabajos, periodoPedido, plural, sumaMontos, useDatosLugar } from './periodo/utils'

/** Registrar un pago (`/lugares/:id/pago?periodo=<fin>`): monto, fecha y qué trabajos cubre. */
export default function RegistrarPago() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const volver = useVolver(id ? `/lugares/${id}` : '/lugares')
  const datos = useDatosLugar(id)
  if (datos === undefined) return <Cargando />
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
  return <Formulario key={`${datos.lugar.id}${periodo.fin}`} lugar={datos.lugar} trabajos={datos.trabajos} pagos={datos.pagos} periodo={periodo} />
}

/** "En total falta $ 38.000: 1 trabajo ($ 30.000) y $ 8.000 de diferencia"; si hay solo uno de los dos, solo ese. */
function textoFaltante(trabajos: number, montoTrabajos: Centavos, diferencia: Centavos): string {
  const total = `En total falta ${pesosJuntos(montoTrabajos + diferencia)}`
  if (trabajos > 0 && diferencia > 0)
    return `${total}: ${plural(trabajos, 'trabajo', 'trabajos')} (${pesosJuntos(montoTrabajos)}) y ${pesosJuntos(diferencia)} de diferencia`
  if (trabajos > 0) return `${total}: ${plural(trabajos, 'trabajo', 'trabajos')}`
  return `${total} de diferencia`
}

function Formulario({ lugar, trabajos, pagos, periodo }: { lugar: Lugar; trabajos: Trabajo[]; pagos: Pago[]; periodo: Periodo }) {
  const navigate = useNavigate()
  const volver = useVolver(`/lugares/${lugar.id}`)
  const guardandoRef = useRef(false)

  // Lo que se ofrece queda fijo al abrir: al guardar los trabajos cambian de estado y la lista no debe saltar.
  const [ofrecidos] = useState(() => {
    const o = trabajosOfrecidosParaPago(lugar, periodo.fin, trabajos)
    // Plata que el período todavía debe y no está atada a ningún trabajo (p. ej. lo que faltó de un pago a cuenta).
    const saldoPlata = Math.max(0, resumenPeriodo(lugar, periodo, trabajos, pagos).faltaCobrar - sumaMontos(o.delPeriodo))
    return {
      delPeriodo: ordenarTrabajos(o.delPeriodo),
      anteriores: o.anteriores.map((g) => ({ ...g, trabajos: ordenarTrabajos(g.trabajos) })),
      saldoPlata,
    }
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
  const { saldoPlata } = ofrecidos
  const sumaTildados = sumaMontos(todos.filter((tr) => tildados.has(tr.id)))
  /** Con lo que se compara lo recibido: lo tildado más el saldo en plata del período. */
  const esperadoPregunta = sumaTildados + saldoPlata
  /** Lo que se muestra como "Esperabas": todo lo del período (tildado o no), lo atrasado tildado y el saldo. */
  const tildadosAnteriores = sumaMontos(ofrecidos.anteriores.flatMap((g) => g.trabajos).filter((tr) => tildados.has(tr.id)))
  const esperado = sumaMontos(ofrecidos.delPeriodo) + tildadosAnteriores + saldoPlata
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
    if (requierePregunta(esperadoPregunta, recibido, sinTildar.length)) setPregunta(true)
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

  const diferencia = recibido === null ? 0 : recibido - esperadoPregunta
  const plataSinTrabajo = Math.max(0, -diferencia)
  const montoSinTildar = sumaMontos(sinTildar)
  const faltante = montoSinTildar + plataSinTrabajo

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

        {saldoPlata > 0 && <p className="saldo-pendiente">{`Saldo pendiente del período: ${pesosJuntos(saldoPlata)}`}</p>}

        <div className={`diferencia-viva${recibido !== null && diferencia === 0 && sinTildar.length === 0 ? ' diferencia-viva--ok' : ''}`} aria-live="polite">
          <p>{recibido === null ? `Esperabas ${pesosJuntos(esperado)}` : `Esperabas ${pesosJuntos(esperado)} · te pagaron ${pesosJuntos(recibido)}`}</p>
          {diferencia > 0 && <p className="diferencia-viva__linea">{`Te pagaron ${pesosJuntos(diferencia)} de más`}</p>}
          {faltante > 0 && (
            <p className="diferencia-viva__linea">
              <strong>{textoFaltante(sinTildar.length, montoSinTildar, plataSinTrabajo)}</strong>
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
          texto={`Esperabas ${pesosJuntos(esperado)} y te pagaron ${pesosJuntos(recibido)}${sinTildar.length > 0 ? `; ${plural(sinTildar.length, 'trabajo quedó', 'trabajos quedaron')} sin tildar` : ''}.`}
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

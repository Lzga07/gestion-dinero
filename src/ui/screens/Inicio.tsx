import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { leerAjuste } from '../../data/ajustes'
import { db } from '../../data/db'
import { cerrarPeriodo, cobrarDeuda, noMePagaron } from '../../data/pagos'
import { calcularAvisos, type Aviso } from '../../domain/avisos'
import { resumenPeriodo } from '../../domain/conciliacion'
import { formatFechaCorta, mesClave, nombreMes, type FechaISO } from '../../domain/dates'
import type { Centavos } from '../../domain/money'
import { nombrePeriodo, periodoQueContiene, type Periodo } from '../../domain/periodos'
import { datosReclamo } from '../../pdf/reclamo'
import type { DatosListado } from '../../pdf/listado'
import { resumenMes } from '../../domain/totales'
import type { Lugar, Movimiento, Pago, Trabajo } from '../../domain/types'
import AvisoCard, { type AvisoDeuda } from '../components/AvisoCard'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import ConfirmDialog from '../components/ConfirmDialog'
import DialogCompartir from '../components/DialogCompartir'
import DialogoCobrarDeuda from '../components/DialogoCobrarDeuda'
import { useHoy } from '../hooks/useHoy'
import { plural, textoCerrarPeriodo, tituloCerrarPeriodo } from './periodo/utils'
import { pesosJuntos } from '../pesos'

interface Datos {
  lugares: Lugar[]
  trabajos: Trabajo[]
  pagos: Pago[]
  movimientos: Movimiento[]
  ultimaCopia: string | null
  recordatorioDias: number
}

/** Todo lo que necesita Inicio, siempre al día. `undefined` mientras carga. */
function useDatos(): Datos | undefined {
  return useLiveQuery(
    async (): Promise<Datos> => ({
      lugares: await db.lugares.toArray(),
      trabajos: await db.trabajos.toArray(),
      pagos: await db.pagos.toArray(),
      movimientos: await db.movimientos.toArray(),
      ultimaCopia: await leerAjuste<string | null>('ultimaCopia', null),
      recordatorioDias: await leerAjuste<number>('recordatorioCopiaDias', 7),
    }),
    [],
  )
}

const porNombre = (a: Lugar, b: Lugar) => a.nombre.localeCompare(b.nombre, 'es')

/** Lo que se está por confirmar desde un aviso. `pendientes: null` = todos los trabajos (pago atrasado). */
type Confirmacion =
  | { tipo: 'no-me-pagaron'; lugar: Lugar; periodo: Periodo; pendientes: number | null }
  | { tipo: 'cerrar'; lugar: Lugar; periodo: Periodo; falta: Centavos; pendientes: number }

/** Inicio: saldo del mes, avisos que piden actuar y una tarjeta por lugar con el período en curso. */
export default function Inicio() {
  const datos = useDatos()
  const hoy = useHoy()
  if (datos === undefined) return <Cargando />
  return <Vista datos={datos} hoy={hoy} />
}

function Vista({ datos, hoy }: { datos: Datos; hoy: FechaISO }) {
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null)
  const [reclamo, setReclamo] = useState<Omit<DatosListado, 'incluirNotas'> | null>(null)
  const [cobrando, setCobrando] = useState<AvisoDeuda | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ocupado = useRef(false)

  const { lugares, trabajos, pagos, movimientos } = datos
  const activos = useMemo(() => lugares.filter((l) => !l.archivado).sort(porNombre), [lugares])
  const hayDatos = trabajos.length > 0 || movimientos.length > 0
  const mes = useMemo(() => resumenMes(mesClave(hoy), hoy, trabajos, movimientos), [hoy, trabajos, movimientos])
  const avisos = useMemo(
    () =>
      calcularAvisos({
        hoy, lugares, trabajos, pagos,
        ultimaCopia: datos.ultimaCopia, recordatorioDias: datos.recordatorioDias, hayDatos,
      }),
    [hoy, lugares, trabajos, pagos, datos.ultimaCopia, datos.recordatorioDias, hayDatos],
  )

  // Los avisos incluyen a los lugares archivados: una deuda no se pierde por archivar el lugar.
  const lugarDe = (id: string) => lugares.find((l) => l.id === id)
  const clave = (a: Aviso) => (a.tipo === 'COPIA' ? 'copia' : `${a.tipo}-${a.lugarId}-${'periodo' in a ? a.periodo.fin : ''}`)

  async function confirmar() {
    if (!confirmando || ocupado.current) return
    ocupado.current = true
    setError(null)
    const c = confirmando
    try {
      if (c.tipo === 'cerrar') await cerrarPeriodo(c.lugar.id, c.periodo.fin, hoy)
      else await noMePagaron(c.lugar.id, c.periodo.fin)
    } catch {
      setError(
        c.tipo === 'cerrar'
          ? 'No se pudo pasar a deuda lo que falta cobrar. Probá de nuevo.'
          : 'No se pudo marcar como no pagados. Probá de nuevo.',
      )
    } finally {
      ocupado.current = false
      setConfirmando(null)
    }
  }

  const sinLugares = lugares.length === 0
  const sinActivos = activos.length === 0
  return (
    <section className="inicio">
      <h1 className="sr-only">Inicio</h1>

      {(!sinLugares || hayDatos) && (
        <header className="mes">
          <p className="mes__titulo">{`${nombreMes(hoy)} ${hoy.slice(0, 4)} · hasta hoy`}</p>
          <p className={`mes__saldo${mes.saldo < 0 ? ' texto-neg' : ''}`}>{pesosJuntos(mes.saldo)}</p>
          <div className="mes__detalle">
            <span>{`Ganado ${pesosJuntos(mes.ganado)}`}</span>
            <span>{`Gastos ${pesosJuntos(mes.gastos)}`}</span>
          </div>
        </header>
      )}

      {(avisos.length > 0 || error) && (
        <section className="avisos" aria-label="Avisos">
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          {avisos.map((a) => (
            <AvisoCard
              key={clave(a)}
              aviso={a}
              lugar={a.tipo === 'COPIA' ? undefined : lugarDe(a.lugarId)}
              onNoMePagaron={(aviso) => {
                const lugar = lugarDe(aviso.lugarId)
                const pendientes = aviso.tipo === 'SIN_CONCILIAR' ? aviso.trabajos.length : null
                if (lugar) setConfirmando({ tipo: 'no-me-pagaron', lugar, periodo: aviso.periodo, pendientes })
              }}
              onCerrarPeriodo={(aviso) => {
                const lugar = lugarDe(aviso.lugarId)
                if (lugar) {
                  setConfirmando({
                    tipo: 'cerrar', lugar, periodo: aviso.periodo, falta: aviso.faltaACuenta, pendientes: aviso.trabajos.length,
                  })
                }
              }}
              onYaMeLoPagaron={setCobrando}
              onCompartirReclamo={(lugarId) => {
                const lugar = lugarDe(lugarId)
                const deuda = avisos.find((x) => x.tipo === 'DEUDA' && x.lugarId === lugarId)
                if (lugar && deuda?.tipo === 'DEUDA') setReclamo(datosReclamo(lugar, deuda, pagos, hoy))
              }}
            />
          ))}
        </section>
      )}

      {sinLugares ? (
        <Card className="vacio">
          <p className="vacio__texto">Empezá agregando los lugares donde trabajás</p>
          <Link className="btn btn--primario" to="/lugares/nuevo">
            Agregar lugar
          </Link>
        </Card>
      ) : sinActivos ? (
        <Card className="vacio">
          <p className="vacio__texto">No tenés lugares activos.</p>
          <Link className="btn btn--secundario" to="/lugares">
            Ver lugares
          </Link>
        </Card>
      ) : (
        <>
          <h2 className="section-title">Por lugar</h2>
          <div className="lugares-inicio">
            {activos.map((lugar) => {
              const periodo = periodoQueContiene(lugar.reglasCierre, hoy)
              const r = resumenPeriodo(lugar, periodo, trabajos, pagos)
              return (
                <Link key={lugar.id} className="card lugar-card" to={`/lugares/${lugar.id}`}>
                  <span className="lugar-card__fila">
                    <b className="lugar-card__nombre">{lugar.nombre}</b>
                    <span className="lugar-card__cierre">{`cierra el ${formatFechaCorta(periodo.fin)}`}</span>
                  </span>
                  <span className="lugar-card__fila">
                    <span className="lugar-card__trabajos">{plural(r.cantidad, 'trabajo', 'trabajos')}</span>
                    <span className="lugar-card__total">{pesosJuntos(r.teCorresponde)}</span>
                  </span>
                </Link>
              )
            })}
          </div>
          <Link className="btn btn--primario fab" to="/trabajo/nuevo">
            + Anotar trabajo
          </Link>
        </>
      )}

      {reclamo && <DialogCompartir datos={reclamo} onCerrar={() => setReclamo(null)} />}

      {cobrando && (
        <DialogoCobrarDeuda
          noPagados={cobrando.noPagados}
          diferencias={cobrando.deudasPlata}
          onCancel={() => setCobrando(null)}
          onGuardar={async (fecha, trabajosIds, diferencias) => {
            await cobrarDeuda(cobrando.lugarId, fecha, { trabajos: trabajosIds, diferencias })
            setCobrando(null)
          }}
        />
      )}

      {confirmando?.tipo === 'no-me-pagaron' && (
        <ConfirmDialog
          titulo={
            confirmando.pendientes === null
              ? `¿Marcar todos los trabajos de ${nombrePeriodo(confirmando.periodo)} como no pagados?`
              : `¿Marcar ${confirmando.pendientes === 1 ? 'el trabajo pendiente' : `los ${confirmando.pendientes} trabajos pendientes`} de ${nombrePeriodo(confirmando.periodo)} como no pagados?`
          }
          texto="Pasan a ser una deuda de este lugar hasta que te los paguen."
          confirmar="No me pagaron"
          peligro
          onConfirm={confirmar}
          onCancel={() => setConfirmando(null)}
        />
      )}
      {confirmando?.tipo === 'cerrar' && (
        <ConfirmDialog
          titulo={tituloCerrarPeriodo(confirmando.periodo)}
          texto={textoCerrarPeriodo(confirmando.falta, confirmando.pendientes)}
          confirmar="Ya no me van a pagar más"
          peligro
          onConfirm={confirmar}
          onCancel={() => setConfirmando(null)}
        />
      )}
    </section>
  )
}

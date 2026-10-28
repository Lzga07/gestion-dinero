import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { borrarPago, saldarDiferencia, yaMeLoPagaron } from '../../data/pagos'
import { resumenPeriodo } from '../../domain/conciliacion'
import { formatFechaCorta, hoy, type FechaISO } from '../../domain/dates'
import type { Centavos } from '../../domain/money'
import type { Lugar, Pago, Trabajo } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import DialogoYaPagaron from '../components/DialogoYaPagaron'
import ResumenCard from './periodo/ResumenCard'
import SelectorPeriodo from './periodo/SelectorPeriodo'
import { etiquetaTrabajo, finDe, ordenarTrabajos, periodoPedido, useDatosLugar } from './periodo/utils'
import { pesosJuntos } from '../pesos'

type Dialogo =
  | { tipo: 'cobro-trabajo'; trabajo: Trabajo }
  | { tipo: 'cobro-diferencia'; monto: Centavos }
  | { tipo: 'borrar-pago'; pago: Pago }

/** Período de un lugar (`/lugares/:id?periodo=<fin>`): qué le corresponde, qué le pagaron y qué falta. */
export default function PeriodoLugar() {
  const { id } = useParams()
  const datos = useDatosLugar(id)
  if (datos === undefined) return null // cargando
  if (!datos.lugar) {
    return (
      <section>
        <h1 className="screen-title">Lugar</h1>
        <Card>
          <p className="muted">No encontramos este lugar.</p>
        </Card>
      </section>
    )
  }
  return <Vista key={datos.lugar.id} lugar={datos.lugar} trabajos={datos.trabajos} pagos={datos.pagos} />
}

function Vista({ lugar, trabajos, pagos }: { lugar: Lugar; trabajos: Trabajo[]; pagos: Pago[] }) {
  const [params, setParams] = useSearchParams()
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const periodo = periodoPedido(lugar, params.get('periodo'), hoy())
  const resumen = resumenPeriodo(lugar, periodo, trabajos, pagos)
  const delPeriodo = ordenarTrabajos(trabajos.filter((tr) => finDe(lugar, tr) === periodo.fin))
  const pagosDelPeriodo = pagos
    .filter((p) => p.periodoFin === periodo.fin)
    .sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creadoEn < b.creadoEn ? 1 : -1))

  /** Corre una acción de datos; si falla deja el aviso en pantalla. */
  async function correr(accion: () => Promise<unknown>, falla: string) {
    setError(null)
    try {
      await accion()
      setDialogo(null)
    } catch {
      setError(falla)
      setDialogo(null)
    }
  }

  return (
    <section>
      <header className="screen-header screen-header--lugar">
        <Link className="screen-header__back" to="/lugares" aria-label="Volver a Lugares">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="screen-title screen-title--inline">{lugar.nombre}</h1>
        <Link className="screen-header__back screen-header__accion" to={`/lugares/${lugar.id}/config`} aria-label="Configurar lugar">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </header>

      <SelectorPeriodo
        lugar={lugar}
        trabajos={trabajos}
        seleccionado={periodo}
        onElegir={(fin: FechaISO) => setParams({ periodo: fin }, { replace: true })}
      />

      <ResumenCard resumen={resumen} />

      {error && (
        <p className="field__error form__error" role="alert">
          {error}
        </p>
      )}

      {delPeriodo.length === 0 ? (
        <Card>
          <p className="muted">No hay trabajos en este período.</p>
        </Card>
      ) : (
        <Card flush as="ul" className="lista trabajos" aria-label="Trabajos del período">
          {delPeriodo.map((tr) => (
            <li key={tr.id} className="trabajo">
              <Link className="trabajo__datos" to={`/trabajo/${tr.id}`}>
                <span className={`trabajo__estado trabajo__estado--${tr.estado.toLowerCase()}`}>
                  {tr.estado === 'PAGADO' && (
                    <>
                      <span aria-hidden="true">✓</span>
                      <span className="sr-only">Pagado</span>
                    </>
                  )}
                  {tr.estado === 'NO_PAGADO' && (
                    <>
                      <span aria-hidden="true">⚠</span>
                      <span className="sr-only">Sin pagar</span>
                    </>
                  )}
                </span>
                <span className="trabajo__nombre">
                  <span id={`trabajo-${tr.id}`}>{etiquetaTrabajo(tr)}</span>
                  {tr.nota && <small className="nota-trabajo">{tr.nota}</small>}
                </span>
                <span className={tr.estado === 'NO_PAGADO' ? 'texto-neg' : undefined}>{pesosJuntos(tr.monto)}</span>
              </Link>
              {tr.estado === 'NO_PAGADO' && (
                <Button
                  variante="texto"
                  className="trabajo__accion"
                  aria-describedby={`trabajo-${tr.id}`}
                  onClick={() => setDialogo({ tipo: 'cobro-trabajo', trabajo: tr })}
                >
                  Ya me lo pagaron
                </Button>
              )}
            </li>
          ))}
        </Card>
      )}

      {resumen.deudaPlata > 0 && (
        <Card className="diferencia">
          <div className="diferencia__fila">
            <p className="diferencia__texto">{`Diferencia en pago: ${pesosJuntos(resumen.deudaPlata)}`}</p>
            <Button variante="texto" onClick={() => setDialogo({ tipo: 'cobro-diferencia', monto: resumen.deudaPlata })}>
              Ya me lo pagaron
            </Button>
          </div>
        </Card>
      )}

      {pagosDelPeriodo.length > 0 && (
        <>
          <h2 className="section-title">Pagos de este período</h2>
          <Card flush as="ul" className="lista pagos" aria-label="Pagos de este período">
            {pagosDelPeriodo.map((p) => (
              <li key={p.id} className="pago">
                <span className="pago__datos">{`${formatFechaCorta(p.fecha)} · ${p.tipo === 'FINAL' ? 'final' : 'a cuenta'}`}</span>
                <strong className="texto-ok">{pesosJuntos(p.monto)}</strong>
                <Button
                  variante="texto"
                  className="texto-neg"
                  aria-label={`Borrar pago del ${formatFechaCorta(p.fecha)}`}
                  onClick={() => setDialogo({ tipo: 'borrar-pago', pago: p })}
                >
                  Borrar
                </Button>
              </li>
            ))}
          </Card>
        </>
      )}

      <div className="acciones-fijas">
        {/* Se conecta en la Tarea 15 (listado en PDF). */}
        <Button variante="secundario" disabled title="Disponible pronto" aria-describedby="compartir-pronto">
          Compartir listado
        </Button>
        <span id="compartir-pronto" className="sr-only">
          Disponible pronto
        </span>
        <Link className="btn btn--primario" to={`/lugares/${lugar.id}/pago?periodo=${periodo.fin}`}>
          Registrar pago
        </Link>
      </div>

      {dialogo?.tipo === 'cobro-trabajo' && (
        <DialogoYaPagaron
          texto={etiquetaTrabajo(dialogo.trabajo)}
          montoInicial={dialogo.trabajo.monto}
          onCancel={() => setDialogo(null)}
          onGuardar={async (fecha, monto) => {
            await yaMeLoPagaron(dialogo.trabajo.id, fecha, monto)
            setDialogo(null)
          }}
        />
      )}
      {dialogo?.tipo === 'cobro-diferencia' && (
        <DialogoYaPagaron
          texto="Diferencia en pago"
          montoInicial={dialogo.monto}
          onCancel={() => setDialogo(null)}
          onGuardar={async (fecha, monto) => {
            await saldarDiferencia(lugar.id, periodo.fin, fecha, monto)
            setDialogo(null)
          }}
        />
      )}
      {dialogo?.tipo === 'borrar-pago' && (
        <ConfirmDialog
          titulo="¿Borrar este pago?"
          texto="Sus trabajos vuelven a pendiente."
          confirmar="Borrar"
          peligro
          onConfirm={() => correr(() => borrarPago(dialogo.pago.id), 'No se pudo borrar el pago. Probá de nuevo.')}
          onCancel={() => setDialogo(null)}
        />
      )}
    </section>
  )
}

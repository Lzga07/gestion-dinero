import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Aviso } from '../../domain/avisos'
import { nombrePeriodo } from '../../domain/periodos'
import type { Lugar } from '../../domain/types'
import { plural } from '../screens/periodo/utils'
import Button from './Button'
import { pesosJuntos } from '../pesos'

type AvisoPeriodo = Extract<Aviso, { tipo: 'PAGO_ATRASADO' | 'SIN_CONCILIAR' }>
export type AvisoSinConciliar = Extract<Aviso, { tipo: 'SIN_CONCILIAR' }>

interface AvisoCardProps {
  aviso: Aviso
  /** El lugar del aviso (todos menos COPIA). */
  lugar?: Lugar
  /** "No me pagaron": pasar los pendientes del período a no pagados (el que lo recibe pide confirmación). */
  onNoMePagaron?: (aviso: AvisoPeriodo) => void
  /** "Ya no me van a pagar más": cerrar un período con pagos solo a cuenta (pide confirmación). */
  onCerrarPeriodo?: (aviso: AvisoSinConciliar) => void
  onCompartirReclamo?: (lugarId: string) => void
}

interface Contenido {
  /** `alerta` (terracota): hay que actuar con plata. `aviso` (ámbar): para revisar o recordar. */
  nivel: 'alerta' | 'aviso'
  titulo: string
  lineas: string[]
  acciones: ReactNode
}

function contenido({ aviso, lugar, onNoMePagaron, onCerrarPeriodo, onCompartirReclamo }: AvisoCardProps): Contenido | null {
  if (aviso.tipo === 'COPIA') {
    return {
      nivel: 'aviso',
      titulo:
        aviso.diasSinCopia === null
          ? 'Todavía no hiciste una copia de seguridad'
          : `Hace ${plural(aviso.diasSinCopia, 'día', 'días')} que no hacés una copia de seguridad`,
      lineas: [],
      acciones: (
        <Link className="btn btn--secundario" to="/mas/copia">
          Hacer copia ahora
        </Link>
      ),
    }
  }
  if (!lugar) return null

  if (aviso.tipo === 'PAGO_ATRASADO') {
    return {
      nivel: 'alerta',
      titulo: `${lugar.nombre}: sin pago registrado`,
      lineas: [
        `${nombrePeriodo(aviso.periodo)} · ${pesosJuntos(aviso.monto)} · te pagan del ${lugar.pagoDesdeDia} al ${lugar.pagoHastaDia}`,
      ],
      acciones: (
        <>
          <Link className="btn btn--secundario" to={`/lugares/${lugar.id}/pago?periodo=${aviso.periodo.fin}`}>
            Registrar pago
          </Link>
          <Button variante="secundario" onClick={() => onNoMePagaron?.(aviso)}>
            No me pagaron
          </Button>
        </>
      ),
    }
  }

  if (aviso.tipo === 'DEUDA') {
    const diferencias = aviso.deudasPlata.reduce((s, d) => s + d.monto, 0)
    return {
      nivel: 'alerta',
      titulo: `${lugar.nombre}: te deben ${pesosJuntos(aviso.monto)}`,
      lineas: [
        ...(aviso.noPagados.length > 0 ? [`${plural(aviso.noPagados.length, 'trabajo', 'trabajos')} sin pagar`] : []),
        ...(diferencias > 0 ? [`Diferencias en pagos: ${pesosJuntos(diferencias)}`] : []),
      ],
      acciones: (
        <>
          <Link className="btn btn--secundario" to={`/lugares/${lugar.id}`}>
            Ver detalle
          </Link>
          <Button variante="secundario" onClick={() => onCompartirReclamo?.(lugar.id)}>
            Compartir reclamo
          </Button>
        </>
      ),
    }
  }

  // SIN_CONCILIAR: trabajos pendientes y/o pagos solo a cuenta que no alcanzan, con el plazo ya vencido.
  const periodo = nombrePeriodo(aviso.periodo)
  const hayTrabajos = aviso.trabajos.length > 0
  const falta = pesosJuntos(aviso.faltaACuenta)
  return {
    nivel: 'aviso',
    titulo: hayTrabajos
      ? `${lugar.nombre}: ${plural(aviso.trabajos.length, 'trabajo', 'trabajos')} sin conciliar`
      : `${lugar.nombre}: falta cobrar ${falta} de ${periodo} (pagos a cuenta)`,
    lineas: hayTrabajos
      ? [
          `${periodo}: revisá si te los pagaron.`,
          ...(aviso.faltaACuenta > 0 ? [`Además falta cobrar ${falta} de los pagos a cuenta.`] : []),
        ]
      : ['Ya pasó la fecha de pago y solo registraste pagos a cuenta.'],
    acciones: (
      <>
        <Link className="btn btn--secundario" to={`/lugares/${lugar.id}?periodo=${aviso.periodo.fin}`}>
          Revisar
        </Link>
        {aviso.faltaACuenta > 0 ? (
          // Cerrar el período también pasa los pendientes a no pagados: no hace falta "No me pagaron".
          <Button variante="secundario" onClick={() => onCerrarPeriodo?.(aviso)}>
            Ya no me van a pagar más
          </Button>
        ) : (
          <Button variante="secundario" onClick={() => onNoMePagaron?.(aviso)}>
            No me pagaron
          </Button>
        )}
      </>
    ),
  }
}

/** Un aviso de Inicio: qué pasa, el detalle y lo que se puede hacer. */
export default function AvisoCard(props: AvisoCardProps) {
  const c = contenido(props)
  if (!c) return null
  return (
    <article className={`aviso-card aviso-card--${c.nivel}`}>
      <h3 className="aviso-card__titulo">{c.titulo}</h3>
      {c.lineas.map((linea) => (
        <p key={linea} className="aviso-card__texto">
          {linea}
        </p>
      ))}
      <div className="aviso-card__acciones">{c.acciones}</div>
    </article>
  )
}

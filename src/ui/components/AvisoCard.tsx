import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Aviso } from '../../domain/avisos'
import { formatPesos } from '../../domain/money'
import { nombrePeriodo, type Periodo } from '../../domain/periodos'
import type { Lugar } from '../../domain/types'
import { plural } from '../screens/periodo/utils'
import Button from './Button'

interface AvisoCardProps {
  aviso: Aviso
  /** El lugar del aviso (todos menos COPIA). */
  lugar?: Lugar
  onNoMePagaron?: (lugarId: string, periodo: Periodo) => void
}

/** Botón que todavía no hace nada (se conecta en una tarea posterior): deshabilitado y con la explicación para lectores de pantalla. */
function BotonPronto({ children }: { children: string }) {
  const id = useId()
  return (
    <>
      <Button variante="secundario" disabled title="Disponible pronto" aria-describedby={id}>
        {children}
      </Button>
      <span id={id} className="sr-only">
        Disponible pronto
      </span>
    </>
  )
}

interface Contenido {
  /** `alerta` (terracota): hay que actuar con plata. `aviso` (ámbar): para revisar o recordar. */
  nivel: 'alerta' | 'aviso'
  titulo: string
  lineas: string[]
  acciones: ReactNode
}

function contenido(aviso: Aviso, lugar: Lugar | undefined, onNoMePagaron: AvisoCardProps['onNoMePagaron']): Contenido | null {
  if (aviso.tipo === 'COPIA') {
    return {
      nivel: 'aviso',
      titulo:
        aviso.diasSinCopia === null
          ? 'Todavía no hiciste una copia de seguridad'
          : `Hace ${plural(aviso.diasSinCopia, 'día', 'días')} que no hacés una copia de seguridad`,
      lineas: [],
      // Se conecta en la Tarea 16 (copia de seguridad).
      acciones: <BotonPronto>Hacer copia ahora</BotonPronto>,
    }
  }
  if (!lugar) return null

  if (aviso.tipo === 'PAGO_ATRASADO') {
    return {
      nivel: 'alerta',
      titulo: `${lugar.nombre}: sin pago registrado`,
      lineas: [
        `Te pagan entre el ${lugar.pagoDesdeDia} y el ${lugar.pagoHastaDia}. ${nombrePeriodo(aviso.periodo)}: ${formatPesos(aviso.monto)}.`,
      ],
      acciones: (
        <>
          <Link className="btn btn--secundario" to={`/lugares/${lugar.id}/pago?periodo=${aviso.periodo.fin}`}>
            Registrar pago
          </Link>
          <Button variante="secundario" onClick={() => onNoMePagaron?.(lugar.id, aviso.periodo)}>
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
      titulo: `${lugar.nombre}: te deben ${formatPesos(aviso.monto)}`,
      lineas: [
        ...(aviso.noPagados.length > 0 ? [`${plural(aviso.noPagados.length, 'trabajo', 'trabajos')} sin pagar`] : []),
        ...(diferencias > 0 ? [`Diferencias en pagos: ${formatPesos(diferencias)}`] : []),
      ],
      acciones: (
        <>
          <Link className="btn btn--secundario" to={`/lugares/${lugar.id}`}>
            Ver detalle
          </Link>
          {/* Se conecta en la Tarea 15 (reclamo en PDF). */}
          <BotonPronto>Compartir reclamo</BotonPronto>
        </>
      ),
    }
  }

  return {
    nivel: 'aviso',
    titulo: `${lugar.nombre}: ${plural(aviso.trabajos.length, 'trabajo', 'trabajos')} sin conciliar`,
    lineas: [`${nombrePeriodo(aviso.periodo)}: revisá si te los pagaron.`],
    acciones: (
      <Link className="btn btn--secundario" to={`/lugares/${lugar.id}?periodo=${aviso.periodo.fin}`}>
        Revisar
      </Link>
    ),
  }
}

/** Un aviso de Inicio: qué pasa, el detalle y lo que se puede hacer. */
export default function AvisoCard({ aviso, lugar, onNoMePagaron }: AvisoCardProps) {
  const c = contenido(aviso, lugar, onNoMePagaron)
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

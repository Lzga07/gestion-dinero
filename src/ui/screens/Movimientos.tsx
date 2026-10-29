import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../../data/db'
import { mesClave, moverMes, nombreMes } from '../../domain/dates'
import type { Categoria, Lugar, Movimiento, Trabajo } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import { useHoy } from '../hooks/useHoy'
import { pesosJuntos } from '../pesos'
import { agruparPorDia, construirFilas, type Fila, type Filtro } from './movimientos/lista'
import MenuNuevo from './movimientos/MenuNuevo'

interface Datos {
  trabajos: Trabajo[]
  movimientos: Movimiento[]
  categorias: Categoria[]
  lugares: Lugar[]
}

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'TODO', texto: 'Todo' },
  { valor: 'INGRESOS', texto: 'Ingresos' },
  { valor: 'GASTOS', texto: 'Gastos' },
]

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/

function FilaMovimiento({ fila }: { fila: Fila }) {
  return (
    <li>
      <Link className="mov-fila" to={fila.destino}>
        <span
          className="mov-fila__icono"
          aria-hidden="true"
          style={fila.color ? { background: `color-mix(in srgb, ${fila.color} 16%, var(--card))` } : undefined}
        >
          {fila.icono}
        </span>
        <span className="mov-fila__texto">
          <span className="mov-fila__titulo">{fila.titulo}</span>
          {/* Los espacios separan renglones y monto en el nombre accesible de la fila (en un flex no se ven). */}
          {fila.detalle && (
            <>
              {' '}
              <span className="mov-fila__detalle">{fila.detalle}</span>
            </>
          )}
        </span>{' '}
        <span className={`mov-fila__monto ${fila.suma ? 'texto-ok' : 'texto-neg'}`}>
          {`${fila.suma ? '+' : '−'} ${pesosJuntos(fila.monto)}`}
        </span>
      </Link>
    </li>
  )
}

/** Movimientos: trabajos, otros ingresos y gastos del mes, agrupados por día. */
export default function Movimientos() {
  const hoy = useHoy()
  // Estadísticas abre esta pantalla con `?mes=YYYY-MM&filtro=GASTOS`; lo que no es válido se ignora.
  const [params] = useSearchParams()
  const [mes, setMes] = useState(() => {
    const pedido = params.get('mes')
    return pedido !== null && MES_VALIDO.test(pedido) ? pedido : mesClave(hoy)
  })
  const [filtro, setFiltro] = useState<Filtro>(() => {
    const pedido = FILTROS.find((f) => f.valor === params.get('filtro'))
    return pedido ? pedido.valor : 'TODO'
  })
  const [menu, setMenu] = useState(false)

  const datos = useLiveQuery(
    async (): Promise<Datos> => ({
      trabajos: await db.trabajos.toArray(),
      movimientos: await db.movimientos.toArray(),
      categorias: await db.categorias.toArray(),
      lugares: await db.lugares.toArray(),
    }),
    [],
  )
  const dias = useMemo(
    () =>
      datos
        ? agruparPorDia(construirFilas(mes, filtro, datos.trabajos, datos.movimientos, datos.categorias, datos.lugares), hoy)
        : [],
    [datos, mes, filtro, hoy],
  )
  if (datos === undefined) return <Cargando />

  return (
    <section className="movimientos">
      <h1 className="screen-title">Movimientos</h1>

      <div className="mov-mes">
        <Button variante="texto" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>
          ‹
        </Button>
        <span className="mov-mes__nombre">{`${nombreMes(`${mes}-01`)} ${mes.slice(0, 4)}`}</span>
        <Button variante="texto" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))}>
          ›
        </Button>
      </div>

      <div className="pestanas" role="group" aria-label="Mostrar">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            className="pestana"
            aria-pressed={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {dias.length === 0 ? (
        <Card>
          <p className="muted">No hay movimientos en este mes</p>
        </Card>
      ) : (
        dias.map((d) => (
          <section key={d.fecha} aria-labelledby={`dia-${d.fecha}`}>
            <h2 className="section-title" id={`dia-${d.fecha}`}>
              {d.titulo}
            </h2>
            <Card flush as="ul">
              {d.filas.map((f) => (
                <FilaMovimiento key={f.clave} fila={f} />
              ))}
            </Card>
          </section>
        ))
      )}

      <Button className="fab" onClick={() => setMenu(true)}>
        + Nuevo
      </Button>
      {menu && <MenuNuevo onCerrar={() => setMenu(false)} />}
    </section>
  )
}

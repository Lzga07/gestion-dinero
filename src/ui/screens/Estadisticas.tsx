import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useMemo, useState } from 'react'
import { db } from '../../data/db'
import { mesClave, moverMes, nombreMes } from '../../domain/dates'
import { gananciaPorLugarPorMes, gastosPorCategoria } from '../../domain/totales'
import type { Ambito, Categoria, Lugar, Movimiento, Trabajo } from '../../domain/types'
import BarrasApiladas, { type Barra } from '../components/BarrasApiladas'
import BarrasHorizontales from '../components/BarrasHorizontales'
import Card from '../components/Card'
import { useHoy } from '../hooks/useHoy'
import { pesosJuntos } from '../pesos'

interface Datos {
  trabajos: Trabajo[]
  movimientos: Movimiento[]
  categorias: Categoria[]
  lugares: Lugar[]
}

type Rango = 4 | 12
type FiltroAmbito = 'TODOS' | Ambito
interface EntradaLeyenda {
  clave: string
  nombre: string
  color: string
}

const RANGOS: { valor: Rango; texto: string }[] = [
  { valor: 4, texto: '4 meses' },
  { valor: 12, texto: '12 meses' },
]
const AMBITOS: { valor: FiltroAmbito; texto: string }[] = [
  { valor: 'TODOS', texto: 'Todos' },
  { valor: 'TRABAJO', texto: 'Trabajo' },
  { valor: 'PERSONAL', texto: 'Personal' },
]
const SIN_DATOS = 'Todavía no hay datos para este período'
const CANTIDAD_COLORES = 6

/** "octubre 2026" (en minúscula, para frases y nombres accesibles). */
const mesYAnio = (mes: string) => `${nombreMes(`${mes}-01`).toLowerCase()} ${mes.slice(0, 4)}`

const porId = (a: Lugar, b: Lugar) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Grupo de botones de una sola opción activa (mismo aspecto que el filtro de Movimientos). */
function Opciones<T extends string | number>(props: {
  nombre: string
  opciones: { valor: T; texto: string }[]
  valor: T
  onChange: (v: T) => void
}) {
  return (
    <div className="pestanas" role="group" aria-label={props.nombre}>
      {props.opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          className="pestana"
          aria-pressed={props.valor === o.valor}
          onClick={() => props.onChange(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

/**
 * Barras del gráfico de ganancias: un segmento por lugar con trabajos ese mes. El color de cada lugar sale
 * de su posición entre TODOS los lugares (archivados incluidos) ordenados por id, así que no cambia nunca.
 */
function armarBarras(meses: string[], datos: Datos): { barras: Barra[]; leyenda: EntradaLeyenda[] } {
  const lugares = [...datos.lugares].sort(porId)
  const colores = new Map(lugares.map((l, i) => [l.id, `var(--lugar-${(i % CANTIDAD_COLORES) + 1})`]))
  const porMes = gananciaPorLugarPorMes(meses, datos.trabajos)
  const barras = meses.map((mes): Barra => {
    const segmentos = lugares.flatMap((l) => {
      const monto = porMes.get(mes)?.get(l.id) ?? 0
      return monto === 0 ? [] : [{ clave: l.id, nombre: l.nombre, color: colores.get(l.id) ?? '', monto }]
    })
    return {
      clave: mes,
      etiqueta: nombreMes(`${mes}-01`).slice(0, 3),
      nombre: mesYAnio(mes),
      total: segmentos.reduce((suma, s) => suma + s.monto, 0),
      segmentos,
    }
  })
  const usados = new Set(barras.flatMap((b) => b.segmentos.map((s) => s.clave)))
  const leyenda = lugares
    .filter((l) => usados.has(l.id))
    .map((l) => ({ clave: l.id, nombre: l.nombre, color: colores.get(l.id) ?? '' }))
  return { barras, leyenda }
}

/** Texto alternativo del gráfico: el total de cada mes y lo que aportó cada lugar. */
function resumenDe(barras: Barra[]): string {
  const meses = barras.map((b) => {
    const porLugar = b.segmentos.map((s) => `${s.nombre} ${pesosJuntos(s.monto)}`).join(', ')
    return `${b.nombre}: ${pesosJuntos(b.total)}${porLugar ? ` (${porLugar})` : ''}`
  })
  return `Ganancia por mes: ${meses.join('. ')}.`
}

/** Estadísticas: cuánto ganás por lugar mes a mes, y en qué categorías gastás más. */
export default function Estadisticas() {
  const hoy = useHoy()
  const mesActual = mesClave(hoy)
  const [rango, setRango] = useState<Rango>(4)
  const [mesElegido, setMesElegido] = useState(mesActual)
  const [ambito, setAmbito] = useState<FiltroAmbito>('TODOS')
  const idDesglose = useId()

  const datos = useLiveQuery(
    async (): Promise<Datos> => ({
      trabajos: await db.trabajos.toArray(),
      movimientos: await db.movimientos.toArray(),
      categorias: await db.categorias.toArray(),
      lugares: await db.lugares.toArray(),
    }),
    [],
  )

  // Los últimos N meses terminando en el actual: nunca hay meses futuros.
  const meses = useMemo(() => Array.from({ length: rango }, (_, i) => moverMes(mesActual, i - rango + 1)), [rango, mesActual])
  // Si el mes elegido quedó fuera del rango (se achicó), se vuelve al actual.
  const mes = meses.includes(mesElegido) ? mesElegido : mesActual

  const grafico = useMemo(() => (datos ? armarBarras(meses, datos) : null), [datos, meses])
  const ranking = useMemo(
    () => (datos ? gastosPorCategoria(mes, datos.movimientos, datos.categorias, ambito === 'TODOS' ? null : ambito) : []),
    [datos, mes, ambito],
  )
  if (datos === undefined || grafico === null) return null // cargando

  const { barras, leyenda } = grafico
  const barraElegida = barras.find((b) => b.clave === mes)
  const anio = mes.slice(0, 4)
  const tituloGastos = `En qué gastás más · ${nombreMes(`${mes}-01`).toLowerCase()}${anio === mesActual.slice(0, 4) ? '' : ` ${anio}`}`

  return (
    <section className="estadisticas">
      <h1 className="screen-title">Estadísticas</h1>
      <Opciones nombre="Período" opciones={RANGOS} valor={rango} onChange={setRango} />

      <Card>
        <h2 className="grafico__titulo">Cuánto ganás por lugar</h2>
        {barras.some((b) => b.total > 0) ? (
          <>
            <BarrasApiladas
              nombre="Ganancia por mes y por lugar"
              barras={barras}
              seleccionada={mes}
              onSeleccionar={setMesElegido}
              resumen={resumenDe(barras)}
              nombreLeyenda="Lugares"
              leyenda={leyenda}
            />
            <section className="desglose" aria-labelledby={idDesglose}>
              <div className="desglose__cabecera">
                <h3 className="desglose__titulo" id={idDesglose}>{`${nombreMes(`${mes}-01`)} ${anio}`}</h3>
                <span className="desglose__total">{pesosJuntos(barraElegida?.total ?? 0)}</span>
              </div>
              {barraElegida && barraElegida.segmentos.length > 0 ? (
                <ul className="desglose__lista">
                  {[...barraElegida.segmentos]
                    .sort((a, b) => b.monto - a.monto)
                    .map((s) => (
                      <li key={s.clave} className="desglose__fila">
                        <span className="desglose__nombre">
                          <span
                            className="leyenda__muestra"
                            style={{ ['--color-lugar' as string]: s.color }}
                            aria-hidden="true"
                          />
                          {s.nombre}
                        </span>
                        <span className="desglose__monto">{pesosJuntos(s.monto)}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="muted">No hay trabajos en este mes</p>
              )}
            </section>
          </>
        ) : (
          <p className="muted">{SIN_DATOS}</p>
        )}
      </Card>

      <Card>
        <h2 className="grafico__titulo">{tituloGastos}</h2>
        <Opciones nombre="Mostrar gastos" opciones={AMBITOS} valor={ambito} onChange={setAmbito} />
        {ranking.length > 0 ? (
          <BarrasHorizontales
            nombre="Gastos por categoría"
            items={ranking.map((r) => ({
              clave: r.categoria.id,
              nombre: r.categoria.nombre,
              monto: r.monto,
              destino: `/movimientos?mes=${mes}&filtro=GASTOS`,
            }))}
          />
        ) : (
          <p className="muted">{SIN_DATOS}</p>
        )}
      </Card>
    </section>
  )
}

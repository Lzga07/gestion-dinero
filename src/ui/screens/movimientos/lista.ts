import { formatFechaCorta, sumarDias, type FechaISO } from '../../../domain/dates'
import type { Centavos } from '../../../domain/money'
import type { Categoria, Lugar, Movimiento, Trabajo } from '../../../domain/types'

export type Filtro = 'TODO' | 'INGRESOS' | 'GASTOS'

/** Una fila de la lista: un trabajo, un otro ingreso o un gasto. */
export interface Fila {
  clave: string
  fecha: FechaISO
  /** Los trabajos y los otros ingresos suman (+); los gastos restan (−). */
  suma: boolean
  monto: Centavos
  icono: string
  color: string
  titulo: string
  /** "trabajo" / "personal" en gastos, "otro ingreso" en ingresos; los trabajos no llevan. */
  etiqueta: string | null
  nota: string
  destino: string
  creadoEn: string
}

export interface Dia {
  fecha: FechaISO
  titulo: string
  filas: Fila[]
}

const ICONO_TRABAJO = '💼'

/** Une trabajos y movimientos del mes `mes` ('YYYY-MM') en filas, ya filtradas. */
export function construirFilas(
  mes: string,
  filtro: Filtro,
  trabajos: Trabajo[],
  movimientos: Movimiento[],
  categorias: Categoria[],
  lugares: Lugar[],
): Fila[] {
  const filas: Fila[] = []
  if (filtro !== 'GASTOS') {
    for (const t of trabajos) {
      if (!t.fecha.startsWith(mes)) continue
      const lugar = lugares.find((l) => l.id === t.lugarId)
      filas.push({
        clave: `t-${t.id}`,
        fecha: t.fecha,
        suma: true,
        monto: t.monto,
        icono: ICONO_TRABAJO,
        color: '',
        titulo: lugar ? `${t.descripcion} · ${lugar.nombre}` : t.descripcion,
        etiqueta: null,
        nota: t.nota,
        destino: `/trabajo/${t.id}`,
        creadoEn: t.creadoEn,
      })
    }
  }
  for (const m of movimientos) {
    if (!m.fecha.startsWith(mes)) continue
    if (filtro === 'INGRESOS' && m.tipo !== 'INGRESO') continue
    if (filtro === 'GASTOS' && m.tipo !== 'GASTO') continue
    const cat = categorias.find((c) => c.id === m.categoriaId)
    filas.push({
      clave: `m-${m.id}`,
      fecha: m.fecha,
      suma: m.tipo === 'INGRESO',
      monto: m.monto,
      icono: cat?.icono ?? '',
      color: cat?.color ?? '',
      titulo: cat?.nombre ?? 'Sin categoría',
      etiqueta: m.tipo === 'INGRESO' ? 'otro ingreso' : cat?.ambito === 'TRABAJO' ? 'trabajo' : cat?.ambito === 'PERSONAL' ? 'personal' : null,
      nota: m.nota,
      destino: `/movimiento/${m.id}`,
      creadoEn: m.creadoEn,
    })
  }
  return filas
}

/** "Hoy", "Ayer" o "27 oct". */
export function tituloDia(fecha: FechaISO, hoy: FechaISO): string {
  if (fecha === hoy) return 'Hoy'
  if (fecha === sumarDias(hoy, -1)) return 'Ayer'
  return formatFechaCorta(fecha)
}

/** Agrupa por día, el más reciente primero; dentro del día, lo último cargado arriba. */
export function agruparPorDia(filas: Fila[], hoy: FechaISO): Dia[] {
  const porDia = new Map<FechaISO, Fila[]>()
  for (const f of filas) porDia.set(f.fecha, [...(porDia.get(f.fecha) ?? []), f])
  return [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([fecha, delDia]) => ({
      fecha,
      titulo: tituloDia(fecha, hoy),
      filas: delDia.sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0)),
    }))
}

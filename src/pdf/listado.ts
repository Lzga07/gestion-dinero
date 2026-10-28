import { type FechaISO, hoy as hoyLocal, parseFecha } from '../domain/dates'
import { formatPesos, type Centavos } from '../domain/money'
import { slug } from '../domain/texto'
import { nombrePeriodo, type Periodo } from '../domain/periodos'
import type { ResumenPeriodo } from '../domain/conciliacion'
import type { Lugar, Trabajo } from '../domain/types'

export interface DatosListado {
  lugar: Lugar
  periodo: Periodo | null
  trabajos: Trabajo[]
  resumen: ResumenPeriodo | null
  /** Diferencias en plata de períodos pagados de menos (solo en el reclamo). */
  deudasPlata: { periodo: Periodo; monto: Centavos; fechaPago: FechaISO }[]
  incluirNotas: boolean
  tipo: 'PERIODO' | 'RECLAMO'
  /** Fecha de generación; por defecto, hoy. */
  hoy?: FechaISO
}

/** Todo el texto del PDF, ya listo para dibujar. */
export interface ContenidoListado {
  lugar: string
  titulo: string
  generado: string
  columnas: string[]
  filas: string[][]
  pie: [string, string][]
}

// WinAnsi (cp1252): lo único que codifican las fuentes estándar de jsPDF. Lo demás saldría como basura.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')

const MENOS = String.fromCharCode(0x2212)
const SEPARADORES = new RegExp('[ \r\n\t' + String.fromCharCode(0x2028, 0x2029) + ']+', 'g')

/** Deja el texto en caracteres que el PDF sabe dibujar: el menos U+2212 pasa a "-", los saltos a espacios y lo que no existe a "?". */
export function aWinAnsi(texto: string): string {
  const limpio = texto.normalize('NFC').split(MENOS).join('-').replace(SEPARADORES, ' ')
  let r = ''
  for (const ch of limpio) {
    const c = ch.codePointAt(0) ?? 0
    const sirve = (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)
    r += sirve ? ch : c < 0x20 ? ' ' : '?'
  }
  return r.trim()
}

const pesos = (c: Centavos) => aWinAnsi(formatPesos(c))
const diaMes = (f: FechaISO) => {
  const { m, d } = parseFecha(f)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
const fechaCompleta = (f: FechaISO) => `${diaMes(f)}/${parseFecha(f).y}`
const suma = (ts: { monto: Centavos }[]): Centavos => ts.reduce((s, x) => s + x.monto, 0)

const conDescuento = (lugar: Lugar) => lugar.formaCobro === 'PORCENTAJE'

function columnasDe(d: DatosListado): string[] {
  return [
    'Fecha',
    'Qué hizo',
    ...(d.incluirNotas ? ['Nota'] : []),
    ...(conDescuento(d.lugar) ? ['Pagó el cliente', 'Descuento'] : []),
    'Te corresponde',
  ]
}

/** Trabajos que entran en el listado: en el reclamo, solo los NO_PAGADO. */
function trabajosDe(d: DatosListado): Trabajo[] {
  return d.tipo === 'RECLAMO' ? d.trabajos.filter((tr) => tr.estado === 'NO_PAGADO') : d.trabajos
}

/** El listado de un período va sin año (es uno solo); el reclamo junta varios meses y años: DD/MM/AAAA. */
const fechaFila = (d: DatosListado, f: FechaISO) => (d.tipo === 'RECLAMO' ? fechaCompleta(f) : diaMes(f))

function filaDe(d: DatosListado, celdas: { fecha: FechaISO; que: string; nota: string; pago: string; descuento: string; monto: Centavos }) {
  return [
    fechaFila(d, celdas.fecha),
    aWinAnsi(celdas.que),
    ...(d.incluirNotas ? [aWinAnsi(celdas.nota)] : []),
    ...(conDescuento(d.lugar) ? [celdas.pago, celdas.descuento] : []),
    pesos(celdas.monto),
  ]
}

/** Filas del cuerpo (una por trabajo y, en el reclamo, una por diferencia en plata), por fecha. Pura. */
export function filasListado(d: DatosListado): string[][] {
  const items: { fecha: FechaISO; fila: string[] }[] = trabajosDe(d).map((tr) => ({
    fecha: tr.fecha,
    fila: filaDe(d, {
      fecha: tr.fecha,
      que: tr.descripcion,
      nota: tr.nota,
      pago: tr.montoCliente === null ? '' : pesos(tr.montoCliente),
      descuento: tr.descuento ? pesos(tr.descuento) : '',
      monto: tr.monto,
    }),
  }))
  if (d.tipo === 'RECLAMO') {
    for (const deuda of d.deudasPlata) {
      items.push({
        fecha: deuda.fechaPago,
        fila: filaDe(d, {
          fecha: deuda.fechaPago,
          que: `Diferencia en pago del ${fechaCompleta(deuda.fechaPago)}: ${formatPesos(deuda.monto)}`,
          nota: '', pago: '', descuento: '',
          monto: deuda.monto,
        }),
      })
    }
  }
  // sort() es estable: a igual fecha queda el orden en que vinieron.
  return items.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).map((x) => x.fila)
}

function pieDe(d: DatosListado): [string, string][] {
  if (d.tipo === 'RECLAMO') {
    return [['Total a reclamar', pesos(suma(trabajosDe(d)) + suma(d.deudasPlata))]]
  }
  const total = suma(d.trabajos)
  const pie: [string, string][] = [['Total', pesos(total)]]
  const r = d.resumen
  // Cobrado puede venir de un pago de otro período (tienePagos sigue en false) o ser negativo en casos raros.
  if (!r || (!r.tienePagos && r.cobrado === 0)) return pie
  // Valores mostrados: siempre cumplen Total - Cobrado = Falta cobrar.
  const cobrado = Math.max(0, r.cobrado)
  const falta = Math.max(0, total - cobrado)
  pie.push(['Cobrado', pesos(cobrado)])
  if (falta > 0) pie.push(['Falta cobrar', pesos(falta)])
  return pie
}

function tituloDe(d: DatosListado): string {
  if (d.tipo === 'RECLAMO' || !d.periodo) return 'Reclamo de trabajos sin pagar'
  return aWinAnsi(`Listado del período ${nombrePeriodo(d.periodo)} ${parseFecha(d.periodo.fin).y}`)
}

/** Todos los textos del PDF, ya limpios. Pura: es lo que se prueba sin dibujar nada. */
export function contenidoListado(d: DatosListado): ContenidoListado {
  return {
    lugar: aWinAnsi(d.lugar.nombre),
    titulo: tituloDe(d),
    generado: `Generado el ${fechaCompleta(d.hoy ?? hoyLocal())}`,
    columnas: columnasDe(d),
    filas: filasListado(d),
    pie: pieDe(d),
  }
}

/** `listado-<lugar>-<fin>.pdf` o `reclamo-<lugar>-<hoy>.pdf`. */
export function nombreArchivoListado(d: DatosListado): string {
  const lugar = slug(d.lugar.nombre) || 'lugar'
  if (d.tipo === 'RECLAMO' || !d.periodo) return `reclamo-${lugar}-${d.hoy ?? hoyLocal()}.pdf`
  return `listado-${lugar}-${d.periodo.fin}.pdf`
}

// Colores del PDF (es un archivo, no la pantalla: no usa los tokens de theme.css). Son los de la app.
const COLOR_TEXTO: [number, number, number] = [31, 42, 42]
const COLOR_ACENTO: [number, number, number] = [37, 104, 91]
const COLOR_RAYA: [number, number, number] = [233, 230, 223]

/** Arma el PDF en el dispositivo. jsPDF se carga recién acá: pesa y solo hace falta al compartir. */
export async function armarPdfListado(d: DatosListado): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const c = contenidoListado(d)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margen = 40

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...COLOR_TEXTO)
  doc.text(c.lugar, margen, 56)
  doc.setFont('helvetica', 'normal').setFontSize(12)
  doc.text(c.titulo, margen, 76)
  doc.setFontSize(10).setTextColor(86, 95, 93)
  doc.text(c.generado, margen, 92)

  const plata = new Set(['Pagó el cliente', 'Descuento', 'Te corresponde'])
  const columnStyles = Object.fromEntries(
    c.columnas.flatMap((nombre, i) => (plata.has(nombre) ? [[i, { halign: 'right' as const }]] : [])),
  )
  const anchoPie = c.columnas.length - 1
  autoTable(doc, {
    startY: 108,
    margin: { left: margen, right: margen },
    head: [c.columnas],
    body: c.filas,
    foot: c.pie.map(([etiqueta, valor]) => [
      { content: etiqueta, colSpan: anchoPie, styles: { halign: 'right' as const } },
      { content: valor, styles: { halign: 'right' as const } },
    ]),
    showFoot: 'lastPage',
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 5, textColor: COLOR_TEXTO, lineColor: COLOR_RAYA, lineWidth: 0 },
    headStyles: { fillColor: COLOR_ACENTO, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fontStyle: 'bold', fontSize: 11, textColor: COLOR_TEXTO },
    columnStyles,
    didDrawCell: (celda) => {
      if (celda.section !== 'body') return
      doc.setDrawColor(...COLOR_RAYA).setLineWidth(0.5)
      doc.line(celda.cell.x, celda.cell.y + celda.cell.height, celda.cell.x + celda.cell.width, celda.cell.y + celda.cell.height)
    },
  })

  return doc.output('blob')
}

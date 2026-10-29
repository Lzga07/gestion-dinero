import { describe, expect, test } from 'vitest'
import { resumenPeriodo } from '../domain/conciliacion'
import type { Lugar, Pago, Trabajo } from '../domain/types'
import {
  aWinAnsi,
  armarPdfListado,
  contenidoListado,
  filasListado,
  nombreArchivoListado,
  type DatosListado,
} from './listado'

const SEPTIEMBRE = { inicio: '2026-09-01', fin: '2026-09-30' }

const porcentaje: Lugar = {
  id: 'l1', nombre: 'Clínica Norte', formaCobro: 'PORCENTAJE', porcentajeBp: 4000,
  reglasCierre: [{ vigenteDesde: '2026-01-01', dia: 'ULTIMO' }], pagoDesdeDia: 21, pagoHastaDia: 31,
  archivado: false, creadoEn: '2026-01-01T00:00:00.000Z',
}
const fijo: Lugar = { ...porcentaje, id: 'l2', nombre: 'Consultorio Sur', formaCobro: 'ARANCEL_FIJO', porcentajeBp: null }

function trabajo(p: Partial<Trabajo>): Trabajo {
  return {
    id: 't', lugarId: 'l1', fecha: '2026-09-26', descripcion: 'Corona', tipoTrabajoId: null, precioLista: null,
    montoCliente: 20000000, descuento: 5000000, descuentoMotivo: null, porcentajeBp: 4000, monto: 6000000,
    nota: 'Juan P.', estado: 'PENDIENTE', pagoId: null, creadoEn: '2026-09-26T12:00:00.000Z',
    actualizadoEn: '2026-09-26T12:00:00.000Z', ...p,
  }
}
const corona = trabajo({ id: 'a' })
const limpieza = trabajo({
  id: 'b', fecha: '2026-09-29', descripcion: 'Limpieza', montoCliente: 10000000, descuento: null, monto: 4000000, nota: '',
})

function datos(p: Partial<DatosListado> = {}): DatosListado {
  const trabajos = p.trabajos ?? [limpieza, corona]
  const lugar = p.lugar ?? porcentaje
  return {
    lugar, periodo: SEPTIEMBRE, trabajos, resumen: resumenPeriodo(lugar, SEPTIEMBRE, trabajos, []),
    deudasPlata: [], incluirNotas: true, tipo: 'PERIODO', hoy: '2026-10-27', ...p,
  }
}

function pago(p: Partial<Pago>): Pago {
  return {
    id: 'p1', lugarId: 'l1', periodoFin: '2026-09-30', fecha: '2026-10-22', monto: 3000000, tipo: 'A_CUENTA', nota: '',
    creadoEn: '2026-10-22T12:00:00.000Z', ...p,
  }
}

describe('filasListado', () => {
  test('de período porcentaje incluye pagó, descuento y te corresponde', () => {
    expect(filasListado(datos())[0]).toEqual(['26/09', 'Corona', 'Juan P.', '$ 200.000', '$ 50.000', '$ 60.000'])
  })

  test('van ordenadas por fecha, la más vieja primero', () => {
    expect(filasListado(datos()).map((f) => f[0])).toEqual(['26/09', '29/09'])
  })

  test('el descuento va vacío cuando no hay (null o 0)', () => {
    const filas = filasListado(datos({ trabajos: [limpieza, trabajo({ id: 'c', descuento: 0, fecha: '2026-09-30' })] }))
    expect(filas[0][4]).toBe('')
    expect(filas[1][4]).toBe('')
  })

  test('un trabajo "lo que me tocó" de un lugar por porcentaje deja vacíos pagó y descuento y muestra su monto', () => {
    const tocado = trabajo({ id: 'd', montoCliente: null, descuento: null, porcentajeBp: null, monto: 7000000 })
    const d = datos({ trabajos: [tocado] })

    expect(filasListado(d)[0]).toEqual(['26/09', 'Corona', 'Juan P.', '', '', '$ 70.000'])
    expect(JSON.stringify(contenidoListado(d))).not.toMatch(/null|NaN|undefined/)
  })

  test('sin notas no incluye la columna Nota', () => {
    const d = datos({ incluirNotas: false })

    expect(filasListado(d)[0]).toEqual(['26/09', 'Corona', '$ 200.000', '$ 50.000', '$ 60.000'])
    expect(contenidoListado(d).columnas).toEqual(['Fecha', 'Qué hizo', 'Pagó el cliente', 'Descuento', 'Te corresponde'])
    expect(JSON.stringify(contenidoListado(d))).not.toContain('Juan P.')
  })

  test('con notas la columna se llama Nota', () => {
    expect(contenidoListado(datos()).columnas).toEqual([
      'Fecha', 'Qué hizo', 'Nota', 'Pagó el cliente', 'Descuento', 'Te corresponde',
    ])
  })

  test('en un lugar de arancel fijo no hay columnas de pagó el cliente ni descuento', () => {
    const t = trabajo({ lugarId: 'l2', montoCliente: null, descuento: null, monto: 4500000 })
    const d = datos({ lugar: fijo, trabajos: [t] })

    expect(filasListado(d)[0]).toEqual(['26/09', 'Corona', 'Juan P.', '$ 45.000'])
    expect(contenidoListado(d).columnas).toEqual(['Fecha', 'Qué hizo', 'Nota', 'Te corresponde'])
  })

  test('el reclamo solo lleva NO_PAGADO y las diferencias en plata, por fecha', () => {
    const sinPagar = trabajo({ id: 'n', fecha: '2026-09-29', descripcion: 'Arreglo', estado: 'NO_PAGADO', monto: 3800000, nota: '' })
    const otroMes = trabajo({ id: 'o', fecha: '2026-08-10', descripcion: 'Extracción', estado: 'NO_PAGADO', monto: 3000000 })
    const pagado = trabajo({ id: 'p', estado: 'PAGADO' })
    const pendiente = trabajo({ id: 'q', estado: 'PENDIENTE' })
    const d = datos({
      tipo: 'RECLAMO', periodo: null, resumen: null,
      trabajos: [sinPagar, pagado, pendiente, otroMes],
      deudasPlata: [{ periodo: SEPTIEMBRE, monto: 500000, fechaPago: '2026-09-25' }],
    })

    const filas = filasListado(d)

    // El reclamo junta períodos de distintos meses (y años): las fechas llevan el año.
    expect(filas.map((f) => f[0])).toEqual(['10/08/2026', '25/09/2026', '29/09/2026'])
    expect(filas.map((f) => f[1])).toEqual(['Extracción', 'Diferencia en pago del 25/09/2026: $ 5.000', 'Arreglo'])
    expect(filas[1]).toEqual(['25/09/2026', 'Diferencia en pago del 25/09/2026: $ 5.000', '', '', '', '$ 5.000'])
    expect(filas[2][5]).toBe('$ 38.000')
  })
})

describe('pie del listado', () => {
  test('sin pagos: solo el total', () => {
    expect(contenidoListado(datos()).pie).toEqual([['Total', '$ 100.000']])
  })

  test('con pagos suma lo cobrado y lo que falta', () => {
    const d = datos({ resumen: resumenPeriodo(porcentaje, SEPTIEMBRE, [limpieza, corona], [pago({})]) })

    expect(contenidoListado(d).pie).toEqual([
      ['Total', '$ 100.000'],
      ['Cobrado', '$ 30.000'],
      ['Falta cobrar', '$ 70.000'],
    ])
  })

  test('todo cobrado: no muestra falta cobrar', () => {
    const d = datos({ resumen: resumenPeriodo(porcentaje, SEPTIEMBRE, [limpieza, corona], [pago({ monto: 10000000 })]) })

    expect(contenidoListado(d).pie).toEqual([
      ['Total', '$ 100.000'],
      ['Cobrado', '$ 100.000'],
    ])
  })

  test('con pagos parciales, Total - Cobrado = Falta cobrar', () => {
    const d = datos({ resumen: resumenPeriodo(porcentaje, SEPTIEMBRE, [limpieza, corona], [pago({ monto: 4500000 })]) })

    const pie = Object.fromEntries(contenidoListado(d).pie.map(([k, v]) => [k, Number(v.replace(/\D/g, ''))]))

    expect(pie).toEqual({ Total: 100000, Cobrado: 45000, 'Falta cobrar': 55000 })
    expect(pie.Total - pie.Cobrado).toBe(pie['Falta cobrar'])
  })

  test('lo cobrado con un pago de otro período también cuenta (tienePagos en false)', () => {
    // Un pago de octubre tilda el trabajo de septiembre: septiembre no tiene pagos propios pero ya cobró 40.000.
    const pagoDeOctubre = pago({ id: 'p9', periodoFin: '2026-10-31', fecha: '2026-10-22', monto: 4000000 })
    const pagado = { ...limpieza, estado: 'PAGADO' as const, pagoId: 'p9' }
    const resumen = resumenPeriodo(porcentaje, SEPTIEMBRE, [pagado, corona], [pagoDeOctubre])
    expect(resumen.tienePagos).toBe(false)
    expect(resumen.cobrado).toBe(4000000)

    expect(contenidoListado(datos({ trabajos: [pagado, corona], resumen })).pie).toEqual([
      ['Total', '$ 100.000'],
      ['Cobrado', '$ 40.000'],
      ['Falta cobrar', '$ 60.000'],
    ])
  })

  test('un cobrado negativo se muestra como $ 0 y la falta cobrar cierra con el total', () => {
    const base = resumenPeriodo(porcentaje, SEPTIEMBRE, [limpieza, corona], [pago({})])
    const pie = contenidoListado(datos({ resumen: { ...base, cobrado: -500000, faltaCobrar: 10500000 } })).pie

    expect(pie).toEqual([
      ['Total', '$ 100.000'],
      ['Cobrado', '$ 0'],
      ['Falta cobrar', '$ 100.000'],
    ])
    expect(pie.flat().join(' ')).not.toMatch(/[-−]/)
  })

  test('el reclamo suma los trabajos sin pagar y las diferencias en plata', () => {
    const sinPagar = trabajo({ id: 'n', estado: 'NO_PAGADO', monto: 3800000 })
    const d = datos({
      tipo: 'RECLAMO', periodo: null, resumen: null, trabajos: [sinPagar, trabajo({ id: 'p', estado: 'PAGADO' })],
      deudasPlata: [{ periodo: SEPTIEMBRE, monto: 500000, fechaPago: '2026-09-25' }],
    })

    expect(contenidoListado(d).pie).toEqual([['Total a reclamar', '$ 43.000']])
  })
})

describe('encabezado y archivo', () => {
  test('el título del período lleva el rango y el año; el del reclamo no', () => {
    expect(contenidoListado(datos()).titulo).toBe('Listado del período 1 – 30 sep 2026')
    expect(contenidoListado(datos({ tipo: 'RECLAMO', periodo: null, resumen: null })).titulo).toBe(
      'Reclamo de trabajos sin pagar',
    )
    expect(contenidoListado(datos()).generado).toBe('Generado el 27/10/2026')
  })

  test('el nombre del archivo lleva el lugar en minúsculas, sin acentos y con guiones', () => {
    expect(nombreArchivoListado(datos())).toBe('listado-clinica-norte-2026-09-30.pdf')
    const lugar = { ...porcentaje, nombre: '  Ñandú & Hnos. – Sede #2 ' }
    expect(nombreArchivoListado(datos({ lugar, tipo: 'RECLAMO', periodo: null, resumen: null }))).toBe(
      'reclamo-nandu-hnos-sede-2-2026-10-27.pdf',
    )
  })

  test('si el nombre del lugar no deja ninguna letra, usa "lugar"', () => {
    expect(nombreArchivoListado(datos({ lugar: { ...porcentaje, nombre: '###' } }))).toBe('listado-lugar-2026-09-30.pdf')
  })
})

describe('caracteres del PDF', () => {
  // WinAnsi (cp1252): lo único que codifican las fuentes estándar de jsPDF.
  const WIN_ANSI = /^[\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/

  test('aWinAnsi cambia el menos U+2212, junta los espacios raros y reemplaza lo que no existe', () => {
    expect(aWinAnsi('−$ 5')).toBe('-$ 5')
    expect(aWinAnsi('uno\ndos\t tres')).toBe('uno dos tres')
    expect(aWinAnsi('Ñandú – ok · bien')).toBe('Ñandú – ok · bien')
    expect(aWinAnsi('caries 🦷 ✓')).toBe('caries ? ?')
    expect(aWinAnsi('a b')).toBe('a b')
  })

  test('todo lo que va al PDF es WinAnsi, aunque el lugar, el trabajo y la nota traigan cualquier cosa', () => {
    const raro = trabajo({
      id: 'r', descripcion: 'Corona 🦷 ✓ −5', nota: 'María\nJosé – 日本', monto: -100, estado: 'NO_PAGADO',
    })
    const lugar = { ...porcentaje, nombre: 'Clínica ✨ Ñ' }
    const d = datos({
      lugar, trabajos: [raro],
      resumen: { ...resumenPeriodo(lugar, SEPTIEMBRE, [raro], []), cobrado: -100, faltaCobrar: 0 },
    })
    const reclamo = datos({
      lugar, tipo: 'RECLAMO', periodo: null, resumen: null, trabajos: [raro],
      deudasPlata: [{ periodo: SEPTIEMBRE, monto: 500000, fechaPago: '2026-09-25' }],
    })

    for (const x of [d, reclamo]) {
      const c = contenidoListado(x)
      const textos = [c.lugar, c.titulo, c.generado, ...c.columnas, ...c.filas.flat(), ...c.pie.flat()]
      for (const t of textos) expect(t).toMatch(WIN_ANSI)
    }
    expect(filasListado(d)[0][1]).toBe('Corona ? ? -5')
  })
})

describe('armarPdfListado', () => {
  test('devuelve un PDF', async () => {
    const blob = await armarPdfListado(datos())

    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(500)
  })

  test('arma también el reclamo, con y sin notas', async () => {
    const sinPagar = trabajo({ id: 'n', estado: 'NO_PAGADO' })
    const base = datos({
      tipo: 'RECLAMO', periodo: null, resumen: null, trabajos: [sinPagar],
      deudasPlata: [{ periodo: SEPTIEMBRE, monto: 500000, fechaPago: '2026-09-25' }],
    })

    expect((await armarPdfListado(base)).type).toBe('application/pdf')
    expect((await armarPdfListado({ ...base, incluirNotas: false })).type).toBe('application/pdf')
  })
})

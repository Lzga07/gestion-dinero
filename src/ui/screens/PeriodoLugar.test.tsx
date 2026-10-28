import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../data/db'
import { marcarNoPagado, registrarPago } from '../../data/pagos'
import * as datosPagos from '../../data/pagos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import ConfigLugar from './ConfigLugar'
import PeriodoLugar from './PeriodoLugar'
import RegistrarPago from './RegistrarPago'
import { anotar, septiembre } from './periodo/test-fixtures'

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/lugares" element={<h1>Lugares</h1>} />
        <Route path="/lugares/:id" element={<PeriodoLugar />} />
        <Route path="/lugares/:id/config" element={<ConfigLugar />} />
        <Route path="/lugares/:id/pago" element={<RegistrarPago />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

beforeEach(async () => {
  // Hoy es 27 de octubre de 2026; solo se simula la fecha, no los timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  await reiniciarDb()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Octubre de la maqueta: 4 trabajos, $ 131.000 (período 1 – 31 oct). */
async function octubre(lugarId: string) {
  return {
    arreglo: await anotar(lugarId, '2026-10-27', 'Arreglo', 38000),
    limpieza: await anotar(lugarId, '2026-10-27', 'Limpieza', 25000),
    extraccion: await anotar(lugarId, '2026-10-24', 'Extracción', 30000),
    arreglo2: await anotar(lugarId, '2026-10-22', 'Arreglo', 38000),
  }
}

/** Fila del resumen ("Cobrado", "Falta cobrar"…) como elemento con etiqueta y valor. */
const fila = (etiqueta: string) =>
  within(screen.getByRole('region', { name: 'Resumen del período' })).getByText(etiqueta).parentElement as HTMLElement

describe('período del lugar', () => {
  test('PeriodoLugar muestra Te corresponde / Cobrado / Falta cobrar del período elegido', async () => {
    const lugarId = await lugarFijo()
    const o = await octubre(lugarId)
    await septiembre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 6300000, tipo: 'A_CUENTA', nota: '',
      tildados: [o.arreglo, o.limpieza], destildados: [o.extraccion, o.arreglo2],
    })
    const user = renderEn(`/lugares/${lugarId}`)

    // por defecto, el período de hoy
    expect(await screen.findByRole('heading', { name: 'Clínica Centro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 – 31 oct' })).toHaveAttribute('aria-pressed', 'true')
    expect(fila('Te corresponde')).toHaveTextContent('$ 131.000')
    expect(fila('Cobrado')).toHaveTextContent('$ 63.000')
    expect(fila('Falta cobrar')).toHaveTextContent('$ 68.000')

    // al elegir septiembre cambian los tres
    await user.click(screen.getByRole('button', { name: '1 – 30 sep' }))
    expect(screen.getByRole('button', { name: '1 – 30 sep' })).toHaveAttribute('aria-pressed', 'true')
    expect(fila('Te corresponde')).toHaveTextContent('$ 138.000')
    expect(fila('Cobrado')).toHaveTextContent('$ 0')
    expect(fila('Falta cobrar')).toHaveTextContent('$ 138.000')
  })

  test('lista los trabajos del período del más nuevo al más viejo con su estado', async () => {
    const lugarId = await lugarFijo()
    const o = await octubre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 3800000, tipo: 'A_CUENTA', nota: '',
      tildados: [o.arreglo], destildados: [],
    })
    await marcarNoPagado(o.extraccion)
    renderEn(`/lugares/${lugarId}`)

    const lista = await screen.findByRole('list', { name: 'Trabajos del período' })
    const items = within(lista).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('27 oct · Arreglo')
    expect(items[0]).toHaveTextContent('Pagado')
    expect(items[1]).toHaveTextContent('27 oct · Limpieza')
    expect(items[1]).not.toHaveTextContent('Pagado')
    expect(items[1]).not.toHaveTextContent('Sin pagar')
    expect(items[2]).toHaveTextContent('24 oct · Extracción')
    expect(items[2]).toHaveTextContent('Sin pagar')
    expect(within(items[2]).getByRole('button', { name: 'Ya me lo pagaron' })).toBeInTheDocument()
    expect(items[3]).toHaveTextContent('22 oct · Arreglo')
    expect(screen.getAllByRole('button', { name: 'Ya me lo pagaron' })).toHaveLength(1)
  })

  test('muestra la nota del trabajo debajo de "fecha · descripción" solo si tiene', async () => {
    const lugarId = await lugarFijo()
    await anotar(lugarId, '2026-10-27', 'Arreglo', 38000, 'Paciente Gómez')
    await anotar(lugarId, '2026-10-24', 'Extracción', 30000)
    renderEn(`/lugares/${lugarId}`)

    const lista = await screen.findByRole('list', { name: 'Trabajos del período' })
    const [conNota, sinNota] = within(lista).getAllByRole('listitem')
    const nota = within(conNota).getByText('Paciente Gómez')
    expect(nota).toBeInTheDocument()
    expect(nota).toHaveClass('nota-trabajo')
    expect(conNota).toHaveTextContent('27 oct · Arreglo')
    expect(sinNota.querySelector('.nota-trabajo')).toBeNull()
  })

  test('el parámetro ?periodo elige el período mostrado', async () => {
    const lugarId = await lugarFijo()
    await octubre(lugarId)
    await septiembre(lugarId)
    renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1 – 31 oct' })).toHaveAttribute('aria-pressed', 'false')
    expect(fila('Te corresponde')).toHaveTextContent('$ 138.000')
  })

  test('Historial lista los períodos desde el primer trabajo con su total y permite elegir uno', async () => {
    const lugarId = await lugarFijo()
    await octubre(lugarId)
    await septiembre(lugarId)
    await anotar(lugarId, '2026-08-20', 'Conducto', 60000)
    const user = renderEn(`/lugares/${lugarId}`)

    await user.click(await screen.findByRole('button', { name: 'Historial' }))
    const historial = screen.getByRole('list', { name: 'Historial de períodos' })
    const items = within(historial).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('1 – 31 oct')
    expect(items[0]).toHaveTextContent('$ 131.000')
    expect(items[1]).toHaveTextContent('1 – 30 sep')
    expect(items[1]).toHaveTextContent('$ 138.000')
    expect(items[2]).toHaveTextContent('1 – 31 ago')
    expect(items[2]).toHaveTextContent('$ 60.000')

    await user.click(within(items[2]).getByRole('button'))
    expect(screen.queryByRole('list', { name: 'Historial de períodos' })).not.toBeInTheDocument()
    expect(screen.getByText('Período 1 – 31 ago')).toBeInTheDocument()
    expect(fila('Te corresponde')).toHaveTextContent('$ 60.000')
    expect(screen.getByRole('button', { name: 'Historial' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('muestra "Parte de un pago se aplicó a trabajos de otros meses." cuando lo cobrado es negativo', async () => {
    const lugarId = await lugarFijo()
    const t = await septiembre(lugarId)
    const oct = await anotar(lugarId, '2026-10-05', 'Limpieza', 10000)
    // un solo pago de $ 30.000 en octubre que cubre un trabajo de octubre y la Corona de septiembre
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 3000000, tipo: 'FINAL', nota: '',
      tildados: [oct, t.corona], destildados: [],
    })
    renderEn(`/lugares/${lugarId}`)

    await screen.findByRole('heading', { name: 'Clínica Centro' })
    expect(fila('Cobrado')).toHaveTextContent('−$ 15.000')
    expect(screen.getByText('Parte de un pago se aplicó a trabajos de otros meses.')).toBeInTheDocument()
    expect(fila('Falta cobrar')).toHaveTextContent('$ 25.000')
  })

  test('sin cobrado negativo no muestra esa aclaración', async () => {
    const lugarId = await lugarFijo()
    await octubre(lugarId)
    renderEn(`/lugares/${lugarId}`)
    await screen.findByRole('heading', { name: 'Clínica Centro' })
    expect(screen.queryByText(/se aplicó a trabajos de otros meses/)).not.toBeInTheDocument()
  })

  test('muestra "A favor" en vez de "Falta cobrar" y no esconde los trabajos sin pagar', async () => {
    const lugarId = await lugarFijo()
    const a = await anotar(lugarId, '2026-10-05', 'Limpieza', 10000)
    const b = await anotar(lugarId, '2026-10-06', 'Arreglo', 20000)
    // pagaron $ 35.000 por el primero y dejaron el segundo como no pagado
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 3500000, tipo: 'FINAL', nota: '',
      tildados: [a], destildados: [b],
    })
    renderEn(`/lugares/${lugarId}`)

    await screen.findByRole('heading', { name: 'Clínica Centro' })
    expect(fila('Cobrado')).toHaveTextContent('$ 35.000')
    expect(fila('A favor')).toHaveTextContent('$ 5.000')
    expect(within(screen.getByRole('region', { name: 'Resumen del período' })).queryByText('Falta cobrar')).not.toBeInTheDocument()
    expect(fila('Sin pagar')).toHaveTextContent('1 trabajo, $ 20.000')
    expect(screen.getByRole('button', { name: 'Ya me lo pagaron' })).toBeInTheDocument()
  })

  test('borrar un pago desde PeriodoLugar devuelve sus trabajos a pendiente', async () => {
    const lugarId = await lugarFijo()
    const o = await octubre(lugarId)
    const pagoId = await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 6300000, tipo: 'A_CUENTA', nota: '',
      tildados: [o.arreglo, o.limpieza], destildados: [o.extraccion, o.arreglo2],
    })
    const user = renderEn(`/lugares/${lugarId}`)

    const pagos = await screen.findByRole('list', { name: 'Pagos de este período' })
    expect(within(pagos).getByText('25 oct · a cuenta')).toBeInTheDocument()
    expect(within(pagos).getByText('$ 63.000')).toBeInTheDocument()
    await user.click(within(pagos).getByRole('button', { name: 'Borrar pago del 25 oct' }))

    const dialogo = await screen.findByRole('dialog', { name: '¿Borrar este pago?' })
    expect(
      within(dialogo).getByText(
        'Los trabajos de este pago vuelven a pendiente. Los que marcaste como no pagados siguen así; los podés volver a pendiente desde la lista.',
      ),
    ).toBeInTheDocument()
    expect(await db.pagos.count()).toBe(1) // todavía no
    await user.click(within(dialogo).getByRole('button', { name: 'Borrar' }))

    await waitFor(async () => expect(await db.pagos.get(pagoId)).toBeUndefined())
    for (const id of [o.arreglo, o.limpieza])
      expect(await db.trabajos.get(id)).toMatchObject({ estado: 'PENDIENTE', pagoId: null })
    await waitFor(() => expect(fila('Cobrado')).toHaveTextContent('$ 0'))
    expect(screen.queryByRole('list', { name: 'Pagos de este período' })).not.toBeInTheDocument()
  })

  test('cancelar el borrado no toca el pago', async () => {
    const lugarId = await lugarFijo()
    const o = await octubre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 3800000, tipo: 'FINAL', nota: '',
      tildados: [o.arreglo], destildados: [],
    })
    const user = renderEn(`/lugares/${lugarId}`)
    await user.click(await screen.findByRole('button', { name: 'Borrar pago del 25 oct' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.pagos.count()).toBe(1)
  })

  test('"Ya me lo pagaron" en un trabajo sin pagar lo pasa a PAGADO con fecha y monto', async () => {
    const lugarId = await lugarFijo()
    const t = await septiembre(lugarId)
    await marcarNoPagado(t.corona)
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    await user.click(await screen.findByRole('button', { name: 'Ya me lo pagaron' }))
    const dialogo = await screen.findByRole('dialog')
    // por defecto: hoy y el monto del trabajo
    expect(within(dialogo).getByLabelText('Fecha del pago')).toHaveValue('2026-10-27')
    const monto = within(dialogo).getByLabelText('Monto')
    expect(monto).toHaveValue('$ 45.000')

    await user.clear(monto)
    await user.type(monto, '40.000')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const pagos = await db.pagos.toArray()
    expect(pagos).toMatchObject([
      { lugarId, periodoFin: '2026-09-30', fecha: '2026-10-27', monto: 4000000, tipo: 'FINAL' },
    ])
    expect(await db.trabajos.get(t.corona)).toMatchObject({ estado: 'PAGADO', pagoId: pagos[0].id })
    // la fila de la Corona ya no ofrece cobrarla; los $ 5.000 que faltaron quedan como diferencia en pago
    expect(await screen.findByText('Diferencia en pago: $ 5.000')).toBeInTheDocument()
    const fila45 = screen.getByText('26 sep · Corona').closest('li') as HTMLElement
    expect(within(fila45).queryByRole('button')).not.toBeInTheDocument()
    expect(within(fila45).getByText('Pagado')).toBeInTheDocument()
  })

  test('el diálogo de "Ya me lo pagaron" exige un monto y guarda una sola vez', async () => {
    const lugarId = await lugarFijo()
    const t = await septiembre(lugarId)
    await marcarNoPagado(t.corona)
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    await user.click(await screen.findByRole('button', { name: 'Ya me lo pagaron' }))
    const dialogo = await screen.findByRole('dialog')
    await user.clear(within(dialogo).getByLabelText('Monto'))
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialogo).findByText('Ingresá un monto mayor a 0')).toBeInTheDocument()
    expect(await db.pagos.count()).toBe(0)

    const original = datosPagos.yaMeLoPagaron
    const espia = vi.spyOn(datosPagos, 'yaMeLoPagaron').mockImplementation(async (...a) => {
      await new Promise((r) => setTimeout(r, 50))
      return original(...a)
    })
    await user.type(within(dialogo).getByLabelText('Monto'), '45.000')
    await user.dblClick(within(dialogo).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(espia).toHaveBeenCalledTimes(1)
    expect(await db.pagos.count()).toBe(1)
  })

  test('la diferencia en plata del pago se salda con "Ya me lo pagaron"', async () => {
    const lugarId = await lugarFijo()
    const a = await anotar(lugarId, '2026-10-05', 'Limpieza', 50000)
    const b = await anotar(lugarId, '2026-10-06', 'Arreglo', 50000)
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 9000000, tipo: 'FINAL', nota: '',
      tildados: [a, b], destildados: [],
    })
    const user = renderEn(`/lugares/${lugarId}`)

    const diferencia = (await screen.findByText('Diferencia en pago: $ 10.000')).parentElement as HTMLElement
    await user.click(within(diferencia).getByRole('button', { name: 'Ya me lo pagaron' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Monto')).toHaveValue('$ 10.000')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.queryByText(/^Diferencia en pago/)).not.toBeInTheDocument())
    const pagos = await db.pagos.toArray()
    expect(pagos).toHaveLength(2)
    expect(pagos.find((p) => p.monto === 1000000)).toMatchObject({ periodoFin: '2026-10-31', tipo: 'FINAL' })
    expect(fila('Falta cobrar')).toHaveTextContent('$ 0')
  })

  test('"Registrar pago" abre el registro del período elegido', async () => {
    const lugarId = await lugarFijo()
    await septiembre(lugarId)
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    await screen.findByRole('button', { name: 'Compartir listado' })
    await user.click(screen.getByRole('link', { name: 'Registrar pago' }))
    expect(await screen.findByRole('heading', { name: 'Pago · Clínica Centro' })).toBeInTheDocument()
    expect(screen.getByText('Período 1 – 30 sep')).toBeInTheDocument()
  })

  test('el engranaje abre la configuración y la flecha vuelve a Lugares', async () => {
    const lugarId = await lugarFijo()
    const user = renderEn(`/lugares/${lugarId}`)
    const engranaje = await screen.findByRole('link', { name: 'Configurar lugar' })
    expect(engranaje).toHaveAttribute('href', `/lugares/${lugarId}/config`)
    expect(screen.getByRole('link', { name: 'Volver a Lugares' })).toHaveAttribute('href', '/lugares')
    await user.click(engranaje)
    expect(await screen.findByRole('heading', { name: 'Configurar lugar' })).toBeInTheDocument()
  })

  test('un período sin trabajos lo dice', async () => {
    const lugarId = await lugarFijo()
    renderEn(`/lugares/${lugarId}`)
    expect(await screen.findByText('No hay trabajos en este período.')).toBeInTheDocument()
  })

  test('un lugar inexistente avisa en vez de romper', async () => {
    renderEn('/lugares/no-existe')
    expect(await screen.findByText('No encontramos este lugar.')).toBeInTheDocument()
  })
})

describe('cerrar un período y cambiar el estado de un trabajo', () => {
  test('pagos solo a cuenta: "Ya no me van a pagar más" convierte lo que falta en deuda del período', async () => {
    const lugarId = await lugarFijo()
    const t = await septiembre(lugarId) // 138.000
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-22', monto: 6000000, tipo: 'A_CUENTA', nota: '',
      tildados: [t.arreglo, t.corona, t.limpieza, t.extraccion], destildados: [],
    })
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    expect(await screen.findByText('Pagos a cuenta: falta cobrar $ 78.000')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ya no me van a pagar más' }))
    const dialogo = await screen.findByRole('dialog', { name: '¿Ya no te van a pagar más 1 – 30 sep?' })
    expect(
      within(dialogo).getByText('Lo que falta cobrar ($ 78.000) pasa a ser una deuda de este lugar, para reclamarla.'),
    ).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Ya no me van a pagar más' }))

    expect(await screen.findByText('Diferencia en pago: $ 78.000')).toBeInTheDocument()
    expect(screen.queryByText(/^Pagos a cuenta: falta cobrar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ya no me van a pagar más' })).not.toBeInTheDocument()
    const pagos = await db.pagos.toArray()
    expect(pagos.find((p) => p.tipo === 'FINAL')).toMatchObject({ monto: 0, periodoFin: '2026-09-30', fecha: '2026-10-27' })
    expect(within(screen.getByRole('list', { name: 'Pagos de este período' })).getByText('27 oct · sin más pagos')).toBeInTheDocument()
  })

  test('"Ya no me van a pagar más" también pasa los pendientes a no pagados, y cancelar no cambia nada', async () => {
    const lugarId = await lugarFijo()
    const t = await septiembre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-22', monto: 3000000, tipo: 'A_CUENTA', nota: '',
      tildados: [t.arreglo], destildados: [t.corona, t.limpieza, t.extraccion],
    })
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    await user.click(await screen.findByRole('button', { name: 'Ya no me van a pagar más' }))
    const dialogo = await screen.findByRole('dialog')
    expect(
      within(dialogo).getByText(
        'Lo que falta cobrar ($ 8.000) pasa a ser una deuda de este lugar, para reclamarla. Los 3 trabajos pendientes quedan como no pagados.',
      ),
    ).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(await db.pagos.count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Ya no me van a pagar más' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ya no me van a pagar más' }))
    await waitFor(async () => expect((await db.trabajos.get(t.corona))!.estado).toBe('NO_PAGADO'))
    expect(await screen.findByText('Diferencia en pago: $ 8.000')).toBeInTheDocument()
  })

  test('sin pagos a cuenta no ofrece cerrar el período', async () => {
    const lugarId = await lugarFijo()
    await septiembre(lugarId)
    renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)
    await screen.findByRole('list', { name: 'Trabajos del período' })
    expect(screen.queryByRole('button', { name: 'Ya no me van a pagar más' })).not.toBeInTheDocument()
  })

  test('un PENDIENTE se marca como no pagado y vuelve a pendiente; un PAGADO no ofrece nada', async () => {
    const lugarId = await lugarFijo()
    const o = await octubre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 3800000, tipo: 'A_CUENTA', nota: '',
      tildados: [o.arreglo], destildados: [],
    })
    const user = renderEn(`/lugares/${lugarId}`)

    const lista = await screen.findByRole('list', { name: 'Trabajos del período' })
    const filaDe = (texto: string) => within(lista).getByText(texto).closest('li') as HTMLElement
    const pagado = within(lista).getAllByText('27 oct · Arreglo')[0].closest('li') as HTMLElement
    expect(within(pagado).queryByRole('button')).not.toBeInTheDocument()

    await user.click(within(filaDe('24 oct · Extracción')).getByRole('button', { name: 'Marcar como no pagado' }))
    await waitFor(async () => expect((await db.trabajos.get(o.extraccion))!.estado).toBe('NO_PAGADO'))
    expect(await within(filaDe('24 oct · Extracción')).findByRole('button', { name: 'Volver a pendiente' })).toBeInTheDocument()
    expect(within(filaDe('24 oct · Extracción')).getByRole('button', { name: 'Ya me lo pagaron' })).toBeInTheDocument()
    expect(within(filaDe('24 oct · Extracción')).queryByRole('button', { name: 'Marcar como no pagado' })).not.toBeInTheDocument()

    await user.click(within(filaDe('24 oct · Extracción')).getByRole('button', { name: 'Volver a pendiente' }))
    await waitFor(async () => expect((await db.trabajos.get(o.extraccion))!.estado).toBe('PENDIENTE'))
    expect(await within(filaDe('24 oct · Extracción')).findByRole('button', { name: 'Marcar como no pagado' })).toBeInTheDocument()
  })

  test('después de borrar un pago FINAL por error, los no pagados se pueden volver a pendiente', async () => {
    const lugarId = await lugarFijo()
    const o = await octubre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 3800000, tipo: 'FINAL', nota: '',
      tildados: [o.arreglo], destildados: [o.limpieza, o.extraccion, o.arreglo2],
    })
    const user = renderEn(`/lugares/${lugarId}`)
    await user.click(await screen.findByRole('button', { name: 'Borrar pago del 25 oct' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Borrar' }))
    await waitFor(async () => expect(await db.pagos.count()).toBe(0))

    expect(await screen.findAllByRole('button', { name: 'Volver a pendiente' })).toHaveLength(3)
  })
})

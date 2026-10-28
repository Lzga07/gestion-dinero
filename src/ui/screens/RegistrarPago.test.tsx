import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../data/db'
import * as datosPagos from '../../data/pagos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import PeriodoLugar from './PeriodoLugar'
import RegistrarPago from './RegistrarPago'
import { anotar, septiembre } from './periodo/test-fixtures'

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/lugares/:id" element={<PeriodoLugar />} />
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

async function abrirPagoDeSeptiembre() {
  const lugarId = await lugarFijo()
  const t = await septiembre(lugarId)
  const user = renderEn(`/lugares/${lugarId}/pago?periodo=2026-09-30`)
  await screen.findByRole('heading', { name: 'Pago · Clínica Centro' })
  return { lugarId, t, user }
}

const guardarPago = () => screen.getByRole('button', { name: 'Guardar pago' })

describe('registrar pago', () => {
  test('todo tildado y monto exacto guarda FINAL sin preguntar', async () => {
    const { lugarId, t, user } = await abrirPagoDeSeptiembre()
    expect(screen.getByText('Período 1 – 30 sep')).toBeInTheDocument()
    for (const nombre of [/Arreglo/, /Corona/, /Limpieza/, /Extracción/])
      expect(screen.getByRole('checkbox', { name: nombre })).toBeChecked()

    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '138.000')
    await user.click(guardarPago())

    // vuelve al período pagado (septiembre, no el actual)
    expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const pagos = await db.pagos.toArray()
    expect(pagos).toMatchObject([
      { lugarId, periodoFin: '2026-09-30', fecha: '2026-10-27', monto: 13800000, tipo: 'FINAL' },
    ])
    for (const id of Object.values(t))
      expect(await db.trabajos.get(id)).toMatchObject({ estado: 'PAGADO', pagoId: pagos[0].id })
  })

  test('destildar uno muestra "Falta: 1 trabajo, $ 45.000" y pregunta', async () => {
    const { t, user } = await abrirPagoDeSeptiembre()
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '93.000')
    await user.click(screen.getByRole('checkbox', { name: /Corona/ }))

    // lo esperado es todo el período, tildado o no; la Corona destildada aparece en "Falta"
    expect(screen.getByText('Esperabas $ 138.000 · te pagaron $ 93.000')).toBeInTheDocument()
    expect(screen.queryByText(/de más|menos de lo esperado/)).not.toBeInTheDocument()
    expect(screen.getByText('Falta: 1 trabajo, $ 45.000')).toBeInTheDocument()

    await user.click(guardarPago())
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: 'Es un pago a cuenta, falta el resto' })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Es todo lo que me van a pagar' })).toBeInTheDocument()
    expect(await db.pagos.count()).toBe(0)
    expect(await db.trabajos.get(t.corona)).toMatchObject({ estado: 'PENDIENTE' })
  })

  test('"Es todo lo que me van a pagar" deja el destildado NO_PAGADO', async () => {
    const { t, user } = await abrirPagoDeSeptiembre()
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '93.000')
    await user.click(screen.getByRole('checkbox', { name: /Corona/ }))
    await user.click(guardarPago())
    await user.click(await screen.findByRole('button', { name: 'Es todo lo que me van a pagar' }))

    expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toHaveAttribute('aria-pressed', 'true')
    expect((await db.pagos.toArray())[0]).toMatchObject({ tipo: 'FINAL', monto: 9300000 })
    expect(await db.trabajos.get(t.corona)).toMatchObject({ estado: 'NO_PAGADO', pagoId: null })
    expect(await db.trabajos.get(t.arreglo)).toMatchObject({ estado: 'PAGADO' })
  })

  test('"Es un pago a cuenta" deja el destildado PENDIENTE', async () => {
    const { t, user } = await abrirPagoDeSeptiembre()
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '93.000')
    await user.click(screen.getByRole('checkbox', { name: /Corona/ }))
    await user.click(guardarPago())
    await user.click(await screen.findByRole('button', { name: 'Es un pago a cuenta, falta el resto' }))

    expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toHaveAttribute('aria-pressed', 'true')
    expect((await db.pagos.toArray())[0]).toMatchObject({ tipo: 'A_CUENTA', monto: 9300000 })
    expect(await db.trabajos.get(t.corona)).toMatchObject({ estado: 'PENDIENTE', pagoId: null })
  })

  describe('saldo en plata de un pago a cuenta', () => {
    async function septiembreConACuenta() {
      const lugarId = await lugarFijo()
      const t = await septiembre(lugarId)
      await datosPagos.registrarPago({
        lugarId, periodoFin: '2026-09-30', fecha: '2026-10-20', monto: 13000000, tipo: 'A_CUENTA', nota: '',
        tildados: Object.values(t), destildados: [],
      })
      const user = renderEn(`/lugares/${lugarId}/pago?periodo=2026-09-30`)
      await screen.findByRole('heading', { name: 'Pago · Clínica Centro' })
      return user
    }

    test('lo que falta en plata se ofrece como esperado y saldarlo guarda FINAL sin preguntar', async () => {
      const user = await septiembreConACuenta()
      expect(screen.getByText('Esperabas $ 8.000')).toBeInTheDocument()
      expect(screen.getByText('Saldo pendiente del período: $ 8.000')).toBeInTheDocument()

      await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '8.000')
      expect(screen.queryByText(/de más/)).not.toBeInTheDocument()
      await user.click(guardarPago())

      expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      const pagos = await db.pagos.toArray()
      expect(pagos).toHaveLength(2)
      expect(pagos.find((p) => p.tipo === 'FINAL')).toMatchObject({ monto: 800000, periodoFin: '2026-09-30' })
      const resumen = screen.getByRole('region', { name: 'Resumen del período' })
      expect(within(resumen).getByText('Falta cobrar').parentElement).toHaveTextContent('$ 0')
      expect(screen.queryByText(/^Diferencia en pago/)).not.toBeInTheDocument()
    })

    test('recibir menos que el saldo pregunta si es a cuenta o final', async () => {
      const user = await septiembreConACuenta()
      await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '5.000')
      expect(screen.getByText('Te pagaron $ 3.000 menos de lo esperado')).toBeInTheDocument()
      await user.click(guardarPago())
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(await db.pagos.count()).toBe(1)
    })
  })

  test('recibir menos de lo esperado también pregunta, aunque estén todos tildados', async () => {
    const { user } = await abrirPagoDeSeptiembre()
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '130.000')
    expect(screen.getByText('Te pagaron $ 8.000 menos de lo esperado')).toBeInTheDocument()
    await user.click(guardarPago())
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await db.pagos.count()).toBe(0)
  })

  test('trabajo atrasado de agosto aparece destildado en "De períodos anteriores"', async () => {
    const lugarId = await lugarFijo()
    const t = await septiembre(lugarId)
    const agosto = await anotar(lugarId, '2026-08-20', 'Conducto', 60000)
    const user = renderEn(`/lugares/${lugarId}/pago?periodo=2026-09-30`)

    const anteriores = await screen.findByRole('group', { name: 'De períodos anteriores' })
    expect(within(anteriores).getByText('1 – 31 ago')).toBeInTheDocument()
    const atrasado = within(anteriores).getByRole('checkbox', { name: /Conducto/ })
    expect(atrasado).not.toBeChecked()
    // el esperado no lo cuenta hasta que se tilda
    expect(screen.getByText(/^Esperabas \$ 138\.000/)).toBeInTheDocument()

    await user.click(atrasado)
    expect(screen.getByText(/^Esperabas \$ 198\.000/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '198.000')
    await user.click(guardarPago())

    expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toHaveAttribute('aria-pressed', 'true')
    const pagos = await db.pagos.toArray()
    expect(pagos).toMatchObject([{ periodoFin: '2026-09-30', monto: 19800000, tipo: 'FINAL' }])
    expect(await db.trabajos.get(agosto)).toMatchObject({ estado: 'PAGADO', pagoId: pagos[0].id })
    expect(await db.trabajos.get(t.arreglo)).toMatchObject({ estado: 'PAGADO', pagoId: pagos[0].id })
  })

  test('dejar sin tildar uno de agosto no pregunta ni lo marca NO_PAGADO', async () => {
    const lugarId = await lugarFijo()
    await septiembre(lugarId)
    const agosto = await anotar(lugarId, '2026-08-20', 'Conducto', 60000)
    const user = renderEn(`/lugares/${lugarId}/pago?periodo=2026-09-30`)
    await user.type(await screen.findByLabelText('¿Cuánto te pagaron?'), '138.000')
    expect(screen.queryByText(/^Falta:/)).not.toBeInTheDocument()
    await user.click(guardarPago())
    expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.trabajos.get(agosto)).toMatchObject({ estado: 'PENDIENTE', pagoId: null })
  })

  test('sin monto no guarda y muestra el error', async () => {
    const { user } = await abrirPagoDeSeptiembre()
    await user.click(guardarPago())
    expect(await screen.findByText('Ingresá un monto mayor a 0')).toBeInTheDocument()
    expect(await db.pagos.count()).toBe(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('un monto con texto inválido bloquea el guardado', async () => {
    const { user } = await abrirPagoDeSeptiembre()
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '12abc')
    await user.click(guardarPago())
    expect(await screen.findByText('Monto inválido. Usá coma para los decimales (ej: 1.234,50)')).toBeInTheDocument()
    expect(await db.pagos.count()).toBe(0)
  })

  test('tocar dos veces "Guardar pago" registra un solo pago', async () => {
    const { user } = await abrirPagoDeSeptiembre()
    const original = datosPagos.registrarPago
    const espia = vi.spyOn(datosPagos, 'registrarPago').mockImplementation(async (p) => {
      await new Promise((r) => setTimeout(r, 50))
      return original(p)
    })
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '138.000')
    await user.dblClick(guardarPago())

    expect(await screen.findByRole('button', { name: '1 – 30 sep' })).toBeInTheDocument()
    expect(espia).toHaveBeenCalledTimes(1)
    expect(await db.pagos.count()).toBe(1)
  })

  test('si falla el guardado muestra el error y deja reintentar', async () => {
    const { user } = await abrirPagoDeSeptiembre()
    vi.spyOn(datosPagos, 'registrarPago').mockRejectedValueOnce(new Error('boom'))
    await user.type(screen.getByLabelText('¿Cuánto te pagaron?'), '138.000')
    await user.click(guardarPago())
    expect(await screen.findByText('No se pudo guardar el pago. Probá de nuevo.')).toBeInTheDocument()
    await waitFor(() => expect(guardarPago()).toBeEnabled())
  })

  test('un lugar inexistente avisa en vez de romper', async () => {
    renderEn('/lugares/no-existe/pago?periodo=2026-09-30')
    expect(await screen.findByText('No encontramos este lugar.')).toBeInTheDocument()
  })
})

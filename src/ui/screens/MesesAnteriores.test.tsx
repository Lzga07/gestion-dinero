import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { archivarLugar } from '../../data/lugares'
import { marcarNoPagado, registrarPago } from '../../data/pagos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import MesesAnteriores from './MesesAnteriores'
import { anotar, septiembre } from './periodo/test-fixtures'

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

/** Muestra a dónde navegó la app (ruta + query), para verificar los enlaces. */
function Ubicacion() {
  const { pathname, search } = useLocation()
  return <p data-testid="ubicacion">{pathname + search}</p>
}

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/lugares/:id/anteriores" element={<MesesAnteriores />} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

const mes = () => screen.getByRole('group', { name: 'Mes' })

describe('MesesAnteriores', () => {
  test('título, nombre del lugar y arranca en el período anterior al actual', async () => {
    const id = await lugarFijo('ULTIMO', 'Clínica Centro')
    renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('Clínica Centro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cargar meses anteriores' })).toBeInTheDocument()
    expect(within(mes()).getByText('1 – 30 sep 2026')).toBeInTheDocument()
    expect(within(mes()).getByText('Sin trabajos')).toBeInTheDocument()
  })

  test('‹ y › cambian de período; › está deshabilitado en el anterior al actual', async () => {
    const id = await lugarFijo()
    await anotar(id, '2026-08-12', 'Limpieza', 20000)
    await anotar(id, '2026-08-14', 'Arreglo', 30000)
    const user = renderEn(`/lugares/${id}/anteriores`)

    await screen.findByText('1 – 30 sep 2026')
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(within(mes()).getByText('1 – 31 ago 2026')).toBeInTheDocument()
    expect(within(mes()).getByText('2 trabajos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(within(mes()).getByText('1 – 30 sep 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  test('‹ se deshabilita a 5 años de hoy', async () => {
    const id = await lugarFijo()
    const user = renderEn(`/lugares/${id}/anteriores`)
    await screen.findByText('1 – 30 sep 2026')

    // Hoy es 27/10/2026: el límite es 27/10/2021, así que el último período ofrecido es 1 – 31 oct 2021.
    const anterior = screen.getByRole('button', { name: 'Mes anterior' })
    for (let i = 0; i < 59; i++) await user.click(anterior)
    expect(within(mes()).getByText('1 – 31 oct 2021')).toBeInTheDocument()
    expect(anterior).toBeDisabled()
  })

  test('un lugar que cierra el 15 muestra "16 sep – 15 oct 2026" y cruza de año hacia atrás', async () => {
    vi.setSystemTime(new Date(2026, 9, 31, 12))
    const id = await lugarFijo(15)
    const user = renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('16 sep – 15 oct 2026')).toBeInTheDocument()
    const anterior = screen.getByRole('button', { name: 'Mes anterior' })
    for (let i = 0; i < 9; i++) await user.click(anterior)
    expect(within(mes()).getByText('16 dic – 15 ene 2026')).toBeInTheDocument()
  })

  test('?periodo=<fecha> abre ese período si ya terminó; si no, el anterior al actual', async () => {
    const id = await lugarFijo()
    renderEn(`/lugares/${id}/anteriores?periodo=2026-07-31`)
    expect(await screen.findByText('1 – 31 jul 2026')).toBeInTheDocument()
  })

  test.each(['2026-10-31', '2030-01-01', '2015-01-31', 'cualquier cosa'])('?periodo=%s no es válido y abre el anterior al actual', async (pedido) => {
    const id = await lugarFijo()
    renderEn(`/lugares/${id}/anteriores?periodo=${encodeURIComponent(pedido)}`)
    expect(await screen.findByText('1 – 30 sep 2026')).toBeInTheDocument()
  })

  test('lista los trabajos del período por fecha, con el total, y tocar uno abre su pantalla', async () => {
    const id = await lugarFijo()
    // Anotados fuera de orden; el 22 se anota dos veces para ver el desempate por orden de carga.
    const corona = await anotar(id, '2026-09-26', 'Corona', 45000)
    await anotar(id, '2026-09-22', 'Extracción', 30000)
    await anotar(id, '2026-09-22', 'Otra extracción', 0)
    await anotar(id, '2026-08-30', 'De agosto', 99999)
    const user = renderEn(`/lugares/${id}/anteriores`)

    const lista = await screen.findByRole('list', { name: 'Trabajos del mes' })
    const filas = within(lista).getAllByRole('listitem').map((li) => li.textContent)
    expect(filas).toEqual(['22 sep · Extracción$ 30.000', '22 sep · Otra extracción$ 0', '26 sep · Corona$ 45.000'])
    expect(screen.getByText('3 trabajos · $ 75.000')).toBeInTheDocument()
    expect(screen.queryByText(/De agosto/)).not.toBeInTheDocument()
    expect(screen.queryByText('Este mes ya está cerrado.')).not.toBeInTheDocument()

    await user.click(within(lista).getByRole('link', { name: /Corona/ }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(`/trabajo/${corona}`)
  })

  test('un mes con un pago está cerrado: avisa y lleva a ver el período', async () => {
    const id = await lugarFijo()
    const t = await septiembre(id)
    await registrarPago({
      lugarId: id, periodoFin: '2026-09-30', fecha: '2026-10-25', monto: 13800000, tipo: 'FINAL', nota: '',
      tildados: [t.arreglo, t.corona, t.limpieza, t.extraccion], destildados: [],
    })
    const user = renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('Este mes ya está cerrado.')).toBeInTheDocument()
    expect(screen.getByText('4 trabajos · $ 138.000')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ver el período' }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(`/lugares/${id}?periodo=2026-09-30`)
  })

  test('un mes con un trabajo no pagado también está cerrado', async () => {
    const id = await lugarFijo()
    await marcarNoPagado(await anotar(id, '2026-09-10', 'Conducto', 60000))
    renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('Este mes ya está cerrado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el período' })).toHaveAttribute('href', `/lugares/${id}?periodo=2026-09-30`)
  })

  test('lugar inexistente o archivado', async () => {
    const id = await lugarFijo()
    const { unmount } = render(
      <MemoryRouter initialEntries={['/lugares/no-existe/anteriores']}>
        <Routes>
          <Route path="/lugares/:id/anteriores" element={<MesesAnteriores />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('No encontramos este lugar.')).toBeInTheDocument()
    unmount()

    await archivarLugar(id, true)
    renderEn(`/lugares/${id}/anteriores`)
    expect(await screen.findByText('Este lugar está archivado.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Mes' })).not.toBeInTheDocument()
  })
})

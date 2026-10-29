import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../data/db'
import { marcarNoPagado, registrarPago } from '../../data/pagos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import MeDeben from './MeDeben'
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

function renderMeDeben() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <MeDeben />
    </MemoryRouter>,
  )
  return user
}

/**
 * Clínica Centro: un trabajo de junio sin pagar (deuda vieja), la corona de septiembre sin pagar y 13.000 de
 * diferencia en plata de septiembre. Consultorio Sur: un trabajo de agosto sin pagar (reciente).
 */
async function dosLugaresConDeuda() {
  const centro = await lugarFijo('ULTIMO', 'Clínica Centro')
  const sur = await lugarFijo('ULTIMO', 'Consultorio Sur')
  const junio = await anotar(centro, '2026-06-10', 'Conducto', 60000)
  await marcarNoPagado(junio)
  const t = await septiembre(centro)
  await registrarPago({
    lugarId: centro, periodoFin: '2026-09-30', fecha: '2026-10-25', monto: 8000000, tipo: 'FINAL', nota: '',
    tildados: [t.arreglo, t.limpieza, t.extraccion], destildados: [t.corona],
  })
  const agosto = await anotar(sur, '2026-08-12', 'Limpieza', 20000)
  await marcarNoPagado(agosto)
  return { centro, sur, junio, corona: t.corona, agosto }
}

const bloque = (nombre: string) => screen.getByRole('region', { name: nombre })

describe('MeDeben', () => {
  test('sin deudas dice que no te deben nada', async () => {
    await lugarFijo()
    renderMeDeben()

    expect(await screen.findByText('No te deben nada')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Me deben' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ya me lo pagaron' })).not.toBeInTheDocument()
  })

  test('un bloque por lugar con cada período, sus trabajos y la diferencia en plata', async () => {
    await dosLugaresConDeuda()
    renderMeDeben()

    const centro = await screen.findByRole('region', { name: 'Clínica Centro' })
    expect(within(centro).getByText('Te deben $ 118.000')).toBeInTheDocument()
    // del más viejo al más nuevo: junio (vieja) y septiembre (reciente)
    const periodos = within(centro).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(periodos).toEqual(['1 – 30 jun 2026', '1 – 30 sep 2026'])
    expect(within(centro).getByText('10 jun · Conducto')).toBeInTheDocument()
    expect(within(centro).getByText('$ 60.000')).toBeInTheDocument()
    expect(within(centro).getByText('26 sep · Corona')).toBeInTheDocument()
    expect(within(centro).getByText('$ 45.000')).toBeInTheDocument()
    expect(within(centro).getByText('Diferencia en pago: $ 13.000')).toBeInTheDocument()

    const sur = bloque('Consultorio Sur')
    expect(within(sur).getByText('Te deben $ 20.000')).toBeInTheDocument()
    expect(within(sur).getByRole('heading', { level: 3 })).toHaveTextContent('1 – 31 ago 2026')
    expect(within(sur).getByText('12 ago · Limpieza')).toBeInTheDocument()
    expect(within(sur).queryByText(/Diferencia en pago/)).not.toBeInTheDocument()
  })

  test('"Ya me lo pagaron" abre el diálogo con todas las deudas del lugar y, al guardar, la deuda desaparece', async () => {
    const { junio, corona, agosto } = await dosLugaresConDeuda()
    const user = renderMeDeben()

    await user.click(within(await screen.findByRole('region', { name: 'Clínica Centro' })).getByRole('button', { name: 'Ya me lo pagaron' }))
    const dialogo = screen.getByRole('dialog', { name: 'Ya me lo pagaron' })
    expect(within(dialogo).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(dialogo).getByLabelText(/10 jun · Conducto/)).toBeInTheDocument()
    expect(within(dialogo).getByLabelText(/26 sep · Corona/)).toBeInTheDocument()
    expect(within(dialogo).getByLabelText(/Diferencia en pago de 1 – 30 sep/)).toBeInTheDocument()

    for (const caja of within(dialogo).getAllByRole('checkbox')) await user.click(caja)
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'Clínica Centro' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.trabajos.get(junio)).toMatchObject({ estado: 'PAGADO' })
    expect(await db.trabajos.get(corona)).toMatchObject({ estado: 'PAGADO' })
    // la deuda del otro lugar sigue
    expect(await db.trabajos.get(agosto)).toMatchObject({ estado: 'NO_PAGADO' })
    expect(bloque('Consultorio Sur')).toBeInTheDocument()
  })

  test('"Compartir reclamo" abre el diálogo de compartir de ese lugar', async () => {
    await dosLugaresConDeuda()
    const user = renderMeDeben()

    await user.click(within(await screen.findByRole('region', { name: 'Consultorio Sur' })).getByRole('button', { name: 'Compartir reclamo' }))

    const dialogo = screen.getByRole('dialog', { name: 'Compartir reclamo' })
    expect(within(dialogo).getByText('Se arma un PDF con lo que te deben en Consultorio Sur.')).toBeInTheDocument()
    await within(dialogo).findByRole('button', { name: 'Compartir' })
  })
})

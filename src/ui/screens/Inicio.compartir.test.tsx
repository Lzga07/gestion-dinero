import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { guardarAjuste } from '../../data/ajustes'
import { registrarPago } from '../../data/pagos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { armarPdfListado } from '../../pdf/listado'
import Inicio from './Inicio'
import { septiembre } from './periodo/test-fixtures'

vi.mock('../../pdf/listado', async (original) => ({
  ...(await original<typeof import('../../pdf/listado')>()),
  armarPdfListado: vi.fn(),
}))
vi.mock('../../platform/compartir', () => ({ compartirArchivo: vi.fn() }))

const armar = vi.mocked(armarPdfListado)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  armar.mockReset()
  armar.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
  await reiniciarDb()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('compartir reclamo', () => {
  test('"Compartir reclamo" abre el diálogo y arma el reclamo con lo no pagado y la diferencia en plata', async () => {
    const lugarId = await lugarFijo() // paga entre el 21 y el 31: septiembre todavía no venció
    await guardarAjuste('ultimaCopia', new Date().toISOString())
    const t = await septiembre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-25', monto: 8000000, tipo: 'FINAL', nota: '',
      tildados: [t.arreglo, t.limpieza, t.extraccion], destildados: [t.corona],
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Compartir reclamo' }))

    expect(screen.getByRole('dialog', { name: 'Compartir reclamo' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Incluir notas' })).toBeChecked()
    expect(armar).toHaveBeenCalledTimes(1)
    const datos = armar.mock.calls[0][0]
    expect(datos).toMatchObject({ tipo: 'RECLAMO', periodo: null, resumen: null, incluirNotas: true, hoy: '2026-10-27' })
    expect(datos.trabajos.map((tr) => tr.descripcion)).toEqual(['Corona'])
    expect(datos.deudasPlata).toEqual([
      { periodo: { inicio: '2026-09-01', fin: '2026-09-30' }, monto: 1300000, fechaPago: '2026-10-25' },
    ])
  })
})

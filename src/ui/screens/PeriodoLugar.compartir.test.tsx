import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { armarPdfListado } from '../../pdf/listado'
import PeriodoLugar from './PeriodoLugar'
import { septiembre } from './periodo/test-fixtures'

vi.mock('../../pdf/listado', async (original) => ({
  ...(await original<typeof import('../../pdf/listado')>()),
  armarPdfListado: vi.fn(),
}))
vi.mock('../../platform/compartir', () => ({ compartirArchivo: vi.fn() }))

const armar = vi.mocked(armarPdfListado)

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/lugares/:id" element={<PeriodoLugar />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

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

describe('compartir listado', () => {
  test('"Compartir listado" abre el diálogo con "Incluir notas" tildado y arma el PDF del período', async () => {
    const lugarId = await lugarFijo()
    await septiembre(lugarId)
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    await user.click(await screen.findByRole('button', { name: 'Compartir listado' }))

    const dialogo = screen.getByRole('dialog', { name: 'Compartir listado' })
    expect(within(dialogo).getByRole('checkbox', { name: 'Incluir notas' })).toBeChecked()
    expect(armar).toHaveBeenCalledTimes(1)
    const datos = armar.mock.calls[0][0]
    expect(datos).toMatchObject({
      tipo: 'PERIODO', incluirNotas: true, periodo: { fin: '2026-09-30' }, hoy: '2026-10-27', deudasPlata: [],
    })
    expect(datos.trabajos).toHaveLength(4)
    expect(datos.resumen?.teCorresponde).toBe(13800000)
    expect(await within(dialogo).findByRole('button', { name: 'Compartir' })).toBeEnabled()
  })

  test('destildar "Incluir notas" arma el PDF de nuevo sin notas', async () => {
    const lugarId = await lugarFijo()
    await septiembre(lugarId)
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)
    await user.click(await screen.findByRole('button', { name: 'Compartir listado' }))

    await user.click(screen.getByRole('checkbox', { name: 'Incluir notas' }))

    expect(armar).toHaveBeenCalledTimes(2)
    expect(armar.mock.calls[1][0].incluirNotas).toBe(false)
  })

  test('Cancelar cierra el diálogo y devuelve el foco al botón', async () => {
    const lugarId = await lugarFijo()
    await septiembre(lugarId)
    const user = renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)
    const boton = await screen.findByRole('button', { name: 'Compartir listado' })
    await user.click(boton)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
  })

  test('un período sin trabajos no se puede compartir', async () => {
    const lugarId = await lugarFijo()
    renderEn(`/lugares/${lugarId}?periodo=2026-09-30`)

    expect(await screen.findByRole('button', { name: 'Compartir listado' })).toBeDisabled()
  })
})

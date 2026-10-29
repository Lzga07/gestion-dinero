import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../data/db'
import { guardarCategoria } from '../../data/categorias'
import * as datosMovimientos from '../../data/movimientos'
import { guardarMovimiento } from '../../data/movimientos'
import { reiniciarDb } from '../../data/test-helpers'
import FormMovimiento from './FormMovimiento'
import { fechaElegida } from '../test-fecha'

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/origen', ruta]} initialIndex={1}>
      <Routes>
        <Route path="/origen" element={<h1>Origen</h1>} />
        <Route path="/mas/categorias" element={<h1>Categorías</h1>} />
        <Route path="/movimiento/nuevo" element={<FormMovimiento />} />
        <Route path="/movimiento/:id" element={<FormMovimiento />} />
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

async function categorias() {
  return {
    materiales: await guardarCategoria({ nombre: 'Materiales', tipo: 'GASTO', ambito: 'TRABAJO', icono: '🧰', color: '', orden: 0 }),
    supermercado: await guardarCategoria({ nombre: 'Supermercado', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🛒', color: '', orden: 1 }),
    venta: await guardarCategoria({ nombre: 'Venta usado', tipo: 'INGRESO', ambito: null, icono: '💵', color: '', orden: 2 }),
  }
}

describe('nuevo gasto', () => {
  test('crear gasto con categoría Supermercado', async () => {
    const { supermercado } = await categorias()
    const user = renderEn('/movimiento/nuevo?tipo=GASTO')
    expect(await screen.findByRole('heading', { name: 'Nuevo gasto' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Monto'), '41.500')
    await user.click(screen.getByRole('radio', { name: 'Supermercado' }))
    await user.type(screen.getByLabelText('Nota (opcional)'), 'compra del mes')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.movimientos.toArray()).toMatchObject([
      { tipo: 'GASTO', fecha: '2026-10-27', monto: 4150000, categoriaId: supermercado, nota: 'compra del mes' },
    ])
  })

  test('las categorías de gasto se agrupan en "De trabajo" y "Personales"; no aparecen las de ingreso', async () => {
    await categorias()
    renderEn('/movimiento/nuevo?tipo=GASTO')
    const trabajo = await screen.findByRole('group', { name: 'De trabajo' })
    const personales = screen.getByRole('group', { name: 'Personales' })
    expect(within(trabajo).getByRole('radio', { name: 'Materiales' })).toBeInTheDocument()
    expect(within(personales).getByRole('radio', { name: 'Supermercado' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Venta usado' })).not.toBeInTheDocument()
  })
})

describe('nuevo ingreso', () => {
  test('muestra solo las categorías de ingreso en una lista plana y guarda el ingreso', async () => {
    const { venta } = await categorias()
    const user = renderEn('/movimiento/nuevo?tipo=INGRESO')
    expect(await screen.findByRole('heading', { name: 'Nuevo ingreso' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Materiales' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'De trabajo' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Monto'), '60000')
    await user.click(screen.getByRole('radio', { name: 'Venta usado' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.movimientos.toArray()).toMatchObject([{ tipo: 'INGRESO', monto: 6000000, categoriaId: venta }])
  })

  test('sin categorías de ingreso lleva a crear una', async () => {
    renderEn('/movimiento/nuevo?tipo=INGRESO')
    expect(await screen.findByText('Todavía no tenés categorías de ingreso')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear categoría' })).toHaveAttribute('href', '/mas/categorias')
  })
})

describe('validación', () => {
  test('monto y categoría son obligatorios: muestra los errores y no guarda', async () => {
    await categorias()
    const user = renderEn('/movimiento/nuevo?tipo=GASTO')
    await screen.findByRole('heading', { name: 'Nuevo gasto' })
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Ingresá un monto mayor a 0')).toBeInTheDocument()
    expect(screen.getByText('Elegí una categoría')).toBeInTheDocument()
    expect(await db.movimientos.count()).toBe(0)
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
  })

  test('un monto que no se puede interpretar muestra el error en el campo y no guarda', async () => {
    await categorias()
    const user = renderEn('/movimiento/nuevo?tipo=GASTO')
    await user.type(await screen.findByLabelText('Monto'), '41.5')
    await user.click(screen.getByRole('radio', { name: 'Supermercado' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText(/Monto inválido/)).toBeInTheDocument()
    expect(screen.getByLabelText('Monto')).toHaveAttribute('aria-invalid', 'true')
    expect(await db.movimientos.count()).toBe(0)
  })

  test('un monto de 0 no se guarda', async () => {
    await categorias()
    const user = renderEn('/movimiento/nuevo?tipo=GASTO')
    await user.type(await screen.findByLabelText('Monto'), '0')
    await user.click(screen.getByRole('radio', { name: 'Supermercado' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('Ingresá un monto mayor a 0')).toBeInTheDocument()
    expect(await db.movimientos.count()).toBe(0)
  })

  test('si la categoría ya no existe al guardar, lo dice en castellano', async () => {
    await categorias()
    const user = renderEn('/movimiento/nuevo?tipo=GASTO')
    await user.type(await screen.findByLabelText('Monto'), '1000')
    await user.click(screen.getByRole('radio', { name: 'Supermercado' }))
    await db.categorias.clear()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Esa categoría ya no existe. Elegí otra.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
  })

  test('un doble toque en Guardar guarda una sola vez', async () => {
    await categorias()
    const original = datosMovimientos.guardarMovimiento
    const espia = vi.spyOn(datosMovimientos, 'guardarMovimiento').mockImplementation(async (m) => {
      await new Promise((r) => setTimeout(r, 20))
      return original(m)
    })
    const user = renderEn('/movimiento/nuevo?tipo=GASTO')
    await user.type(await screen.findByLabelText('Monto'), '1000')
    await user.click(screen.getByRole('radio', { name: 'Supermercado' }))
    await user.dblClick(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(espia).toHaveBeenCalledTimes(1)
    expect(await db.movimientos.count()).toBe(1)
  })
})

describe('editar y borrar', () => {
  test('edita un gasto existente conservando su tipo', async () => {
    const { materiales, supermercado } = await categorias()
    const id = await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-20', monto: 2200000, categoriaId: materiales, nota: 'x' })
    const user = renderEn(`/movimiento/${id}`)

    expect(await screen.findByRole('heading', { name: 'Editar gasto' })).toBeInTheDocument()
    expect(screen.getByLabelText('Monto')).toHaveValue('$ 22.000')
    expect(await fechaElegida()).toBe('2026-10-20')
    expect(screen.getByRole('radio', { name: 'Materiales' })).toBeChecked()

    await user.clear(screen.getByLabelText('Monto'))
    await user.type(screen.getByLabelText('Monto'), '25000')
    await user.click(screen.getByRole('radio', { name: 'Supermercado' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    const guardados = await db.movimientos.toArray()
    expect(guardados).toHaveLength(1)
    expect(guardados[0]).toMatchObject({ id, tipo: 'GASTO', monto: 2500000, categoriaId: supermercado, fecha: '2026-10-20' })
  })

  test('borrar pide confirmación y recién entonces borra', async () => {
    const { materiales } = await categorias()
    const id = await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-20', monto: 2200000, categoriaId: materiales, nota: '' })
    const user = renderEn(`/movimiento/${id}`)

    await user.click(await screen.findByRole('button', { name: 'Borrar gasto' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Borrar este gasto?' })
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(await db.movimientos.count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Borrar gasto' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Borrar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.movimientos.count()).toBe(0)
  })

  test('un movimiento que no existe lo dice', async () => {
    renderEn('/movimiento/no-existe')
    expect(await screen.findByText('No encontramos este movimiento.')).toBeInTheDocument()
  })
})

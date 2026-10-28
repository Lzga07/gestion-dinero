import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { db } from '../../data/db'
import { guardarCategoria } from '../../data/categorias'
import { guardarMovimiento } from '../../data/movimientos'
import { reiniciarDb } from '../../data/test-helpers'
import Categorias from './Categorias'

function renderCategorias() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/mas', '/mas/categorias']} initialIndex={1}>
      <Routes>
        <Route path="/mas" element={<h1>Más</h1>} />
        <Route path="/mas/categorias" element={<Categorias />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

beforeEach(reiniciarDb)

const gasto = (nombre: string, ambito: 'TRABAJO' | 'PERSONAL', orden: number) =>
  guardarCategoria({ nombre, tipo: 'GASTO', ambito, icono: '📦', color: '', orden })

describe('crear y editar', () => {
  test('crea una categoría de gasto personal', async () => {
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }))
    await user.type(screen.getByLabelText('Nombre'), 'Mascotas')
    await user.click(screen.getByRole('radio', { name: 'Personal' }))
    await user.clear(screen.getByLabelText('Ícono'))
    await user.type(screen.getByLabelText('Ícono'), '🐶')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: /Mascotas/ })).toBeInTheDocument()
    expect(await db.categorias.toArray()).toMatchObject([
      { nombre: 'Mascotas', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🐶' },
    ])
  })

  test('el nombre es obligatorio', async () => {
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Escribí un nombre')).toBeInTheDocument()
    expect(await db.categorias.count()).toBe(0)
  })

  test('una categoría de ingreso queda sin ámbito', async () => {
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }))
    await user.type(screen.getByLabelText('Nombre'), 'Alquiler cobrado')
    await user.click(screen.getByRole('radio', { name: 'Ingreso' }))
    expect(screen.queryByRole('radio', { name: 'Personal' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByRole('button', { name: /Alquiler cobrado/ })
    expect(await db.categorias.toArray()).toMatchObject([{ tipo: 'INGRESO', ambito: null }])
  })

  test('edita el nombre de una categoría existente', async () => {
    await gasto('Materiales', 'TRABAJO', 0)
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: /Materiales/ }))
    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Insumos')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: /Insumos/ })).toBeInTheDocument()
    expect(await db.categorias.count()).toBe(1)
  })

  test('no deja cambiar el tipo de una categoría que tiene movimientos', async () => {
    const id = await gasto('Materiales', 'TRABAJO', 0)
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-20', monto: 1000, categoriaId: id, nota: '' })
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: /Materiales/ }))
    expect(await screen.findByRole('radio', { name: 'Ingreso' })).toBeDisabled()
  })
})

describe('borrar', () => {
  test('una categoría sin movimientos se borra tras confirmar', async () => {
    await gasto('Materiales', 'TRABAJO', 0)
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: /Materiales/ }))
    await user.click(screen.getByRole('button', { name: 'Borrar categoría' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Borrar la categoría Materiales?' })
    await user.click(within(dialogo).getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('button', { name: 'Nueva categoría' })).toBeInTheDocument()
    expect(await db.categorias.count()).toBe(0)
  })

  test('borrar categoría en uso pide categoría destino', async () => {
    const materiales = await gasto('Materiales', 'TRABAJO', 0)
    const traslado = await gasto('Traslado', 'TRABAJO', 1)
    await guardarCategoria({ nombre: 'Sueldo extra', tipo: 'INGRESO', ambito: null, icono: '💰', color: '', orden: 2 })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-20', monto: 1000, categoriaId: materiales, nota: '' })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-21', monto: 2000, categoriaId: materiales, nota: '' })
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: /Materiales/ }))
    await user.click(screen.getByRole('button', { name: 'Borrar categoría' }))

    const dialogo = await screen.findByRole('dialog', { name: '¿A qué categoría pasamos sus movimientos?' })
    expect(within(dialogo).getByText(/2 movimientos/)).toBeInTheDocument()
    const destino = within(dialogo).getByLabelText('Pasar a')
    // Solo las del mismo tipo y sin la propia.
    expect(within(destino).getAllByRole('option').map((o) => o.textContent)).toEqual(['Traslado'])
    expect(await db.categorias.count()).toBe(3) // todavía no se borró nada

    await user.click(within(dialogo).getByRole('button', { name: 'Pasar y borrar' }))
    expect(await screen.findByRole('button', { name: 'Nueva categoría' })).toBeInTheDocument()
    expect(await db.categorias.get(materiales)).toBeUndefined()
    expect((await db.movimientos.toArray()).map((m) => m.categoriaId)).toEqual([traslado, traslado])
  })

  test('si no hay otra categoría del mismo tipo no se puede borrar', async () => {
    const id = await gasto('Materiales', 'TRABAJO', 0)
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-20', monto: 1000, categoriaId: id, nota: '' })
    const user = renderCategorias()
    await user.click(await screen.findByRole('button', { name: /Materiales/ }))
    await user.click(screen.getByRole('button', { name: 'Borrar categoría' }))

    const dialogo = await screen.findByRole('dialog', { name: 'No se puede borrar todavía' })
    expect(within(dialogo).getByText(/Creá otra categoría de gasto/)).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Entendido' }))
    expect(await db.categorias.count()).toBe(1)
  })
})

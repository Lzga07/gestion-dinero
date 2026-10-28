import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../data/db'
import { crearPin, tienePin, verificarPinGuardado } from '../../data/pin'
import { reiniciarDb } from '../../data/test-helpers'
import ConfigPin from './ConfigPin'
import Mas from './Mas'

beforeEach(reiniciarDb)
afterEach(() => vi.restoreAllMocks())

function renderPin() {
  render(
    <MemoryRouter initialEntries={['/mas', '/mas/pin']} initialIndex={1}>
      <Routes>
        <Route path="/mas" element={<Mas />} />
        <Route path="/mas/pin" element={<ConfigPin />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('sin PIN', () => {
  test('explica qué es y qué no es el PIN', async () => {
    renderPin()
    expect(await screen.findByRole('heading', { name: 'PIN' })).toBeInTheDocument()
    expect(
      screen.getByText('El PIN evita que otra persona vea tus datos si agarra tu celular. No cifra la información.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar PIN' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar PIN' })).not.toBeInTheDocument()
  })

  test('crea el PIN (lo repite), lo guarda solo como hash y vuelve a Más con un aviso', async () => {
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN nuevo'), '2468')
    await user.type(screen.getByLabelText('Repetí el PIN'), '2468')
    await user.click(screen.getByRole('button', { name: 'Crear PIN' }))

    expect(await screen.findByText(/^PIN creado\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Más' })).toBeInTheDocument()
    expect(await tienePin()).toBe(true)
    expect(await verificarPinGuardado('2468')).toBe(true)
    expect(JSON.stringify(await db.ajustes.toArray())).not.toContain('2468')
    // El detalle de la fila de Más ya dice que está activado.
    expect(screen.getByRole('link', { name: /PIN/ })).toHaveAccessibleDescription('Activado')
  })

  test.each([
    ['12', '12', 'El PIN tiene que tener de 4 a 6 números.'],
    ['1234', '1235', 'Los dos PIN tienen que ser iguales.'],
  ])('con %s y %s no guarda y explica', async (pin, repetido, mensaje) => {
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN nuevo'), pin)
    await user.type(screen.getByLabelText('Repetí el PIN'), repetido)
    await user.click(screen.getByRole('button', { name: 'Crear PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    expect(await tienePin()).toBe(false)
  })

  test('los campos solo aceptan números y hasta 6', async () => {
    const user = userEvent.setup()
    renderPin()
    const campo = await screen.findByLabelText('PIN nuevo')
    await user.type(campo, '12ab34567')
    expect(campo).toHaveValue('123456')
  })

  test('si no se puede guardar avisa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(db.ajustes, 'bulkPut').mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN nuevo'), '1234')
    await user.type(screen.getByLabelText('Repetí el PIN'), '1234')
    await user.click(screen.getByRole('button', { name: 'Crear PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el PIN. Probá de nuevo.')
    expect(await tienePin()).toBe(false)
  })
})

describe('con PIN', () => {
  beforeEach(() => crearPin('1234'))

  test('ofrece cambiar y quitar, no crear', async () => {
    renderPin()
    expect(await screen.findByRole('button', { name: 'Cambiar PIN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar PIN' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear PIN' })).not.toBeInTheDocument()
  })

  test('cambia el PIN pidiendo el actual', async () => {
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN actual'), '1234')
    await user.type(screen.getByLabelText('PIN nuevo'), '987654')
    await user.type(screen.getByLabelText('Repetí el PIN nuevo'), '987654')
    await user.click(screen.getByRole('button', { name: 'Cambiar PIN' }))

    expect(await screen.findByText('PIN cambiado.')).toBeInTheDocument()
    expect(await verificarPinGuardado('987654')).toBe(true)
    expect(await verificarPinGuardado('1234')).toBe(false)
  })

  test('con el PIN actual equivocado no cambia nada', async () => {
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN actual'), '0000')
    await user.type(screen.getByLabelText('PIN nuevo'), '9876')
    await user.type(screen.getByLabelText('Repetí el PIN nuevo'), '9876')
    await user.click(screen.getByRole('button', { name: 'Cambiar PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El PIN actual no es correcto.')
    expect(await verificarPinGuardado('1234')).toBe(true)
  })

  test('el PIN nuevo inválido o que no coincide se explica antes de tocar nada', async () => {
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN actual'), '1234')
    await user.type(screen.getByLabelText('PIN nuevo'), '98')
    await user.type(screen.getByLabelText('Repetí el PIN nuevo'), '98')
    await user.click(screen.getByRole('button', { name: 'Cambiar PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El PIN tiene que tener de 4 a 6 números.')
    expect(await verificarPinGuardado('1234')).toBe(true)
  })

  test('quita el PIN pidiendo el actual, sin tocar datos', async () => {
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN actual (para quitarlo)'), '1234')
    await user.click(screen.getByRole('button', { name: 'Quitar PIN' }))

    expect(await screen.findByText(/^PIN quitado\./)).toBeInTheDocument()
    expect(await tienePin()).toBe(false)
    expect(screen.getByRole('link', { name: /PIN/ })).toHaveAccessibleDescription('Desactivado')
  })

  test('quitarlo con el PIN actual equivocado no lo quita', async () => {
    const user = userEvent.setup()
    renderPin()
    await user.type(await screen.findByLabelText('PIN actual (para quitarlo)'), '1111')
    await user.click(screen.getByRole('button', { name: 'Quitar PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El PIN actual no es correcto.')
    expect(await tienePin()).toBe(true)
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { FechaISO } from '../../domain/dates'
import SelectorFecha from './SelectorFecha'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0)) // miércoles 28/10/2026
})
afterEach(() => vi.useRealTimers())

const cambios: FechaISO[] = []

function Prueba({ inicial }: { inicial: FechaISO }) {
  const [fecha, setFecha] = useState(inicial)
  return (
    <SelectorFecha
      label="Fecha"
      value={fecha}
      onChange={(f) => {
        cambios.push(f)
        setFecha(f)
      }}
    />
  )
}

function montar(inicial: FechaISO = '2026-10-28') {
  cambios.length = 0
  const user = userEvent.setup()
  render(<Prueba inicial={inicial} />)
  return { user, grupo: screen.getByRole('group', { name: 'Fecha' }) }
}

test('arranca en "Hoy" con la fecha en palabras y sin calendario', () => {
  const { grupo } = montar()
  expect(within(grupo).getByRole('radio', { name: 'Hoy' })).toBeChecked()
  expect(grupo).toHaveTextContent('Miércoles 28 de octubre')
  expect(within(grupo).queryByRole('button', { name: 'Mes anterior' })).not.toBeInTheDocument()
})

test('"Ayer" elige el día anterior con un toque', async () => {
  const { user, grupo } = montar()
  await user.click(within(grupo).getByRole('radio', { name: 'Ayer' }))
  expect(cambios).toEqual(['2026-10-27'])
  expect(within(grupo).getByRole('radio', { name: 'Ayer' })).toBeChecked()
  expect(grupo).toHaveTextContent('Martes 27 de octubre')
})

test('"Otro día…" abre el calendario: se cambia de mes con flechas y se toca el día', async () => {
  const { user, grupo } = montar()
  await user.click(within(grupo).getByRole('radio', { name: 'Otro día…' }))
  expect(within(grupo).getByRole('radio', { name: 'Otro día…' })).toBeChecked()
  expect(grupo).toHaveTextContent('Octubre 2026')
  await user.click(within(grupo).getByRole('button', { name: 'Mes anterior' }))
  expect(grupo).toHaveTextContent('Septiembre 2026')

  await user.click(within(grupo).getByRole('button', { name: '14 de septiembre de 2026' }))
  expect(cambios).toEqual(['2026-09-14'])
  expect(within(grupo).getByRole('radio', { name: 'Otro día…' })).toBeChecked()
  expect(grupo).toHaveTextContent('Lunes 14 de septiembre')
  // Elegido el día, el calendario se cierra.
  expect(within(grupo).queryByRole('button', { name: 'Mes anterior' })).not.toBeInTheDocument()
})

test('no deja elegir días futuros ni pasar más allá del mes actual', async () => {
  const { user, grupo } = montar()
  await user.click(within(grupo).getByRole('radio', { name: 'Otro día…' }))
  expect(within(grupo).getByRole('button', { name: '28 de octubre de 2026' })).toBeEnabled()
  expect(within(grupo).getByRole('button', { name: '29 de octubre de 2026' })).toBeDisabled()
  expect(within(grupo).getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
})

test('con una fecha vieja arranca en "Otro día…" y el calendario abre en ese mes', async () => {
  const { user, grupo } = montar('2025-02-10')
  expect(within(grupo).getByRole('radio', { name: 'Otro día…' })).toBeChecked()
  expect(grupo).toHaveTextContent('Lunes 10 de febrero de 2025')

  await user.click(within(grupo).getByRole('radio', { name: 'Otro día…' }))
  expect(grupo).toHaveTextContent('Febrero 2025')
  expect(within(grupo).getByRole('button', { name: '10 de febrero de 2025' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(grupo).getByRole('button', { name: 'Mes siguiente' })).toBeEnabled()
})

test('"Hoy" vuelve a hoy y cierra el calendario', async () => {
  const { user, grupo } = montar('2025-02-10')
  await user.click(within(grupo).getByRole('radio', { name: 'Otro día…' }))
  await user.click(within(grupo).getByRole('radio', { name: 'Hoy' }))
  expect(cambios).toEqual(['2026-10-28'])
  expect(within(grupo).queryByRole('button', { name: 'Mes anterior' })).not.toBeInTheDocument()
})

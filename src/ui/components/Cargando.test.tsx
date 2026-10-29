import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { guardarAjuste } from '../../data/ajustes'
import { db } from '../../data/db'
import { reiniciarDb } from '../../data/test-helpers'
import App from '../App'
import Inicio from '../screens/Inicio'
import Lugares from '../screens/Lugares'
import Cargando, { DEMORA_CARGA_MS } from './Cargando'

vi.mock('../../platform/persistencia', () => ({ pedirPersistencia: vi.fn().mockResolvedValue(true) }))

/** La base queda trabada: toda lectura de `tabla` espera para siempre. */
function trabar(tabla: 'lugares' | 'ajustes') {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const nunca = () => new Promise(() => undefined) as never
  if (tabla === 'lugares') vi.spyOn(db.lugares, 'toArray').mockImplementation(nunca)
  else vi.spyOn(db.ajustes, 'get').mockImplementation(nunca)
  vi.useFakeTimers({ shouldAdvanceTime: true })
}

beforeEach(async () => {
  await reiniciarDb()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('mientras carga no muestra nada (casi siempre carga al instante)', () => {
  vi.useFakeTimers()
  render(<Cargando />)
  act(() => vi.advanceTimersByTime(DEMORA_CARGA_MS - 1))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('si tarda, avisa que no se perdió nada, deja reintentar y lo registra', async () => {
  vi.useFakeTimers()
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const reintentar = vi.fn()
  render(<Cargando onReintentar={reintentar} />)
  act(() => vi.advanceTimersByTime(DEMORA_CARGA_MS))

  expect(screen.getByRole('alert')).toHaveTextContent('Tus datos están tardando en cargar')
  expect(screen.getByRole('alert')).toHaveTextContent('No se perdió nada')
  expect(aviso).toHaveBeenCalledOnce()
  vi.useRealTimers()
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(reintentar).toHaveBeenCalledOnce()
})

test('una pantalla cuya base no responde muestra el aviso en vez de quedar vacía', async () => {
  trabar('lugares')
  render(
    <MemoryRouter>
      <Inicio />
    </MemoryRouter>,
  )
  act(() => vi.advanceTimersByTime(DEMORA_CARGA_MS))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tus datos están tardando en cargar')
})

test('Lugares con la base trabada avisa en vez de mostrar solo "Agregar lugar"', async () => {
  trabar('lugares')
  render(
    <MemoryRouter>
      <Lugares />
    </MemoryRouter>,
  )
  act(() => vi.advanceTimersByTime(DEMORA_CARGA_MS))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tus datos están tardando en cargar')
})

test('al abrir la app con la base trabada avisa, sin mostrar nada de la app', async () => {
  await guardarAjuste('pinOfrecido', true)
  trabar('ajustes')
  render(<App />)
  act(() => vi.advanceTimersByTime(DEMORA_CARGA_MS))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tus datos están tardando en cargar')
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByRole('main')).not.toBeInTheDocument()
})

import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { pedirPersistencia } from '../platform/persistencia'
import { simularDispositivo, UA_IPHONE } from '../platform/test-dispositivo'
import App from './App'

vi.mock('../platform/persistencia', () => ({ pedirPersistencia: vi.fn().mockResolvedValue(true) }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(pedirPersistencia).mockClear()
})

test('muestra las 5 pestañas de navegación', () => {
  render(<App />)
  for (const t of ['Inicio', 'Movimientos', 'Lugares', 'Estadísticas', 'Más'])
    expect(screen.getByRole('link', { name: t })).toBeInTheDocument()
})

test('Inicio es la pantalla por defecto', () => {
  render(<App />)
  expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
})

test('al iniciar pide almacenamiento persistente una sola vez', () => {
  render(<App />)
  expect(pedirPersistencia).toHaveBeenCalledTimes(1)
})

test('en una computadora no muestra el banner de instalación', () => {
  render(<App />)
  expect(screen.queryByRole('complementary', { name: 'Instalar la app' })).not.toBeInTheDocument()
})

test('en una pestaña de Safari de iPhone el banner va arriba de todo, antes del contenido y de la navegación', () => {
  simularDispositivo({ userAgent: UA_IPHONE, maxTouchPoints: 5, standaloneIos: false })
  render(<App />)
  const banner = screen.getByRole('complementary', { name: 'Instalar la app' })
  const principal = screen.getByRole('main')
  const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
  expect(banner.compareDocumentPosition(principal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(banner.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

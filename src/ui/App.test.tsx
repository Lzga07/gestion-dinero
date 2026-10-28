import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { guardarAjuste, leerAjuste } from '../data/ajustes'
import { db } from '../data/db'
import { crearPin } from '../data/pin'
import { reiniciarDb } from '../data/test-helpers'
import { pedirPersistencia } from '../platform/persistencia'
import { simularDispositivo, UA_ANDROID, UA_IPHONE } from '../platform/test-dispositivo'
import App from './App'

vi.mock('../platform/persistencia', () => ({ pedirPersistencia: vi.fn().mockResolvedValue(true) }))

beforeEach(async () => {
  window.location.hash = ''
  await reiniciarDb()
  await guardarAjuste('pinOfrecido', true) // la oferta de primer uso se prueba aparte, más abajo
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(pedirPersistencia).mockClear()
})

test('muestra las 5 pestañas de navegación', async () => {
  render(<App />)
  for (const t of ['Inicio', 'Movimientos', 'Lugares', 'Estadísticas', 'Más'])
    expect(await screen.findByRole('link', { name: t })).toBeInTheDocument()
})

test('Inicio es la pantalla por defecto', async () => {
  render(<App />)
  expect(await screen.findByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
})

test('al iniciar pide almacenamiento persistente una sola vez', async () => {
  render(<App />)
  await screen.findByRole('main')
  expect(pedirPersistencia).toHaveBeenCalledTimes(1)
})

test('en una computadora no muestra el banner de instalación', async () => {
  render(<App />)
  await screen.findByRole('main')
  expect(screen.queryByRole('complementary', { name: 'Instalar la app' })).not.toBeInTheDocument()
})

test('en una pestaña de Safari de iPhone el banner va arriba de todo, antes del contenido y de la navegación', async () => {
  simularDispositivo({ userAgent: UA_IPHONE, maxTouchPoints: 5, standaloneIos: false })
  render(<App />)
  await screen.findByRole('main')
  const banner = screen.getByRole('complementary', { name: 'Instalar la app' })
  const principal = screen.getByRole('main')
  const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
  expect(banner.compareDocumentPosition(principal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(banner.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

describe('primer uso: oferta de crear un PIN', () => {
  beforeEach(async () => {
    await db.ajustes.delete('pinOfrecido')
  })

  const TITULO = '¿Querés poner un PIN para abrir la app?'

  test('la primera vez ofrece crear el PIN, con el texto de qué es y qué no es', async () => {
    render(<App />)
    const dialogo = await screen.findByRole('dialog', { name: TITULO })
    expect(dialogo).toHaveTextContent('No cifra la información.')
    expect(screen.getByRole('button', { name: 'Crear PIN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeInTheDocument()
  })

  test('"Ahora no" la cierra y no vuelve a aparecer en las próximas aperturas', async () => {
    const user = userEvent.setup()
    const primera = render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Ahora no' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () => expect(await leerAjuste('pinOfrecido', false)).toBe(true))

    primera.unmount()
    render(<App />)
    await screen.findByRole('main')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('"Crear PIN" lleva a la pantalla del PIN y también cuenta como ofrecida', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Crear PIN' }))

    expect(await screen.findByLabelText('PIN nuevo')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () => expect(await leerAjuste('pinOfrecido', false)).toBe(true))
  })

  test('Escape cuenta como "Ahora no"', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('dialog', { name: TITULO })
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () => expect(await leerAjuste('pinOfrecido', false)).toBe(true))
  })

  test('si ya hay un PIN no la ofrece', async () => {
    await crearPin('1234')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })
    await user.keyboard('1234{Enter}')
    await screen.findByRole('main')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('en una pestaña de Safari de iPhone no la ofrece (los datos del ícono instalado son otros)', async () => {
    simularDispositivo({ userAgent: UA_IPHONE, maxTouchPoints: 5, standaloneIos: false })
    render(<App />)
    await screen.findByRole('main')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await leerAjuste('pinOfrecido', false)).toBe(false) // y no la da por ofrecida
  })

  test.each([
    ['la app instalada en iPhone', { userAgent: UA_IPHONE, maxTouchPoints: 5, standaloneIos: true }],
    ['Chrome de Android', { userAgent: UA_ANDROID, maxTouchPoints: 5, standalone: true }],
  ])('en %s sí la ofrece', async (_, dispositivo) => {
    simularDispositivo(dispositivo)
    render(<App />)
    expect(await screen.findByRole('dialog', { name: TITULO })).toBeInTheDocument()
  })
})

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { guardarAjuste, leerAjuste } from '../../data/ajustes'
import { guardarCategoria } from '../../data/categorias'
import { exportarDatos } from '../../data/copia'
import { db } from '../../data/db'
import { guardarTipoTrabajo } from '../../data/lugares'
import { guardarMovimiento } from '../../data/movimientos'
import { registrarPago } from '../../data/pagos'
import { crearPin, tienePin } from '../../data/pin'
import { anotarTrabajo, lugarFijo, reiniciarDb } from '../../data/test-helpers'
import App from '../App'

vi.mock('../../platform/persistencia', () => ({ pedirPersistencia: vi.fn().mockResolvedValue(true) }))

function ponerVisibilidad(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(async () => {
  window.location.hash = ''
  await reiniciarDb()
  await guardarAjuste('pinOfrecido', true) // la oferta de primer uso se prueba en App.test.tsx
})
afterEach(() => {
  ponerVisibilidad('visible')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function teclear(user: UserEvent, pin: string) {
  for (const d of pin) await user.click(screen.getByRole('button', { name: d }))
}

async function desbloquear(user: UserEvent, pin = '1234') {
  await teclear(user, pin)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  await screen.findByRole('navigation', { name: 'Navegación principal' })
}

describe('al abrir la app', () => {
  test('sin PIN abre directo', async () => {
    render(<App />)
    expect(await screen.findByRole('link', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ingresá tu PIN' })).not.toBeInTheDocument()
  })

  test('con PIN arranca bloqueada, sin dibujar nada de la app, y desbloquea con el correcto', async () => {
    await crearPin('1234')
    const user = userEvent.setup()
    render(<App />)

    // Mientras lee el ajuste tampoco dibuja la app: nada de datos a la vista.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'Ingresá tu PIN' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument()

    await desbloquear(user)
    expect(screen.queryByRole('heading', { name: 'Ingresá tu PIN' })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  test('un PIN incorrecto avisa, vacía lo tecleado y sigue bloqueada', async () => {
    await crearPin('1234')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })

    await teclear(user, '4321')
    expect(screen.getByRole('group', { name: '4 dígitos ingresados' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('PIN incorrecto')
    expect(screen.getByRole('group', { name: '0 dígitos ingresados' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  test('"Entrar" espera 4 dígitos, "Borrar" saca el último y no entran más de 6', async () => {
    await crearPin('1234')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })
    const entrar = screen.getByRole('button', { name: 'Entrar' })

    await teclear(user, '123')
    expect(entrar).toBeDisabled()
    await teclear(user, '4')
    expect(entrar).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Borrar' }))
    expect(screen.getByRole('group', { name: '3 dígitos ingresados' })).toBeInTheDocument()
    await teclear(user, '45678')
    expect(screen.getByRole('group', { name: '6 dígitos ingresados' })).toBeInTheDocument()
  })

  test('también anda con el teclado físico: dígitos, Borrar y Enter', async () => {
    await crearPin('1234')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })

    await user.keyboard('12{Backspace}234{Enter}')
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
  })

  test('mientras verifica, el teclado queda deshabilitado', async () => {
    await crearPin('1234')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })
    await teclear(user, '1234')

    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    // Antes de que termine la verificación (PBKDF2 tarda) no se puede tocar nada.
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
    await screen.findByRole('navigation', { name: 'Navegación principal' })
  })

  test('si no puede leer el PIN no abre la app: ofrece reintentar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await crearPin('1234')
    vi.spyOn(db.ajustes, 'get').mockRejectedValueOnce(new Error('boom'))
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos abrir tus datos.')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Ingresá tu PIN' })).toBeInTheDocument()
  })
})

describe('volver a bloquear', () => {
  beforeEach(async () => {
    await crearPin('1234')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 12, 0, 0))
  })

  async function abrirDesbloqueada() {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })
    await desbloquear(user)
    return user
  }

  async function ocultarPor(ms: number) {
    await act(async () => ponerVisibilidad('hidden'))
    vi.setSystemTime(Date.now() + ms)
    await act(async () => ponerVisibilidad('visible'))
  }

  test('tras más de 1 minuto oculta pide el PIN; la app sigue montada, tapada e inerte', async () => {
    const user = await abrirDesbloqueada()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })

    await ocultarPor(61_000)

    expect(await screen.findByRole('heading', { name: 'Ingresá tu PIN' })).toBeInTheDocument()
    expect(nav.isConnected).toBe(true) // sigue montada: un formulario a medio llenar no se pierde
    expect(nav.closest('[inert]')).not.toBeNull()
    expect(nav.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument() // oculta para lectores de pantalla

    await teclear(user, '1234')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBe(nav)
    expect(nav.closest('[inert]')).toBeNull()
  })

  test('con 1 minuto justo o menos no la bloquea', async () => {
    await abrirDesbloqueada()
    await ocultarPor(60_000)
    expect(screen.queryByRole('heading', { name: 'Ingresá tu PIN' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
  })

  test('mide el tiempo oculta con la hora, no con un temporizador', async () => {
    await abrirDesbloqueada()
    await act(async () => ponerVisibilidad('hidden'))
    // El teléfono duerme la pestaña: ningún timer corre, pero la hora avanza.
    vi.setSystemTime(Date.now() + 10 * 60_000)
    await act(async () => ponerVisibilidad('visible'))
    expect(await screen.findByRole('heading', { name: 'Ingresá tu PIN' })).toBeInTheDocument()
  })

  test('si se quita el PIN mientras estaba oculta, no la bloquea', async () => {
    await abrirDesbloqueada()
    await db.ajustes.bulkDelete(['pinHash', 'pinSalt'])
    await ocultarPor(5 * 60_000)
    // Se tapa al instante (había PIN) y apenas lee que ya no hay, vuelve a abrirse sola.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Ingresá tu PIN' })).not.toBeInTheDocument())
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
  })

  test('si no puede leer el PIN al volver, tapa la app y ofrece reintentar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await abrirDesbloqueada()
    vi.spyOn(db.ajustes, 'get').mockRejectedValueOnce(new Error('boom'))
    await ocultarPor(5 * 60_000)
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos abrir tus datos.')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})

describe('"Olvidé mi PIN"', () => {
  async function llenarTodasLasTablas() {
    const lugarId = await lugarFijo(15, 'Lugar que no se toca')
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 5000, orden: 0 })
    const t1 = await anotarTrabajo(lugarId, '2026-10-05')
    const t2 = await anotarTrabajo(lugarId, '2026-10-06')
    await registrarPago({
      lugarId, periodoFin: '2026-10-15', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
      tildados: [t1], destildados: [t2],
    })
    const categoriaId = await guardarCategoria({
      nombre: 'Ocio', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🎬', color: '#6a5acd', orden: 0,
    })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500, categoriaId, nota: '' })
    await guardarAjuste('ultimaCopia', '2026-10-27T10:00:00.000Z')
  }

  const sinAjustesDelPin = async () => {
    const datos = await exportarDatos()
    return {
      ...datos,
      ajustes: datos.ajustes.filter((a) => !['pinHash', 'pinSalt', 'pinOfrecido'].includes(a.clave)),
    }
  }

  beforeEach(async () => {
    await llenarTodasLasTablas()
    await crearPin('1234')
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  })

  async function avanzar(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  test('explica, pide confirmación, espera 60 s, quita el PIN y conserva todos los datos', async () => {
    const antes = await sinAjustesDelPin()
    expect(antes.lugares).toHaveLength(1)
    expect(antes.trabajos).toHaveLength(2)
    expect(antes.pagos).toHaveLength(1)
    expect(antes.movimientos).toHaveLength(1)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })

    await user.click(screen.getByRole('button', { name: 'Olvidé mi PIN' }))
    expect(screen.getByRole('heading', { name: 'Olvidé mi PIN' })).toBeInTheDocument()
    expect(screen.getByText(/no cifra tus datos/)).toBeInTheDocument()
    expect(screen.getByText(/no se borra nada/)).toBeInTheDocument()
    // Todavía no hay cuenta regresiva ni botón para quitar: primero la confirmación.
    expect(screen.queryByRole('button', { name: 'Quitar PIN' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Quiero quitar el PIN' }))
    const quitar = screen.getByRole('button', { name: 'Quitar PIN' })
    expect(screen.getByText('Podés quitar el PIN en 60 s')).toBeInTheDocument()
    expect(quitar).toBeDisabled()

    await avanzar(30_000)
    expect(screen.getByText('Podés quitar el PIN en 30 s')).toBeInTheDocument()
    await avanzar(29_000)
    expect(screen.getByText('Podés quitar el PIN en 1 s')).toBeInTheDocument()
    expect(quitar).toBeDisabled()
    expect(await tienePin()).toBe(true)

    await avanzar(1_000)
    expect(screen.getByText('Ya podés quitar el PIN')).toBeInTheDocument()
    expect(quitar).toBeEnabled()

    await user.click(quitar)
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()

    expect(await tienePin()).toBe(false)
    expect(await leerAjuste('pinSalt', null)).toBeNull()
    expect(await sinAjustesDelPin()).toEqual(antes) // ni una fila de ninguna tabla cambió
  })

  test('"Volver" cancela la cuenta regresiva: al reintentar empieza de nuevo y el PIN sigue', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })
    await user.click(screen.getByRole('button', { name: 'Olvidé mi PIN' }))
    await user.click(screen.getByRole('button', { name: 'Quiero quitar el PIN' }))
    await avanzar(40_000)

    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('heading', { name: 'Ingresá tu PIN' })).toBeInTheDocument()
    await avanzar(60_000)
    expect(await tienePin()).toBe(true)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Olvidé mi PIN' }))
    await user.click(screen.getByRole('button', { name: 'Quiero quitar el PIN' }))
    expect(screen.getByText('Podés quitar el PIN en 60 s')).toBeInTheDocument()
  })

  test('si falla al quitar el PIN avisa y sigue bloqueada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Ingresá tu PIN' })
    await user.click(screen.getByRole('button', { name: 'Olvidé mi PIN' }))
    await user.click(screen.getByRole('button', { name: 'Quiero quitar el PIN' }))
    await avanzar(60_000)
    vi.spyOn(db.ajustes, 'bulkDelete').mockRejectedValueOnce(new Error('boom'))

    await user.click(screen.getByRole('button', { name: 'Quitar PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo quitar el PIN')
    await waitFor(() => expect(screen.queryByRole('navigation')).not.toBeInTheDocument())
    expect(await tienePin()).toBe(true)
  })
})

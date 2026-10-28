import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useRegisterSW } from 'virtual:pwa-register/react'
import AvisoVersionNueva from './AvisoVersionNueva'

vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: vi.fn() }))
const registrar = vi.mocked(useRegisterSW)
const actualizar = vi.fn(async () => {})

function conVersionNueva(hay: boolean) {
  registrar.mockReturnValue({
    needRefresh: [hay, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: actualizar,
  })
}

beforeEach(() => {
  registrar.mockReset()
  actualizar.mockClear()
})
afterEach(() => vi.restoreAllMocks())

test('sin versión nueva no muestra nada', () => {
  conVersionNueva(false)
  render(<AvisoVersionNueva />)
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('con una versión nueva esperando avisa y no recarga sola', () => {
  conVersionNueva(true)
  render(<AvisoVersionNueva />)
  expect(screen.getByRole('status')).toHaveTextContent('Hay una versión nueva')
  expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument()
  expect(actualizar).not.toHaveBeenCalled()
})

test('"Actualizar" aplica la versión nueva y recarga', async () => {
  conVersionNueva(true)
  const user = userEvent.setup()
  render(<AvisoVersionNueva />)
  await user.click(screen.getByRole('button', { name: 'Actualizar' }))
  expect(actualizar).toHaveBeenCalledWith(true)
})

test('al volver la app a primer plano busca si hay una versión nueva', () => {
  conVersionNueva(false)
  render(<AvisoVersionNueva />)
  const opciones = registrar.mock.calls[0][0]!
  const update = vi.fn(async () => {})
  act(() => opciones.onRegisteredSW?.('sw.js', { update } as unknown as ServiceWorkerRegistration))

  const visibilidad = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(update).toHaveBeenCalledTimes(1)
  visibilidad.mockReturnValue('hidden')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(update).toHaveBeenCalledTimes(1)
})

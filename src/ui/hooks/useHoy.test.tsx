import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useHoy } from './useHoy'

function ponerVisibilidad(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 27, 23, 50))
})
afterEach(() => {
  ponerVisibilidad('visible')
  vi.useRealTimers()
})

describe('useHoy', () => {
  test('devuelve la fecha de hoy', () => {
    const { result } = renderHook(() => useHoy())
    expect(result.current).toBe('2026-10-27')
  })

  test('se recalcula cuando la app vuelve a primer plano', () => {
    const { result } = renderHook(() => useHoy())
    vi.setSystemTime(new Date(2026, 9, 28, 8, 0))
    expect(result.current).toBe('2026-10-27')

    act(() => ponerVisibilidad('visible'))
    expect(result.current).toBe('2026-10-28')
  })

  test('no se recalcula mientras la app queda en segundo plano', () => {
    const { result } = renderHook(() => useHoy())
    vi.setSystemTime(new Date(2026, 9, 28, 8, 0))

    act(() => ponerVisibilidad('hidden'))
    expect(result.current).toBe('2026-10-27')
  })

  test('deja de escuchar al desmontarse', () => {
    const quitar = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useHoy())
    unmount()
    expect(quitar).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    quitar.mockRestore()
  })
})

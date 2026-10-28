import { afterEach, describe, expect, test, vi } from 'vitest'
import { esStandalone, plataforma } from './instalacion'
import { pedirPersistencia } from './persistencia'
import { simularDispositivo, UA_ANDROID, UA_IPHONE, UA_MAC, UA_WINDOWS } from './test-dispositivo'

afterEach(() => vi.unstubAllGlobals())

describe('esStandalone', () => {
  test('detecta display-mode: standalone y navigator.standalone', () => {
    simularDispositivo({ userAgent: UA_ANDROID, standalone: true })
    expect(esStandalone()).toBe(true)
    simularDispositivo({ userAgent: UA_IPHONE, standaloneIos: true })
    expect(esStandalone()).toBe(true)
  })

  test('en una pestaña normal del navegador no es standalone', () => {
    simularDispositivo({ userAgent: UA_IPHONE, standaloneIos: false })
    expect(esStandalone()).toBe(false)
    simularDispositivo({ userAgent: UA_ANDROID })
    expect(esStandalone()).toBe(false)
  })

  test('sin matchMedia (navegador viejo) no rompe', () => {
    vi.stubGlobal('navigator', { userAgent: UA_WINDOWS })
    vi.stubGlobal('matchMedia', undefined)
    expect(esStandalone()).toBe(false)
  })
})

describe('plataforma', () => {
  test('detecta iPhone, iPad con Macintosh + touch y Android', () => {
    simularDispositivo({ userAgent: UA_IPHONE, maxTouchPoints: 5 })
    expect(plataforma()).toBe('ios')
    simularDispositivo({ userAgent: UA_MAC, maxTouchPoints: 5 }) // iPad en modo escritorio
    expect(plataforma()).toBe('ios')
    simularDispositivo({ userAgent: UA_ANDROID, maxTouchPoints: 5 })
    expect(plataforma()).toBe('android')
  })

  test('una Mac sin pantalla táctil y Windows son "otro"', () => {
    simularDispositivo({ userAgent: UA_MAC, maxTouchPoints: 0 })
    expect(plataforma()).toBe('otro')
    simularDispositivo({ userAgent: UA_WINDOWS })
    expect(plataforma()).toBe('otro')
  })
})

describe('pedirPersistencia', () => {
  test('devuelve lo que contesta el navegador', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persist } })
    expect(await pedirPersistencia()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  test('sin soporte devuelve false', async () => {
    vi.stubGlobal('navigator', {})
    expect(await pedirPersistencia()).toBe(false)
  })
})

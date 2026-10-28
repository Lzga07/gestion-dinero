import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { compartirArchivo } from './compartir'

const archivo = () => new File(['%PDF'], 'listado-clinica-2026-09-30.pdf', { type: 'application/pdf' })

function ponerShare(share: (datos: ShareData) => Promise<void>, canShare: (datos: ShareData) => boolean = () => true) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true })
}

function error(nombre: string) {
  return new DOMException('x', nombre)
}

let anclas: HTMLAnchorElement[]
beforeEach(() => {
  anclas = []
  URL.createObjectURL = vi.fn(() => 'blob:prueba')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    anclas.push(this)
  })
})
afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
  vi.restoreAllMocks()
})

describe('compartirArchivo', () => {
  test('usa navigator.share cuando canShare lo permite', async () => {
    const share = vi.fn(async () => {})
    ponerShare(share)
    const f = archivo()

    await expect(compartirArchivo(f, 'Listado')).resolves.toBe('compartido')

    expect(share).toHaveBeenCalledWith({ files: [f], title: 'Listado' })
    expect(anclas).toHaveLength(0)
  })

  test('descarga cuando no hay Web Share', async () => {
    const f = archivo()

    await expect(compartirArchivo(f, 'Listado')).resolves.toBe('descargado')

    expect(URL.createObjectURL).toHaveBeenCalledWith(f)
    expect(anclas).toHaveLength(1)
    expect(anclas[0].download).toBe('listado-clinica-2026-09-30.pdf')
    expect(anclas[0].getAttribute('href')).toBe('blob:prueba')
    expect(document.body.contains(anclas[0])).toBe(false)
  })

  test('descarga cuando canShare dice que no se pueden compartir archivos', async () => {
    const share = vi.fn(async () => {})
    ponerShare(share, () => false)

    await expect(compartirArchivo(archivo(), 'Listado')).resolves.toBe('descargado')

    expect(share).not.toHaveBeenCalled()
    expect(anclas).toHaveLength(1)
  })

  test('devuelve "cancelado" ante AbortError y no descarga', async () => {
    ponerShare(async () => {
      throw error('AbortError')
    })

    await expect(compartirArchivo(archivo(), 'Listado')).resolves.toBe('cancelado')

    expect(anclas).toHaveLength(0)
  })

  test('si Safari rechaza share con NotAllowedError, cae a la descarga', async () => {
    ponerShare(async () => {
      throw error('NotAllowedError')
    })

    await expect(compartirArchivo(archivo(), 'Listado')).resolves.toBe('descargado')

    expect(anclas).toHaveLength(1)
  })

  test('un error inesperado de share no se traga', async () => {
    ponerShare(async () => {
      throw error('DataError')
    })

    await expect(compartirArchivo(archivo(), 'Listado')).rejects.toMatchObject({ name: 'DataError' })
  })
})

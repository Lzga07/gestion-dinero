import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { armarPdfListado, type DatosListado } from '../../pdf/listado'
import { compartirArchivo } from '../../platform/compartir'
import type { Lugar } from '../../domain/types'
import DialogCompartir from './DialogCompartir'

vi.mock('../../pdf/listado', async (original) => ({
  ...(await original<typeof import('../../pdf/listado')>()),
  armarPdfListado: vi.fn(),
}))
vi.mock('../../platform/compartir', () => ({ compartirArchivo: vi.fn() }))

const lugar: Lugar = {
  id: 'l1', nombre: 'Clínica Norte', formaCobro: 'ARANCEL_FIJO', porcentajeBp: null,
  reglasCierre: [{ vigenteDesde: '2026-01-01', dia: 'ULTIMO' }], pagoDesdeDia: 21, pagoHastaDia: 25,
  archivado: false, creadoEn: '2026-01-01T00:00:00.000Z',
}
const datos: Omit<DatosListado, 'incluirNotas'> = {
  lugar, periodo: { inicio: '2026-09-01', fin: '2026-09-30' }, trabajos: [], resumen: null, deudasPlata: [],
  tipo: 'PERIODO', hoy: '2026-10-27',
}

/** Promesa que se resuelve a mano, para ver qué muestra el diálogo mientras el PDF se arma. */
function diferida<T>() {
  let resolver!: (v: T) => void
  let rechazar!: (e: unknown) => void
  const promesa = new Promise<T>((res, rej) => {
    resolver = res
    rechazar = rej
  })
  return { promesa, resolver, rechazar }
}
const pdf = (bytes = 10) => new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })

const armar = vi.mocked(armarPdfListado)
const compartir = vi.mocked(compartirArchivo)

beforeEach(() => {
  armar.mockReset()
  compartir.mockReset()
  armar.mockResolvedValue(pdf())
})
afterEach(() => vi.restoreAllMocks())

function abrir(onCerrar = vi.fn()) {
  const user = userEvent.setup()
  render(<DialogCompartir datos={datos} onCerrar={onCerrar} />)
  return { user, onCerrar }
}
const botonCompartir = () => screen.getByRole('button', { name: /^(Compartir|Preparando…)$/ })

describe('DialogCompartir', () => {
  test('abre con "Incluir notas" tildado y arma el PDF con notas; el botón espera al archivo', async () => {
    const pendiente = diferida<Blob>()
    armar.mockReturnValue(pendiente.promesa)
    abrir()

    expect(screen.getByRole('dialog', { name: 'Compartir listado' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Incluir notas' })).toBeChecked()
    expect(armar).toHaveBeenCalledWith(expect.objectContaining({ incluirNotas: true, tipo: 'PERIODO' }))
    expect(botonCompartir()).toBeDisabled()
    expect(botonCompartir()).toHaveTextContent('Preparando…')

    await act(async () => pendiente.resolver(pdf()))

    expect(botonCompartir()).toBeEnabled()
    expect(botonCompartir()).toHaveTextContent('Compartir')
  })

  test('destildar "Incluir notas" arma el PDF de nuevo, sin notas, y espera al archivo nuevo', async () => {
    const { user } = abrir()
    await screen.findByRole('button', { name: 'Compartir' })
    const segundo = diferida<Blob>()
    armar.mockReturnValue(segundo.promesa)

    await user.click(screen.getByRole('checkbox', { name: 'Incluir notas' }))

    expect(screen.getByRole('checkbox', { name: 'Incluir notas' })).not.toBeChecked()
    expect(armar).toHaveBeenLastCalledWith(expect.objectContaining({ incluirNotas: false }))
    expect(botonCompartir()).toBeDisabled()
    await act(async () => segundo.resolver(pdf()))
    expect(botonCompartir()).toBeEnabled()
  })

  test('si un PDF viejo termina después del nuevo, se usa el nuevo', async () => {
    const primero = diferida<Blob>()
    const segundo = diferida<Blob>()
    armar.mockReturnValueOnce(primero.promesa).mockReturnValueOnce(segundo.promesa)
    compartir.mockResolvedValue('cancelado')
    const { user } = abrir()

    await user.click(screen.getByRole('checkbox', { name: 'Incluir notas' }))
    await act(async () => segundo.resolver(pdf(20)))
    await act(async () => primero.resolver(pdf(10)))
    await user.click(botonCompartir())

    expect(compartir).toHaveBeenCalledTimes(1)
    expect(compartir.mock.calls[0][0].size).toBe(20)
  })

  test('"Compartir" entrega el archivo ya armado, con el nombre del listado', async () => {
    compartir.mockResolvedValue('cancelado')
    const { user } = abrir()

    await user.click(await screen.findByRole('button', { name: 'Compartir' }))

    expect(compartir).toHaveBeenCalledTimes(1)
    const [archivo, titulo] = compartir.mock.calls[0]
    expect(archivo).toBeInstanceOf(File)
    expect(archivo.name).toBe('listado-clinica-norte-2026-09-30.pdf')
    expect(archivo.type).toBe('application/pdf')
    expect(titulo).toBe('Listado de Clínica Norte')
  })

  test('un doble toque comparte una sola vez', async () => {
    const abierto = diferida<'compartido'>()
    compartir.mockReturnValue(abierto.promesa)
    const { user } = abrir()
    const boton = await screen.findByRole('button', { name: 'Compartir' })

    await user.dblClick(boton)

    expect(compartir).toHaveBeenCalledTimes(1)
    await act(async () => abierto.resolver('compartido'))
  })

  test('si se compartió, cierra el diálogo', async () => {
    compartir.mockResolvedValue('compartido')
    const { user, onCerrar } = abrir()

    await user.click(await screen.findByRole('button', { name: 'Compartir' }))

    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  test('si se descargó, avisa en un mensaje y no cierra', async () => {
    compartir.mockResolvedValue('descargado')
    const { user, onCerrar } = abrir()

    await user.click(await screen.findByRole('button', { name: 'Compartir' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Se descargó el PDF')
    expect(onCerrar).not.toHaveBeenCalled()
  })

  test('si se canceló, no cierra ni muestra nada, y se puede volver a compartir', async () => {
    compartir.mockResolvedValue('cancelado')
    const { user, onCerrar } = abrir()

    await user.click(await screen.findByRole('button', { name: 'Compartir' }))

    expect(onCerrar).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(botonCompartir()).toBeEnabled()
  })

  test('si compartir falla de verdad, lo dice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    compartir.mockRejectedValue(new DOMException('x', 'DataError'))
    const { user } = abrir()

    await user.click(await screen.findByRole('button', { name: 'Compartir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo compartir el PDF')
  })

  test('si no se puede armar el PDF, lo dice y no deja compartir', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    armar.mockRejectedValue(new Error('boom'))
    abrir()

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo armar el PDF')
    expect(botonCompartir()).toBeDisabled()
    expect(consola).toHaveBeenCalled()
  })

  test('Cancelar y Escape cierran', async () => {
    const { user, onCerrar } = abrir()
    await screen.findByRole('button', { name: 'Compartir' })

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.keyboard('{Escape}')

    expect(onCerrar).toHaveBeenCalledTimes(2)
  })

  test('el reclamo se titula "Compartir reclamo" y se nombra con el lugar', async () => {
    compartir.mockResolvedValue('cancelado')
    const user = userEvent.setup()
    render(
      <DialogCompartir
        datos={{ ...datos, tipo: 'RECLAMO', periodo: null, resumen: null }}
        onCerrar={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Compartir reclamo' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Compartir' }))
    expect(compartir.mock.calls[0][0].name).toBe('reclamo-clinica-norte-2026-10-27.pdf')
    expect(compartir.mock.calls[0][1]).toBe('Reclamo a Clínica Norte')
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { guardarAjuste, leerAjuste } from '../../data/ajustes'
import { exportarDatos } from '../../data/copia'
import { db } from '../../data/db'
import { crearLugar } from '../../data/lugares'
import { anotarTrabajo, lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { armarCopia, leerCopia } from '../../domain/copia'
import { compartirArchivo, type ResultadoCompartir } from '../../platform/compartir'
import { leerTextoArchivo } from '../../platform/archivos'
import Copia from './Copia'

vi.mock('../../platform/compartir', () => ({ compartirArchivo: vi.fn() }))
const compartir = vi.mocked(compartirArchivo)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  compartir.mockReset()
  await reiniciarDb()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function renderCopia() {
  render(
    <MemoryRouter>
      <Copia />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

/** Una copia válida hecha en "otro dispositivo": un lugar y un trabajo. Deja la base vacía. */
async function textoCopiaAjena(): Promise<string> {
  await reiniciarDb()
  const lugarId = await crearLugar({
    nombre: 'Consultorio Sur', formaCobro: 'ARANCEL_FIJO', porcentajeBp: null, pagoDesdeDia: 1, pagoHastaDia: 10, diaCierre: 'ULTIMO',
  })
  await anotarTrabajo(lugarId, '2026-10-05')
  const texto = JSON.stringify(armarCopia(await exportarDatos(), new Date(2026, 8, 15, 10)))
  await reiniciarDb()
  return texto
}

const archivoJson = (texto: string) => new File([texto], 'copia.json', { type: 'application/json' })
const entradaArchivo = () => screen.getByLabelText('Restaurar copia') as HTMLInputElement

describe('última copia', () => {
  test('sin copias dice que nunca hiciste una', async () => {
    renderCopia()
    expect(await screen.findByText('Nunca hiciste una copia')).toBeInTheDocument()
  })

  test.each([
    [new Date(2026, 9, 27, 8), 'Última copia: hoy'],
    [new Date(2026, 9, 26, 23, 30), 'Última copia: ayer'],
    [new Date(2026, 9, 22, 9), 'Última copia: hace 5 días'],
  ])('%s → %s (por día local, no por horas)', async (cuando, texto) => {
    await guardarAjuste('ultimaCopia', cuando.toISOString())
    renderCopia()
    expect(await screen.findByText(texto)).toBeInTheDocument()
  })

  test('una fecha ilegible cuenta como nunca', async () => {
    await guardarAjuste('ultimaCopia', 'basura')
    renderCopia()
    expect(await screen.findByText('Nunca hiciste una copia')).toBeInTheDocument()
  })
})

describe('hacer copia', () => {
  test('el botón espera con "Preparando…" y se habilita cuando el archivo está listo', async () => {
    renderCopia()
    expect(screen.getByRole('button', { name: 'Preparando…' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: 'Hacer copia' })).toBeEnabled()
  })

  test('comparte un JSON con todos los datos ya armado y guarda ultimaCopia', async () => {
    const lugarId = await lugarFijo()
    await anotarTrabajo(lugarId, '2026-10-20')
    await guardarAjuste('pinHash', 'secreto')
    compartir.mockResolvedValue('compartido')
    const user = renderCopia()

    await user.click(await screen.findByRole('button', { name: 'Hacer copia' }))

    expect(compartir).toHaveBeenCalledTimes(1)
    const [archivo] = compartir.mock.calls[0]
    expect(archivo.name).toBe('gestion-dinero-2026-10-27.json')
    expect(archivo.type).toBe('application/json')
    const leida = leerCopia(await leerTextoArchivo(archivo))
    expect(leida.ok).toBe(true)
    if (!leida.ok) return
    expect(leida.copia.datos.lugares).toHaveLength(1)
    expect(leida.copia.datos.trabajos).toHaveLength(1)
    expect(leida.copia.datos.ajustes.map((a) => a.clave)).not.toContain('pinHash')

    expect(await screen.findByText('Copia guardada')).toBeInTheDocument()
    expect(await leerAjuste<string | null>('ultimaCopia', null)).toBe(new Date(2026, 9, 27, 12).toISOString())
    expect(await screen.findByText('Última copia: hoy')).toBeInTheDocument()
  })

  test.each<[ResultadoCompartir, boolean]>([
    ['compartido', true],
    ['descargado', true],
    ['cancelado', false],
  ])('si el resultado es %s, ultimaCopia se guarda: %s', async (resultado, seGuarda) => {
    compartir.mockResolvedValue(resultado)
    const user = renderCopia()

    await user.click(await screen.findByRole('button', { name: 'Hacer copia' }))

    await waitFor(() => expect(compartir).toHaveBeenCalled())
    if (seGuarda) expect(await screen.findByText('Copia guardada')).toBeInTheDocument()
    else await waitFor(() => expect(screen.getByRole('button', { name: 'Hacer copia' })).toBeEnabled())
    expect(await leerAjuste<string | null>('ultimaCopia', null)).toBe(seGuarda ? new Date().toISOString() : null)
    if (!seGuarda) expect(screen.queryByText('Copia guardada')).not.toBeInTheDocument()
  })

  test('un doble toque no abre dos veces el menú de compartir', async () => {
    let terminar: (r: ResultadoCompartir) => void = () => undefined
    compartir.mockReturnValue(new Promise<ResultadoCompartir>((ok) => (terminar = ok)))
    const user = renderCopia()
    const boton = await screen.findByRole('button', { name: 'Hacer copia' })

    await user.dblClick(boton)
    expect(compartir).toHaveBeenCalledTimes(1)

    terminar('compartido')
    expect(await screen.findByText('Copia guardada')).toBeInTheDocument()
  })

  test('si compartir falla muestra un error y no guarda ultimaCopia', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    compartir.mockRejectedValue(new Error('boom'))
    const user = renderCopia()

    await user.click(await screen.findByRole('button', { name: 'Hacer copia' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo hacer la copia. Probá de nuevo.')
    expect(await leerAjuste<string | null>('ultimaCopia', null)).toBeNull()
  })

  test('el archivo se rearma si cambian los datos', async () => {
    compartir.mockResolvedValue('cancelado')
    const user = renderCopia()
    await screen.findByRole('button', { name: 'Hacer copia' })
    await lugarFijo()

    await waitFor(async () => {
      await user.click(screen.getByRole('button', { name: 'Hacer copia' }))
      const leida = leerCopia(await leerTextoArchivo(compartir.mock.calls.at(-1)![0]))
      expect(leida.ok && leida.copia.datos.lugares.length).toBe(1)
    })
  })
})

describe('restaurar copia', () => {
  test('un archivo inválido muestra el error y no toca los datos', async () => {
    await lugarFijo()
    const antes = await exportarDatos()
    const user = renderCopia()
    await screen.findByRole('button', { name: 'Hacer copia' })

    await user.upload(entradaArchivo(), archivoJson('esto no es json'))

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo no es una copia válida.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await exportarDatos()).toEqual(antes)
  })

  test('una copia de una versión más nueva muestra el mensaje de actualizar', async () => {
    const texto = JSON.stringify({ app: 'gestion-dinero', version: 99, creadoEn: new Date().toISOString(), datos: {} })
    const user = renderCopia()
    await screen.findByRole('button', { name: 'Hacer copia' })

    await user.upload(entradaArchivo(), archivoJson(texto))

    expect(await screen.findByRole('alert')).toHaveTextContent('Actualizá la app y volvé a intentar.')
  })

  test('puede elegirse el mismo archivo otra vez: la entrada queda vacía después de cada intento', async () => {
    const user = renderCopia()
    await screen.findByRole('button', { name: 'Hacer copia' })

    await user.upload(entradaArchivo(), archivoJson('{'))
    await screen.findByRole('alert')

    expect(entradaArchivo().value).toBe('')
    expect(entradaArchivo().files).toHaveLength(0)
  })

  test('una copia válida muestra el resumen, pide confirmación y reemplaza todo', async () => {
    const texto = await textoCopiaAjena()
    await lugarFijo('ULTIMO', 'Lugar viejo')
    const user = renderCopia()
    await screen.findByRole('button', { name: 'Hacer copia' })

    await user.upload(entradaArchivo(), archivoJson(texto))

    const dialogo = await screen.findByRole('dialog', { name: '¿Restaurar esta copia?' })
    expect(within(dialogo).getByText('Esto reemplaza todos tus datos actuales.')).toBeInTheDocument()
    expect(within(dialogo).getByText(/15 sep 2026/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/1 lugar\b/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/1 trabajo\b/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/0 movimientos/)).toBeInTheDocument()
    // Todavía no se tocó nada.
    expect((await db.lugares.toArray()).map((l) => l.nombre)).toEqual(['Lugar viejo'])

    await user.click(within(dialogo).getByRole('button', { name: 'Restaurar' }))

    expect(await screen.findByText('Listo: restauramos tus datos')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await db.lugares.toArray()).map((l) => l.nombre)).toEqual(['Consultorio Sur'])
    expect(await db.trabajos.count()).toBe(1)
  })

  test('cancelar la confirmación no cambia nada', async () => {
    const texto = await textoCopiaAjena()
    await lugarFijo('ULTIMO', 'Lugar viejo')
    const user = renderCopia()
    await screen.findByRole('button', { name: 'Hacer copia' })
    await user.upload(entradaArchivo(), archivoJson(texto))

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Listo: restauramos tus datos')).not.toBeInTheDocument()
    expect((await db.lugares.toArray()).map((l) => l.nombre)).toEqual(['Lugar viejo'])
  })

  test('si la restauración falla avisa y los datos siguen como estaban', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const texto = await textoCopiaAjena()
    await lugarFijo('ULTIMO', 'Lugar viejo')
    const user = renderCopia()
    await screen.findByRole('button', { name: 'Hacer copia' })
    await user.upload(entradaArchivo(), archivoJson(texto))
    const dialogo = await screen.findByRole('dialog')
    // Falla a mitad de la transacción: Dexie la aborta y no queda nada a medias.
    vi.spyOn(db.trabajos, 'bulkAdd').mockRejectedValue(new Error('disco lleno'))

    await user.click(within(dialogo).getByRole('button', { name: 'Restaurar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo restaurar la copia. Tus datos no cambiaron.')
    expect((await db.lugares.toArray()).map((l) => l.nombre)).toEqual(['Lugar viejo'])
  })
})

describe('recordatorio', () => {
  test('por defecto cada 7 días, con las 4 opciones', async () => {
    renderCopia()
    const selector = await screen.findByRole('combobox', { name: 'Recordatorio de copia' })
    expect(selector).toHaveValue('7')
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Cada 7 días', 'Cada 14 días', 'Cada 30 días', 'Desactivado',
    ])
  })

  test('muestra lo guardado y guarda al elegir', async () => {
    await guardarAjuste('recordatorioCopiaDias', 30)
    const user = renderCopia()
    const selector = await screen.findByRole('combobox', { name: 'Recordatorio de copia' })
    expect(selector).toHaveValue('30')

    await user.selectOptions(selector, 'Desactivado')
    await waitFor(async () => expect(await leerAjuste('recordatorioCopiaDias', 7)).toBe(0))
    await user.selectOptions(selector, 'Cada 14 días')
    await waitFor(async () => expect(await leerAjuste('recordatorioCopiaDias', 7)).toBe(14))
  })
})

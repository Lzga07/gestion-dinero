import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { archivarLugar } from '../../data/lugares'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { compartirArchivo, type ResultadoCompartir } from '../../platform/compartir'
import { leerTextoArchivo } from '../../platform/archivos'
import Mas from './Mas'

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

function renderMas() {
  render(
    <MemoryRouter>
      <Mas />
    </MemoryRouter>,
  )
}

describe('lista', () => {
  test('las opciones llevan a su pantalla', async () => {
    renderMas()
    expect(await screen.findByRole('link', { name: /Copia de seguridad/ })).toHaveAttribute('href', '/mas/copia')
    expect(screen.getByRole('link', { name: /Categorías/ })).toHaveAttribute('href', '/mas/categorias')
    expect(screen.getByRole('link', { name: /Cómo instalar la app/ })).toHaveAttribute('href', '/mas/instalar')
  })

  test('el PIN se ve pero todavía no se puede abrir, y lo dice para lectores de pantalla', async () => {
    renderMas()
    const pin = await screen.findByRole('button', { name: /PIN/ })
    expect(pin).toBeDisabled()
    expect(pin).toHaveAccessibleDescription('Disponible pronto')
  })

  test('Lugares archivados lleva a Lugares con los archivados abiertos', async () => {
    const id = await lugarFijo('ULTIMO', 'Clínica Vieja')
    await archivarLugar(id, true)
    renderMas()

    const enlace = await screen.findByRole('link', { name: /Lugares archivados/ })
    expect(enlace).toHaveAttribute('href', '/lugares?archivados=1')
    expect(enlace).toHaveTextContent('1 archivado')
  })

  test('sin lugares archivados la opción queda deshabilitada y dice "Ninguno"', async () => {
    await lugarFijo()
    renderMas()

    const boton = await screen.findByRole('button', { name: /Lugares archivados/ })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAccessibleDescription('Ninguno')
  })
})

describe('recordatorios en el calendario', () => {
  test('hay un botón por lugar activo, y los archivados no aparecen', async () => {
    await lugarFijo('ULTIMO', 'Clínica Centro')
    await lugarFijo('ULTIMO', 'Consultorio Sur')
    const viejo = await lugarFijo('ULTIMO', 'Clínica Vieja')
    await archivarLugar(viejo, true)
    renderMas()

    const seccion = await screen.findByRole('region', { name: 'Recordatorios en el calendario' })
    expect(within(seccion).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Agregar al calendario · Clínica Centro',
      'Agregar al calendario · Consultorio Sur',
    ])
    expect(within(seccion).getByText(/se repite todos los meses el último día del rango de pago/)).toBeInTheDocument()
  })

  test('sin lugares activos lo explica y no muestra botones', async () => {
    renderMas()
    const seccion = await screen.findByRole('region', { name: 'Recordatorios en el calendario' })
    expect(within(seccion).queryByRole('button')).not.toBeInTheDocument()
    expect(within(seccion).getByText('Cuando agregues un lugar vas a poder crear su recordatorio acá.')).toBeInTheDocument()
  })

  test('el toque comparte directo el .ics ya armado, sin esperar nada antes', async () => {
    await lugarFijo('ULTIMO', 'Clínica Centro')
    compartir.mockResolvedValue('compartido')
    renderMas()
    const boton = await screen.findByRole('button', { name: 'Agregar al calendario · Clínica Centro' })

    // fireEvent es síncrono: si compartirArchivo no se llamó en el mismo toque, Safari de iPhone lo rechazaría.
    fireEvent.click(boton)

    expect(compartir).toHaveBeenCalledTimes(1)
    const [archivo, titulo] = compartir.mock.calls[0]
    expect(archivo.name).toBe('pago-clinica-centro.ics')
    expect(archivo.type).toBe('text/calendar')
    expect(titulo).toBe('Recordatorio de pago de Clínica Centro')
    const ics = await leerTextoArchivo(archivo)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Revisar pago de Clínica Centro')
    expect(ics).toContain('DTSTART:20261031T100000')
    expect(await screen.findByText('Listo: compartiste el recordatorio de Clínica Centro')).toBeInTheDocument()
  })

  test.each<[ResultadoCompartir, string | null]>([
    ['descargado', 'Se descargó el recordatorio de Clínica Centro. Abrilo para agregarlo al calendario.'],
    ['cancelado', null],
  ])('si el resultado es %s', async (resultado, mensaje) => {
    await lugarFijo('ULTIMO', 'Clínica Centro')
    compartir.mockResolvedValue(resultado)
    const user = userEvent.setup()
    renderMas()

    await user.click(await screen.findByRole('button', { name: 'Agregar al calendario · Clínica Centro' }))

    if (mensaje) expect(await screen.findByText(mensaje)).toBeInTheDocument()
    else expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  test('si compartir falla avisa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await lugarFijo('ULTIMO', 'Clínica Centro')
    compartir.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderMas()

    await user.click(await screen.findByRole('button', { name: 'Agregar al calendario · Clínica Centro' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo crear el recordatorio. Probá de nuevo.')
  })
})

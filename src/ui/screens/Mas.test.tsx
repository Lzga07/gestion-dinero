import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { archivarLugar } from '../../data/lugares'
import { marcarNoPagado } from '../../data/pagos'
import { crearPin } from '../../data/pin'
import { anotarTrabajo, lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { compartirArchivo, type ResultadoCompartir } from '../../platform/compartir'
import { leerTextoArchivo } from '../../platform/archivos'
import ElegirLugar from './anteriores/ElegirLugar'
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

  test('el PIN lleva a su pantalla y dice si está desactivado', async () => {
    renderMas()
    const pin = await screen.findByRole('link', { name: /PIN/ })
    expect(pin).toHaveAttribute('href', '/mas/pin')
    expect(pin).toHaveAccessibleDescription('Desactivado')
  })

  test('con PIN puesto el detalle dice "Activado"', async () => {
    await crearPin('1234')
    renderMas()
    expect(await screen.findByRole('link', { name: /PIN/ })).toHaveAccessibleDescription('Activado')
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

describe('Me deben', () => {
  test('sin deudas dice "Nada" y lleva a la pantalla', async () => {
    renderMas()
    const fila = await screen.findByRole('link', { name: /Me deben/ })
    expect(fila).toHaveAttribute('href', '/mas/me-deben')
    expect(fila).toHaveAccessibleDescription('Nada')
  })

  test('con deudas muestra el total de todas, también las de lugares archivados', async () => {
    const centro = await lugarFijo('ULTIMO', 'Clínica Centro')
    const viejo = await lugarFijo('ULTIMO', 'Clínica Vieja')
    await marcarNoPagado(await anotarTrabajo(centro, '2026-06-10', 5000000))
    await marcarNoPagado(await anotarTrabajo(viejo, '2026-09-10', 2500000))
    await archivarLugar(viejo, true)
    renderMas()

    expect(await screen.findByRole('link', { name: /Me deben/ })).toHaveTextContent('$ 75.000')
  })
})

describe('Cargar meses anteriores', () => {
  test('la fila lleva a elegir el lugar', async () => {
    renderMas()
    const fila = await screen.findByRole('link', { name: /Cargar meses anteriores/ })
    expect(fila).toHaveAttribute('href', '/mas/anteriores')
  })
})

/** Muestra dónde terminó la navegación. */
function Ubicacion() {
  const { pathname } = useLocation()
  return <p>{`Ubicación: ${pathname}`}</p>
}

describe('elegir lugar para cargar meses anteriores', () => {
  function renderElegir() {
    render(
      <MemoryRouter initialEntries={['/mas/anteriores']}>
        <Routes>
          <Route path="/mas/anteriores" element={<ElegirLugar />} />
          <Route path="*" element={<Ubicacion />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  test('con un solo lugar activo va directo a su pantalla', async () => {
    const id = await lugarFijo('ULTIMO', 'Clínica Centro')
    renderElegir()
    expect(await screen.findByText(`Ubicación: /lugares/${id}/anteriores`)).toBeInTheDocument()
  })

  test('con varios lugares activos los lista para elegir, sin los archivados', async () => {
    const centro = await lugarFijo('ULTIMO', 'Clínica Centro')
    const sur = await lugarFijo('ULTIMO', 'Consultorio Sur')
    const viejo = await lugarFijo('ULTIMO', 'Clínica Vieja')
    await archivarLugar(viejo, true)
    renderElegir()

    const enlaces = await screen.findAllByRole('link', { name: /Clínica|Consultorio/ })
    expect(enlaces.map((e) => [e.textContent, e.getAttribute('href')])).toEqual([
      ['Clínica Centro', `/lugares/${centro}/anteriores`],
      ['Consultorio Sur', `/lugares/${sur}/anteriores`],
    ])
  })

  test('un lugar activo y otro archivado va directo al activo', async () => {
    const centro = await lugarFijo('ULTIMO', 'Clínica Centro')
    const viejo = await lugarFijo('ULTIMO', 'Clínica Vieja')
    await archivarLugar(viejo, true)
    renderElegir()
    expect(await screen.findByText(`Ubicación: /lugares/${centro}/anteriores`)).toBeInTheDocument()
  })

  test.each([
    ['sin lugares', false],
    ['con todos los lugares archivados', true],
  ])('%s pide agregar uno primero', async (_, conArchivado) => {
    if (conArchivado) await archivarLugar(await lugarFijo('ULTIMO', 'Clínica Vieja'), true)
    renderElegir()

    expect(await screen.findByText('Primero agregá un lugar donde trabajás')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar lugar' })).toHaveAttribute('href', '/lugares/nuevo')
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

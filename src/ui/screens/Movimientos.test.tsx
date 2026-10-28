import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { guardarCategoria } from '../../data/categorias'
import { guardarMovimiento } from '../../data/movimientos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { pesosJuntos } from '../pesos'
import Movimientos from './Movimientos'
import { anotar } from './periodo/test-fixtures'

function renderMovimientos(ruta = '/movimientos') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/movimientos" element={<Movimientos />} />
        <Route path="/trabajo/nuevo" element={<h1>Pantalla trabajo nuevo</h1>} />
        <Route path="/trabajo/:id" element={<h1>Pantalla editar trabajo</h1>} />
        <Route path="/movimiento/nuevo" element={<h1>Pantalla movimiento nuevo</h1>} />
        <Route path="/movimiento/:id" element={<h1>Pantalla editar movimiento</h1>} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

beforeEach(async () => {
  // Hoy es 27 de octubre de 2026; solo se simula la fecha, no los timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 27, 12))
  await reiniciarDb()
})
afterEach(() => vi.useRealTimers())

/** Escenario de la maqueta: un trabajo, un gasto de trabajo, uno personal y un ingreso, en dos días. */
async function escenario() {
  const lugarId = await lugarFijo('ULTIMO', 'Clínica Centro')
  const materiales = await guardarCategoria({ nombre: 'Materiales', tipo: 'GASTO', ambito: 'TRABAJO', icono: '🧰', color: '', orden: 0 })
  const supermercado = await guardarCategoria({ nombre: 'Supermercado', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🛒', color: '', orden: 1 })
  const venta = await guardarCategoria({ nombre: 'Venta usado', tipo: 'INGRESO', ambito: null, icono: '💵', color: '', orden: 2 })
  await anotar(lugarId, '2026-10-27', 'Arreglo', 38000)
  await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-27', monto: 2200000, categoriaId: materiales, nota: '' })
  await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-27', monto: 4150000, categoriaId: supermercado, nota: '' })
  await guardarMovimiento({ tipo: 'INGRESO', fecha: '2026-10-26', monto: 6000000, categoriaId: venta, nota: '' })
  await anotar(lugarId, '2026-09-30', 'Septiembre', 11100) // otro mes: no aparece
}

describe('lista', () => {
  test('lista une trabajos, ingresos y gastos agrupados por día con signo', async () => {
    await escenario()
    renderMovimientos()

    const hoy = await screen.findByRole('region', { name: 'Hoy' })
    expect(within(hoy).getAllByRole('link')).toHaveLength(3)
    // Trabajo: descripción arriba, lugar abajo, con + (te corresponde); el nombre accesible lleva todo
    const trabajo = within(hoy).getByRole('link', { name: `Arreglo Clínica Centro + ${pesosJuntos(3800000)}` })
    expect(trabajo.querySelector('.mov-fila__titulo')).toHaveTextContent('Arreglo')
    expect(trabajo.querySelector('.mov-fila__detalle')).toHaveTextContent('Clínica Centro')
    expect(trabajo.textContent).toContain(`+ ${pesosJuntos(3800000)}`)
    expect(trabajo).toHaveAttribute('href', expect.stringMatching(/^\/trabajo\/.+/))
    // Gastos: − y, en el segundo renglón, "trabajo" / "personal"
    const materiales = within(hoy).getByRole('link', { name: `Materiales trabajo − ${pesosJuntos(2200000)}` })
    expect(materiales.querySelector('.mov-fila__titulo')).toHaveTextContent('Materiales')
    expect(materiales.querySelector('.mov-fila__detalle')).toHaveTextContent(/^trabajo$/)
    expect(materiales).toHaveAttribute('href', expect.stringMatching(/^\/movimiento\/.+/))
    const supermercado = within(hoy).getByRole('link', { name: /Supermercado/ })
    expect(supermercado.textContent).toContain(`− ${pesosJuntos(4150000)}`)
    expect(supermercado.querySelector('.mov-fila__detalle')).toHaveTextContent(/^personal$/)

    const ayer = screen.getByRole('region', { name: 'Ayer' })
    const venta = within(ayer).getByRole('link', { name: /Venta usado/ })
    expect(venta.textContent).toContain(`+ ${pesosJuntos(6000000)}`)
    expect(venta.querySelector('.mov-fila__detalle')).toHaveTextContent(/^otro ingreso$/)

    // Lo de septiembre no está, y Hoy va antes que Ayer.
    expect(screen.queryByRole('link', { name: /Septiembre/ })).not.toBeInTheDocument()
    expect(hoy.compareDocumentPosition(ayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('el segundo renglón de un gasto o ingreso suma la nota después de la etiqueta', async () => {
    const combustible = await guardarCategoria({ nombre: 'Combustible', tipo: 'GASTO', ambito: 'TRABAJO', icono: '⛽', color: '', orden: 0 })
    const venta = await guardarCategoria({ nombre: 'Venta usado', tipo: 'INGRESO', ambito: null, icono: '💵', color: '', orden: 1 })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-27', monto: 500000, categoriaId: combustible, nota: 'Nafta ida y vuelta' })
    await guardarMovimiento({ tipo: 'INGRESO', fecha: '2026-10-27', monto: 700000, categoriaId: venta, nota: 'Monitor' })
    renderMovimientos()

    const gasto = await screen.findByRole('link', { name: /Combustible/ })
    expect(gasto.querySelector('.mov-fila__detalle')).toHaveTextContent('trabajo · Nafta ida y vuelta')
    expect(gasto).toHaveAccessibleName(`Combustible trabajo · Nafta ida y vuelta − ${pesosJuntos(500000)}`)
    expect(screen.getByRole('link', { name: /Venta usado/ }).querySelector('.mov-fila__detalle')).toHaveTextContent(
      'otro ingreso · Monitor',
    )
  })

  test('los días anteriores a ayer se titulan "20 oct"', async () => {
    const lugarId = await lugarFijo()
    await anotar(lugarId, '2026-10-20', 'Corona', 45000)
    renderMovimientos()
    expect(await screen.findByRole('region', { name: '20 oct' })).toBeInTheDocument()
  })

  test('el selector de mes va para atrás y para adelante', async () => {
    await escenario()
    const user = renderMovimientos()
    expect(await screen.findByText('Octubre 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Septiembre/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Materiales/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Materiales/ })).toBeInTheDocument()
  })

  test('un mes sin movimientos lo dice', async () => {
    renderMovimientos()
    expect(await screen.findByText('No hay movimientos en este mes')).toBeInTheDocument()
  })
})

describe('filtro', () => {
  test('filtro Gastos oculta ingresos y trabajos', async () => {
    await escenario()
    const user = renderMovimientos()
    await screen.findByRole('link', { name: /Arreglo/ })

    await user.click(screen.getByRole('button', { name: 'Gastos' }))
    expect(screen.queryByRole('link', { name: /Arreglo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Venta usado/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Materiales/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Supermercado/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ayer' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ingresos' }))
    expect(screen.getByRole('link', { name: /Arreglo/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Venta usado/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Materiales/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Todo' }))
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })
})

describe('mes y filtro desde la dirección', () => {
  test('?mes=2026-09&filtro=GASTOS abre septiembre mostrando solo gastos', async () => {
    await escenario()
    const lugarId = await lugarFijo('ULTIMO', 'Otro lugar')
    const combustible = await guardarCategoria({ nombre: 'Combustible', tipo: 'GASTO', ambito: 'TRABAJO', icono: '⛽', color: '', orden: 3 })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-09-12', monto: 500000, categoriaId: combustible, nota: '' })
    await anotar(lugarId, '2026-09-13', 'Trabajo de septiembre', 1000)
    renderMovimientos('/movimientos?mes=2026-09&filtro=GASTOS')

    expect(await screen.findByText('Septiembre 2026')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Combustible/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gastos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('link', { name: /Septiembre|Trabajo de septiembre/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Materiales/ })).not.toBeInTheDocument()
  })

  test('valores inválidos se ignoran y quedan el mes actual y Todo', async () => {
    await escenario()
    renderMovimientos('/movimientos?mes=2026-13&filtro=CUALQUIERA')

    expect(await screen.findByText('Octubre 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('link', { name: /Arreglo/ })).toBeInTheDocument()
  })
})

describe('+ Nuevo', () => {
  test('abre un menú con Trabajo, Gasto y Otro ingreso', async () => {
    const user = renderMovimientos()
    await user.click(await screen.findByRole('button', { name: '+ Nuevo' }))

    const menu = screen.getByRole('dialog', { name: '¿Qué querés cargar?' })
    expect(within(menu).getByRole('link', { name: 'Trabajo' })).toHaveAttribute('href', '/trabajo/nuevo')
    expect(within(menu).getByRole('link', { name: 'Gasto' })).toHaveAttribute('href', '/movimiento/nuevo?tipo=GASTO')
    expect(within(menu).getByRole('link', { name: 'Otro ingreso' })).toHaveAttribute('href', '/movimiento/nuevo?tipo=INGRESO')

    await user.click(within(menu).getByRole('link', { name: 'Gasto' }))
    expect(await screen.findByRole('heading', { name: 'Pantalla movimiento nuevo' })).toBeInTheDocument()
  })

  test('Cancelar cierra el menú', async () => {
    const user = renderMovimientos()
    await user.click(await screen.findByRole('button', { name: '+ Nuevo' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('al abrir el foco va a la primera opción', async () => {
    const user = renderMovimientos()
    await user.click(await screen.findByRole('button', { name: '+ Nuevo' }))
    expect(screen.getByRole('link', { name: 'Trabajo' })).toHaveFocus()
  })

  test('Tab desde Cancelar vuelve a la primera opción y Shift+Tab desde la primera va a Cancelar', async () => {
    const user = renderMovimientos()
    await user.click(await screen.findByRole('button', { name: '+ Nuevo' }))

    await user.tab()
    expect(screen.getByRole('link', { name: 'Gasto' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Otro ingreso' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Trabajo' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  test('Escape cierra el menú y devuelve el foco a "+ Nuevo"', async () => {
    const user = renderMovimientos()
    const nuevo = await screen.findByRole('button', { name: '+ Nuevo' })
    await user.click(nuevo)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(nuevo).toHaveFocus()
  })

  test('tocar el fondo cierra el menú y devuelve el foco a "+ Nuevo"', async () => {
    const user = renderMovimientos()
    const nuevo = await screen.findByRole('button', { name: '+ Nuevo' })
    await user.click(nuevo)

    const fondo = screen.getByRole('dialog').parentElement as HTMLElement
    await user.pointer({ keys: '[MouseLeft]', target: fondo })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(nuevo).toHaveFocus()
  })

  test('Cancelar devuelve el foco a "+ Nuevo"', async () => {
    const user = renderMovimientos()
    const nuevo = await screen.findByRole('button', { name: '+ Nuevo' })
    await user.click(nuevo)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(nuevo).toHaveFocus()
  })
})

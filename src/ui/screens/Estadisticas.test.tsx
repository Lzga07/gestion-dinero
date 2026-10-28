import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { guardarCategoria } from '../../data/categorias'
import { archivarLugar } from '../../data/lugares'
import { guardarMovimiento } from '../../data/movimientos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { pesosJuntos } from '../pesos'
import Estadisticas from './Estadisticas'
import { anotar } from './periodo/test-fixtures'

function renderEstadisticas() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/estadisticas']}>
      <Routes>
        <Route path="/estadisticas" element={<Estadisticas />} />
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

/** Barra (botón de mes) del gráfico de ganancias. */
const barraMes = (mes: string) => screen.getByRole('button', { name: new RegExp(`^${mes} 20\\d\\d`, 'i') })
const segmentos = (barra: HTMLElement) => [...barra.querySelectorAll<HTMLElement>('[data-lugar]')]
/** Un monto como fragmento de expresión regular (el espacio no cortable se normaliza al calcular la descripción). */
const rx = (monto: string) => monto.replace(/[$.]/g, (c) => `\\${c}`).replace(/\u00a0/g, '\\s')
const color = (el: HTMLElement) => el.style.getPropertyValue('--color-lugar')

async function escenarioLugares() {
  const centro = await lugarFijo('ULTIMO', 'Clínica Centro')
  const sur = await lugarFijo('ULTIMO', 'Consultorio Sur')
  const viejo = await lugarFijo('ULTIMO', 'Lugar viejo')
  await anotar(centro, '2026-08-10', 'Arreglo', 100000)
  await anotar(viejo, '2026-08-12', 'Limpieza', 20000)
  await anotar(centro, '2026-09-15', 'Corona', 50000)
  await anotar(sur, '2026-09-20', 'Extracción', 30000)
  await anotar(centro, '2026-10-05', 'Arreglo', 38000)
  await anotar(sur, '2026-10-06', 'Corona', 45000)
  await archivarLugar(viejo, true) // archivado: su historia sigue en el gráfico
}

describe('cuánto ganás por lugar', () => {
  test('una barra por mes con un segmento por lugar y leyenda', async () => {
    await escenarioLugares()
    const user = renderEstadisticas()

    // Últimos 4 meses terminando en el actual: nunca meses futuros.
    const grafico = await screen.findByRole('group', { name: 'Ganancia por mes y por lugar' })
    const barras = within(grafico).getAllByRole('button')
    expect(barras.map((b) => b.getAttribute('aria-label'))).toEqual([
      `julio 2026: ${pesosJuntos(0)}`,
      `agosto 2026: ${pesosJuntos(12000000)}`,
      `septiembre 2026: ${pesosJuntos(8000000)}`,
      `octubre 2026: ${pesosJuntos(8300000)}`,
    ])

    // Un segmento por lugar con trabajos ese mes (el archivado también cuenta en agosto).
    expect(segmentos(barraMes('julio'))).toHaveLength(0)
    expect(segmentos(barraMes('agosto')).map((s) => s.dataset.lugar).sort()).toEqual(['Clínica Centro', 'Lugar viejo'])
    expect(segmentos(barraMes('septiembre'))).toHaveLength(2)
    expect(segmentos(barraMes('octubre'))).toHaveLength(2)

    // La leyenda lista los tres lugares, y el color de cada segmento es el de su lugar en la leyenda.
    const leyenda = screen.getByRole('list', { name: 'Lugares' })
    const muestras = [...leyenda.querySelectorAll<HTMLElement>('[data-lugar]')]
    expect(
      within(leyenda)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
        .sort(),
    ).toEqual(['Clínica Centro', 'Consultorio Sur', 'Lugar viejo'])
    expect(new Set(muestras.map(color)).size).toBe(3)
    for (const seg of segmentos(barraMes('agosto'))) {
      const muestra = muestras.find((m) => m.dataset.lugar === seg.dataset.lugar)
      expect(color(seg)).toBe(color(muestra!))
    }

    // Texto alternativo con los totales (para lectores de pantalla).
    expect(grafico).toHaveAccessibleDescription(
      new RegExp(`agosto 2026: ${rx(pesosJuntos(12000000))} .*Lugar viejo ${rx(pesosJuntos(2000000))}`),
    )

    // Tocar un mes muestra su desglose por lugar, de mayor a menor, y el ranking pasa a ese mes.
    await user.click(barraMes('septiembre'))
    expect(barraMes('septiembre')).toHaveAttribute('aria-pressed', 'true')
    const desglose = screen.getByRole('region', { name: 'Septiembre 2026' })
    const filas = within(desglose)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(filas).toEqual([`Clínica Centro${pesosJuntos(5000000)}`, `Consultorio Sur${pesosJuntos(3000000)}`])
    expect(screen.getByRole('heading', { name: 'En qué gastás más · septiembre' })).toBeInTheDocument()

    // 12 meses: doce barras, y la selección sigue siendo septiembre.
    await user.click(screen.getByRole('button', { name: '12 meses' }))
    expect(within(grafico).getAllByRole('button')).toHaveLength(12)
    expect(barraMes('septiembre')).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '4 meses' }))
    expect(within(grafico).getAllByRole('button')).toHaveLength(4)
  })

  test('al achicar el rango, un mes que quedó afuera vuelve al mes actual', async () => {
    const lugarId = await lugarFijo()
    await anotar(lugarId, '2026-02-10', 'Arreglo', 10000)
    const user = renderEstadisticas()

    await user.click(await screen.findByRole('button', { name: '12 meses' }))
    await user.click(barraMes('febrero'))
    expect(screen.getByRole('region', { name: 'Febrero 2026' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '4 meses' }))
    expect(screen.getByRole('heading', { name: 'En qué gastás más · octubre' })).toBeInTheDocument()
  })
})

describe('en qué gastás más', () => {
  async function escenarioGastos() {
    const materiales = await guardarCategoria({ nombre: 'Materiales', tipo: 'GASTO', ambito: 'TRABAJO', icono: '🧰', color: '', orden: 0 })
    const combustible = await guardarCategoria({ nombre: 'Combustible', tipo: 'GASTO', ambito: 'TRABAJO', icono: '⛽', color: '', orden: 1 })
    const supermercado = await guardarCategoria({ nombre: 'Supermercado', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🛒', color: '', orden: 2 })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-03', monto: 6400000, categoriaId: materiales, nota: '' })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-04', monto: 5200000, categoriaId: combustible, nota: '' })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 7000000, categoriaId: supermercado, nota: '' })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-20', monto: 5000000, categoriaId: supermercado, nota: '' })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-09-20', monto: 900000, categoriaId: materiales, nota: '' })
  }

  test('ranking de gastos de mayor a menor y filtro Personal', async () => {
    await escenarioGastos()
    const user = renderEstadisticas()

    expect(await screen.findByRole('heading', { name: 'En qué gastás más · octubre' })).toBeInTheDocument()
    const ranking = screen.getByRole('list', { name: 'Gastos por categoría' })
    const filas = () => within(ranking).getAllByRole('link').map((a) => a.textContent)
    expect(filas()).toEqual([
      `Supermercado${pesosJuntos(12000000)}`,
      `Materiales${pesosJuntos(6400000)}`,
      `Combustible${pesosJuntos(5200000)}`,
    ])

    await user.click(screen.getByRole('button', { name: 'Personal' }))
    expect(filas()).toEqual([`Supermercado${pesosJuntos(12000000)}`])

    await user.click(screen.getByRole('button', { name: 'Trabajo' }))
    expect(filas()).toEqual([`Materiales${pesosJuntos(6400000)}`, `Combustible${pesosJuntos(5200000)}`])

    await user.click(screen.getByRole('button', { name: 'Todos' }))
    expect(filas()).toHaveLength(3)
  })

  test('cada categoría lleva a Movimientos, filtrado a gastos del mes elegido', async () => {
    await escenarioGastos()
    await anotar(await lugarFijo(), '2026-10-05', 'Arreglo', 10000) // sin trabajos no hay gráfico de meses para tocar
    const user = renderEstadisticas()

    const materiales = await screen.findByRole('link', { name: /Materiales/ })
    expect(materiales).toHaveAttribute('href', '/movimientos?mes=2026-10&filtro=GASTOS')

    // Con septiembre elegido en el gráfico, el ranking es el de septiembre y el enlace también.
    await user.click(screen.getByRole('button', { name: /^septiembre 2026/ }))
    const deSeptiembre = screen.getByRole('link', { name: /Materiales/ })
    expect(deSeptiembre).toHaveTextContent(new RegExp(rx(pesosJuntos(900000))))
    expect(deSeptiembre).toHaveAttribute('href', '/movimientos?mes=2026-09&filtro=GASTOS')
  })
})

describe('sin datos', () => {
  test('sin datos muestra "Todavía no hay datos para este período"', async () => {
    renderEstadisticas()
    // Una vez por gráfico.
    expect(await screen.findAllByText('Todavía no hay datos para este período')).toHaveLength(2)
    expect(screen.queryByRole('group', { name: 'Ganancia por mes y por lugar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Gastos por categoría' })).not.toBeInTheDocument()
  })

  test('un filtro sin gastos lo dice, aunque haya gastos de otro ámbito', async () => {
    const supermercado = await guardarCategoria({ nombre: 'Supermercado', tipo: 'GASTO', ambito: 'PERSONAL', icono: '🛒', color: '', orden: 0 })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 7000000, categoriaId: supermercado, nota: '' })
    const user = renderEstadisticas()

    expect(await screen.findByRole('list', { name: 'Gastos por categoría' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Trabajo' }))
    expect(screen.queryByRole('list', { name: 'Gastos por categoría' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Todavía no hay datos para este período')).toHaveLength(2) // gráfico de ganancias + ranking
  })
})

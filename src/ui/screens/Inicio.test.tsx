import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { guardarAjuste } from '../../data/ajustes'
import { db } from '../../data/db'
import { archivarLugar, crearLugar } from '../../data/lugares'
import { guardarMovimiento } from '../../data/movimientos'
import * as datosPagos from '../../data/pagos'
import { registrarPago } from '../../data/pagos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import Inicio from './Inicio'
import { anotar, septiembre } from './periodo/test-fixtures'

function renderInicio() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <Inicio />
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
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Lugar de arancel fijo, cierra el último día del mes y paga entre el 21 y el 25 (septiembre ya venció). */
const lugarQuePagaEl25 = (nombre = 'Clínica Centro') =>
  crearLugar({ nombre, formaCobro: 'ARANCEL_FIJO', porcentajeBp: null, pagoDesdeDia: 21, pagoHastaDia: 25, diaCierre: 'ULTIMO' })

/** Evita el aviso de copia en los tests que no hablan de ella. */
const copiaAlDia = () => guardarAjuste('ultimaCopia', new Date().toISOString())

const avisos = () => screen.getByRole('region', { name: 'Avisos' })

describe('estado vacío', () => {
  test('sin lugares muestra el estado vacío con "Agregar lugar"', async () => {
    renderInicio()

    expect(await screen.findByText('Empezá agregando los lugares donde trabajás')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Agregar lugar' })).toHaveAttribute('href', '/lugares/nuevo')
    expect(screen.queryByRole('link', { name: '+ Anotar trabajo' })).not.toBeInTheDocument()
    expect(screen.queryByText(/hasta hoy/)).not.toBeInTheDocument()
  })
})

describe('resumen del mes', () => {
  test('muestra saldo, ganado y gastos del mes hasta hoy', async () => {
    const lugarId = await lugarFijo()
    await copiaAlDia()
    await anotar(lugarId, '2026-10-27', 'Arreglo', 38000)
    await anotar(lugarId, '2026-10-24', 'Extracción', 30000)
    await anotar(lugarId, '2026-10-28', 'Futuro', 99000) // mañana: todavía no cuenta
    await anotar(lugarId, '2026-09-29', 'Septiembre', 45000) // otro mes
    await db.categorias.add({ id: 'c1', nombre: 'Insumos', tipo: 'GASTO', ambito: 'TRABAJO', icono: '', color: '', orden: 0 })
    await db.categorias.add({ id: 'c2', nombre: 'Extras', tipo: 'INGRESO', ambito: null, icono: '', color: '', orden: 1 })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-20', monto: 2000000, categoriaId: 'c1', nota: '' })
    await guardarMovimiento({ tipo: 'INGRESO', fecha: '2026-10-21', monto: 500000, categoriaId: 'c2', nota: '' })
    renderInicio()

    expect(await screen.findByText('Octubre 2026 · hasta hoy')).toBeInTheDocument()
    // ganado = 38.000 + 30.000 + 5.000; gastos = 20.000; saldo = 53.000
    expect(screen.getByText('$ 53.000')).toBeInTheDocument()
    expect(screen.getByText('Ganado $ 73.000')).toBeInTheDocument()
    expect(screen.getByText('Gastos $ 20.000')).toBeInTheDocument()
  })

  test('un saldo negativo se marca en terracota', async () => {
    await lugarFijo()
    await copiaAlDia()
    await db.categorias.add({ id: 'c1', nombre: 'Alquiler', tipo: 'GASTO', ambito: 'PERSONAL', icono: '', color: '', orden: 0 })
    await guardarMovimiento({ tipo: 'GASTO', fecha: '2026-10-05', monto: 1500000, categoriaId: 'c1', nota: '' })
    renderInicio()

    const saldo = await screen.findByText('−$ 15.000')
    expect(saldo).toHaveClass('texto-neg')
  })
})

describe('avisos', () => {
  test('muestra aviso de pago atrasado y "No me pagaron" lo convierte en deuda', async () => {
    const lugarId = await lugarQuePagaEl25()
    await copiaAlDia()
    await septiembre(lugarId) // $ 138.000, nadie pagó y la ventana (21 – 25 oct) ya pasó
    const user = renderInicio()

    expect(await screen.findByText('Clínica Centro: sin pago registrado')).toBeInTheDocument()
    expect(screen.getByText('1 – 30 sep · $ 138.000 · te pagan del 21 al 25')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrar pago' })).toHaveAttribute(
      'href',
      `/lugares/${lugarId}/pago?periodo=2026-09-30`,
    )

    await user.click(screen.getByRole('button', { name: 'No me pagaron' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText('¿Marcar todos los trabajos de 1 – 30 sep como no pagados?')).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'No me pagaron' }))

    // el aviso de pago atrasado se reemplaza por la deuda
    expect(await screen.findByText('Clínica Centro: te deben $ 138.000')).toBeInTheDocument()
    expect(screen.queryByText('Clínica Centro: sin pago registrado')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('4 trabajos sin pagar')).toBeInTheDocument()
    expect((await db.trabajos.toArray()).every((tr) => tr.estado === 'NO_PAGADO')).toBe(true)
  })

  test('cancelar la confirmación no cambia nada', async () => {
    const lugarId = await lugarQuePagaEl25()
    await copiaAlDia()
    await septiembre(lugarId)
    const user = renderInicio()

    await user.click(await screen.findByRole('button', { name: 'No me pagaron' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Clínica Centro: sin pago registrado')).toBeInTheDocument()
    expect((await db.trabajos.toArray()).every((tr) => tr.estado === 'PENDIENTE')).toBe(true)
  })

  test('doble toque en confirmar marca una sola vez', async () => {
    const lugarId = await lugarQuePagaEl25()
    await copiaAlDia()
    await septiembre(lugarId)
    const original = datosPagos.noMePagaron
    const espia = vi.spyOn(datosPagos, 'noMePagaron').mockImplementation(async (...args) => {
      await new Promise((r) => setTimeout(r, 50))
      return original(...args)
    })
    const user = renderInicio()

    await user.click(await screen.findByRole('button', { name: 'No me pagaron' }))
    await user.dblClick(within(screen.getByRole('dialog')).getByRole('button', { name: 'No me pagaron' }))

    expect(await screen.findByText('Clínica Centro: te deben $ 138.000')).toBeInTheDocument()
    expect(espia).toHaveBeenCalledTimes(1)
  })

  test('si falla "No me pagaron" lo dice y deja el aviso', async () => {
    const lugarId = await lugarQuePagaEl25()
    await copiaAlDia()
    await septiembre(lugarId)
    vi.spyOn(datosPagos, 'noMePagaron').mockRejectedValue(new Error('boom'))
    const user = renderInicio()

    await user.click(await screen.findByRole('button', { name: 'No me pagaron' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'No me pagaron' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo marcar como no pagados. Probá de nuevo.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Clínica Centro: sin pago registrado')).toBeInTheDocument()
  })

  test('una deuda muestra trabajos sin pagar y diferencias en pagos, con "Ver detalle"', async () => {
    const lugarId = await lugarFijo() // paga entre el 21 y el 31: septiembre todavía no venció
    await copiaAlDia()
    const t = await septiembre(lugarId) // arreglo 38.000, corona 45.000, limpieza 25.000, extracción 30.000
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-25', monto: 8000000, tipo: 'FINAL', nota: '',
      tildados: [t.arreglo, t.limpieza, t.extraccion], destildados: [t.corona],
    })
    renderInicio()

    // corona sin pagar (45.000) + diferencia de plata (93.000 esperados − 80.000 recibidos = 13.000)
    expect(await screen.findByText('Clínica Centro: te deben $ 58.000')).toBeInTheDocument()
    expect(screen.getByText('1 trabajo sin pagar')).toBeInTheDocument()
    expect(screen.getByText('Diferencias en pagos: $ 13.000')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', `/lugares/${lugarId}`)
    expect(screen.getByRole('button', { name: 'Compartir reclamo' })).toBeEnabled()
  })

  test('trabajos sin conciliar lleva a revisar el período', async () => {
    const lugarId = await lugarQuePagaEl25()
    await copiaAlDia()
    const t = await septiembre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-22', monto: 3800000, tipo: 'A_CUENTA', nota: '',
      tildados: [t.arreglo], destildados: [],
    })
    renderInicio()

    expect(await screen.findByText('Clínica Centro: 3 trabajos sin conciliar')).toBeInTheDocument()
    expect(within(avisos()).getByText('1 – 30 sep: revisá si te los pagaron.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar' })).toHaveAttribute('href', `/lugares/${lugarId}?periodo=2026-09-30`)
  })

  test('trabajos sin conciliar: "No me pagaron" pide confirmación y los pasa a deuda', async () => {
    const lugarId = await lugarQuePagaEl25()
    await copiaAlDia()
    const t = await septiembre(lugarId)
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-22', monto: 3800000, tipo: 'A_CUENTA', nota: '',
      tildados: [t.arreglo], destildados: [],
    })
    const user = renderInicio()

    expect(await screen.findByText('Clínica Centro: 3 trabajos sin conciliar')).toBeInTheDocument()
    await user.click(within(avisos()).getByRole('button', { name: 'No me pagaron' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Marcar los 3 trabajos pendientes de 1 – 30 sep como no pagados?' })
    await user.click(within(dialogo).getByRole('button', { name: 'No me pagaron' }))

    expect(await screen.findByText('Clínica Centro: te deben $ 100.000')).toBeInTheDocument()
    expect(screen.queryByText(/sin conciliar/)).not.toBeInTheDocument()
    expect(await db.trabajos.get(t.corona)).toMatchObject({ estado: 'NO_PAGADO' })
    expect(await db.trabajos.get(t.arreglo)).toMatchObject({ estado: 'PAGADO' })
  })

  test('pagos solo a cuenta vencidos avisan lo que falta y "Ya no me van a pagar más" lo pasa a deuda', async () => {
    const lugarId = await lugarQuePagaEl25()
    await copiaAlDia()
    const t = await septiembre(lugarId) // 138.000
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-22', monto: 7800000, tipo: 'A_CUENTA', nota: '',
      tildados: [t.arreglo, t.corona, t.limpieza, t.extraccion], destildados: [],
    })
    const user = renderInicio()

    expect(await screen.findByText('Clínica Centro: falta cobrar $ 60.000 de 1 – 30 sep (pagos a cuenta)')).toBeInTheDocument()
    expect(within(avisos()).getByRole('link', { name: 'Revisar' })).toHaveAttribute('href', `/lugares/${lugarId}?periodo=2026-09-30`)
    expect(within(avisos()).queryByRole('button', { name: 'No me pagaron' })).not.toBeInTheDocument()

    await user.click(within(avisos()).getByRole('button', { name: 'Ya no me van a pagar más' }))
    const dialogo = screen.getByRole('dialog', { name: '¿Ya no te van a pagar más 1 – 30 sep?' })
    await user.click(within(dialogo).getByRole('button', { name: 'Ya no me van a pagar más' }))

    expect(await screen.findByText('Clínica Centro: te deben $ 60.000')).toBeInTheDocument()
    expect(screen.getByText('Diferencias en pagos: $ 60.000')).toBeInTheDocument()
    expect(screen.queryByText(/pagos a cuenta\)/)).not.toBeInTheDocument()
    expect((await db.pagos.toArray()).filter((p) => p.tipo === 'FINAL')).toHaveLength(1)
  })

  test('sin copia de seguridad avisa, y "Hacer copia ahora" lleva a la pantalla de copia', async () => {
    const lugarId = await lugarFijo()
    await anotar(lugarId, '2026-10-20', 'Limpieza', 25000)
    renderInicio()

    expect(await screen.findByText('Todavía no hiciste una copia de seguridad')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hacer copia ahora' })).toHaveAttribute('href', '/mas/copia')
  })

  test('con una copia vieja cuenta los días', async () => {
    const lugarId = await lugarFijo()
    await anotar(lugarId, '2026-10-20', 'Limpieza', 25000)
    await guardarAjuste('ultimaCopia', new Date(2026, 9, 17, 9).toISOString())
    renderInicio()

    expect(await screen.findByText('Hace 10 días que no hacés una copia de seguridad')).toBeInTheDocument()
  })

  test('con la copia al día no avisa', async () => {
    const lugarId = await lugarFijo()
    await anotar(lugarId, '2026-10-20', 'Limpieza', 25000)
    await copiaAlDia()
    renderInicio()

    await screen.findByText('Octubre 2026 · hasta hoy')
    expect(screen.queryByRole('region', { name: 'Avisos' })).not.toBeInTheDocument()
  })
})

describe('lugares archivados', () => {
  test('un lugar archivado con trabajos sin pagar sigue avisando, aunque no tenga tarjeta', async () => {
    const activo = await lugarFijo('ULTIMO', 'Consultorio Sur')
    const viejo = await lugarFijo('ULTIMO', 'Consultorio Viejo')
    await copiaAlDia()
    const t = await septiembre(viejo)
    await db.trabajos.update(t.corona, { estado: 'NO_PAGADO' })
    await archivarLugar(viejo, true)
    renderInicio()

    expect(await screen.findByText('Consultorio Viejo: te deben $ 45.000')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalle' })).toHaveAttribute('href', `/lugares/${viejo}`)
    expect(screen.getByRole('link', { name: /Consultorio Sur/ })).toHaveAttribute('href', `/lugares/${activo}`)
    expect(within(screen.getByRole('heading', { name: 'Por lugar' }).parentElement!).queryByRole('link', { name: /Consultorio Viejo/ })).not.toBeInTheDocument()
  })

  test('un lugar archivado con el pago atrasado sigue ofreciendo "No me pagaron"', async () => {
    const viejo = await lugarQuePagaEl25('Consultorio Viejo')
    await copiaAlDia()
    await septiembre(viejo)
    await archivarLugar(viejo, true)
    const user = renderInicio()

    expect(await screen.findByText('Consultorio Viejo: sin pago registrado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No me pagaron' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'No me pagaron' }))
    expect(await screen.findByText('Consultorio Viejo: te deben $ 138.000')).toBeInTheDocument()
  })

  test('con todos los lugares archivados muestra el mes y las deudas, sin el estado vacío ni el botón flotante', async () => {
    const viejo = await lugarFijo('ULTIMO', 'Consultorio Viejo')
    await copiaAlDia()
    const t = await septiembre(viejo)
    await db.trabajos.update(t.corona, { estado: 'NO_PAGADO' })
    await archivarLugar(viejo, true)
    renderInicio()

    expect(await screen.findByText('Consultorio Viejo: te deben $ 45.000')).toBeInTheDocument()
    expect(screen.getByText('Octubre 2026 · hasta hoy')).toBeInTheDocument()
    expect(screen.getByText('No tenés lugares activos.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver lugares' })).toHaveAttribute('href', '/lugares')
    expect(screen.queryByText('Empezá agregando los lugares donde trabajás')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Anotar trabajo' })).not.toBeInTheDocument()
  })
})

describe('por lugar', () => {
  test('tarjeta por lugar con total del período en curso', async () => {
    const centro = await lugarFijo()
    const sur = await lugarFijo(15, 'Consultorio Sur')
    await copiaAlDia()
    await anotar(centro, '2026-10-27', 'Arreglo', 38000)
    await anotar(centro, '2026-10-24', 'Extracción', 30000)
    await anotar(centro, '2026-09-29', 'Septiembre', 45000) // período anterior: no suma
    await anotar(sur, '2026-10-20', 'Limpieza', 25000) // período 16 oct – 15 nov
    renderInicio()

    const tarjetaCentro = await screen.findByRole('link', { name: /Clínica Centro/ })
    expect(tarjetaCentro).toHaveAttribute('href', `/lugares/${centro}`)
    expect(tarjetaCentro).toHaveTextContent('cierra el 31 oct')
    expect(tarjetaCentro).toHaveTextContent('2 trabajos')
    expect(tarjetaCentro).toHaveTextContent('$ 68.000')

    const tarjetaSur = screen.getByRole('link', { name: /Consultorio Sur/ })
    expect(tarjetaSur).toHaveAttribute('href', `/lugares/${sur}`)
    expect(tarjetaSur).toHaveTextContent('cierra el 15 nov')
    expect(tarjetaSur).toHaveTextContent('1 trabajo')
    expect(tarjetaSur).not.toHaveTextContent('1 trabajos')
    expect(tarjetaSur).toHaveTextContent('$ 25.000')
  })

  test('un lugar archivado no tiene tarjeta', async () => {
    await lugarFijo()
    const viejo = await lugarFijo('ULTIMO', 'Consultorio Viejo')
    await archivarLugar(viejo, true)
    await copiaAlDia()
    renderInicio()

    expect(await screen.findByRole('link', { name: /Clínica Centro/ })).toBeInTheDocument()
    expect(screen.queryByText('Consultorio Viejo')).not.toBeInTheDocument()
  })

  test('el botón flotante "+ Anotar trabajo" abre el formulario', async () => {
    await lugarFijo()
    await copiaAlDia()
    renderInicio()

    expect(await screen.findByRole('link', { name: '+ Anotar trabajo' })).toHaveAttribute('href', '/trabajo/nuevo')
  })
})

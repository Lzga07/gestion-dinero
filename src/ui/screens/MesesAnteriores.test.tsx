import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../data/db'
import { archivarLugar, crearLugar, guardarTipoTrabajo } from '../../data/lugares'
import { marcarNoPagado, registrarPago } from '../../data/pagos'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import MesesAnteriores from './MesesAnteriores'
import FilaCarga from './anteriores/FilaCarga'
import { anotar, septiembre } from './periodo/test-fixtures'

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

/** Muestra a dónde navegó la app (ruta + query), para verificar los enlaces. */
function Ubicacion() {
  const { pathname, search } = useLocation()
  return <p data-testid="ubicacion">{pathname + search}</p>
}

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/lugares/:id/anteriores" element={<MesesAnteriores />} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

const mes = () => screen.getByRole('group', { name: 'Mes' })

describe('MesesAnteriores', () => {
  test('título, nombre del lugar y arranca en el período anterior al actual', async () => {
    const id = await lugarFijo('ULTIMO', 'Clínica Centro')
    renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('Clínica Centro')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cargar meses anteriores' })).toBeInTheDocument()
    expect(within(mes()).getByText('1 – 30 sep 2026')).toBeInTheDocument()
    expect(within(mes()).getByText('Sin trabajos')).toBeInTheDocument()
  })

  test('‹ y › cambian de período; › está deshabilitado en el anterior al actual', async () => {
    const id = await lugarFijo()
    await anotar(id, '2026-08-12', 'Limpieza', 20000)
    await anotar(id, '2026-08-14', 'Arreglo', 30000)
    const user = renderEn(`/lugares/${id}/anteriores`)

    await screen.findByText('1 – 30 sep 2026')
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(within(mes()).getByText('1 – 31 ago 2026')).toBeInTheDocument()
    expect(within(mes()).getByText('2 trabajos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(within(mes()).getByText('1 – 30 sep 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  test('‹ se deshabilita a 5 años de hoy', async () => {
    const id = await lugarFijo()
    const user = renderEn(`/lugares/${id}/anteriores`)
    await screen.findByText('1 – 30 sep 2026')

    // Hoy es 27/10/2026: el límite es 27/10/2021, así que el último período ofrecido es 1 – 31 oct 2021.
    const anterior = screen.getByRole('button', { name: 'Mes anterior' })
    for (let i = 0; i < 59; i++) await user.click(anterior)
    expect(within(mes()).getByText('1 – 31 oct 2021')).toBeInTheDocument()
    expect(anterior).toBeDisabled()
  })

  test('un lugar que cierra el 15 muestra "16 sep – 15 oct 2026" y cruza de año hacia atrás', async () => {
    vi.setSystemTime(new Date(2026, 9, 31, 12))
    const id = await lugarFijo(15)
    const user = renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('16 sep – 15 oct 2026')).toBeInTheDocument()
    const anterior = screen.getByRole('button', { name: 'Mes anterior' })
    for (let i = 0; i < 9; i++) await user.click(anterior)
    expect(within(mes()).getByText('16 dic – 15 ene 2026')).toBeInTheDocument()
  })

  test('?periodo=<fecha> abre ese período si ya terminó; si no, el anterior al actual', async () => {
    const id = await lugarFijo()
    renderEn(`/lugares/${id}/anteriores?periodo=2026-07-31`)
    expect(await screen.findByText('1 – 31 jul 2026')).toBeInTheDocument()
  })

  test.each(['2026-10-31', '2030-01-01', '2015-01-31', 'cualquier cosa'])('?periodo=%s no es válido y abre el anterior al actual', async (pedido) => {
    const id = await lugarFijo()
    renderEn(`/lugares/${id}/anteriores?periodo=${encodeURIComponent(pedido)}`)
    expect(await screen.findByText('1 – 30 sep 2026')).toBeInTheDocument()
  })

  test('lista los trabajos del período por fecha, con el total, y tocar uno abre su pantalla', async () => {
    const id = await lugarFijo()
    // Anotados fuera de orden; el 22 se anota dos veces para ver el desempate por orden de carga.
    const corona = await anotar(id, '2026-09-26', 'Corona', 45000)
    await anotar(id, '2026-09-22', 'Extracción', 30000)
    await anotar(id, '2026-09-22', 'Otra extracción', 0)
    await anotar(id, '2026-08-30', 'De agosto', 99999)
    const user = renderEn(`/lugares/${id}/anteriores`)

    const lista = await screen.findByRole('list', { name: 'Trabajos del mes' })
    const filas = within(lista).getAllByRole('listitem').map((li) => li.textContent)
    expect(filas).toEqual(['22 sep · Extracción$ 30.000', '22 sep · Otra extracción$ 0', '26 sep · Corona$ 45.000'])
    expect(screen.getByText('3 trabajos · $ 75.000')).toBeInTheDocument()
    expect(screen.queryByText(/De agosto/)).not.toBeInTheDocument()
    expect(screen.queryByText('Este mes ya está cerrado.')).not.toBeInTheDocument()

    await user.click(within(lista).getByRole('link', { name: /Corona/ }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(`/trabajo/${corona}`)
  })

  test('un mes con un pago está cerrado: avisa y lleva a ver el período', async () => {
    const id = await lugarFijo()
    const t = await septiembre(id)
    await registrarPago({
      lugarId: id, periodoFin: '2026-09-30', fecha: '2026-10-25', monto: 13800000, tipo: 'FINAL', nota: '',
      tildados: [t.arreglo, t.corona, t.limpieza, t.extraccion], destildados: [],
    })
    const user = renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('Este mes ya está cerrado.')).toBeInTheDocument()
    expect(screen.getByText('4 trabajos · $ 138.000')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ver el período' }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent(`/lugares/${id}?periodo=2026-09-30`)
  })

  test('un mes con un trabajo no pagado también está cerrado', async () => {
    const id = await lugarFijo()
    await marcarNoPagado(await anotar(id, '2026-09-10', 'Conducto', 60000))
    renderEn(`/lugares/${id}/anteriores`)

    expect(await screen.findByText('Este mes ya está cerrado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el período' })).toHaveAttribute('href', `/lugares/${id}?periodo=2026-09-30`)
  })

  test('lugar inexistente o archivado', async () => {
    const id = await lugarFijo()
    const { unmount } = render(
      <MemoryRouter initialEntries={['/lugares/no-existe/anteriores']}>
        <Routes>
          <Route path="/lugares/:id/anteriores" element={<MesesAnteriores />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('No encontramos este lugar.')).toBeInTheDocument()
    unmount()

    await archivarLugar(id, true)
    renderEn(`/lugares/${id}/anteriores`)
    expect(await screen.findByText('Este lugar está archivado.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Mes' })).not.toBeInTheDocument()
  })
})

/** Lugar de arancel fijo con la lista "Limpieza $ 25.000" y "Arreglo $ 38.000". */
async function lugarConLista(diaCierre: 'ULTIMO' | number = 'ULTIMO') {
  const id = await lugarFijo(diaCierre)
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 })
  return id
}

const lugarPorcentaje = (porcentajeBp = 4000) =>
  crearLugar({ nombre: 'Consultorio Sur', formaCobro: 'PORCENTAJE', porcentajeBp, pagoDesdeDia: 21, pagoHastaDia: 31, diaCierre: 'ULTIMO' })

const dia = () => screen.getByLabelText('Día')
const opciones = (el: HTMLElement) => within(el).getAllByRole('option').map((o) => o.textContent)
const agregar = () => screen.getByRole('button', { name: 'Agregar' })
const guardados = () => db.trabajos.toArray()

describe('FilaCarga', () => {
  describe('día', () => {
    test('un período de un solo mes ofrece solo el número; arranca en el primero y sigue en el último agregado', async () => {
      const id = await lugarConLista()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await screen.findByLabelText('Día')

      expect(opciones(dia())).toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1)))
      expect(dia()).toHaveValue('2026-09-01')

      await user.selectOptions(dia(), '12')
      await user.selectOptions(screen.getByLabelText('¿Qué hiciste?'), 'Limpieza')
      await user.click(agregar())

      await waitFor(async () => expect(await guardados()).toHaveLength(1))
      expect((await guardados())[0].fecha).toBe('2026-09-12')
      expect(dia()).toHaveValue('2026-09-12')
    })

    test('un período que cruza de mes y de año ofrece "16 dic" … "15 ene", todos pasados', async () => {
      vi.setSystemTime(new Date(2026, 9, 31, 12))
      const id = await lugarConLista(15)
      const user = renderEn(`/lugares/${id}/anteriores`)
      await screen.findByText('16 sep – 15 oct 2026')
      const anterior = screen.getByRole('button', { name: 'Mes anterior' })
      for (let i = 0; i < 9; i++) await user.click(anterior)
      expect(within(mes()).getByText('16 dic – 15 ene 2026')).toBeInTheDocument()

      const dias = opciones(dia())
      expect(dias).toHaveLength(31)
      expect(dias[0]).toBe('16 dic')
      expect(dias[15]).toBe('31 dic')
      expect(dias[16]).toBe('1 ene')
      expect(dias[30]).toBe('15 ene')
      expect(dia()).toHaveValue('2025-12-16')
    })

    test('no ofrece días futuros', async () => {
      const id = await lugarConLista()
      const lugar = (await db.lugares.get(id))!
      render(
        <FilaCarga
          lugar={lugar} tipos={[]} periodo={{ inicio: '2026-10-16', fin: '2026-11-15' }} hoy="2026-10-20"
          porcentajeBp={0} onPorcentaje={() => undefined} modo="CLIENTE" onModo={() => undefined}
        />,
      )
      expect(opciones(dia())).toEqual(['16 oct', '17 oct', '18 oct', '19 oct', '20 oct'])
    })
  })

  describe('arancel fijo', () => {
    test('elegir un trabajo trae su precio, que se puede cambiar; "Agregar" lo guarda y deja la fila lista', async () => {
      const id = await lugarConLista()
      const user = renderEn(`/lugares/${id}/anteriores`)
      const que = await screen.findByLabelText('¿Qué hiciste?')
      expect(screen.queryByLabelText('Precio')).not.toBeInTheDocument()

      await user.selectOptions(dia(), '9')
      await user.selectOptions(que, 'Limpieza')
      const precio = screen.getByLabelText('Precio')
      expect(precio).toHaveValue('$ 25.000')
      await user.clear(precio)
      await user.type(precio, '20.000')
      await user.click(agregar())

      await waitFor(async () => expect(await guardados()).toHaveLength(1))
      const [t] = await guardados()
      expect(t).toMatchObject({
        lugarId: id, fecha: '2026-09-09', descripcion: 'Limpieza', tipoTrabajoId: expect.any(String),
        precioLista: 2000000, monto: 2000000, montoCliente: null, descuento: null, porcentajeBp: null, nota: '', estado: 'PENDIENTE',
      })
      // La fila queda vacía, en el mismo día, con el foco en "¿Qué hiciste?".
      await waitFor(() => expect(screen.getByLabelText('¿Qué hiciste?')).toHaveFocus())
      expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue('')
      expect(screen.queryByLabelText('Precio')).not.toBeInTheDocument()
      expect(dia()).toHaveValue('2026-09-09')
    })

    test('"Otro…" pide nombre y precio', async () => {
      const id = await lugarConLista()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await user.selectOptions(await screen.findByLabelText('¿Qué hiciste?'), 'Otro…')
      await user.type(screen.getByLabelText('Descripción'), '  Reparación  ')
      await user.type(screen.getByLabelText('Precio'), '15.000')
      await user.click(agregar())

      await waitFor(async () => expect(await guardados()).toHaveLength(1))
      expect((await guardados())[0]).toMatchObject({
        descripcion: 'Reparación', tipoTrabajoId: null, precioLista: null, monto: 1500000, fecha: '2026-09-01',
      })
      await waitFor(() => expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue(''))
      expect(screen.queryByLabelText('Descripción')).not.toBeInTheDocument()
    })

    test('sin lista de trabajos, solo "Otro…"', async () => {
      const id = await lugarFijo()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await user.type(await screen.findByLabelText('Descripción'), 'Reparación')
      await user.type(screen.getByLabelText('Precio'), '15.000')
      await user.click(agregar())
      await waitFor(async () => expect(await guardados()).toHaveLength(1))
      expect((await guardados())[0]).toMatchObject({ descripcion: 'Reparación', monto: 1500000 })
    })
  })

  describe('porcentaje', () => {
    test('el porcentaje del mes arranca en el del lugar; cambiarlo no toca el lugar y se muestra la cuenta', async () => {
      const id = await lugarPorcentaje()
      const user = renderEn(`/lugares/${id}/anteriores`)
      const pct = await screen.findByLabelText('Porcentaje de este mes')
      expect(pct).toHaveValue('40')

      await user.clear(pct)
      await user.type(pct, '35')
      await user.type(screen.getByLabelText('¿Qué hiciste?'), 'Corona')
      await user.type(screen.getByLabelText('Lo que pagó el cliente'), '100.000')
      expect(screen.getByText('100.000 × 35 %')).toBeInTheDocument()
      await user.click(agregar())

      await waitFor(async () => expect(await guardados()).toHaveLength(1))
      expect((await guardados())[0]).toMatchObject({
        descripcion: 'Corona', tipoTrabajoId: null, precioLista: null, montoCliente: 10000000, descuento: null,
        descuentoMotivo: null, porcentajeBp: 3500, monto: 3500000, nota: '',
      })
      expect((await db.lugares.get(id))!.porcentajeBp).toBe(4000)
      // Sigue con el 35 para el próximo trabajo.
      await waitFor(() => expect(screen.getByLabelText('¿Qué hiciste?')).toHaveFocus())
      expect(screen.getByLabelText('Porcentaje de este mes')).toHaveValue('35')
      expect(screen.getByLabelText('Lo que pagó el cliente')).toHaveValue('')
    })

    test('con descuento, la cuenta lo resta antes del porcentaje', async () => {
      const id = await lugarPorcentaje()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await user.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
      await user.type(screen.getByLabelText('Lo que pagó el cliente'), '100.000')
      await user.type(screen.getByLabelText('Descuento antes del % (opcional)'), '20.000')
      expect(screen.getByText('(100.000 − 20.000) × 40 %')).toBeInTheDocument()
      await user.click(agregar())
      await waitFor(async () => expect(await guardados()).toHaveLength(1))
      expect((await guardados())[0]).toMatchObject({ montoCliente: 10000000, descuento: 2000000, porcentajeBp: 4000, monto: 3200000 })
    })

    test('"Lo que me tocó" guarda el monto escrito, sin monto del cliente ni porcentaje', async () => {
      const id = await lugarPorcentaje()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await user.selectOptions(await screen.findByLabelText('Anoté:'), 'Lo que me tocó')
      expect(screen.getByRole('option', { name: 'Lo que pagó el cliente' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Lo que pagó el cliente')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Porcentaje de este mes')).not.toBeInTheDocument()

      await user.type(screen.getByLabelText('¿Qué hiciste?'), 'Corona')
      await user.type(screen.getByLabelText('Lo que te tocó'), '48.000')
      await user.click(agregar())

      await waitFor(async () => expect(await guardados()).toHaveLength(1))
      expect((await guardados())[0]).toMatchObject({
        descripcion: 'Corona', montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null,
        tipoTrabajoId: null, precioLista: null, monto: 4800000,
      })
    })

    test('el porcentaje y el modo se recuerdan al pasar de mes', async () => {
      const id = await lugarPorcentaje()
      const user = renderEn(`/lugares/${id}/anteriores`)
      const pct = await screen.findByLabelText('Porcentaje de este mes')
      await user.clear(pct)
      await user.type(pct, '37,5')

      await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
      expect(await screen.findByText('1 – 31 ago 2026')).toBeInTheDocument()
      expect(screen.getByLabelText('Porcentaje de este mes')).toHaveValue('37,5')

      await user.selectOptions(screen.getByLabelText('Anoté:'), 'Lo que me tocó')
      await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
      expect(await screen.findByText('1 – 30 sep 2026')).toBeInTheDocument()
      expect(screen.getByLabelText('Anoté:')).toHaveValue('DIRECTO')
      expect(dia()).toHaveValue('2026-09-01')
      expect((await db.lugares.get(id))!.porcentajeBp).toBe(4000)
    })
  })

  describe('errores y estado', () => {
    test('arancel fijo sin completar: avisa en línea y no guarda', async () => {
      const id = await lugarConLista()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await screen.findByLabelText('¿Qué hiciste?')
      await user.click(agregar())
      expect(screen.getByText('Elegí qué hiciste')).toBeInTheDocument()
      expect(screen.getByLabelText('¿Qué hiciste?')).toHaveFocus()

      await user.selectOptions(screen.getByLabelText('¿Qué hiciste?'), 'Otro…')
      await user.click(agregar())
      expect(screen.getByText('Escribí qué hiciste')).toBeInTheDocument()
      expect(screen.getByText('Ingresá un monto mayor a 0')).toBeInTheDocument()
      expect(await guardados()).toHaveLength(0)
    })

    test('porcentaje: falta qué hiciste, monto inválido y porcentaje inválido', async () => {
      const id = await lugarPorcentaje()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await user.type(await screen.findByLabelText('Lo que pagó el cliente'), 'abc')
      await user.clear(screen.getByLabelText('Porcentaje de este mes'))
      await user.click(agregar())

      expect(screen.getByText('Escribí qué hiciste')).toBeInTheDocument()
      expect(screen.getByText('Monto inválido. Usá coma para los decimales (ej: 1.234,50)')).toBeInTheDocument()
      expect(screen.getByText('Revisá el porcentaje del lugar')).toBeInTheDocument()
      expect(await guardados()).toHaveLength(0)
    })

    test('doble toque en "Agregar" crea un solo trabajo', async () => {
      const id = await lugarConLista()
      const user = renderEn(`/lugares/${id}/anteriores`)
      await user.selectOptions(await screen.findByLabelText('¿Qué hiciste?'), 'Limpieza')
      await user.dblClick(agregar())

      await waitFor(() => expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue(''))
      expect(await guardados()).toHaveLength(1)
    })

    test('el trabajo agregado aparece en la lista y el total se actualiza', async () => {
      const id = await lugarConLista()
      await anotar(id, '2026-09-05', 'Arreglo', 38000)
      const user = renderEn(`/lugares/${id}/anteriores`)
      expect(await screen.findByText('1 trabajo · $ 38.000')).toBeInTheDocument()

      await user.selectOptions(await screen.findByLabelText('¿Qué hiciste?'), 'Limpieza')
      await user.click(agregar())

      expect(await screen.findByText('2 trabajos · $ 63.000')).toBeInTheDocument()
      const lista = screen.getByRole('list', { name: 'Trabajos del mes' })
      expect(within(lista).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1 sep · Limpieza$ 25.000', '5 sep · Arreglo$ 38.000'])
    })

    test('un mes cerrado no tiene fila de carga', async () => {
      const id = await lugarConLista()
      await marcarNoPagado(await anotar(id, '2026-09-10', 'Conducto', 60000))
      renderEn(`/lugares/${id}/anteriores`)

      expect(await screen.findByText('Este mes ya está cerrado.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Día')).not.toBeInTheDocument()
    })
  })
})

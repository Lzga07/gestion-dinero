import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { leerAjuste, guardarAjuste } from '../../data/ajustes'
import { db } from '../../data/db'
import { borrarTipoTrabajo, crearLugar, guardarTipoTrabajo } from '../../data/lugares'
import * as datosPagos from '../../data/pagos'
import { registrarPago } from '../../data/pagos'
import * as datosTrabajos from '../../data/trabajos'
import { anotarTrabajo, lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { hoy } from '../../domain/dates'
import FormTrabajo from './FormTrabajo'

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/origen', ruta]} initialIndex={1}>
      <Routes>
        <Route path="/origen" element={<h1>Origen</h1>} />
        <Route path="/lugares/nuevo" element={<h1>Nuevo lugar</h1>} />
        <Route path="/trabajo/nuevo" element={<FormTrabajo />} />
        <Route path="/trabajo/:id" element={<FormTrabajo />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

async function lugarConArreglo(nombre = 'Clínica Centro') {
  const id = await lugarFijo('ULTIMO', nombre)
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
  const tipoId = await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 })
  return { id, tipoId }
}

function lugarPorcentaje(nombre = 'Consultorio Sur', porcentajeBp = 4000) {
  return crearLugar({
    nombre, formaCobro: 'PORCENTAJE', porcentajeBp, pagoDesdeDia: 21, pagoHastaDia: 31, diaCierre: 'ULTIMO',
  })
}

beforeEach(reiniciarDb)
afterEach(() => vi.restoreAllMocks())

describe('porcentaje', () => {
  test('muestra la cuenta en vivo y guarda 60.000', async () => {
    const lugarId = await lugarPorcentaje()
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '200.000')
    await user.type(screen.getByLabelText('Descuento antes del % (opcional)'), '50.000')
    await user.type(screen.getByLabelText('Motivo del descuento (opcional)'), 'laboratorio')

    expect(screen.getByText('(200.000 − 50.000) × 40 %')).toBeInTheDocument()
    expect(screen.getByText('$ 60.000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.toArray()).toMatchObject([
      {
        lugarId, descripcion: 'Corona', monto: 6000000, montoCliente: 20000000, descuento: 5000000,
        descuentoMotivo: 'laboratorio', porcentajeBp: 4000, tipoTrabajoId: null, precioLista: null,
        estado: 'PENDIENTE', pagoId: null, fecha: hoy(),
      },
    ])
  })

  test('descuento mayor muestra error y no guarda', async () => {
    const lugarId = await lugarPorcentaje()
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '100.000')
    await user.type(screen.getByLabelText('Descuento antes del % (opcional)'), '150.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText('El descuento tiene que ser menor a lo que pagó el cliente'),
    ).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(0)
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
  })

  test('sin descripción ni monto muestra los dos errores y no guarda', async () => {
    const lugarId = await lugarPorcentaje()
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Escribí qué hiciste')).toBeInTheDocument()
    expect(screen.getByText('Ingresá un monto mayor a 0')).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(0)
  })

  test('un monto con formato inválido bloquea el guardado', async () => {
    const lugarId = await lugarPorcentaje()
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '1.234.50')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(
      await screen.findByText('Monto inválido. Usá coma para los decimales (ej: 1.234,50)'),
    ).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(0)
  })
})

describe('franja fija inferior', () => {
  test('"Te corresponde" va junto a Guardar, con "—" si todavía no hay datos', async () => {
    const { id } = await lugarConArreglo()
    renderEn(`/trabajo/nuevo?lugar=${id}`)
    const guardar = await screen.findByRole('button', { name: 'Guardar' })
    const barra = guardar.closest('.form__barra') as HTMLElement
    expect(barra).not.toBeNull()
    expect(within(barra).getByText('Te corresponde')).toBeInTheDocument()
    expect(within(barra).getByText('—')).toBeInTheDocument()
  })
})

describe('arancel fijo', () => {
  test('elegir "Arreglo" guarda 38.000 y precioLista', async () => {
    const { id, tipoId } = await lugarConArreglo()
    const user = renderEn(`/trabajo/nuevo?lugar=${id}`)
    await user.click(await screen.findByRole('radio', { name: /Arreglo/ }))
    expect(screen.getByText('$ 38.000', { selector: '.resultado__monto' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Paciente Pérez')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.toArray()).toMatchObject([
      {
        lugarId: id, descripcion: 'Arreglo', tipoTrabajoId: tipoId, precioLista: 3800000, monto: 3800000,
        montoCliente: null, descuento: null, porcentajeBp: null, nota: 'Paciente Pérez',
      },
    ])
  })

  test('sin elegir qué hiciste pide elegir y no guarda', async () => {
    const { id } = await lugarConArreglo()
    const user = renderEn(`/trabajo/nuevo?lugar=${id}`)
    await user.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elegí qué hiciste')).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(0)
  })

  test('"Otro…" pide descripción y monto, y guarda sin precio de lista', async () => {
    const { id } = await lugarConArreglo()
    const user = renderEn(`/trabajo/nuevo?lugar=${id}`)
    await user.click(await screen.findByRole('radio', { name: 'Otro…' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Escribí qué hiciste')).toBeInTheDocument()
    expect(screen.getByText('Ingresá un monto mayor a 0')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Descripción'), 'Radiografía')
    await user.type(screen.getByLabelText('Monto que te corresponde'), '12.500')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.toArray()).toMatchObject([
      { descripcion: 'Radiografía', tipoTrabajoId: null, precioLista: null, monto: 1250000 },
    ])
  })

  test('un lugar sin lista de trabajos ofrece solo "Otro…"', async () => {
    const id = await lugarFijo()
    renderEn(`/trabajo/nuevo?lugar=${id}`)
    expect(await screen.findByLabelText('Descripción')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Otro…' })).toBeChecked()
  })
})

describe('lugar', () => {
  test('recuerda el último lugar usado', async () => {
    const a = await lugarFijo('ULTIMO', 'Clínica Centro')
    const b = await lugarPorcentaje('Consultorio Sur')
    await guardarTipoTrabajo({ lugarId: a, nombre: 'Limpieza', precio: 2500000, orden: 0 })

    // Sin ajuste ni query: primer lugar por nombre (Clínica Centro).
    let user = renderEn('/trabajo/nuevo')
    expect(await screen.findByLabelText('Lugar')).toHaveValue(a)
    expect(await leerAjuste('ultimoLugarId', null)).toBeNull()

    // Anotar un trabajo en B lo recuerda para la próxima.
    await user.selectOptions(screen.getByLabelText('Lugar'), b)
    await user.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '100.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await leerAjuste('ultimoLugarId', null)).toBe(b)

    document.body.innerHTML = ''
    user = renderEn('/trabajo/nuevo')
    expect(await screen.findByLabelText('Lugar')).toHaveValue(b)
  })

  test('el lugar de la URL manda sobre el último usado, y los archivados no aparecen', async () => {
    const a = await lugarFijo('ULTIMO', 'Clínica Centro')
    const b = await lugarPorcentaje('Consultorio Sur')
    const c = await lugarPorcentaje('Archivado')
    await db.lugares.update(c, { archivado: true })
    await guardarAjuste('ultimoLugarId', a)

    renderEn(`/trabajo/nuevo?lugar=${b}`)
    const select = await screen.findByLabelText('Lugar')
    expect(select).toHaveValue(b)
    expect(screen.queryByRole('option', { name: /Archivado/ })).not.toBeInTheDocument()
  })

  test('si el último lugar usado se archivó, cae en un lugar activo', async () => {
    const a = await lugarFijo('ULTIMO', 'Clínica Centro')
    const c = await lugarPorcentaje('Archivado')
    await guardarAjuste('ultimoLugarId', c)
    await db.lugares.update(c, { archivado: true })
    renderEn('/trabajo/nuevo')
    expect(await screen.findByLabelText('Lugar')).toHaveValue(a)
  })

  test('sin lugares activos invita a agregar uno', async () => {
    const user = renderEn('/trabajo/nuevo')
    expect(await screen.findByText('Primero agregá un lugar donde trabajás')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Agregar lugar' }))
    expect(await screen.findByRole('heading', { name: 'Nuevo lugar' })).toBeInTheDocument()
  })
})

describe('fechas y trabajos olvidados', () => {
  test('trabajo con fecha en período pagado pregunta y "No" lo deja NO_PAGADO', async () => {
    const lugarId = await lugarFijo('ULTIMO', 'Clínica Centro')
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const previo = await anotarTrabajo(lugarId, '2026-09-10')
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-05', monto: 10000, tipo: 'FINAL', nota: '',
      tildados: [previo], destildados: [],
    })

    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.clear(await screen.findByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2026-09-20')
    await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('dialog', { name: '¿Este trabajo ya te lo pagaron?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    const nuevo = (await db.trabajos.toArray()).find((t) => t.id !== previo)!
    expect(nuevo).toMatchObject({ fecha: '2026-09-20', estado: 'NO_PAGADO', monto: 2500000 })
  })

  test('"Sí" registra un pago adicional y deja el trabajo PAGADO', async () => {
    const lugarId = await lugarFijo()
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const previo = await anotarTrabajo(lugarId, '2026-09-10')
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-05', monto: 10000, tipo: 'FINAL', nota: '',
      tildados: [previo], destildados: [],
    })
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.clear(await screen.findByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2026-09-20')
    await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'Sí' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    const nuevo = (await db.trabajos.toArray()).find((t) => t.id !== previo)!
    expect(nuevo.estado).toBe('PAGADO')
    expect(await db.pagos.count()).toBe(2)
  })

  test('"Todavía no sé" no cambia nada: queda PENDIENTE', async () => {
    const lugarId = await lugarFijo()
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const previo = await anotarTrabajo(lugarId, '2026-09-10')
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-05', monto: 10000, tipo: 'FINAL', nota: '',
      tildados: [previo], destildados: [],
    })
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.clear(await screen.findByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2026-09-20')
    await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'Todavía no sé' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    const nuevo = (await db.trabajos.toArray()).find((t) => t.id !== previo)!
    expect(nuevo.estado).toBe('PENDIENTE')
    expect(await db.pagos.count()).toBe(1)
  })

  test('fecha de hace 2 años cae en su período y se guarda', async () => {
    const lugarId = await lugarFijo('ULTIMO', 'Clínica Centro')
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.clear(await screen.findByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), '2024-10-27')
    await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    // Ese período no tiene pagos: no pregunta nada y vuelve.
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.toArray()).toMatchObject([{ fecha: '2024-10-27', estado: 'PENDIENTE', monto: 2500000 }])
  })

  test('una fecha vacía bloquea el guardado', async () => {
    const lugarId = await lugarFijo()
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.clear(await screen.findByLabelText('Fecha'))
    await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elegí la fecha')).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(0)
  })
})

describe('guardado', () => {
  test('doble toque en Guardar crea un solo trabajo', async () => {
    const lugarId = await lugarFijo()
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const original = datosTrabajos.guardarTrabajo
    const espia = vi.spyOn(datosTrabajos, 'guardarTrabajo').mockImplementation(async (t) => {
      await new Promise((r) => setTimeout(r, 50))
      return original(t)
    })
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('radio', { name: /Limpieza/ }))
    const boton = screen.getByRole('button', { name: 'Guardar' })
    await user.dblClick(boton)

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(espia).toHaveBeenCalledTimes(1)
    expect(await db.trabajos.count()).toBe(1)
  })

  test('el botón Guardar queda deshabilitado mientras se guarda', async () => {
    const lugarId = await lugarFijo()
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const original = datosTrabajos.guardarTrabajo
    let soltar: () => void = () => undefined
    const pendiente = new Promise<void>((r) => {
      soltar = r
    })
    vi.spyOn(datosTrabajos, 'guardarTrabajo').mockImplementation(async (t) => {
      await pendiente
      return original(t)
    })
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('radio', { name: /Limpieza/ }))
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
    soltar()
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(1)
  })

  test('si falla el guardado muestra el error y deja volver a intentar', async () => {
    const lugarId = await lugarFijo()
    await guardarTipoTrabajo({ lugarId, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    vi.spyOn(datosTrabajos, 'guardarTrabajo').mockRejectedValueOnce(new Error('boom'))
    const user = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No se pudo guardar. Probá de nuevo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(1)
  })
})

describe('editar', () => {
  test('carga el trabajo, guarda los cambios y conserva estado y pago', async () => {
    const lugarId = await lugarPorcentaje()
    const user0 = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user0.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user0.type(screen.getByLabelText('Lo que pagó el cliente'), '200.000')
    await user0.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('heading', { name: 'Origen' })
    const [creado] = await db.trabajos.toArray()
    // El lugar cambia su % después: el trabajo conserva el suyo.
    await db.lugares.update(lugarId, { porcentajeBp: 5000 })
    document.body.innerHTML = ''

    const user = renderEn(`/trabajo/${creado.id}`)
    expect(await screen.findByRole('heading', { name: 'Editar trabajo' })).toBeInTheDocument()
    expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue('Corona')
    expect(screen.getByLabelText('Lo que pagó el cliente')).toHaveValue('$ 200.000')
    expect(screen.getByText('$ 80.000')).toBeInTheDocument()

    const monto = screen.getByLabelText('Lo que pagó el cliente')
    await user.clear(monto)
    await user.type(monto, '300.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    const filas = await db.trabajos.toArray()
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      id: creado.id, montoCliente: 30000000, porcentajeBp: 4000, monto: 12000000, creadoEn: creado.creadoEn,
    })
  })

  test('un trabajo de arancel fijo conserva su precio aunque la lista haya cambiado', async () => {
    const { id, tipoId } = await lugarConArreglo()
    const trabajoId = await anotarTrabajo(id, '2026-10-05', 3800000)
    await db.trabajos.update(trabajoId, { descripcion: 'Arreglo', tipoTrabajoId: tipoId, precioLista: 3800000 })
    await db.tiposTrabajo.update(tipoId, { precio: 5000000 })

    const user = renderEn(`/trabajo/${trabajoId}`)
    expect(await screen.findByRole('radio', { name: /Arreglo/ })).toBeChecked()
    expect(screen.getByText('$ 38.000', { selector: '.resultado__monto' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nota (opcional)'), 'revisar')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({ monto: 3800000, precioLista: 3800000, nota: 'revisar' })
  })

  test('editar un trabajo de arancel fijo no pisa su descripción con el nombre nuevo del tipo', async () => {
    const { id, tipoId } = await lugarConArreglo()
    const trabajoId = await anotarTrabajo(id, '2026-10-05', 3800000)
    await db.trabajos.update(trabajoId, { descripcion: 'Arreglo', tipoTrabajoId: tipoId, precioLista: 3800000 })
    await db.tiposTrabajo.update(tipoId, { nombre: 'Arreglo grande' })

    const user = renderEn(`/trabajo/${trabajoId}`)
    expect(await screen.findByRole('radio', { name: /Arreglo grande/ })).toBeChecked()
    await user.type(screen.getByLabelText('Nota (opcional)'), 'revisar')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({ descripcion: 'Arreglo', tipoTrabajoId: tipoId, nota: 'revisar' })
  })

  test('si al editar elige otro tipo, la descripción pasa a ser la del tipo elegido', async () => {
    const { id, tipoId } = await lugarConArreglo()
    const trabajoId = await anotarTrabajo(id, '2026-10-05', 3800000)
    await db.trabajos.update(trabajoId, { descripcion: 'Arreglo viejo', tipoTrabajoId: tipoId, precioLista: 3800000 })

    const user = renderEn(`/trabajo/${trabajoId}`)
    await user.click(await screen.findByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({ descripcion: 'Limpieza', monto: 2500000 })
  })

  test('un trabajo cuyo tipo se borró se edita como "Otro…" y conserva descripción y monto', async () => {
    const { id, tipoId } = await lugarConArreglo()
    const trabajoId = await anotarTrabajo(id, '2026-10-05', 3800000)
    await db.trabajos.update(trabajoId, { descripcion: 'Arreglo', tipoTrabajoId: tipoId, precioLista: 3800000 })
    await borrarTipoTrabajo(tipoId)

    const user = renderEn(`/trabajo/${trabajoId}`)
    expect(await screen.findByRole('radio', { name: 'Otro…' })).toBeChecked()
    expect(screen.getByLabelText('Descripción')).toHaveValue('Arreglo')
    expect(screen.getByLabelText('Monto que te corresponde')).toHaveValue('$ 38.000')
    await user.type(screen.getByLabelText('Nota (opcional)'), 'revisar')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({
      descripcion: 'Arreglo', monto: 3800000, tipoTrabajoId: null, nota: 'revisar',
    })
  })

  test('un trabajo que ya está en un pago muestra el aviso', async () => {
    const { id } = await lugarConArreglo()
    const trabajoId = await anotarTrabajo(id, '2026-10-05')
    await registrarPago({
      lugarId: id, periodoFin: '2026-10-31', fecha: '2026-11-25', monto: 10000, tipo: 'FINAL', nota: '',
      tildados: [trabajoId], destildados: [],
    })
    renderEn(`/trabajo/${trabajoId}`)
    expect(
      await screen.findByText(
        'Este trabajo ya está en un pago: cambiarlo modifica la conciliación de ese período',
      ),
    ).toBeInTheDocument()
  })

  test('borrar pide confirmación y borra', async () => {
    const { id } = await lugarConArreglo()
    const trabajoId = await anotarTrabajo(id, '2026-10-05')
    const user = renderEn(`/trabajo/${trabajoId}`)
    await user.click(await screen.findByRole('button', { name: 'Borrar trabajo' }))
    const dialogo = await screen.findByRole('dialog', { name: '¿Borrar este trabajo?' })
    expect(dialogo).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await db.trabajos.count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Borrar trabajo' }))
    await user.click(screen.getByRole('button', { name: 'Borrar' }))
    await waitFor(async () => expect(await db.trabajos.count()).toBe(0))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
  })

  test('un trabajo inexistente muestra un aviso', async () => {
    renderEn('/trabajo/no-existe')
    expect(await screen.findByText('No encontramos este trabajo.')).toBeInTheDocument()
  })

  test('el lugar se puede cambiar entre los activos más el actual aunque esté archivado', async () => {
    const a = await lugarFijo('ULTIMO', 'Clínica Centro')
    const b = await lugarPorcentaje('Consultorio Sur')
    const c = await lugarPorcentaje('Otro archivado')
    const trabajoId = await anotarTrabajo(c, '2026-10-05')
    await db.lugares.update(c, { archivado: true })
    renderEn(`/trabajo/${trabajoId}`)
    const select = await screen.findByLabelText('Lugar')
    expect(select).toHaveValue(c)
    const nombres = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(nombres.sort()).toEqual([a, b, c].sort())
  })
})

describe('editar: casos delicados', () => {
  async function dosPeriodosPagados(lugarId: string) {
    const agosto = await anotarTrabajo(lugarId, '2026-08-10')
    await registrarPago({
      lugarId, periodoFin: '2026-08-31', fecha: '2026-09-05', monto: 10000, tipo: 'FINAL', nota: '',
      tildados: [agosto], destildados: [],
    })
    const setiembre = await anotarTrabajo(lugarId, '2026-09-10')
    await registrarPago({
      lugarId, periodoFin: '2026-09-30', fecha: '2026-10-05', monto: 10000, tipo: 'FINAL', nota: '',
      tildados: [setiembre], destildados: [],
    })
    return { agosto, setiembre }
  }

  async function cambiarFecha(user: ReturnType<typeof userEvent.setup>, fecha: string) {
    await user.clear(await screen.findByLabelText('Fecha'))
    await user.type(screen.getByLabelText('Fecha'), fecha)
  }

  test('editar un trabajo PAGADO hacia otro período pagado no pregunta ni crea otro pago', async () => {
    const lugarId = await lugarFijo()
    const { agosto } = await dosPeriodosPagados(lugarId)
    const antes = (await db.trabajos.get(agosto))!
    expect(antes.estado).toBe('PAGADO')

    const user = renderEn(`/trabajo/${agosto}`)
    await cambiarFecha(user, '2026-09-20')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.pagos.count()).toBe(2)
    expect(await db.trabajos.get(agosto)).toMatchObject({
      fecha: '2026-09-20', estado: 'PAGADO', pagoId: antes.pagoId,
    })
  })

  test('editar un trabajo PENDIENTE hacia un período pagado sí pregunta, y "No" lo deja NO_PAGADO', async () => {
    const lugarId = await lugarFijo()
    await dosPeriodosPagados(lugarId)
    const pendiente = await anotarTrabajo(lugarId, '2026-10-05')

    const user = renderEn(`/trabajo/${pendiente}`)
    await cambiarFecha(user, '2026-09-20')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('dialog', { name: '¿Este trabajo ya te lo pagaron?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(pendiente)).toMatchObject({ fecha: '2026-09-20', estado: 'NO_PAGADO', pagoId: null })
    expect(await db.pagos.count()).toBe(2)
  })

  test('si falla "Sí" avisa que el trabajo se guardó y no vuelve', async () => {
    const lugarId = await lugarFijo()
    await dosPeriodosPagados(lugarId)
    const pendiente = await anotarTrabajo(lugarId, '2026-10-05')
    vi.spyOn(datosPagos, 'yaMeLoPagaron').mockRejectedValueOnce(new Error('boom'))

    const user = renderEn(`/trabajo/${pendiente}`)
    await cambiarFecha(user, '2026-09-20')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'Sí' }))

    expect(
      await screen.findByText('El trabajo se guardó, pero no pudimos registrar si te lo pagaron.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.trabajos.get(pendiente)).toMatchObject({ fecha: '2026-09-20', estado: 'PENDIENTE' })
    expect(await db.pagos.count()).toBe(2)
  })

  test('si falla "No" avisa que el trabajo se guardó y no vuelve', async () => {
    const lugarId = await lugarFijo()
    await dosPeriodosPagados(lugarId)
    const pendiente = await anotarTrabajo(lugarId, '2026-10-05')
    vi.spyOn(datosPagos, 'marcarNoPagado').mockRejectedValueOnce(new Error('boom'))

    const user = renderEn(`/trabajo/${pendiente}`)
    await cambiarFecha(user, '2026-09-20')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(await screen.findByRole('button', { name: 'No' }))

    expect(
      await screen.findByText('El trabajo se guardó, pero no pudimos registrar si te lo pagaron.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
    expect(await db.trabajos.get(pendiente)).toMatchObject({ estado: 'PENDIENTE' })
  })

  test('cambiar a otro lugar con porcentaje distinto usa el porcentaje de ese lugar', async () => {
    const p = await lugarPorcentaje('Consultorio Sur', 4000)
    const q = await lugarPorcentaje('Consultorio Norte', 5000)
    const user0 = renderEn(`/trabajo/nuevo?lugar=${p}`)
    await user0.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user0.type(screen.getByLabelText('Lo que pagó el cliente'), '200.000')
    await user0.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('heading', { name: 'Origen' })
    const [creado] = await db.trabajos.toArray()
    document.body.innerHTML = ''

    const user = renderEn(`/trabajo/${creado.id}`)
    expect(await screen.findByText('$ 80.000')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Lugar'), q)
    expect(screen.getByText('200.000 × 50 %')).toBeInTheDocument()
    expect(screen.getByText('$ 100.000')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(creado.id)).toMatchObject({
      lugarId: q, porcentajeBp: 5000, monto: 10000000, montoCliente: 20000000,
    })
  })

  test('cambiar a otro lugar de arancel fijo reinicia el tipo y guarda el precio del nuevo lugar', async () => {
    const { id: a, tipoId } = await lugarConArreglo('Clínica Centro')
    const b = await lugarFijo('ULTIMO', 'Clínica Norte')
    const tipoB = await guardarTipoTrabajo({ lugarId: b, nombre: 'Corona', precio: 9000000, orden: 0 })
    const trabajoId = await anotarTrabajo(a, '2026-10-05', 3800000)
    await db.trabajos.update(trabajoId, { descripcion: 'Arreglo', tipoTrabajoId: tipoId, precioLista: 3800000 })

    const user = renderEn(`/trabajo/${trabajoId}`)
    expect(await screen.findByRole('radio', { name: /Arreglo/ })).toBeChecked()
    await user.selectOptions(screen.getByLabelText('Lugar'), b)
    expect(screen.getByRole('radio', { name: /Corona/ })).not.toBeChecked()
    expect(screen.queryByRole('radio', { name: /Arreglo/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elegí qué hiciste')).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({ lugarId: a, precioLista: 3800000 })

    await user.click(screen.getByRole('radio', { name: /Corona/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({
      lugarId: b, descripcion: 'Corona', tipoTrabajoId: tipoB, precioLista: 9000000, monto: 9000000,
    })
  })

  test('pasar un trabajo de arancel fijo a un lugar con porcentaje lo recalcula con ese porcentaje', async () => {
    const { id: a, tipoId } = await lugarConArreglo('Clínica Centro')
    const p = await lugarPorcentaje('Consultorio Sur', 4000)
    const trabajoId = await anotarTrabajo(a, '2026-10-05', 3800000)
    await db.trabajos.update(trabajoId, { descripcion: 'Arreglo', tipoTrabajoId: tipoId, precioLista: 3800000 })

    const user = renderEn(`/trabajo/${trabajoId}`)
    await user.selectOptions(await screen.findByLabelText('Lugar'), p)
    expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue('Arreglo')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '100.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({
      lugarId: p, tipoTrabajoId: null, precioLista: null, montoCliente: 10000000, porcentajeBp: 4000, monto: 4000000,
    })
  })

  test('mover a otro lugar un trabajo pagado avisa antes de guardar y lo deja pendiente', async () => {
    const a = await lugarFijo('ULTIMO', 'Clínica Centro')
    const b = await lugarFijo('ULTIMO', 'Clínica Norte')
    const trabajoId = await anotarTrabajo(a, '2026-10-05', 3800000)
    const pagoId = await registrarPago({
      lugarId: a, periodoFin: '2026-10-31', fecha: '2026-10-25', monto: 3800000, tipo: 'FINAL', nota: '',
      tildados: [trabajoId], destildados: [],
    })

    const user = renderEn(`/trabajo/${trabajoId}`)
    await user.selectOptions(await screen.findByLabelText('Lugar'), b)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    const dialogo = await screen.findByRole('dialog', { name: '¿Mover el trabajo a Clínica Norte?' })
    expect(
      within(dialogo).getByText(
        'Este trabajo estaba pagado en Clínica Centro. Al moverlo vuelve a pendiente en Clínica Norte y el pago de Clínica Centro queda con esa diferencia.',
      ),
    ).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(await db.trabajos.get(trabajoId)).toMatchObject({ lugarId: a, estado: 'PAGADO', pagoId })

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Mover' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({ lugarId: b, estado: 'PENDIENTE', pagoId: null, monto: 3800000 })
    expect(await db.pagos.get(pagoId)).toMatchObject({ lugarId: a })
  })

  test('mover un trabajo pendiente no pregunta nada', async () => {
    const a = await lugarFijo('ULTIMO', 'Clínica Centro')
    const b = await lugarFijo('ULTIMO', 'Clínica Norte')
    const trabajoId = await anotarTrabajo(a, '2026-10-05', 3800000)

    const user = renderEn(`/trabajo/${trabajoId}`)
    await user.selectOptions(await screen.findByLabelText('Lugar'), b)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.get(trabajoId)).toMatchObject({ lugarId: b, estado: 'PENDIENTE' })
  })
})

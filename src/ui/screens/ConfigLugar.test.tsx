import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from '../../data/db'
import { ErrorDatos } from '../../data/errores'
import * as datosLugares from '../../data/lugares'
import { crearLugar, guardarTipoTrabajo } from '../../data/lugares'
import { anotarTrabajo, lugarFijo, reiniciarDb } from '../../data/test-helpers'
import ConfigLugar from './ConfigLugar'
import Lugares from './Lugares'

function renderEn(ruta: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/lugares" element={<Lugares />} />
        <Route path="/lugares/nuevo" element={<ConfigLugar />} />
        <Route path="/lugares/:id/config" element={<ConfigLugar />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

beforeEach(reiniciarDb)
afterEach(() => vi.restoreAllMocks())

describe('nuevo lugar', () => {
  test('crea un lugar por porcentaje', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Consultorio Sur')
    await user.click(screen.getByRole('radio', { name: 'Porcentaje' }))
    await user.type(screen.getByLabelText('Porcentaje que te corresponde'), '40')
    await user.selectOptions(screen.getByLabelText('Cierra el período el día'), '15')
    const desde = screen.getByLabelText('Desde el día')
    await user.clear(desde)
    await user.type(desde, '21')
    const hasta = screen.getByLabelText('Hasta el día')
    await user.clear(hasta)
    await user.type(hasta, '31')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
    const lugares = await db.lugares.toArray()
    expect(lugares).toMatchObject([
      { nombre: 'Consultorio Sur', formaCobro: 'PORCENTAJE', porcentajeBp: 4000, pagoDesdeDia: 21, pagoHastaDia: 31 },
    ])
    expect(lugares[0].reglasCierre).toMatchObject([{ dia: 15 }])
  })

  test('arancel fijo exige al menos un trabajo con precio', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Clínica Norte')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Agregá al menos un trabajo con su precio')).toBeInTheDocument()
    expect(await db.lugares.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: '+ Agregar trabajo' }))
    await user.type(screen.getByLabelText('Trabajo'), 'Limpieza')
    await user.type(screen.getByLabelText('Precio'), '25.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
    const [lugar] = await db.lugares.toArray()
    expect(lugar).toMatchObject({ nombre: 'Clínica Norte', formaCobro: 'ARANCEL_FIJO', porcentajeBp: null })
    expect(await db.tiposTrabajo.toArray()).toMatchObject([
      { lugarId: lugar.id, nombre: 'Limpieza', precio: 2500000, orden: 0 },
    ])
  })

  test('rango de pago inválido (desde > hasta) muestra error y no guarda', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Consultorio Sur')
    await user.click(screen.getByRole('radio', { name: 'Porcentaje' }))
    await user.type(screen.getByLabelText('Porcentaje que te corresponde'), '40')
    const desde = screen.getByLabelText('Desde el día')
    await user.clear(desde)
    await user.type(desde, '25')
    const hasta = screen.getByLabelText('Hasta el día')
    await user.clear(hasta)
    await user.type(hasta, '10')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El primer día no puede ser mayor que el último.')).toBeInTheDocument()
    expect(await db.lugares.count()).toBe(0)

    await user.clear(hasta)
    await user.type(hasta, '40')
    expect(await screen.findByText('Los días van de 1 a 31.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await db.lugares.count()).toBe(0)
  })

  test('un monto con formato inválido muestra el mensaje en línea', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.click(screen.getByRole('button', { name: '+ Agregar trabajo' }))
    await user.type(screen.getByLabelText('Precio'), '1.234.50')
    await user.tab()
    expect(
      await screen.findByText('Monto inválido. Usá coma para los decimales (ej: 1.234,50)'),
    ).toBeInTheDocument()
  })

  test('un monto válido se reformatea al salir del campo', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.click(screen.getByRole('button', { name: '+ Agregar trabajo' }))
    await user.type(screen.getByLabelText('Precio'), '1234,5')
    await user.tab()
    expect(screen.getByLabelText('Precio')).toHaveValue('$ 1.234,50')
  })

  test('un porcentaje inválido muestra el mensaje en línea y no guarda', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Consultorio Sur')
    await user.click(screen.getByRole('radio', { name: 'Porcentaje' }))
    await user.type(screen.getByLabelText('Porcentaje que te corresponde'), '37.5')
    await user.tab()
    expect(await screen.findByText('Porcentaje inválido (ej: 40 o 37,5)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await db.lugares.count()).toBe(0)
  })

  test('el día de cierre ofrece 1 a 31 y "Último día del mes"', async () => {
    renderEn('/lugares/nuevo')
    const select = screen.getByLabelText('Cierra el período el día')
    const opciones = within(select).getAllByRole('option')
    expect(opciones).toHaveLength(32)
    expect(opciones[0]).toHaveTextContent('1')
    expect(opciones[30]).toHaveTextContent('31')
    expect(opciones[31]).toHaveTextContent('Último día del mes')
    expect(select).toHaveValue('ULTIMO')
  })
})

describe('lugar existente', () => {
  test('lugar con trabajos ofrece Archivar y no Borrar', async () => {
    const id = await lugarFijo()
    await anotarTrabajo(id, '2026-10-20')
    renderEn(`/lugares/${id}/config`)

    expect(await screen.findByRole('button', { name: 'Archivar lugar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar lugar' })).not.toBeInTheDocument()
  })

  test('lugar con pagos (sin trabajos) ofrece Archivar y no Borrar', async () => {
    const id = await lugarFijo()
    await db.pagos.add({
      id: 'p1', lugarId: id, periodoFin: '2026-09-30', fecha: '2026-10-22', monto: 1000, tipo: 'FINAL', nota: '', creadoEn: '',
    })
    renderEn(`/lugares/${id}/config`)

    expect(await screen.findByRole('button', { name: 'Archivar lugar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar lugar' })).not.toBeInTheDocument()
  })

  test('lugar sin historial se puede borrar, con confirmación propia', async () => {
    const id = await lugarFijo()
    await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const user = renderEn(`/lugares/${id}/config`)

    await user.click(await screen.findByRole('button', { name: 'Borrar lugar' }))
    const dialogo = screen.getByRole('dialog')
    expect(await db.lugares.count()).toBe(1)
    await user.click(within(dialogo).getByRole('button', { name: 'Borrar' }))

    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
    expect(await db.lugares.count()).toBe(0)
    expect(await db.tiposTrabajo.count()).toBe(0)
  })

  test('si borrarLugar falla por historial, avisa que se puede archivar', async () => {
    const id = await lugarFijo()
    vi.spyOn(datosLugares, 'borrarLugar').mockRejectedValue(new ErrorDatos('LUGAR_CON_TRABAJOS'))
    const user = renderEn(`/lugares/${id}/config`)
    await user.click(await screen.findByRole('button', { name: 'Borrar lugar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Borrar' }))
    expect(
      await screen.findByText('Este lugar tiene historial. Podés archivarlo para que no aparezca más.'),
    ).toBeInTheDocument()
    expect(await db.lugares.count()).toBe(1)
  })

  test('archivar pide confirmación y archiva', async () => {
    const id = await lugarFijo()
    await anotarTrabajo(id, '2026-10-20')
    const user = renderEn(`/lugares/${id}/config`)

    await user.click(await screen.findByRole('button', { name: 'Archivar lugar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archivar' }))

    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
    expect((await db.lugares.get(id))?.archivado).toBe(true)
  })

  test('cancelar el diálogo no borra nada', async () => {
    const id = await lugarFijo()
    const user = renderEn(`/lugares/${id}/config`)
    await user.click(await screen.findByRole('button', { name: 'Borrar lugar' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.lugares.count()).toBe(1)
  })

  test('cambiar el día de cierre avisa desde cuándo rige', async () => {
    const id = await lugarFijo('ULTIMO')
    const user = renderEn(`/lugares/${id}/config`)
    const select = await screen.findByLabelText('Cierra el período el día')
    expect(screen.queryByText(/El cambio rige desde el próximo período/)).not.toBeInTheDocument()
    await user.selectOptions(select, '15')
    expect(screen.getByText(/El cambio rige desde el próximo período \(después del \d+ \w+\)\./)).toBeInTheDocument()
  })

  test('cambiar el rango de pago avisa del recordatorio al guardar', async () => {
    const id = await lugarFijo()
    await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const user = renderEn(`/lugares/${id}/config`)
    const hasta = await screen.findByLabelText('Hasta el día')
    await user.clear(hasta)
    await user.type(hasta, '28')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent(
      'Si agregaste el recordatorio al calendario, volvé a agregarlo desde Más → Recordatorios en el calendario.',
    )
    expect((await db.lugares.get(id))?.pagoHastaDia).toBe(28)
    await user.click(within(dialogo).getByRole('button', { name: 'Entendido' }))
    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
  })

  test('editar un precio actualiza el tipo de trabajo y no toca los trabajos anotados', async () => {
    const id = await lugarFijo()
    const tipoId = await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const trabajoId = await anotarTrabajo(id, '2026-10-20', 2500000)
    const user = renderEn(`/lugares/${id}/config`)
    const precio = await screen.findByLabelText('Precio')
    expect(precio).toHaveValue('$ 25.000')
    await user.clear(precio)
    await user.type(precio, '30.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByRole('heading', { name: 'Lugares' })
    expect((await db.tiposTrabajo.get(tipoId))?.precio).toBe(3000000)
    expect((await db.trabajos.get(trabajoId))?.monto).toBe(2500000)
  })

  test('quitar un trabajo de la lista lo borra al guardar', async () => {
    const id = await lugarFijo()
    await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 })
    const user = renderEn(`/lugares/${id}/config`)
    await screen.findAllByLabelText('Trabajo')
    await user.click(screen.getByRole('button', { name: 'Quitar Limpieza' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByRole('heading', { name: 'Lugares' })
    expect(await db.tiposTrabajo.toArray()).toMatchObject([{ nombre: 'Arreglo' }])
  })

  test('una fila con nombre vacío y precio inválido bloquea el guardado y no borra el tipo guardado', async () => {
    const id = await lugarFijo()
    await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const arreglo = await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 })
    const user = renderEn(`/lugares/${id}/config`)
    const nombres = await screen.findAllByLabelText('Trabajo')
    const precios = screen.getAllByLabelText('Precio')
    await user.clear(nombres[1])
    await user.clear(precios[1])
    await user.type(precios[1], 'abc')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Completá el nombre y un precio mayor a 0')).toBeInTheDocument()
    expect(screen.getByText('Monto inválido. Usá coma para los decimales (ej: 1.234,50)')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lugares' })).not.toBeInTheDocument()
    expect(await db.tiposTrabajo.get(arreglo)).toMatchObject({ nombre: 'Arreglo', precio: 3800000 })
    expect(await db.tiposTrabajo.count()).toBe(2)
  })

  test('si falla el guardado muestra el error y reintentar no duplica el lugar', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Clínica Norte')
    await user.click(screen.getByRole('button', { name: '+ Agregar trabajo' }))
    await user.type(screen.getByLabelText('Trabajo'), 'Limpieza')
    await user.type(screen.getByLabelText('Precio'), '25.000')
    const espia = vi.spyOn(db.tiposTrabajo, 'put').mockRejectedValueOnce(new Error('falla'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('No se pudo guardar. Probá de nuevo.')).toBeInTheDocument()
    expect(await db.lugares.count()).toBe(0)
    espia.mockRestore()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
    expect(await db.lugares.count()).toBe(1)
    expect(await db.tiposTrabajo.count()).toBe(1)
  })

  test('un lugar inexistente muestra un aviso', async () => {
    renderEn('/lugares/no-existe/config')
    expect(await screen.findByText('No encontramos este lugar.')).toBeInTheDocument()
  })
})

describe('lista de lugares', () => {
  test('muestra activos, archivados plegados y el botón para agregar', async () => {
    const a = await lugarFijo('ULTIMO', 'Clínica Centro')
    await crearLugar({
      nombre: 'Consultorio Sur', formaCobro: 'PORCENTAJE', porcentajeBp: 3750, pagoDesdeDia: 1, pagoHastaDia: 10, diaCierre: 15,
    })
    const viejo = await lugarFijo('ULTIMO', 'Lugar viejo')
    await db.lugares.update(viejo, { archivado: true })
    renderEn('/lugares')

    expect(await screen.findByRole('link', { name: /Clínica Centro/ })).toHaveAttribute('href', `/lugares/${a}`)
    expect(screen.getByRole('link', { name: /Consultorio Sur/ })).toHaveTextContent('37,5 %')
    expect(screen.getByRole('link', { name: '+ Agregar lugar' })).toHaveAttribute('href', '/lugares/nuevo')
    const archivados = screen.getByText('Archivados (1)').closest('details')!
    expect(archivados).not.toHaveAttribute('open')
    expect(within(archivados).getByRole('link', { name: /Lugar viejo/ })).toBeInTheDocument()
  })

  test('sin lugares invita a agregar el primero', async () => {
    renderEn('/lugares')
    expect(await screen.findByText(/Todavía no cargaste ningún lugar./)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: '+ Agregar lugar' })).toBeInTheDocument())
  })
})

describe('volver sin guardar', () => {
  test('sin cambios vuelve directo a Lugares', async () => {
    const id = await lugarFijo()
    await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const user = renderEn(`/lugares/${id}/config`)
    await screen.findByDisplayValue('Clínica Centro')

    await user.click(screen.getByRole('link', { name: 'Volver a Lugares' }))
    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('con cambios pregunta "¿Descartar los cambios?" y solo descarta si se confirma', async () => {
    const id = await lugarFijo()
    await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
    const user = renderEn(`/lugares/${id}/config`)
    const nombre = await screen.findByDisplayValue('Clínica Centro')
    await user.type(nombre, ' Norte')

    await user.click(screen.getByRole('link', { name: 'Volver a Lugares' }))
    const dialogo = await screen.findByRole('dialog', { name: '¿Descartar los cambios?' })
    await user.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Clínica Centro Norte')

    await user.click(screen.getByRole('link', { name: 'Volver a Lugares' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descartar' }))
    expect(await screen.findByRole('heading', { name: 'Lugares' })).toBeInTheDocument()
    expect((await db.lugares.get(id))!.nombre).toBe('Clínica Centro')
  })

  test('un lugar nuevo a medio cargar también pregunta', async () => {
    const user = renderEn('/lugares/nuevo')
    await user.type(screen.getByLabelText('Nombre'), 'Consultorio')
    await user.click(screen.getByRole('link', { name: 'Volver a Lugares' }))
    expect(await screen.findByRole('dialog', { name: '¿Descartar los cambios?' })).toBeInTheDocument()
  })
})

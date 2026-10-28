import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { leerAjuste } from '../../data/ajustes'
import { db } from '../../data/db'
import { crearLugar, guardarTipoTrabajo } from '../../data/lugares'
import * as datosTrabajos from '../../data/trabajos'
import { registrarPago } from '../../data/pagos'
import { anotarTrabajo, lugarFijo, reiniciarDb } from '../../data/test-helpers'
import { hoy } from '../../domain/dates'
import { CLAVE_FECHA_RECORDADA } from '../hooks/fechaRecordada'
import FormTrabajo from './FormTrabajo'

function renderEn(ruta: string) {
  const user = userEvent.setup()
  const { unmount } = render(
    <MemoryRouter initialEntries={['/origen', ruta]} initialIndex={1}>
      <Routes>
        <Route path="/origen" element={<h1>Origen</h1>} />
        <Route path="/trabajo/nuevo" element={<FormTrabajo />} />
        <Route path="/trabajo/:id" element={<FormTrabajo />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user, unmount }
}

const lugarPorcentaje = () =>
  crearLugar({
    nombre: 'Consultorio Sur', formaCobro: 'PORCENTAJE', porcentajeBp: 4000, pagoDesdeDia: 21, pagoHastaDia: 31,
    diaCierre: 'ULTIMO',
  })

async function lugarConTipos() {
  const id = await lugarFijo('ULTIMO', 'Clínica Centro')
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Limpieza', precio: 2500000, orden: 0 })
  await guardarTipoTrabajo({ lugarId: id, nombre: 'Arreglo', precio: 3800000, orden: 1 })
  return id
}

/** Un período de setiembre ya pagado: anotar ahí un trabajo dispara "¿ya te lo pagaron?". */
async function periodoPagado(lugarId: string) {
  const previo = await anotarTrabajo(lugarId, '2026-09-10')
  await registrarPago({
    lugarId, periodoFin: '2026-09-30', fecha: '2026-10-05', monto: 10000, tipo: 'FINAL', nota: '',
    tildados: [previo], destildados: [],
  })
  return previo
}

const OTRO_BOTON = 'Anotar otro trabajo (este se guarda)'
const OTRO_TEXTO = 'Guardar y anotar otro'
const FECHA_PAPEL = '2026-05-03'

async function ponerFecha(user: ReturnType<typeof userEvent.setup>, fecha: string) {
  await user.clear(await screen.findByLabelText('Fecha'))
  await user.type(screen.getByLabelText('Fecha'), fecha)
}

beforeEach(async () => {
  window.sessionStorage.clear()
  await reiniciarDb()
})
afterEach(() => vi.restoreAllMocks())

describe('guardar y anotar otro', () => {
  test('en un lugar con porcentaje guarda, no navega, conserva lugar y fecha, limpia el resto y anuncia', async () => {
    const lugarId = await lugarPorcentaje()
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await ponerFecha(user, FECHA_PAPEL)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    await user.type(screen.getByLabelText('¿Qué hiciste?'), 'Corona')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '200.000')
    await user.type(screen.getByLabelText('Descuento antes del % (opcional)'), '50.000')
    await user.type(screen.getByLabelText('Motivo del descuento (opcional)'), 'laboratorio')
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Pérez')
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))

    expect(await screen.findByText('Guardado: Corona · $ 60.000 · 3 may')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Guardado: Corona · $ 60.000 · 3 may')
    expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
    expect(await db.trabajos.toArray()).toMatchObject([
      { lugarId, descripcion: 'Corona', monto: 6000000, fecha: FECHA_PAPEL, nota: 'Pérez' },
    ])
    expect(await leerAjuste('ultimoLugarId', null)).toBe(lugarId)

    expect(screen.getByLabelText('Lugar')).toHaveValue(lugarId)
    expect(screen.getByLabelText('Fecha')).toHaveValue(FECHA_PAPEL)
    expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue('')
    expect(screen.getByLabelText('Lo que pagó el cliente')).toHaveValue('')
    expect(screen.getByLabelText('Descuento antes del % (opcional)')).toHaveValue('')
    expect(screen.queryByLabelText('Motivo del descuento (opcional)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('')
    expect(screen.getByLabelText('¿Qué hiciste?')).toHaveFocus()
    expect(screen.getByRole('button', { name: OTRO_BOTON })).toBeEnabled()

    // El siguiente se guarda como un trabajo nuevo, no pisa el anterior.
    await user.type(screen.getByLabelText('¿Qué hiciste?'), 'Limpieza')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '100.000')
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))
    expect(await screen.findByText('Guardado: Limpieza · $ 40.000 · 3 may')).toBeInTheDocument()
    expect((await db.trabajos.toArray()).map((t) => t.descripcion).sort()).toEqual(['Corona', 'Limpieza'])
  })

  test('en arancel fijo deja sin elegir el tipo y el foco en el primero', async () => {
    const lugarId = await lugarConTipos()
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('radio', { name: /Arreglo/ }))
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Paciente')
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))

    expect(await screen.findByText('Guardado: Arreglo · $ 38.000 · ' + new Date().getDate() + ' ' + MES_ACTUAL)).toBeInTheDocument()
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('')
    expect(screen.getAllByRole('radio')[0]).toHaveFocus()
    expect(screen.getByLabelText('Fecha')).toHaveValue(hoy())
    expect(await db.trabajos.toArray()).toMatchObject([{ descripcion: 'Arreglo', monto: 3800000, nota: 'Paciente' }])
  })

  test('con "Otro…" limpia descripción y monto y deja el foco en la descripción', async () => {
    const lugarId = await lugarFijo()
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.type(await screen.findByLabelText('Descripción'), 'Radiografía')
    await user.type(screen.getByLabelText('Monto que te corresponde'), '12.500')
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))

    expect(await screen.findByText(/^Guardado: Radiografía · \$ 12\.500 · /)).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción')).toHaveValue('')
    expect(screen.getByLabelText('Monto que te corresponde')).toHaveValue('')
    expect(screen.getByLabelText('Descripción')).toHaveFocus()
  })

  test('con datos inválidos muestra los errores y no guarda ni limpia', async () => {
    const lugarId = await lugarPorcentaje()
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))
    expect(await screen.findByText('Ingresá un monto mayor a 0')).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(0)
    expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue('Corona')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  test('si falla el guardado no limpia y deja reintentar', async () => {
    const lugarId = await lugarPorcentaje()
    vi.spyOn(datosTrabajos, 'guardarTrabajo').mockRejectedValueOnce(new Error('boom'))
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.type(await screen.findByLabelText('¿Qué hiciste?'), 'Corona')
    await user.type(screen.getByLabelText('Lo que pagó el cliente'), '100.000')
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))

    expect(await screen.findByText('No se pudo guardar. Probá de nuevo.')).toBeInTheDocument()
    expect(screen.getByLabelText('¿Qué hiciste?')).toHaveValue('Corona')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))
    expect(await screen.findByText(/^Guardado: Corona/)).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(1)
  })

  test('doble toque guarda un solo trabajo', async () => {
    const lugarId = await lugarConTipos()
    const original = datosTrabajos.guardarTrabajo
    const espia = vi.spyOn(datosTrabajos, 'guardarTrabajo').mockImplementation(async (t) => {
      await new Promise((r) => setTimeout(r, 50))
      return original(t)
    })
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('radio', { name: /Limpieza/ }))
    await user.dblClick(screen.getByRole('button', { name: OTRO_BOTON }))

    expect(await screen.findByText(/^Guardado: Limpieza/)).toBeInTheDocument()
    expect(espia).toHaveBeenCalledTimes(1)
    expect(await db.trabajos.count()).toBe(1)
  })

  test('los dos botones quedan deshabilitados mientras se guarda', async () => {
    const lugarId = await lugarConTipos()
    const original = datosTrabajos.guardarTrabajo
    let soltar: () => void = () => undefined
    const pendiente = new Promise<void>((r) => {
      soltar = r
    })
    vi.spyOn(datosTrabajos, 'guardarTrabajo').mockImplementation(async (t) => {
      await pendiente
      return original(t)
    })
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))
    expect(screen.getByRole('button', { name: OTRO_BOTON })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    soltar()
    expect(await screen.findByText(/^Guardado: Limpieza/)).toBeInTheDocument()
  })

  describe('con el diálogo "¿ya te lo pagaron?"', () => {
    async function abrirDialogo() {
      const lugarId = await lugarConTipos()
      const previo = await periodoPagado(lugarId)
      const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
      await ponerFecha(user, '2026-09-20')
      await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
      await user.click(screen.getByRole('button', { name: OTRO_BOTON }))
      expect(await screen.findByRole('dialog', { name: '¿Este trabajo ya te lo pagaron?' })).toBeInTheDocument()
      return { user, previo, lugarId }
    }

    test('"No" marca el trabajo, deja el formulario listo y no navega', async () => {
      const { user, previo } = await abrirDialogo()
      // Todavía no limpió ni anunció: espera la respuesta.
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      await user.click(screen.getByRole('button', { name: 'No' }))

      expect(await screen.findByText('Guardado: Limpieza · $ 25.000 · 20 sep')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
      const nuevo = (await db.trabajos.toArray()).find((t) => t.id !== previo)!
      expect(nuevo).toMatchObject({ fecha: '2026-09-20', estado: 'NO_PAGADO' })
      expect(screen.getByLabelText('Fecha')).toHaveValue('2026-09-20')
      expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
      expect(screen.getByRole('button', { name: OTRO_BOTON })).toBeEnabled()

      // Se puede anotar el siguiente (otro trabajo, no una edición del anterior).
      await user.click(screen.getByRole('radio', { name: /Arreglo/ }))
      await user.click(screen.getByRole('button', { name: OTRO_BOTON }))
      await user.click(await screen.findByRole('button', { name: 'Todavía no sé' }))
      expect(await screen.findByText('Guardado: Arreglo · $ 38.000 · 20 sep')).toBeInTheDocument()
      expect(await db.trabajos.count()).toBe(3)
    })

    test('"Sí" registra el pago y también deja el formulario listo', async () => {
      const { user, previo } = await abrirDialogo()
      await user.click(screen.getByRole('button', { name: 'Sí' }))

      expect(await screen.findByText('Guardado: Limpieza · $ 25.000 · 20 sep')).toBeInTheDocument()
      const nuevo = (await db.trabajos.toArray()).find((t) => t.id !== previo)!
      expect(nuevo.estado).toBe('PAGADO')
      expect(await db.pagos.count()).toBe(2)
      expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
    })

    test('si falla registrar la respuesta avisa y no limpia', async () => {
      const { user } = await abrirDialogo()
      const pagos = await import('../../data/pagos')
      vi.spyOn(pagos, 'marcarNoPagado').mockRejectedValueOnce(new Error('boom'))
      await user.click(screen.getByRole('button', { name: 'No' }))

      expect(
        await screen.findByText('El trabajo se guardó, pero no pudimos registrar si te lo pagaron.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(screen.queryByRole('heading', { name: 'Origen' })).not.toBeInTheDocument()
    })
  })

  test('al editar un trabajo no aparece', async () => {
    const lugarId = await lugarConTipos()
    const trabajoId = await anotarTrabajo(lugarId, '2026-10-05')
    renderEn(`/trabajo/${trabajoId}`)
    expect(await screen.findByRole('heading', { name: 'Editar trabajo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: OTRO_BOTON })).not.toBeInTheDocument()
    expect(screen.queryByText(OTRO_TEXTO)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('al anotar uno nuevo, Guardar sigue siendo el botón principal junto al secundario', async () => {
    const lugarId = await lugarConTipos()
    renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    const guardar = await screen.findByRole('button', { name: 'Guardar' })
    const otro = screen.getByRole('button', { name: OTRO_BOTON })
    expect(otro).toHaveTextContent(OTRO_TEXTO)
    expect(screen.getByText(OTRO_TEXTO)).toBe(otro)
    expect(guardar).toHaveClass('btn--primario')
    expect(otro).toHaveClass('btn--secundario')
    expect(guardar).toHaveAttribute('type', 'submit')
    const barra = guardar.closest('.form__barra') as HTMLElement
    expect(within(barra).getByRole('button', { name: OTRO_BOTON })).toBe(otro)
  })
})

const MES_ACTUAL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][
  new Date().getMonth()
]

function recordar(fecha: string, haceMs: number) {
  window.sessionStorage.setItem(CLAVE_FECHA_RECORDADA, JSON.stringify({ fecha, en: Date.now() - haceMs }))
}

const MIN = 60_000

describe('recordar la última fecha usada', () => {
  test('dentro de los 30 minutos arranca en la fecha anterior y avisa que no es hoy', async () => {
    const lugarId = await lugarConTipos()
    recordar(FECHA_PAPEL, 10 * MIN)
    renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue(FECHA_PAPEL)
    expect(screen.getByText('No es hoy: 3 de mayo de 2026')).toBeInTheDocument()
  })

  test('pasados los 30 minutos arranca en hoy y no avisa', async () => {
    const lugarId = await lugarConTipos()
    recordar(FECHA_PAPEL, 31 * MIN)
    renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue(hoy())
    expect(screen.queryByText(/No es hoy/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hoy' })).not.toBeInTheDocument()
  })

  test('sin storage (o con un valor roto) arranca en hoy', async () => {
    const lugarId = await lugarConTipos()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('sin storage')
    })
    renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue(hoy())
  })

  test('un valor roto en el storage se ignora', async () => {
    const lugarId = await lugarConTipos()
    window.sessionStorage.setItem(CLAVE_FECHA_RECORDADA, '{no es json')
    renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue(hoy())
  })

  test('si no hay storage para guardar, el trabajo igual se guarda', async () => {
    const lugarId = await lugarConTipos()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin storage')
    })
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await user.click(await screen.findByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Origen' })).toBeInTheDocument()
    expect(await db.trabajos.count()).toBe(1)
  })

  test('"Hoy" la corrige y el aviso desaparece', async () => {
    const lugarId = await lugarConTipos()
    recordar(FECHA_PAPEL, 1 * MIN)
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await screen.findByText('No es hoy: 3 de mayo de 2026')
    await user.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(screen.getByLabelText('Fecha')).toHaveValue(hoy())
    expect(screen.queryByText(/No es hoy/)).not.toBeInTheDocument()
  })

  test('el aviso sigue a la fecha que se tipea a mano', async () => {
    const lugarId = await lugarConTipos()
    const { user } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue(hoy())
    expect(screen.queryByText(/No es hoy/)).not.toBeInTheDocument()
    await ponerFecha(user, FECHA_PAPEL)
    expect(screen.getByText('No es hoy: 3 de mayo de 2026')).toBeInTheDocument()
  })

  test('guardar con una fecha pasada la recuerda para el próximo formulario; guardar con hoy la olvida', async () => {
    const lugarId = await lugarConTipos()
    const primero = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await ponerFecha(primero.user, FECHA_PAPEL)
    await primero.user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await primero.user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('heading', { name: 'Origen' })
    primero.unmount()

    const segundo = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue(FECHA_PAPEL)
    await segundo.user.click(screen.getByRole('button', { name: 'Hoy' }))
    await segundo.user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await segundo.user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('heading', { name: 'Origen' })
    segundo.unmount()

    renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue(hoy())
  })

  test('guardar y anotar otro también deja recordada la fecha', async () => {
    const lugarId = await lugarConTipos()
    const { user, unmount } = renderEn(`/trabajo/nuevo?lugar=${lugarId}`)
    await ponerFecha(user, FECHA_PAPEL)
    await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: OTRO_BOTON }))
    await screen.findByText(/^Guardado: Limpieza/)
    expect(JSON.parse(window.sessionStorage.getItem(CLAVE_FECHA_RECORDADA) ?? 'null')).toMatchObject({
      fecha: FECHA_PAPEL,
    })
    unmount()
  })

  test('editar un trabajo usa su fecha, no muestra el aviso y no toca lo recordado', async () => {
    const lugarId = await lugarConTipos()
    const trabajoId = await anotarTrabajo(lugarId, '2026-10-05')
    recordar(FECHA_PAPEL, 1 * MIN)
    const { user } = renderEn(`/trabajo/${trabajoId}`)
    expect(await screen.findByLabelText('Fecha')).toHaveValue('2026-10-05')
    expect(screen.queryByText(/No es hoy/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Limpieza/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('heading', { name: 'Origen' })
    expect(JSON.parse(window.sessionStorage.getItem(CLAVE_FECHA_RECORDADA) ?? 'null')).toMatchObject({
      fecha: FECHA_PAPEL,
    })
  })
})

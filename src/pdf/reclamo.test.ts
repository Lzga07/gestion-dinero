import { describe, expect, test } from 'vitest'
import { calcularAvisos, type Aviso } from '../domain/avisos'
import type { Lugar, Pago, Trabajo } from '../domain/types'
import { datosReclamo } from './reclamo'

const lugar: Lugar = {
  id: 'l1', nombre: 'Clínica Norte', formaCobro: 'ARANCEL_FIJO', porcentajeBp: null,
  reglasCierre: [{ vigenteDesde: '2026-01-01', dia: 'ULTIMO' }], pagoDesdeDia: 21, pagoHastaDia: 25,
  archivado: false, creadoEn: '2026-01-01T00:00:00.000Z',
}
function trabajo(id: string, fecha: string, monto: number, estado: Trabajo['estado'], pagoId: string | null): Trabajo {
  return {
    id, lugarId: 'l1', fecha, descripcion: id, tipoTrabajoId: null, precioLista: monto, montoCliente: null,
    descuento: null, descuentoMotivo: null, porcentajeBp: null, monto, nota: '', estado, pagoId,
    creadoEn: `${fecha}T12:00:00.000Z`, actualizadoEn: `${fecha}T12:00:00.000Z`,
  }
}
function pago(id: string, fecha: string, monto: number, tipo: Pago['tipo']): Pago {
  return { id, lugarId: 'l1', periodoFin: '2026-09-30', fecha, monto, tipo, nota: '', creadoEn: `${fecha}T10:00:00.000Z` }
}

describe('datosReclamo', () => {
  test('junta lo no pagado y las diferencias en plata con la fecha del pago final', () => {
    const trabajos = [
      trabajo('a', '2026-09-20', 5000000, 'PAGADO', 'p2'),
      trabajo('b', '2026-09-25', 4000000, 'PAGADO', 'p2'),
      trabajo('c', '2026-08-10', 3000000, 'NO_PAGADO', null),
    ]
    // Cobrado del período: 10.000 + 70.000 = 80.000 contra 90.000 esperados: faltan 10.000 en plata.
    const pagos = [pago('p1', '2026-10-01', 1000000, 'A_CUENTA'), pago('p2', '2026-10-22', 7000000, 'FINAL')]
    const aviso = calcularAvisos({
      hoy: '2026-10-27', lugares: [lugar], trabajos, pagos, ultimaCopia: null, recordatorioDias: 0, hayDatos: true,
    }).find((a): a is Extract<Aviso, { tipo: 'DEUDA' }> => a.tipo === 'DEUDA')!

    const d = datosReclamo(lugar, aviso, pagos, '2026-10-27')

    expect(d).toMatchObject({ tipo: 'RECLAMO', periodo: null, resumen: null, incluirNotas: true, hoy: '2026-10-27' })
    expect(d.trabajos.map((t) => t.id)).toEqual(['c'])
    expect(d.deudasPlata).toEqual([
      { periodo: { inicio: '2026-09-01', fin: '2026-09-30' }, monto: 1000000, fechaPago: '2026-10-22' },
    ])
  })

  test('si hay varios pagos finales usa la fecha del último', () => {
    const aviso: Extract<Aviso, { tipo: 'DEUDA' }> = {
      tipo: 'DEUDA', lugarId: 'l1', noPagados: [], monto: 1000000,
      deudasPlata: [{ periodo: { inicio: '2026-09-01', fin: '2026-09-30' }, monto: 1000000 }],
    }
    const pagos = [pago('p1', '2026-10-05', 1, 'FINAL'), pago('p2', '2026-10-22', 1, 'FINAL'), pago('p3', '2026-10-25', 1, 'A_CUENTA')]

    expect(datosReclamo(lugar, aviso, pagos, '2026-10-27').deudasPlata[0].fechaPago).toBe('2026-10-22')
  })
})

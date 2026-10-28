import { describe, expect, test } from 'vitest';
import { type Aviso, calcularAvisos } from './avisos';
import { INICIO_DE_LOS_TIEMPOS, periodoQueContiene } from './periodos';
import type { EstadoPago, Lugar, Pago, TipoPago, Trabajo } from './types';

function t(id: string, fecha: string, monto: number, estado: EstadoPago = 'PENDIENTE', pagoId: string | null = null, lugarId = 'L1'): Trabajo {
  return {
    id, lugarId, fecha, descripcion: id, tipoTrabajoId: null, precioLista: null,
    montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null,
    monto, nota: '', estado, pagoId, creadoEn: '', actualizadoEn: '',
  };
}

function lugar(id: string, nombre: string, extra: Partial<Lugar> = {}): Lugar {
  return {
    id, nombre, formaCobro: 'ARANCEL_FIJO', porcentajeBp: null,
    reglasCierre: [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 'ULTIMO' }],
    pagoDesdeDia: 21, pagoHastaDia: 31, archivado: false, creadoEn: '', ...extra,
  };
}

function pago(id: string, periodoFin: string, monto: number, tipo: TipoPago, lugarId = 'L1'): Pago {
  return { id, lugarId, periodoFin, fecha: '2026-10-25', monto, tipo, nota: '', creadoEn: '' };
}

const tipos = (avisos: Aviso[]) => avisos.map(a => a.tipo);

const clinica = lugar('L1', 'Clínica');
const base = {
  hoy: '2026-10-27', lugares: [clinica], trabajos: [] as Trabajo[], pagos: [] as Pago[],
  ultimaCopia: null as string | null, recordatorioDias: 7, hayDatos: true,
};
// Con hayDatos y sin copia previa saldría COPIA: los avisos de pago se prueban con el recordatorio desactivado.
const sinCopia = { ...base, recordatorioDias: 0 };
const SEP = periodoQueContiene(clinica.reglasCierre, '2026-09-15');

test('pago atrasado recién el día siguiente al fin de la ventana', () => {
  const args = { ...sinCopia, trabajos: [t('a', '2026-09-10', 20000000)] };
  expect(tipos(calcularAvisos({ ...args, hoy: '2026-10-31' }))).toEqual([]);
  const avisos = calcularAvisos({ ...args, hoy: '2026-11-01' });
  expect(tipos(avisos)).toEqual(['PAGO_ATRASADO']);
  expect(avisos[0]).toEqual({ tipo: 'PAGO_ATRASADO', lugarId: 'L1', periodo: SEP, monto: 20000000 });
});

test('período sin trabajos no genera aviso', () => {
  expect(calcularAvisos({ ...sinCopia, hoy: '2026-11-15' })).toEqual([]);
  // El trabajo de otro lugar no hace que este lugar tenga avisos.
  const otro = lugar('L2', 'Otro');
  const args = { ...sinCopia, hoy: '2026-11-15', lugares: [clinica, otro], trabajos: [t('x', '2026-09-10', 100, 'PENDIENTE', null, 'L2')] };
  const avisos = calcularAvisos(args);
  expect(avisos.map(a => ('lugarId' in a ? a.lugarId : null))).toEqual(['L2']);
});

test('"No me pagaron" (todos NO_PAGADO) cambia atraso por DEUDA', () => {
  const pendientes = [t('a', '2026-09-10', 20000000), t('b', '2026-09-20', 5000000)];
  const antes = calcularAvisos({ ...sinCopia, hoy: '2026-11-05', trabajos: pendientes });
  expect(tipos(antes)).toEqual(['PAGO_ATRASADO']);
  const noPagados = pendientes.map(tr => ({ ...tr, estado: 'NO_PAGADO' as const }));
  const despues = calcularAvisos({ ...sinCopia, hoy: '2026-11-05', trabajos: noPagados });
  expect(tipos(despues)).toEqual(['DEUDA']);
  expect(despues[0]).toEqual({ tipo: 'DEUDA', lugarId: 'L1', noPagados, deudasPlata: [], monto: 25000000 });
});

test('trabajo olvidado PENDIENTE en período ya pagado → SIN_CONCILIAR', () => {
  const pagado = t('a', '2026-09-10', 10000000, 'PAGADO', 'p1');
  const olvidado = t('d', '2026-09-28', 2000000);
  const args = { ...sinCopia, hoy: '2026-11-05', trabajos: [pagado, olvidado], pagos: [pago('p1', SEP.fin, 10000000, 'FINAL')] };
  const avisos = calcularAvisos(args);
  expect(tipos(avisos)).toEqual(['SIN_CONCILIAR']);
  expect(avisos[0]).toEqual({ tipo: 'SIN_CONCILIAR', lugarId: 'L1', periodo: SEP, trabajos: [olvidado], faltaACuenta: 0, monto: 2000000 });
  // Dentro de la ventana de pago todavía no avisa.
  expect(tipos(calcularAvisos({ ...args, hoy: '2026-10-31' }))).toEqual([]);
});

describe('pagos solo a cuenta, vencida la ventana', () => {
  // a (100.000) y b (50.000) tildados como pagados con un pago a cuenta de 90.000: faltan 60.000 en plata.
  const a = t('a', '2026-09-03', 10000000, 'PAGADO', 'p1');
  const b = t('b', '2026-09-10', 5000000, 'PAGADO', 'p1');
  const aCuenta = pago('p1', SEP.fin, 9000000, 'A_CUENTA');

  test('sin pendientes ni pago final, lo que falta en plata genera SIN_CONCILIAR', () => {
    const args = { ...sinCopia, trabajos: [a, b], pagos: [aCuenta] };
    expect(calcularAvisos({ ...args, hoy: '2026-10-31' })).toEqual([]);
    expect(calcularAvisos({ ...args, hoy: '2026-11-01' })).toEqual([
      { tipo: 'SIN_CONCILIAR', lugarId: 'L1', periodo: SEP, trabajos: [], faltaACuenta: 6000000, monto: 6000000 },
    ]);
  });

  test('con pendientes, el aviso junta los trabajos y lo que falta en plata', () => {
    const c = t('c', '2026-09-20', 2000000);
    const avisos = calcularAvisos({ ...sinCopia, hoy: '2026-11-05', trabajos: [a, b, c], pagos: [aCuenta] });
    expect(avisos).toEqual([
      { tipo: 'SIN_CONCILIAR', lugarId: 'L1', periodo: SEP, trabajos: [c], faltaACuenta: 6000000, monto: 8000000 },
    ]);
  });

  test('con un pago final, lo que falta ya es deuda y no SIN_CONCILIAR', () => {
    const cierre = pago('p2', SEP.fin, 0, 'FINAL');
    const avisos = calcularAvisos({ ...sinCopia, hoy: '2026-11-05', trabajos: [a, b], pagos: [aCuenta, cierre] });
    expect(avisos).toEqual([
      { tipo: 'DEUDA', lugarId: 'L1', noPagados: [], deudasPlata: [{ periodo: SEP, monto: 6000000 }], monto: 6000000 },
    ]);
  });

  test('si lo cobrado alcanza, no avisa', () => {
    const completo = pago('p1', SEP.fin, 15000000, 'A_CUENTA');
    expect(calcularAvisos({ ...sinCopia, hoy: '2026-11-05', trabajos: [a, b], pagos: [completo] })).toEqual([]);
  });
});

test('DEUDA suma NO_PAGADO y deuda en plata del mismo lugar en un solo aviso', () => {
  const c = t('c', '2026-08-10', 4000000, 'NO_PAGADO');
  const a = t('a', '2026-09-03', 10000000, 'PAGADO', 'p1');
  const b = t('b', '2026-09-10', 5000000, 'PAGADO', 'p1');
  const avisos = calcularAvisos({
    ...sinCopia, hoy: '2026-11-05', trabajos: [c, a, b], pagos: [pago('p1', SEP.fin, 12000000, 'FINAL')],
  });
  expect(avisos).toEqual([
    { tipo: 'DEUDA', lugarId: 'L1', noPagados: [c], deudasPlata: [{ periodo: SEP, monto: 3000000 }], monto: 7000000 },
  ]);
});

test('lugar archivado con deuda sigue avisando', () => {
  const archivado = lugar('L1', 'Clínica', { archivado: true });
  const c = t('c', '2026-08-10', 4000000, 'NO_PAGADO');
  const avisos = calcularAvisos({ ...sinCopia, lugares: [archivado], trabajos: [c] });
  expect(tipos(avisos)).toEqual(['DEUDA']);
});

describe('COPIA', () => {
  const copia = (over: Partial<typeof base>) => calcularAvisos({ ...base, ...over });
  test('nunca hecha con datos avisa con diasSinCopia null', () => {
    expect(copia({})).toEqual([{ tipo: 'COPIA', diasSinCopia: null }]);
  });
  test('avisa a los 7 días y no a los 6', () => {
    expect(copia({ ultimaCopia: '2026-10-20T15:30:00' })).toEqual([{ tipo: 'COPIA', diasSinCopia: 7 }]);
    expect(copia({ ultimaCopia: '2026-10-21T08:00:00' })).toEqual([]);
  });
  test('desactivada con 0 no avisa', () => {
    expect(copia({ recordatorioDias: 0 })).toEqual([]);
    expect(copia({ recordatorioDias: 0, ultimaCopia: '2026-01-01T10:00:00' })).toEqual([]);
  });
  test('sin datos no avisa', () => {
    expect(copia({ hayDatos: false })).toEqual([]);
  });
});

test('orden: PAGO_ATRASADO, DEUDA, SIN_CONCILIAR, COPIA; dentro de cada tipo por fin de período y nombre', () => {
  const lA = lugar('LA', 'Zeta');
  const lB = lugar('LB', 'Alfa');
  const lC = lugar('LC', 'Medio');
  const lD = lugar('LD', 'Delta');
  const trabajos = [
    t('z1', '2026-09-10', 100, 'PENDIENTE', null, 'LA'),
    t('a1', '2026-09-10', 200, 'PENDIENTE', null, 'LB'),
    t('a0', '2026-08-10', 300, 'PENDIENTE', null, 'LB'),
    t('m1', '2026-09-10', 400, 'NO_PAGADO', null, 'LC'),
    t('d1', '2026-09-10', 500, 'PAGADO', 'pd', 'LD'),
    t('d2', '2026-09-12', 600, 'PENDIENTE', null, 'LD'),
  ];
  const pagos = [pago('pd', '2026-09-30', 500, 'FINAL', 'LD')];
  const avisos = calcularAvisos({ ...base, hoy: '2026-11-15', lugares: [lA, lB, lC, lD], trabajos, pagos });
  expect(tipos(avisos)).toEqual(['PAGO_ATRASADO', 'PAGO_ATRASADO', 'PAGO_ATRASADO', 'DEUDA', 'SIN_CONCILIAR', 'COPIA']);
  const atrasos = avisos.filter((a): a is Extract<Aviso, { tipo: 'PAGO_ATRASADO' }> => a.tipo === 'PAGO_ATRASADO');
  expect(atrasos.map(a => [a.lugarId, a.periodo.fin])).toEqual([
    ['LB', '2026-08-31'], ['LB', '2026-09-30'], ['LA', '2026-09-30'],
  ]);
});

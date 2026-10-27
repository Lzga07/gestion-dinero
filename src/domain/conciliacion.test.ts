import { expect, test } from 'vitest';
import {
  type CambioTrabajo,
  cobradoPorPeriodo,
  requierePregunta,
  resolverPago,
  resumenPeriodo,
  trabajosOfrecidosParaPago,
} from './conciliacion';
import { INICIO_DE_LOS_TIEMPOS, periodoQueContiene } from './periodos';
import type { EstadoPago, Lugar, Pago, TipoPago, Trabajo } from './types';

function t(id: string, fecha: string, monto: number, estado: EstadoPago = 'PENDIENTE', pagoId: string | null = null): Trabajo {
  return {
    id, lugarId: 'L1', fecha, descripcion: id, tipoTrabajoId: null, precioLista: null,
    montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null,
    monto, nota: '', estado, pagoId, creadoEn: '', actualizadoEn: '',
  };
}

const lugarUlt: Lugar = {
  id: 'L1', nombre: 'Clínica', formaCobro: 'ARANCEL_FIJO', porcentajeBp: null,
  reglasCierre: [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 'ULTIMO' }],
  pagoDesdeDia: 21, pagoHastaDia: 31, archivado: false, creadoEn: '',
};

function pago(id: string, periodoFin: string, monto: number, tipo: TipoPago, lugarId = 'L1'): Pago {
  return { id, lugarId, periodoFin, fecha: '2026-10-25', monto, tipo, nota: '', creadoEn: '' };
}

function aplicar(trabajos: Trabajo[], cambios: CambioTrabajo[]): Trabajo[] {
  return trabajos.map(tr => {
    const c = cambios.find(x => x.id === tr.id);
    return c ? { ...tr, estado: c.estado, pagoId: c.pagoId } : tr;
  });
}

const SEP = periodoQueContiene(lugarUlt.reglasCierre, '2026-09-15');
const AGO = periodoQueContiene(lugarUlt.reglasCierre, '2026-08-15');

function septiembre(): Trabajo[] {
  return [t('a', '2026-09-03', 20000000), t('b', '2026-09-10', 25000000), t('corona', '2026-09-20', 4500000)];
}

test('pago justo: todo PAGADO, nada falta', () => {
  const trabajos = septiembre();
  const p = pago('p1', SEP.fin, 49500000, 'FINAL');
  const cambios = resolverPago({ pago: p, tildados: trabajos, destildados: [] });
  const despues = aplicar(trabajos, cambios);
  const r = resumenPeriodo(lugarUlt, SEP, despues, [p]);
  expect(despues.every(x => x.estado === 'PAGADO' && x.pagoId === 'p1')).toBe(true);
  expect(r.teCorresponde).toBe(49500000);
  expect(r.cobrado).toBe(49500000);
  expect(r.faltaCobrar).toBe(0);
  expect(r.deudaPlata).toBe(0);
  expect(r.aFavor).toBe(0);
  expect(r.pendientes).toEqual([]);
  expect(r.noPagados).toEqual([]);
  expect(r.tienePagos).toBe(true);
  expect(r.cantidad).toBe(3);
});

test('lugar que paga un total menor, FINAL: la diferencia es deuda en plata', () => {
  const trabajos = septiembre();
  const p = pago('p1', SEP.fin, 45000000, 'FINAL');
  const cambios = resolverPago({ pago: p, tildados: trabajos, destildados: [] });
  const r = resumenPeriodo(lugarUlt, SEP, aplicar(trabajos, cambios), [p]);
  expect(r.cobrado).toBe(45000000);
  expect(r.faltaCobrar).toBe(4500000);
  expect(r.deudaPlata).toBe(4500000);
});

test('destildado con FINAL queda NO_PAGADO y no se cuenta dos veces como deuda', () => {
  const trabajos = septiembre();
  const [a, b, corona] = trabajos;
  const p = pago('p1', SEP.fin, 45000000, 'FINAL');
  const cambios = resolverPago({ pago: p, tildados: [a, b], destildados: [corona] });
  const r = resumenPeriodo(lugarUlt, SEP, aplicar(trabajos, cambios), [p]);
  expect(cambios.find(c => c.id === 'corona')!.estado).toBe('NO_PAGADO');
  expect(cambios.find(c => c.id === 'corona')!.pagoId).toBeNull();
  expect(r.noPagados.map(x => x.id)).toEqual(['corona']);
  expect(r.deudaPlata).toBe(0);
  expect(r.faltaCobrar).toBe(4500000);
});

test('A_CUENTA deja destildados PENDIENTE y no genera deuda', () => {
  const trabajos = [t('x', '2026-09-03', 21000000), t('y', '2026-09-10', 24000000), t('z', '2026-09-20', 4500000)];
  const [x, y, z] = trabajos;
  const p = pago('p1', SEP.fin, 20000000, 'A_CUENTA');
  const cambios = resolverPago({ pago: p, tildados: [x], destildados: [y, z] });
  const despues = aplicar(trabajos, cambios);
  const r = resumenPeriodo(lugarUlt, SEP, despues, [p]);
  expect(cambios.find(c => c.id === 'x')).toEqual({ id: 'x', estado: 'PAGADO', pagoId: 'p1' });
  expect(cambios.find(c => c.id === 'y')).toEqual({ id: 'y', estado: 'PENDIENTE', pagoId: null });
  expect(r.pendientes).toHaveLength(2);
  expect(r.noPagados).toHaveLength(0);
  expect(r.deudaPlata).toBe(0);
  expect(r.faltaCobrar).toBe(29500000);
});

test('A_CUENTA y después FINAL por el resto exacto: falta 10.000 y es deuda', () => {
  const trabajos = [t('x', '2026-09-03', 21000000), t('y', '2026-09-10', 24000000), t('z', '2026-09-20', 4500000)];
  const [x, y, z] = trabajos;
  const p1 = pago('p1', SEP.fin, 20000000, 'A_CUENTA');
  let estado = aplicar(trabajos, resolverPago({ pago: p1, tildados: [x], destildados: [y, z] }));
  const p2 = pago('p2', SEP.fin, 28500000, 'FINAL');
  const pendientes = estado.filter(tr => tr.estado === 'PENDIENTE');
  estado = aplicar(estado, resolverPago({ pago: p2, tildados: pendientes, destildados: [] }));
  const r = resumenPeriodo(lugarUlt, SEP, estado, [p1, p2]);
  expect(estado.find(tr => tr.id === 'y')!.pagoId).toBe('p2');
  expect(r.cobrado).toBe(48500000);
  expect(r.faltaCobrar).toBe(1000000);
  expect(r.deudaPlata).toBe(1000000);
});

test('un pago que incluye un trabajo atrasado de agosto', () => {
  const sep = septiembre();
  const ago = t('ago', '2026-08-12', 4000000, 'NO_PAGADO');
  const todos = [...sep, ago];
  const p = pago('p1', SEP.fin, 53500000, 'FINAL');
  const cambios = resolverPago({ pago: p, tildados: todos, destildados: [] });
  const despues = aplicar(todos, cambios);
  const cobrado = cobradoPorPeriodo(lugarUlt, despues, [p]);
  expect(cobrado.get('2026-08-31')).toBe(4000000);
  expect(cobrado.get('2026-09-30')).toBe(49500000);
  expect(despues.find(tr => tr.id === 'ago')).toMatchObject({ estado: 'PAGADO', pagoId: 'p1' });
  const rAgo = resumenPeriodo(lugarUlt, AGO, despues, [p]);
  expect(rAgo.cobrado).toBe(4000000);
  expect(rAgo.faltaCobrar).toBe(0);
  expect(rAgo.tienePagos).toBe(false);
  const rSep = resumenPeriodo(lugarUlt, SEP, despues, [p]);
  expect(rSep.faltaCobrar).toBe(0);
  expect(rSep.deudaPlata).toBe(0);
});

test('editar el monto de un trabajo ya pagado no cambia lo cobrado', () => {
  const trabajos = septiembre();
  const p = pago('p1', SEP.fin, 49500000, 'FINAL');
  const pagados = aplicar(trabajos, resolverPago({ pago: p, tildados: trabajos, destildados: [] }));
  const editados = pagados.map(tr => (tr.id === 'a' ? { ...tr, monto: 30000000 } : tr));
  expect(cobradoPorPeriodo(lugarUlt, editados, [p]).get(SEP.fin)).toBe(49500000);
  const r = resumenPeriodo(lugarUlt, SEP, editados, [p]);
  expect(r.cobrado).toBe(49500000);
  expect(r.teCorresponde).toBe(59500000);
  expect(r.faltaCobrar).toBe(10000000);
});

test('recibido mayor que lo esperado: aFavor y sin deuda', () => {
  const trabajos = septiembre();
  const p = pago('p1', SEP.fin, 50000000, 'FINAL');
  const r = resumenPeriodo(lugarUlt, SEP, aplicar(trabajos, resolverPago({ pago: p, tildados: trabajos, destildados: [] })), [p]);
  expect(r.cobrado).toBe(50000000);
  expect(r.faltaCobrar).toBe(-500000);
  expect(r.aFavor).toBe(500000);
  expect(r.deudaPlata).toBe(0);
});

test('requierePregunta', () => {
  expect(requierePregunta(495, 495, 0)).toBe(false);
  expect(requierePregunta(495, 450, 0)).toBe(true);
  expect(requierePregunta(450, 450, 1)).toBe(true);
  expect(requierePregunta(495, 500, 0)).toBe(false);
});

test('sin pagos: nada cobrado, tienePagos false, pendientes listados', () => {
  const r = resumenPeriodo(lugarUlt, SEP, septiembre(), []);
  expect(r.cobrado).toBe(0);
  expect(r.faltaCobrar).toBe(49500000);
  expect(r.deudaPlata).toBe(0);
  expect(r.tienePagos).toBe(false);
  expect(r.pendientes.map(x => x.id)).toEqual(['a', 'b', 'corona']);
});

test('ignora trabajos y pagos de otros lugares', () => {
  const ajenos: Trabajo[] = [{ ...t('otro', '2026-09-05', 99900000), lugarId: 'L2' }];
  const pAjeno = pago('pX', SEP.fin, 99900000, 'FINAL', 'L2');
  const trabajos = [...septiembre(), ...ajenos];
  const r = resumenPeriodo(lugarUlt, SEP, trabajos, [pAjeno]);
  expect(r.cantidad).toBe(3);
  expect(r.cobrado).toBe(0);
  expect(r.tienePagos).toBe(false);
  expect(cobradoPorPeriodo(lugarUlt, trabajos, [pAjeno]).size).toBe(0);
});

test('resolverPago no toca lo que no se tilda ni se destilda', () => {
  const ago = t('ago', '2026-08-12', 4000000, 'NO_PAGADO');
  const p = pago('p1', SEP.fin, 20000000, 'FINAL');
  const cambios = resolverPago({ pago: p, tildados: [septiembre()[0]], destildados: [] });
  expect(cambios.map(c => c.id)).toEqual(['a']);
  expect(cambios.find(c => c.id === ago.id)).toBeUndefined();
});

test('trabajosOfrecidosParaPago agrupa anteriores pendientes y no pagados', () => {
  const jul = periodoQueContiene(lugarUlt.reglasCierre, '2026-07-15');
  const trabajos = [
    t('sepP', '2026-09-03', 100, 'PENDIENTE'),
    t('sepN', '2026-09-04', 200, 'NO_PAGADO'),
    t('sepOk', '2026-09-05', 300, 'PAGADO', 'p0'),
    t('agoP', '2026-08-03', 400, 'PENDIENTE'),
    t('agoOk', '2026-08-04', 500, 'PAGADO', 'p0'),
    t('julN', '2026-07-03', 600, 'NO_PAGADO'),
    t('junOk', '2026-06-03', 700, 'PAGADO', 'p0'),
    t('octP', '2026-10-03', 800, 'PENDIENTE'),
    { ...t('ajeno', '2026-08-03', 900, 'PENDIENTE'), lugarId: 'L2' },
  ];
  const r = trabajosOfrecidosParaPago(lugarUlt, SEP.fin, trabajos);
  expect(r.delPeriodo.map(x => x.id)).toEqual(['sepP', 'sepN']);
  expect(r.anteriores.map(g => g.periodo)).toEqual([AGO, jul]);
  expect(r.anteriores.map(g => g.trabajos.map(x => x.id))).toEqual([['agoP'], ['julN']]);
  expect(r.anteriores.some(g => g.periodo.fin === SEP.fin)).toBe(false);
});

import { describe, expect, test } from 'vitest';
import { gananciaPorLugarPorMes, gastosPorCategoria, resumenMes } from './totales';
import type { Categoria, Movimiento, Trabajo } from './types';

function t(id: string, lugarId: string, fecha: string, monto: number, estado: Trabajo['estado'] = 'PENDIENTE'): Trabajo {
  return {
    id, lugarId, fecha, descripcion: id, tipoTrabajoId: null, precioLista: null,
    montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null,
    monto, nota: '', estado, pagoId: null, creadoEn: '', actualizadoEn: '',
  };
}

function m(id: string, tipo: Movimiento['tipo'], fecha: string, monto: number, categoriaId = 'c1'): Movimiento {
  return { id, tipo, fecha, monto, categoriaId, nota: '', creadoEn: '' };
}

function cat(id: string, tipo: Categoria['tipo'], ambito: Categoria['ambito'], orden: number): Categoria {
  return { id, nombre: id, tipo, ambito, icono: '', color: '', orden };
}

test('resumenMes: ganado = trabajos + otros ingresos; saldo = ganado − gastos; solo hasta hoy', () => {
  const trabajos = [
    t('a', 'L1', '2026-10-05', 70000000, 'PAGADO'),
    t('b', 'L1', '2026-10-27', 30000000, 'PENDIENTE'),
    t('c', 'L2', '2026-10-15', 12000000, 'NO_PAGADO'),
    t('futuro', 'L1', '2026-10-28', 5000000),
    t('mesAnterior', 'L1', '2026-09-30', 3000000),
  ];
  const movs = [
    m('i1', 'INGRESO', '2026-10-10', 6000000),
    m('i2', 'INGRESO', '2026-10-28', 1000000),
    m('g1', 'GASTO', '2026-10-03', 20000000),
    m('g2', 'GASTO', '2026-10-27', 7750000),
    m('g3', 'GASTO', '2026-10-29', 900000),
    m('g4', 'GASTO', '2026-09-30', 800000),
  ];
  expect(resumenMes('2026-10', '2026-10-27', trabajos, movs))
    .toEqual({ ganadoTrabajos: 112000000, otrosIngresos: 6000000, ganado: 118000000, gastos: 27750000, saldo: 90250000 });
});

test('resumenMes: mes vacío da ceros y el saldo puede ser negativo', () => {
  expect(resumenMes('2026-10', '2026-10-27', [], []))
    .toEqual({ ganadoTrabajos: 0, otrosIngresos: 0, ganado: 0, gastos: 0, saldo: 0 });
  expect(resumenMes('2026-10', '2026-10-27', [], [m('g', 'GASTO', '2026-10-01', 500)]).saldo).toBe(-500);
});

test('gananciaPorLugarPorMes agrupa por mes calendario de la fecha', () => {
  const trabajos = [
    t('a', 'L1', '2026-09-30', 1000, 'PAGADO'),
    t('b', 'L1', '2026-10-01', 2000, 'PENDIENTE'),
    t('c', 'L1', '2026-10-31', 500, 'NO_PAGADO'),
    t('d', 'L2', '2026-10-15', 700),
    t('e', 'L2', '2026-08-15', 9999),
  ];
  const r = gananciaPorLugarPorMes(['2026-09', '2026-10', '2026-11'], trabajos);
  expect([...r.keys()]).toEqual(['2026-09', '2026-10', '2026-11']);
  expect(Object.fromEntries(r.get('2026-09')!)).toEqual({ L1: 1000 });
  expect(Object.fromEntries(r.get('2026-10')!)).toEqual({ L1: 2500, L2: 700 });
  expect(r.get('2026-11')!.size).toBe(0);
});

describe('gastosPorCategoria', () => {
  const categorias = [
    cat('insumos', 'GASTO', 'TRABAJO', 1),
    cat('alquiler', 'GASTO', 'PERSONAL', 2),
    cat('comida', 'GASTO', 'PERSONAL', 3),
    cat('vacia', 'GASTO', 'PERSONAL', 4),
    cat('empate', 'GASTO', 'TRABAJO', 5),
    cat('extra', 'INGRESO', null, 6),
  ];
  const movs = [
    m('1', 'GASTO', '2026-10-02', 3000, 'insumos'),
    m('2', 'GASTO', '2026-10-09', 1000, 'insumos'),
    m('3', 'GASTO', '2026-10-03', 9000, 'alquiler'),
    m('4', 'GASTO', '2026-10-04', 2000, 'comida'),
    m('5', 'GASTO', '2026-10-05', 4000, 'empate'),
    m('6', 'GASTO', '2026-09-30', 7777, 'comida'),
    m('7', 'INGRESO', '2026-10-06', 50000, 'extra'),
  ];
  test('ordena de mayor a menor, desempata por orden y omite ceros e ingresos', () => {
    const r = gastosPorCategoria('2026-10', movs, categorias, null);
    expect(r.map(x => [x.categoria.id, x.monto])).toEqual([
      ['alquiler', 9000], ['insumos', 4000], ['empate', 4000], ['comida', 2000],
    ]);
  });
  test('filtra por ámbito', () => {
    expect(gastosPorCategoria('2026-10', movs, categorias, 'PERSONAL').map(x => x.categoria.id)).toEqual(['alquiler', 'comida']);
    expect(gastosPorCategoria('2026-10', movs, categorias, 'TRABAJO').map(x => x.categoria.id)).toEqual(['insumos', 'empate']);
  });
});

import { describe, expect, test } from 'vitest';
import { MAX_CENTAVOS } from './money';
import { type EntradaTrabajo, calcularTrabajo } from './trabajos';

describe('calcularTrabajo', () => {
  test('arancel fijo toma el precio de la lista', () =>
    expect(calcularTrabajo({ forma: 'ARANCEL_FIJO', tipo: { id: 't', lugarId: 'l', nombre: 'Arreglo', precio: 3800000, orden: 0 } }))
      .toMatchObject({ ok: true, monto: 3800000, descripcion: 'Arreglo', detalle: '' }));
  test('arancel fijo "Otro…" usa nombre y monto a mano', () =>
    expect(calcularTrabajo({ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: 'Urgencia', otroMonto: 5000000 }))
      .toMatchObject({ ok: true, monto: 5000000, descripcion: 'Urgencia' }));
  test('arancel fijo "Otro…" recorta el nombre', () =>
    expect(calcularTrabajo({ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: '  Urgencia ', otroMonto: 5000000 }))
      .toMatchObject({ ok: true, descripcion: 'Urgencia' }));
  test('porcentaje con descuento: (200.000 − 50.000) × 40 % = 60.000', () =>
    expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: 'Corona', montoCliente: 20000000, descuento: 5000000, porcentajeBp: 4000 }))
      .toEqual({ ok: true, monto: 6000000, descripcion: 'Corona', detalle: '(200.000 − 50.000) × 40 %' }));
  test('porcentaje sin descuento', () =>
    expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 10000000, descuento: null, porcentajeBp: 4000 }))
      .toMatchObject({ monto: 4000000, detalle: '100.000 × 40 %' }));
  test('porcentaje con descuento 0 se trata como sin descuento', () =>
    expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 10000000, descuento: 0, porcentajeBp: 4000 }))
      .toMatchObject({ monto: 4000000, detalle: '100.000 × 40 %' }));
  test('porcentaje con decimales y redondeo al centavo', () =>
    expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 12345, descuento: null, porcentajeBp: 3750 }))
      .toEqual({ ok: true, monto: 4629, descripcion: 'X', detalle: '123,45 × 37,5 %' }));
  test('porcentaje recorta la descripción', () =>
    expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: '  Corona ', montoCliente: 100, descuento: null, porcentajeBp: 4000 }))
      .toMatchObject({ ok: true, descripcion: 'Corona' }));

  test.each([
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: 200, porcentajeBp: 4000 }, 'DESCUENTO_MAYOR'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 0, descuento: null, porcentajeBp: 4000 }, 'MONTO_INVALIDO'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: null, descuento: null, porcentajeBp: 4000 }, 'MONTO_INVALIDO'],
    [{ forma: 'PORCENTAJE', descripcion: '  ', montoCliente: 100, descuento: null, porcentajeBp: 4000 }, 'FALTA_DESCRIPCION'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: null, porcentajeBp: 0 }, 'PORCENTAJE_INVALIDO'],
    [{ forma: 'ARANCEL_FIJO', tipo: null }, 'FALTA_TIPO'],
    [{ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: 'A', otroMonto: 0 }, 'MONTO_INVALIDO'],
    // extras
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: MAX_CENTAVOS + 1, descuento: null, porcentajeBp: 4000 }, 'MONTO_INVALIDO'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: null, porcentajeBp: 10001 }, 'PORCENTAJE_INVALIDO'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: null, porcentajeBp: -5 }, 'PORCENTAJE_INVALIDO'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: -1, porcentajeBp: 4000 }, 'MONTO_INVALIDO'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: 100, porcentajeBp: 4000 }, 'DESCUENTO_MAYOR'],
    [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 10.5, descuento: null, porcentajeBp: 4000 }, 'MONTO_INVALIDO'],
    [{ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: '   ', otroMonto: 100 }, 'FALTA_DESCRIPCION'],
    [{ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: 'A', otroMonto: null }, 'MONTO_INVALIDO'],
    [{ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: 'A', otroMonto: MAX_CENTAVOS + 1 }, 'MONTO_INVALIDO'],
  ])('rechaza entradas inválidas %#', (e, err) =>
    expect(calcularTrabajo(e as EntradaTrabajo)).toEqual({ ok: false, error: err }));

  test('el monto máximo exacto es válido', () =>
    expect(calcularTrabajo({ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: 'A', otroMonto: MAX_CENTAVOS }))
      .toMatchObject({ ok: true, monto: MAX_CENTAVOS }));
  test('100 % es válido', () =>
    expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: null, porcentajeBp: 10000 }))
      .toMatchObject({ ok: true, monto: 100 }));
});

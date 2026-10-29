import { describe, expect, test } from 'vitest';
import { avisoDeuda, deudasPorLugar, esDeudaVieja, soloRecientes, soloViejas } from './deudas';
import { INICIO_DE_LOS_TIEMPOS } from './periodos';
import type { EstadoPago, Lugar, Pago, TipoPago, Trabajo } from './types';

function t(id: string, fecha: string, monto: number, estado: EstadoPago = 'PENDIENTE', pagoId: string | null = null, lugarId = 'L1', creadoEn = ''): Trabajo {
  return {
    id, lugarId, fecha, descripcion: id, tipoTrabajoId: null, precioLista: null,
    montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null,
    monto, nota: '', estado, pagoId, creadoEn, actualizadoEn: '',
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

describe('esDeudaVieja', () => {
  test('es vieja pasados 2 meses del fin del período', () => {
    expect(esDeudaVieja('2026-10-31', '2026-12-30')).toBe(false); // un día antes del límite
    expect(esDeudaVieja('2026-10-31', '2026-12-31')).toBe(false); // el día justo
    expect(esDeudaVieja('2026-10-31', '2027-01-01')).toBe(true); // un día después
  });
  test('fin de mes corto: el límite cae en el último día del mes', () => {
    expect(esDeudaVieja('2026-12-31', '2027-02-28')).toBe(false);
    expect(esDeudaVieja('2026-12-31', '2027-03-01')).toBe(true);
  });
  test('período que cierra a mitad de mes', () => {
    expect(esDeudaVieja('2026-10-15', '2026-12-15')).toBe(false);
    expect(esDeudaVieja('2026-10-15', '2026-12-16')).toBe(true);
  });
});

describe('deudasPorLugar', () => {
  // Agosto: un NO_PAGADO (vieja). Octubre: a (100.000) y b (50.000) pagados con un FINAL de 120.000 → 30.000 en plata.
  const agosto = t('c', '2026-08-10', 4000000, 'NO_PAGADO');
  const a = t('a', '2026-10-03', 10000000, 'PAGADO', 'p1');
  const b = t('b', '2026-10-10', 5000000, 'PAGADO', 'p1');
  const final = pago('p1', '2026-10-31', 12000000, 'FINAL');
  const args = { hoy: '2026-12-15', lugares: [lugar('L1', 'Clínica')], trabajos: [agosto, a, b], pagos: [final] };

  test('junta los períodos con deuda, del más viejo al más nuevo, marcando cuáles son viejos', () => {
    const r = deudasPorLugar(args);
    expect(r).toHaveLength(1);
    expect(r[0].lugar.id).toBe('L1');
    expect(r[0].periodos.map(p => [p.periodo.fin, p.vieja, p.monto, p.plata, p.noPagados])).toEqual([
      ['2026-08-31', true, 4000000, 0, [agosto]],
      ['2026-10-31', false, 3000000, 3000000, []],
    ]);
    expect(r[0].monto).toBe(7000000);
  });

  test('los no pagados de un período van por fecha y, a igual fecha, por cuándo se anotaron (no por id)', () => {
    // Los ids van al revés del orden de carga: la base los devuelve por id.
    const tarde = t('a', '2026-10-10', 100, 'NO_PAGADO', null, 'L1', '2026-10-11T10:00:00.000Z');
    const temprano = t('b', '2026-10-10', 100, 'NO_PAGADO', null, 'L1', '2026-10-11T09:00:00.000Z');
    const antes = t('c', '2026-10-05', 100, 'NO_PAGADO', null, 'L1', '2026-10-12T09:00:00.000Z');
    const [d] = deudasPorLugar({ ...args, trabajos: [tarde, temprano, antes], pagos: [] });
    expect(d.periodos[0].noPagados.map(x => x.id)).toEqual(['c', 'b', 'a']);
  });

  test('incluye lugares archivados, deja afuera los que no deben y ordena por nombre', () => {
    const zeta = lugar('L2', 'Zeta', { archivado: true });
    const alfa = lugar('L3', 'Alfa');
    const sinDeuda = lugar('L4', 'Beta');
    const trabajos = [
      ...args.trabajos,
      t('z', '2026-10-05', 100, 'NO_PAGADO', null, 'L2'),
      t('f', '2026-10-05', 100, 'NO_PAGADO', null, 'L3'),
      t('s', '2026-10-05', 100, 'PENDIENTE', null, 'L4'),
    ];
    const r = deudasPorLugar({ ...args, lugares: [zeta, args.lugares[0], alfa, sinDeuda], trabajos });
    expect(r.map(d => d.lugar.nombre)).toEqual(['Alfa', 'Clínica', 'Zeta']);
  });

  test('soloRecientes y soloViejas dejan un período cada uno', () => {
    const [d] = deudasPorLugar(args);
    const recientes = soloRecientes(d)!;
    expect(recientes.periodos.map(p => p.periodo.fin)).toEqual(['2026-10-31']);
    expect(recientes.monto).toBe(3000000);
    const viejas = soloViejas(d)!;
    expect(viejas.periodos.map(p => p.periodo.fin)).toEqual(['2026-08-31']);
    expect(viejas.monto).toBe(4000000);
  });

  test('si todo es viejo, soloRecientes da null; si todo es reciente, soloViejas da null', () => {
    const [viejo] = deudasPorLugar({ ...args, trabajos: [agosto], pagos: [] });
    expect(soloRecientes(viejo)).toBeNull();
    expect(soloViejas(viejo)).not.toBeNull();
    const [reciente] = deudasPorLugar({ ...args, trabajos: [a, b], pagos: [final] });
    expect(soloViejas(reciente)).toBeNull();
  });
});

describe('avisoDeuda', () => {
  test('arma el aviso con los no pagados por fecha y solo las diferencias en plata mayores a 0', () => {
    const dic = t('d', '2026-10-20', 100, 'NO_PAGADO');
    const ago = t('c', '2026-08-10', 4000000, 'NO_PAGADO');
    const a = t('a', '2026-09-03', 10000000, 'PAGADO', 'p1');
    const b = t('b', '2026-09-10', 5000000, 'PAGADO', 'p1');
    const [d] = deudasPorLugar({
      hoy: '2026-12-15', lugares: [lugar('L1', 'Clínica')], trabajos: [dic, ago, a, b], pagos: [pago('p1', '2026-09-30', 12000000, 'FINAL')],
    });
    const aviso = avisoDeuda(d);
    expect(aviso).toEqual({
      tipo: 'DEUDA', lugarId: 'L1', noPagados: [ago, dic],
      deudasPlata: [{ periodo: d.periodos[1].periodo, monto: 3000000 }], monto: 7000100,
    });
  });
});

import { describe, expect, test } from 'vitest';
import { type Copia, type Datos, MIGRACIONES, VERSION_COPIA, armarCopia, leerCopia, migrar, nombreArchivoCopia } from './copia';
import { INICIO_DE_LOS_TIEMPOS } from './periodos';
import type { Lugar, Trabajo } from './types';

const lugarBase: Lugar = {
  id: 'L1', nombre: 'Clínica Centro', formaCobro: 'PORCENTAJE', porcentajeBp: 4000,
  reglasCierre: [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 'ULTIMO' }, { vigenteDesde: '2026-06-01', dia: 15 }],
  pagoDesdeDia: 21, pagoHastaDia: 31, archivado: false, creadoEn: '2026-01-05T12:00:00.000Z',
};
const trabajoBase: Trabajo = {
  id: 'T1', lugarId: 'L1', fecha: '2026-10-20', descripcion: 'Limpieza', tipoTrabajoId: 'TT1',
  precioLista: null, montoCliente: 100000, descuento: 5000, descuentoMotivo: 'Amigo', porcentajeBp: 4000,
  monto: 38000, nota: 'Paciente Juan', estado: 'PAGADO', pagoId: 'P1',
  creadoEn: '2026-10-20T15:00:00.000Z', actualizadoEn: '2026-10-21T15:00:00.000Z',
};

function datosBase(): Datos {
  return structuredClone({
    lugares: [lugarBase],
    tiposTrabajo: [{ id: 'TT1', lugarId: 'L1', nombre: 'Limpieza', precio: 1234550, orden: 0 }],
    trabajos: [
      trabajoBase,
      { ...trabajoBase, id: 'T2', tipoTrabajoId: null, pagoId: null, estado: 'PENDIENTE', porcentajeBp: null, montoCliente: null, descuento: null, descuentoMotivo: null },
    ],
    pagos: [{ id: 'P1', lugarId: 'L1', periodoFin: '2026-10-31', fecha: '2026-11-02', monto: 38000, tipo: 'FINAL', nota: '', creadoEn: '2026-11-02T10:00:00.000Z' }],
    movimientos: [{ id: 'M1', tipo: 'GASTO', fecha: '2026-10-22', monto: 2500, categoriaId: 'C1', nota: 'Almuerzo', creadoEn: '2026-10-22T13:00:00.000Z' }],
    categorias: [
      { id: 'C1', nombre: 'Comida', tipo: 'GASTO', ambito: 'PERSONAL', icono: 'utensils', color: '#9e4430', orden: 0 },
      { id: 'C2', nombre: 'Varios', tipo: 'INGRESO', ambito: null, icono: 'plus', color: '#25685b', orden: 1 },
    ],
    ajustes: [{ clave: 'recordatorioCopiaDias', valor: 7 }, { clave: 'ultimaCopia', valor: null }],
  });
}
const AHORA = new Date('2026-10-27T15:30:00.000Z');

/** Texto de una copia válida con `mod` aplicado sobre el objeto antes de serializar. */
function copiaCon(mod: Partial<Copia> | ((c: any) => void), datos: Datos = datosBase()): string {
  const c: any = armarCopia(datos, AHORA);
  if (typeof mod === 'function') mod(c);
  else Object.assign(c, mod);
  return JSON.stringify(c);
}
const trabajoCon = (cambios: Record<string, unknown>) => (c: any) => {
  c.datos.trabajos[0] = { ...c.datos.trabajos[0], ...cambios };
};
const copiaSin = (tabla: string) => copiaCon(c => { delete c.datos[tabla]; });
const error = (texto: string, migraciones?: Record<number, (c: any) => any>) => {
  const r = leerCopia(texto, migraciones);
  expect(r.ok).toBe(false);
  return (r as { error: string }).error;
};

describe('armarCopia / leerCopia', () => {
  test('ida y vuelta: armarCopia → JSON → leerCopia devuelve los mismos datos', () => {
    const datos = datosBase();
    const r = leerCopia(JSON.stringify(armarCopia(datos, AHORA)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.copia.datos).toEqual(datos);
    expect(r.copia.app).toBe('gestion-dinero');
    expect(r.copia.version).toBe(VERSION_COPIA);
    expect(r.copia.creadoEn).toBe('2026-10-27T15:30:00.000Z');
    expect(r.resumen).toEqual({ creadoEn: '2026-10-27T15:30:00.000Z', lugares: 1, trabajos: 2, movimientos: 1 });
  });

  test('una copia vacía (app recién instalada) es válida', () => {
    const vacia: Datos = { lugares: [], tiposTrabajo: [], trabajos: [], pagos: [], movimientos: [], categorias: [], ajustes: [] };
    expect(leerCopia(JSON.stringify(armarCopia(vacia, AHORA))).ok).toBe(true);
  });

  test('la copia no incluye el PIN', () => {
    const datos = datosBase();
    datos.ajustes.push({ clave: 'pinHash', valor: 'abc' }, { clave: 'pinSalt', valor: 'def' }, { clave: 'pinOfrecido', valor: true });
    const copia = armarCopia(datos, AHORA);
    expect(copia.datos.ajustes.map(a => a.clave)).toEqual(['recordatorioCopiaDias', 'ultimaCopia']);
    const texto = JSON.stringify(copia);
    expect(texto).not.toContain('pinHash');
    expect(texto).not.toContain('pinSalt');
    expect(texto).not.toContain('pinOfrecido');
    expect(datos.ajustes).toHaveLength(5); // no muta la entrada
  });

  test.each([
    ['no es JSON', '{', /no es una copia válida/i],
    ['otra app', JSON.stringify({ app: 'x' }), /no es una copia de Gestión Dinero/i],
    ['versión más nueva', copiaCon({ version: 99 }), /versión más nueva/i],
    ['monto con decimales', copiaCon(trabajoCon({ monto: 10.5 })), /monto/i],
    ['referencia rota', copiaCon(trabajoCon({ lugarId: 'no-existe' })), /lugar/i],
    ['array faltante', copiaSin('pagos'), /pagos/i],
  ])('rechaza %s', (_, texto, msg) => {
    const r = leerCopia(texto);
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(msg);
  });

  test('mensaje exacto de versión más nueva', () => {
    expect(error(copiaCon({ version: 99 }))).toBe('Esta copia es de una versión más nueva de la app. Actualizá la app y volvé a intentar.');
  });

  test.each([
    ['vacío', ''],
    ['null', 'null'],
    ['un array', '[]'],
    ['un número', '42'],
    ['una cadena', '"hola"'],
  ])('rechaza JSON que es %s sin romper', (_, texto) => {
    expect(error(texto)).toMatch(/no es una copia válida/i);
  });

  test('rechaza versión faltante, no entera o negativa', () => {
    for (const version of [undefined, '1', 1.5, -1, null]) {
      expect(error(copiaCon({ version } as any))).toMatch(/no es una copia válida/i);
    }
  });

  test('rechaza datos faltante o creadoEn inválido', () => {
    expect(error(copiaCon(c => { delete c.datos; }))).toMatch(/no es una copia válida/i);
    expect(error(copiaCon({ creadoEn: 'ayer' }))).toMatch(/fecha de creación/i);
    expect(error(copiaCon({ creadoEn: 5 as any }))).toMatch(/fecha de creación/i);
  });

  test.each(['lugares', 'tiposTrabajo', 'trabajos', 'pagos', 'movimientos', 'categorias', 'ajustes'])('rechaza si falta la lista %s', tabla => {
    expect(error(copiaSin(tabla))).toMatch(/no tiene la lista de/i);
  });

  test('rechaza una lista que no es array', () => {
    expect(error(copiaCon(c => { c.datos.pagos = {}; }))).toMatch(/pagos/i);
  });

  test('rechaza elementos que no son objetos', () => {
    expect(error(copiaCon(c => { c.datos.trabajos = [null]; }))).toMatch(/trabajo/i);
    expect(error(copiaCon(c => { c.datos.pagos = ['x']; }))).toMatch(/pago/i);
  });

  describe('campos', () => {
    const casos: [string, (c: any) => void, RegExp][] = [
      ['lugar sin nombre', c => { delete c.datos.lugares[0].nombre; }, /lugar.*nombre/i],
      ['lugar con forma de cobro desconocida', c => { c.datos.lugares[0].formaCobro = 'HORAS'; }, /lugar.*forma de cobro/i],
      ['lugar con porcentaje decimal', c => { c.datos.lugares[0].porcentajeBp = 37.5; }, /lugar.*porcentaje/i],
      ['lugar con archivado no booleano', c => { c.datos.lugares[0].archivado = 'no'; }, /lugar.*archivado/i],
      ['lugar con rango de pago fuera de 1-31', c => { c.datos.lugares[0].pagoHastaDia = 32; }, /lugar.*rango de pago/i],
      ['lugar sin reglas de cierre', c => { c.datos.lugares[0].reglasCierre = []; }, /lugar.*cierre/i],
      ['lugar con reglasCierre ausente', c => { delete c.datos.lugares[0].reglasCierre; }, /lugar.*cierre/i],
      ['regla con día 0', c => { c.datos.lugares[0].reglasCierre[0].dia = 0; }, /cierre/i],
      ['regla con día 32', c => { c.datos.lugares[0].reglasCierre[0].dia = 32; }, /cierre/i],
      ['regla con día decimal', c => { c.datos.lugares[0].reglasCierre[0].dia = 10.5; }, /cierre/i],
      ['regla con día texto', c => { c.datos.lugares[0].reglasCierre[0].dia = 'ultimo'; }, /cierre/i],
      ['regla con fecha inválida', c => { c.datos.lugares[0].reglasCierre[1].vigenteDesde = '2026-13-01'; }, /cierre/i],
      ['tipo de trabajo con precio decimal', c => { c.datos.tiposTrabajo[0].precio = 99.9; }, /tipo de trabajo.*precio/i],
      ['tipo de trabajo con precio negativo', c => { c.datos.tiposTrabajo[0].precio = -1; }, /tipo de trabajo.*precio/i],
      ['trabajo con fecha de otro formato', c => { c.datos.trabajos[0].fecha = '27/10/2026'; }, /trabajo.*fecha/i],
      ['trabajo con fecha inexistente', c => { c.datos.trabajos[0].fecha = '2026-02-30'; }, /trabajo.*fecha/i],
      ['trabajo con estado desconocido', c => { c.datos.trabajos[0].estado = 'PAGO'; }, /trabajo.*estado/i],
      ['trabajo con monto como texto', c => { c.datos.trabajos[0].monto = '100'; }, /trabajo.*monto/i],
      ['trabajo con monto negativo', c => { c.datos.trabajos[0].monto = -5; }, /trabajo.*monto/i],
      ['trabajo con monto faltante', c => { delete c.datos.trabajos[0].monto; }, /trabajo.*monto/i],
      ['trabajo con montoCliente decimal', c => { c.datos.trabajos[0].montoCliente = 1.5; }, /trabajo.*monto/i],
      ['trabajo con descuento decimal', c => { c.datos.trabajos[0].descuento = 0.5; }, /trabajo.*descuento/i],
      ['trabajo con precioLista decimal', c => { c.datos.trabajos[0].precioLista = 0.5; }, /trabajo.*precio/i],
      ['trabajo con porcentaje decimal', c => { c.datos.trabajos[0].porcentajeBp = 33.3; }, /trabajo.*porcentaje/i],
      ['trabajo con nota que no es texto', c => { c.datos.trabajos[0].nota = null; }, /trabajo.*nota/i],
      ['trabajo con tipoTrabajoId numérico', c => { c.datos.trabajos[0].tipoTrabajoId = 3; }, /trabajo/i],
      ['trabajo con pagoId indefinido', c => { delete c.datos.trabajos[0].pagoId; }, /trabajo/i],
      ['pago con tipo desconocido', c => { c.datos.pagos[0].tipo = 'PARCIAL'; }, /pago.*tipo/i],
      ['pago con monto decimal', c => { c.datos.pagos[0].monto = 1.1; }, /pago.*monto/i],
      ['pago con fin de período inválido', c => { c.datos.pagos[0].periodoFin = 'x'; }, /pago.*período/i],
      ['movimiento con tipo desconocido', c => { c.datos.movimientos[0].tipo = 'OTRO'; }, /movimiento.*tipo/i],
      ['movimiento con monto decimal', c => { c.datos.movimientos[0].monto = 2.5; }, /movimiento.*monto/i],
      ['movimiento con fecha inválida', c => { c.datos.movimientos[0].fecha = '2026-10-32'; }, /movimiento.*fecha/i],
      ['categoría con ámbito desconocido', c => { c.datos.categorias[0].ambito = 'CASA'; }, /categoría.*ámbito/i],
      ['categoría con orden decimal', c => { c.datos.categorias[0].orden = 0.5; }, /categoría.*orden/i],
      ['ajuste sin clave', c => { c.datos.ajustes[0] = { valor: 1 }; }, /ajuste.*clave/i],
    ];
    test.each(casos)('rechaza %s', (_, mod, msg) => {
      expect(error(copiaCon(mod))).toMatch(msg);
    });

    test('acepta los nulos permitidos y los días de cierre 1 y 31', () => {
      const r = leerCopia(copiaCon(c => {
        c.datos.lugares[0].porcentajeBp = null;
        c.datos.lugares[0].reglasCierre = [{ vigenteDesde: '2026-01-01', dia: 1 }, { vigenteDesde: '2026-07-01', dia: 31 }];
        c.datos.categorias[0].ambito = null;
      }));
      expect(r.ok).toBe(true);
    });
  });

  describe('ids y referencias', () => {
    test.each([
      ['lugares', (c: any) => { c.datos.lugares.push({ ...c.datos.lugares[0] }); }, /lugares repetidos/i],
      ['trabajos', (c: any) => { c.datos.trabajos[1].id = 'T1'; }, /trabajos repetidos/i],
      ['pagos', (c: any) => { c.datos.pagos.push({ ...c.datos.pagos[0] }); }, /pagos repetidos/i],
      ['categorías', (c: any) => { c.datos.categorias[1].id = 'C1'; }, /categorías repetidas/i],
      ['movimientos', (c: any) => { c.datos.movimientos.push({ ...c.datos.movimientos[0] }); }, /movimientos repetidos/i],
      ['tipos de trabajo', (c: any) => { c.datos.tiposTrabajo.push({ ...c.datos.tiposTrabajo[0] }); }, /tipos de trabajo repetidos/i],
      ['ajustes', (c: any) => { c.datos.ajustes.push({ clave: 'ultimaCopia', valor: 1 }); }, /ajustes repetidos/i],
    ])('rechaza ids repetidos en %s', (_, mod, msg) => {
      expect(error(copiaCon(mod))).toMatch(msg);
    });

    test.each([
      ['trabajo → lugar', (c: any) => { c.datos.trabajos[0].lugarId = 'zz'; }, /trabajo que apunta a un lugar que no existe/i],
      ['trabajo → pago', (c: any) => { c.datos.trabajos[0].pagoId = 'zz'; }, /trabajo que apunta a un pago que no existe/i],
      ['movimiento → categoría', (c: any) => { c.datos.movimientos[0].categoriaId = 'zz'; }, /movimiento que apunta a una categoría que no existe/i],
      ['tipo de trabajo → lugar', (c: any) => { c.datos.tiposTrabajo[0].lugarId = 'zz'; }, /tipo de trabajo que apunta a un lugar que no existe/i],
      ['pago → lugar', (c: any) => { c.datos.pagos[0].lugarId = 'zz'; }, /pago que apunta a un lugar que no existe/i],
    ])('rechaza referencia rota: %s', (_, mod, msg) => {
      expect(error(copiaCon(mod))).toMatch(msg);
    });

    test('un trabajo que apunta a un tipo de trabajo borrado no es error: se restaura sin tipo, con su monto y descripción', () => {
      // Así quedaron las copias hechas antes del arreglo: borrar un tipo dejaba la referencia colgada.
      const texto = copiaCon(trabajoCon({ tipoTrabajoId: 'tipo-borrado' }));
      const r = leerCopia(texto);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const esperado = { ...datosBase().trabajos[0], tipoTrabajoId: null };
      expect(r.copia.datos.trabajos[0]).toEqual(esperado);
      // El resto de los datos no cambia.
      expect(r.copia.datos.trabajos[1]).toEqual(datosBase().trabajos[1]);
      expect(r.copia.datos.tiposTrabajo).toEqual(datosBase().tiposTrabajo);
      expect(r.resumen.trabajos).toBe(2);
    });

    test('un tipo de trabajo existente se conserva', () => {
      const r = leerCopia(copiaCon(() => undefined));
      expect(r.ok && r.copia.datos.trabajos[0].tipoTrabajoId).toBe('TT1');
    });
  });

  test('nunca lanza: un valor raro adentro de la copia devuelve error', () => {
    const texto = JSON.stringify({ app: 'gestion-dinero', version: 1, creadoEn: AHORA.toISOString(), datos: { lugares: [{ id: 'x', reglasCierre: [null] }] } });
    expect(() => leerCopia(texto)).not.toThrow();
    expect(leerCopia(texto).ok).toBe(false);
  });
});

describe('migraciones', () => {
  test('MIGRACIONES está vacío en la versión 1', () => {
    expect(Object.keys(MIGRACIONES)).toHaveLength(0);
    expect(VERSION_COPIA).toBe(1);
  });

  test('migrar aplica en orden cada migración y sube la versión', () => {
    const pasos: number[] = [];
    const migraciones = {
      0: (c: any) => { pasos.push(0); return { ...c, marca: 'a' }; },
      1: (c: any) => { pasos.push(1); return { ...c, marca: c.marca + 'b' }; },
    };
    const r = migrar({ version: 0 }, migraciones, 2);
    expect(pasos).toEqual([0, 1]);
    expect(r).toEqual({ version: 2, marca: 'ab' });
  });

  test('una copia de versión anterior se migra antes de validar', () => {
    const migraciones = {
      0: (c: any) => {
        const { lugaresViejos, ...resto } = c.datos;
        return { ...c, datos: { ...resto, lugares: lugaresViejos } };
      },
    };
    const vieja: any = armarCopia(datosBase(), AHORA);
    vieja.version = 0;
    vieja.datos.lugaresViejos = vieja.datos.lugares;
    delete vieja.datos.lugares;
    expect(leerCopia(JSON.stringify(vieja)).ok).toBe(false); // sin migración no sirve
    const r = leerCopia(JSON.stringify(vieja), migraciones);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.copia.version).toBe(VERSION_COPIA);
      expect(r.copia.datos.lugares).toHaveLength(1);
    }
  });

  test('falta la migración intermedia: error claro, sin lanzar', () => {
    const vieja: any = armarCopia(datosBase(), AHORA);
    vieja.version = 0;
    expect(error(JSON.stringify(vieja))).toMatch(/no es una copia válida/i);
  });
});

test('nombreArchivoCopia', () => expect(nombreArchivoCopia('2026-10-27')).toBe('gestion-dinero-2026-10-27.json'));

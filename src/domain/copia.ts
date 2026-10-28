import { type FechaISO, diasEnMes, parseFecha } from './dates';
import type { Ajuste, Categoria, Lugar, Movimiento, Pago, TipoTrabajo, Trabajo } from './types';

export const VERSION_COPIA = 1;

export interface Datos {
  lugares: Lugar[]; tiposTrabajo: TipoTrabajo[]; trabajos: Trabajo[]; pagos: Pago[];
  movimientos: Movimiento[]; categorias: Categoria[]; ajustes: Ajuste[];
}
export interface Copia { app: 'gestion-dinero'; version: number; creadoEn: string; datos: Datos }

/** Migraciones: `MIGRACIONES[n]` convierte una copia de la versión n a la n+1. Vacío en v1. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MIGRACIONES: Record<number, (c: any) => any> = {};

/**
 * Ajustes propios de cada dispositivo: nunca viajan en la copia y la restauración conserva los de este
 * dispositivo (el PIN se configura de nuevo en cada uno, y la oferta de crearlo se hace una vez por celular).
 */
export const AJUSTES_DEL_DISPOSITIVO = ['pinHash', 'pinSalt', 'pinOfrecido'];

export function armarCopia(datos: Datos, ahora: Date): Copia {
  return {
    app: 'gestion-dinero',
    version: VERSION_COPIA,
    creadoEn: ahora.toISOString(),
    datos: { ...datos, ajustes: datos.ajustes.filter(a => !AJUSTES_DEL_DISPOSITIVO.includes(a.clave)) },
  };
}

export function nombreArchivoCopia(hoy: FechaISO): string {
  return `gestion-dinero-${hoy}.json`;
}

// ---------------------------------------------------------------------------
// Migraciones

/** Aplica las migraciones de la versión de `c` hasta `destino`. Lanza si falta alguna. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrar(c: any, migraciones: Record<number, (c: any) => any>, destino: number = VERSION_COPIA): any {
  let actual = c;
  while (actual.version < destino) {
    const paso = migraciones[actual.version];
    if (!paso) throw new Error(`Falta la migración de la versión ${actual.version}`);
    const version = actual.version + 1;
    actual = { ...paso(actual), version };
  }
  return actual;
}

// ---------------------------------------------------------------------------
// Validación

type Pred = (v: unknown) => boolean;
/** [campo, validador, descripción del problema para el usuario, p. ej. "un monto inválido"] */
type Campo = [string, Pred, string];
interface Tabla {
  clave: keyof Datos;
  /** "tipos de trabajo": para "no tiene la lista de …" y "… repetidos" */
  plural: string;
  /** "un tipo de trabajo" */
  uno: string;
  campos: Campo[];
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto: Pred = v => typeof v === 'string';
const bool: Pred = v => typeof v === 'boolean';
const entero: Pred = v => Number.isSafeInteger(v);
const enteroNoNeg: Pred = v => Number.isSafeInteger(v) && (v as number) >= 0;
const diaDelMes: Pred = v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31;
const nulo = (p: Pred): Pred => v => v === null || p(v);
const uno = (...opciones: string[]): Pred => v => typeof v === 'string' && opciones.includes(v);

const fecha: Pred = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const { y, m, d } = parseFecha(v);
  return m >= 1 && m <= 12 && d >= 1 && d <= diasEnMes(y, m);
};

const reglasCierre: Pred = v =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(r => esObjeto(r) && fecha(r.vigenteDesde) && (r.dia === 'ULTIMO' || diaDelMes(r.dia)));

const TABLAS: Tabla[] = [
  {
    clave: 'lugares', plural: 'lugares', uno: 'un lugar',
    campos: [
      ['id', texto, 'un identificador inválido'],
      ['nombre', texto, 'un nombre inválido'],
      ['formaCobro', uno('ARANCEL_FIJO', 'PORCENTAJE'), 'una forma de cobro inválida'],
      ['porcentajeBp', nulo(enteroNoNeg), 'un porcentaje inválido'],
      ['reglasCierre', reglasCierre, 'días de cierre inválidos o sin ningún día de cierre'],
      ['pagoDesdeDia', diaDelMes, 'un rango de pago inválido'],
      ['pagoHastaDia', diaDelMes, 'un rango de pago inválido'],
      ['archivado', bool, 'un dato de archivado inválido'],
      ['creadoEn', texto, 'una fecha de creación inválida'],
    ],
  },
  {
    clave: 'tiposTrabajo', plural: 'tipos de trabajo', uno: 'un tipo de trabajo',
    campos: [
      ['id', texto, 'un identificador inválido'],
      ['lugarId', texto, 'un lugar inválido'],
      ['nombre', texto, 'un nombre inválido'],
      ['precio', enteroNoNeg, 'un precio inválido'],
      ['orden', entero, 'un orden inválido'],
    ],
  },
  {
    clave: 'trabajos', plural: 'trabajos', uno: 'un trabajo',
    campos: [
      ['id', texto, 'un identificador inválido'],
      ['lugarId', texto, 'un lugar inválido'],
      ['fecha', fecha, 'una fecha inválida'],
      ['descripcion', texto, 'una descripción inválida'],
      ['tipoTrabajoId', nulo(texto), 'un tipo de trabajo inválido'],
      ['precioLista', nulo(enteroNoNeg), 'un precio de lista inválido'],
      ['montoCliente', nulo(enteroNoNeg), 'un monto del cliente inválido'],
      ['descuento', nulo(enteroNoNeg), 'un descuento inválido'],
      ['descuentoMotivo', nulo(texto), 'un motivo de descuento inválido'],
      ['porcentajeBp', nulo(enteroNoNeg), 'un porcentaje inválido'],
      ['monto', enteroNoNeg, 'un monto inválido'],
      ['nota', texto, 'una nota inválida'],
      ['estado', uno('PENDIENTE', 'PAGADO', 'NO_PAGADO'), 'un estado inválido'],
      ['pagoId', nulo(texto), 'un pago inválido'],
      ['creadoEn', texto, 'una fecha de creación inválida'],
      ['actualizadoEn', texto, 'una fecha de actualización inválida'],
    ],
  },
  {
    clave: 'pagos', plural: 'pagos', uno: 'un pago',
    campos: [
      ['id', texto, 'un identificador inválido'],
      ['lugarId', texto, 'un lugar inválido'],
      ['periodoFin', fecha, 'un fin de período inválido'],
      ['fecha', fecha, 'una fecha inválida'],
      ['monto', enteroNoNeg, 'un monto inválido'],
      ['tipo', uno('A_CUENTA', 'FINAL'), 'un tipo inválido'],
      ['nota', texto, 'una nota inválida'],
      ['creadoEn', texto, 'una fecha de creación inválida'],
    ],
  },
  {
    clave: 'movimientos', plural: 'movimientos', uno: 'un movimiento',
    campos: [
      ['id', texto, 'un identificador inválido'],
      ['tipo', uno('GASTO', 'INGRESO'), 'un tipo inválido'],
      ['fecha', fecha, 'una fecha inválida'],
      ['monto', enteroNoNeg, 'un monto inválido'],
      ['categoriaId', texto, 'una categoría inválida'],
      ['nota', texto, 'una nota inválida'],
      ['creadoEn', texto, 'una fecha de creación inválida'],
    ],
  },
  {
    clave: 'categorias', plural: 'categorías', uno: 'una categoría',
    campos: [
      ['id', texto, 'un identificador inválido'],
      ['nombre', texto, 'un nombre inválido'],
      ['tipo', uno('GASTO', 'INGRESO'), 'un tipo inválido'],
      ['ambito', nulo(uno('TRABAJO', 'PERSONAL')), 'un ámbito inválido'],
      ['icono', texto, 'un ícono inválido'],
      ['color', texto, 'un color inválido'],
      ['orden', entero, 'un orden inválido'],
    ],
  },
  {
    clave: 'ajustes', plural: 'ajustes', uno: 'un ajuste',
    campos: [['clave', texto, 'una clave inválida']],
  },
];

/** Campo que identifica a cada fila (los ajustes se identifican por `clave`). */
const campoId = (t: Tabla) => (t.clave === 'ajustes' ? 'clave' : 'id');

/** Referencias entre tablas: [tabla de origen, campo, tabla destino, "un X" para el mensaje, admite null]. */
const REFERENCIAS: [keyof Datos, string, keyof Datos, string, boolean][] = [
  ['trabajos', 'lugarId', 'lugares', 'un lugar', false],
  ['trabajos', 'pagoId', 'pagos', 'un pago', true],
  ['trabajos', 'tipoTrabajoId', 'tiposTrabajo', 'un tipo de trabajo', true],
  ['movimientos', 'categoriaId', 'categorias', 'una categoría', false],
  ['tiposTrabajo', 'lugarId', 'lugares', 'un lugar', false],
  ['pagos', 'lugarId', 'lugares', 'un lugar', false],
];

const NO_VALIDA = 'El archivo no es una copia válida.';
const NO_ES_DE_LA_APP = 'El archivo no es una copia de Gestión Dinero.';
const MAS_NUEVA = 'Esta copia es de una versión más nueva de la app. Actualizá la app y volvé a intentar.';

/** Devuelve el mensaje del primer problema de `datos`, o null si todo está bien. */
function validarDatos(datos: Record<string, unknown>): string | null {
  const nombreDe = (clave: keyof Datos) => TABLAS.find(t => t.clave === clave)!;
  // 1. listas presentes y filas con campos correctos
  for (const t of TABLAS) {
    const filas = datos[t.clave];
    if (!Array.isArray(filas)) return `La copia no tiene la lista de ${t.plural}.`;
    for (const fila of filas) {
      if (!esObjeto(fila)) return `La copia tiene ${t.uno} con un formato inválido.`;
      for (const [campo, pred, problema] of t.campos) {
        if (!pred(fila[campo])) return `La copia tiene ${t.uno} con ${problema}.`;
      }
    }
  }
  // 2. identificadores únicos
  for (const t of TABLAS) {
    const ids = new Set<unknown>();
    for (const fila of datos[t.clave] as Record<string, unknown>[]) {
      const id = fila[campoId(t)];
      if (ids.has(id)) return `La copia tiene ${t.plural} ${t.plural === 'categorías' ? 'repetidas' : 'repetidos'}.`;
      ids.add(id);
    }
  }
  // 3. referencias
  for (const [origen, campo, destino, quien, admiteNulo] of REFERENCIAS) {
    const existentes = new Set((datos[destino] as Record<string, unknown>[]).map(f => f.id));
    for (const fila of datos[origen] as Record<string, unknown>[]) {
      const ref = fila[campo];
      if (ref === null && admiteNulo) continue;
      if (!existentes.has(ref)) return `La copia tiene ${nombreDe(origen).uno} que apunta a ${quien} que no existe.`;
    }
  }
  return null;
}

export type ResultadoLeerCopia =
  | { ok: true; copia: Copia; resumen: { creadoEn: string; lugares: number; trabajos: number; movimientos: number } }
  | { ok: false; error: string };

/**
 * Valida el texto de una copia de seguridad completa. Nunca lanza y no toca nada:
 * si algo está mal devuelve un mensaje en español para mostrar al usuario.
 */
export function leerCopia(
  textoCopia: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  migraciones: Record<number, (c: any) => any> = MIGRACIONES,
): ResultadoLeerCopia {
  try {
    let bruto: unknown;
    try {
      bruto = JSON.parse(textoCopia);
    } catch {
      return { ok: false, error: NO_VALIDA };
    }
    if (!esObjeto(bruto)) return { ok: false, error: NO_VALIDA };
    if (bruto.app !== 'gestion-dinero') return { ok: false, error: NO_ES_DE_LA_APP };
    const version = bruto.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return { ok: false, error: NO_VALIDA };
    if (version > VERSION_COPIA) return { ok: false, error: MAS_NUEVA };

    const migrada = migrar(bruto, migraciones, VERSION_COPIA);
    if (!esObjeto(migrada) || !esObjeto(migrada.datos)) return { ok: false, error: NO_VALIDA };
    if (typeof migrada.creadoEn !== 'string' || Number.isNaN(Date.parse(migrada.creadoEn))) {
      return { ok: false, error: 'La copia no tiene una fecha de creación válida.' };
    }
    const problema = validarDatos(migrada.datos);
    if (problema) return { ok: false, error: problema };

    const copia = migrada as unknown as Copia;
    return {
      ok: true,
      copia,
      resumen: {
        creadoEn: copia.creadoEn,
        lugares: copia.datos.lugares.length,
        trabajos: copia.datos.trabajos.length,
        movimientos: copia.datos.movimientos.length,
      },
    };
  } catch {
    return { ok: false, error: NO_VALIDA };
  }
}

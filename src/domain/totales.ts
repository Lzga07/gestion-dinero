import { type FechaISO, mesClave } from './dates';
import type { Centavos } from './money';
import type { Ambito, Categoria, Movimiento, Trabajo } from './types';

const sumar = (xs: { monto: Centavos }[]): Centavos => xs.reduce((s, x) => s + x.monto, 0);

/** Resumen del mes calendario hasta `hasta` (inclusive). Lo ganado es devengado: cuenta todo trabajo, esté cobrado o no. */
export function resumenMes(
  mes: string,
  hasta: FechaISO,
  trabajos: Trabajo[],
  movimientos: Movimiento[],
): { ganadoTrabajos: Centavos; otrosIngresos: Centavos; ganado: Centavos; gastos: Centavos; saldo: Centavos } {
  const enRango = (f: FechaISO) => mesClave(f) === mes && f <= hasta;
  const ganadoTrabajos = sumar(trabajos.filter(tr => enRango(tr.fecha)));
  const delMes = movimientos.filter(mv => enRango(mv.fecha));
  const otrosIngresos = sumar(delMes.filter(mv => mv.tipo === 'INGRESO'));
  const gastos = sumar(delMes.filter(mv => mv.tipo === 'GASTO'));
  const ganado = ganadoTrabajos + otrosIngresos;
  return { ganadoTrabajos, otrosIngresos, ganado, gastos, saldo: ganado - gastos };
}

/** mes ('YYYY-MM') → lugarId → suma de "te corresponde" (cualquier estado). Cada mes pedido está presente aunque esté vacío. */
export function gananciaPorLugarPorMes(meses: string[], trabajos: Trabajo[]): Map<string, Map<string, Centavos>> {
  const resultado = new Map<string, Map<string, Centavos>>(meses.map(m => [m, new Map<string, Centavos>()]));
  for (const tr of trabajos) {
    const delMes = resultado.get(mesClave(tr.fecha));
    if (delMes) delMes.set(tr.lugarId, (delMes.get(tr.lugarId) ?? 0) + tr.monto);
  }
  return resultado;
}

/** Gastos del mes por categoría, de mayor a menor (empate: orden de la categoría), sin ceros. `ambito` null = todas. */
export function gastosPorCategoria(
  mes: string,
  movimientos: Movimiento[],
  categorias: Categoria[],
  ambito: Ambito | null,
): { categoria: Categoria; monto: Centavos }[] {
  const porCategoria = new Map<string, Centavos>();
  for (const mv of movimientos) {
    if (mv.tipo !== 'GASTO' || mesClave(mv.fecha) !== mes) continue;
    porCategoria.set(mv.categoriaId, (porCategoria.get(mv.categoriaId) ?? 0) + mv.monto);
  }
  return categorias
    .filter(c => c.tipo === 'GASTO' && (ambito === null || c.ambito === ambito))
    .map(categoria => ({ categoria, monto: porCategoria.get(categoria.id) ?? 0 }))
    .filter(x => x.monto !== 0)
    .sort((x, y) => y.monto - x.monto || x.categoria.orden - y.categoria.orden);
}

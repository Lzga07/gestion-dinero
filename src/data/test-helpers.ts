import type { DiaCierre } from '../domain/periodos';
import type { FechaISO } from '../domain/dates';
import { db } from './db';
import { crearLugar } from './lugares';
import { guardarTrabajo } from './trabajos';

/** Borra y reabre la base: cada test arranca vacío. */
export async function reiniciarDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Lugar de arancel fijo que cierra el último día del mes (salvo que se pase otro). */
export function lugarFijo(diaCierre: DiaCierre = 'ULTIMO', nombre = 'Clínica Centro'): Promise<string> {
  return crearLugar({
    nombre, formaCobro: 'ARANCEL_FIJO', porcentajeBp: null, pagoDesdeDia: 21, pagoHastaDia: 31, diaCierre,
  });
}

/** Anota un trabajo de arancel fijo de `monto` centavos. */
export async function anotarTrabajo(lugarId: string, fecha: FechaISO, monto = 10000): Promise<string> {
  const { id } = await guardarTrabajo({
    lugarId, fecha, descripcion: 'Trabajo', tipoTrabajoId: null, precioLista: monto,
    montoCliente: null, descuento: null, descuentoMotivo: null, porcentajeBp: null, monto, nota: '',
  });
  return id;
}

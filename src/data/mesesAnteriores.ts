import type { ResumenPeriodo } from '../domain/conciliacion';
import type { FechaISO } from '../domain/dates';
import { MAX_CENTAVOS, type Centavos } from '../domain/money';
import { periodoQueContiene, type Periodo } from '../domain/periodos';
import { db } from './db';
import { ErrorDatos } from './errores';
import { noMePagaron, registrarPago } from './pagos';

/** Cómo terminó un mes ya pasado: lo pagaron todo, una parte, o nada. */
export type CierreMes =
  | { tipo: 'TODO'; fecha: FechaISO }
  | { tipo: 'PARTE'; fecha: FechaISO; monto: Centavos }
  | { tipo: 'NADA' };

/**
 * Cierra un mes cargado a mano, en una transacción: sobre los trabajos PENDIENTE del período, TODO y PARTE
 * registran un pago FINAL con todos tildados (TODO por la suma; PARTE por lo escrito, y si es menor la
 * diferencia queda como deuda en plata); NADA los pasa a NO_PAGADO. Sin pendientes no hace nada.
 */
export async function cerrarMes(lugarId: string, periodo: Periodo, cierre: CierreMes): Promise<void> {
  if (cierre.tipo === 'PARTE' && (!Number.isSafeInteger(cierre.monto) || cierre.monto <= 0 || cierre.monto > MAX_CENTAVOS)) throw new ErrorDatos('MONTO_INVALIDO');
  await db.transaction('rw', db.lugares, db.trabajos, db.pagos, async () => {
    const lugar = await db.lugares.get(lugarId);
    if (!lugar) throw new ErrorDatos('LUGAR_INEXISTENTE');
    const pendientes = await db.trabajos
      .where('lugarId').equals(lugarId)
      .filter(tr => tr.estado === 'PENDIENTE' && periodoQueContiene(lugar.reglasCierre, tr.fecha).fin === periodo.fin)
      .toArray();
    if (pendientes.length === 0) return;
    if (cierre.tipo === 'NADA') {
      await noMePagaron(lugarId, periodo.fin);
      return;
    }
    const suma = pendientes.reduce((s, tr) => s + tr.monto, 0);
    await registrarPago({
      lugarId, periodoFin: periodo.fin, fecha: cierre.fecha, tipo: 'FINAL', nota: '',
      monto: cierre.tipo === 'TODO' ? suma : cierre.monto,
      tildados: pendientes.map(tr => tr.id), destildados: [],
    });
  });
}

/** Un mes está cerrado si tiene algún pago o algún trabajo marcado como no pagado. */
export function mesCerrado(r: ResumenPeriodo): boolean {
  return r.tienePagos || r.noPagados.length > 0;
}

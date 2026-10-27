import type { Centavos } from './money';
import type { FechaISO } from './dates';
import type { ReglaCierre } from './periodos';

export type FormaCobro = 'ARANCEL_FIJO' | 'PORCENTAJE';
export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'NO_PAGADO';
export interface Lugar {
  id: string; nombre: string; formaCobro: FormaCobro;
  porcentajeBp: number | null;            // solo PORCENTAJE
  reglasCierre: ReglaCierre[];
  pagoDesdeDia: number; pagoHastaDia: number;
  archivado: boolean; creadoEn: string;   // ISO datetime
}
export interface TipoTrabajo { id: string; lugarId: string; nombre: string; precio: Centavos; orden: number }
export interface Trabajo {
  id: string; lugarId: string; fecha: FechaISO; descripcion: string;
  tipoTrabajoId: string | null; precioLista: Centavos | null;         // ARANCEL_FIJO
  montoCliente: Centavos | null; descuento: Centavos | null;          // PORCENTAJE
  descuentoMotivo: string | null; porcentajeBp: number | null;        // copia del % al anotar
  monto: Centavos;                                                    // "te corresponde"
  nota: string; estado: EstadoPago; pagoId: string | null;
  creadoEn: string; actualizadoEn: string;
}
export type TipoPago = 'A_CUENTA' | 'FINAL';
export interface Pago { id: string; lugarId: string; periodoFin: FechaISO; fecha: FechaISO; monto: Centavos; tipo: TipoPago; nota: string; creadoEn: string }
export type TipoMovimiento = 'GASTO' | 'INGRESO';
export type Ambito = 'TRABAJO' | 'PERSONAL';
export interface Categoria { id: string; nombre: string; tipo: TipoMovimiento; ambito: Ambito | null; icono: string; color: string; orden: number }
export interface Movimiento { id: string; tipo: TipoMovimiento; fecha: FechaISO; monto: Centavos; categoriaId: string; nota: string; creadoEn: string }
export interface Ajuste { clave: string; valor: unknown }

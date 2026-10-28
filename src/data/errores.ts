/** Error esperado de la capa de datos; `codigo` dice qué pasó (p. ej. 'LUGAR_CON_TRABAJOS'). */
export class ErrorDatos extends Error {
  codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.name = 'ErrorDatos';
    this.codigo = codigo;
  }
}

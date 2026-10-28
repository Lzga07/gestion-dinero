import { formatPesos, type Centavos } from '../domain/money'

/**
 * `formatPesos` con el espacio de "$ 56.000" no cortable: en texto corrido el "$" nunca queda solo
 * al final de una línea. Para los montos que se muestran dentro de una frase.
 */
export const pesosJuntos = (c: Centavos): string => formatPesos(c).replace('$ ', '$ ')

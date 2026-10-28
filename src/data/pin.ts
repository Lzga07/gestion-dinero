import { hashPin, pinValido, verificarPin } from '../platform/pin'
import { leerAjuste } from './ajustes'
import { db } from './db'

/** True si este dispositivo tiene un PIN puesto. Lanza si no se puede leer la base: quien llama decide qué hacer. */
export async function tienePin(): Promise<boolean> {
  return (await leerAjuste<string | null>('pinHash', null)) !== null
}

/** Pone (o reemplaza) el PIN: guarda el hash y la sal juntos, nunca el PIN. */
export async function crearPin(pin: string): Promise<void> {
  if (!pinValido(pin)) throw new Error('El PIN tiene que tener de 4 a 6 números.')
  const { hash, salt } = await hashPin(pin)
  await db.ajustes.bulkPut([
    { clave: 'pinHash', valor: hash },
    { clave: 'pinSalt', valor: salt },
  ])
}

/**
 * Comprueba `pin` contra el guardado. Sin PIN puesto no hay nada que pedir: da true.
 * Lanza si el hash está sin su sal (datos a medias): nunca abre por no poder verificar.
 */
export async function verificarPinGuardado(pin: string): Promise<boolean> {
  const hash = await leerAjuste<string | null>('pinHash', null)
  if (hash === null) return true
  const salt = await leerAjuste<string | null>('pinSalt', null)
  if (salt === null) throw new Error('Falta la sal del PIN guardado')
  return verificarPin(pin, hash, salt)
}

/**
 * Quita el PIN: borra solo `pinHash` y `pinSalt`, ningún dato. Deja anotado que la oferta de crear
 * un PIN ya se hizo, para que la app no la repita justo después de que la persona decidió no tenerlo.
 */
export async function quitarPin(): Promise<void> {
  await db.transaction('rw', db.ajustes, async () => {
    await db.ajustes.bulkDelete(['pinHash', 'pinSalt'])
    await db.ajustes.put({ clave: 'pinOfrecido', valor: true })
  })
}

/** A los 60 s o más en segundo plano, al volver la app pide el PIN de nuevo. */
export const BLOQUEO_TRAS_MS = 60_000

const ITERACIONES = 150_000
const BYTES_SAL = 16
const BITS_HASH = 256

/** True si es un PIN válido: de 4 a 6 dígitos y nada más. */
export function pinValido(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}

function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario)
}

function deBase64(texto: string): Uint8Array<ArrayBuffer> {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/**
 * Hash del PIN con PBKDF2-SHA256 (150.000 vueltas) y una sal de 16 bytes, los dos en base64.
 * Sin `saltB64` genera una sal nueva. Es una pantalla de privacidad, no un cifrado: el hash
 * solo sirve para comprobar el PIN sin guardarlo.
 */
export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const sal = saltB64 === undefined ? crypto.getRandomValues(new Uint8Array(BYTES_SAL)) : deBase64(saltB64)
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES }, clave, BITS_HASH)
  return { hash: aBase64(new Uint8Array(bits)), salt: aBase64(sal) }
}

/** True si `pin` da el mismo hash con esa sal. Un hash dañado da false; una sal que no es base64 lanza. */
export async function verificarPin(pin: string, hash: string, salt: string): Promise<boolean> {
  const calculado = (await hashPin(pin, salt)).hash
  if (calculado.length !== hash.length) return false
  let diferencia = 0
  for (let i = 0; i < calculado.length; i++) diferencia |= calculado.charCodeAt(i) ^ hash.charCodeAt(i)
  return diferencia === 0
}

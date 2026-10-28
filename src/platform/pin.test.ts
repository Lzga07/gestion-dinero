import { expect, test } from 'vitest'
import { BLOQUEO_TRAS_MS, hashPin, pinValido, verificarPin } from './pin'

test('hash y verificación de PIN', async () => {
  const { hash, salt } = await hashPin('1234')
  expect(await verificarPin('1234', hash, salt)).toBe(true)
  expect(await verificarPin('4321', hash, salt)).toBe(false)
  expect(hash).not.toContain('1234')
})

test('la sal es de 16 bytes y es distinta cada vez, así que el hash también', async () => {
  const a = await hashPin('1234')
  const b = await hashPin('1234')
  expect(atob(a.salt)).toHaveLength(16)
  expect(a.salt).not.toBe(b.salt)
  expect(a.hash).not.toBe(b.hash)
})

test('con la misma sal el hash es el mismo (así se verifica)', async () => {
  const a = await hashPin('1234')
  const b = await hashPin('1234', a.salt)
  expect(b).toEqual(a)
})

test('un hash o una sal dañados no verifican nada', async () => {
  const { hash, salt } = await hashPin('1234')
  expect(await verificarPin('1234', '', salt)).toBe(false)
  expect(await verificarPin('1234', hash.slice(0, -4), salt)).toBe(false)
})

test.each([
  ['123', false],
  ['1234', true],
  ['123456', true],
  ['1234567', false],
  ['12a4', false],
  ['', false],
  ['12 34', false],
  ['1234\n', false],
])('pinValido(%j) es %s', (pin, esperado) => {
  expect(pinValido(pin)).toBe(esperado)
})

test('la app se vuelve a bloquear después de 1 minuto', () => {
  expect(BLOQUEO_TRAS_MS).toBe(60_000)
})

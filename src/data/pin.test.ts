import { beforeEach, expect, test } from 'vitest'
import { guardarAjuste, leerAjuste } from './ajustes'
import { db } from './db'
import { crearPin, quitarPin, tienePin, verificarPinGuardado } from './pin'
import { reiniciarDb } from './test-helpers'

beforeEach(reiniciarDb)

test('sin PIN: tienePin es falso y no hay nada que verificar', async () => {
  expect(await tienePin()).toBe(false)
  expect(await verificarPinGuardado('1234')).toBe(true) // sin PIN no hay nada que pedir
})

test('crearPin guarda solo el hash y la sal, nunca el PIN', async () => {
  await crearPin('1234')
  expect(await tienePin()).toBe(true)
  const filas = await db.ajustes.toArray()
  expect(filas.map((f) => f.clave).sort()).toEqual(['pinHash', 'pinSalt'])
  expect(JSON.stringify(filas)).not.toContain('1234')
  expect(await verificarPinGuardado('1234')).toBe(true)
  expect(await verificarPinGuardado('1235')).toBe(false)
})

test('crearPin rechaza un PIN inválido y no guarda nada', async () => {
  await expect(crearPin('12')).rejects.toThrow()
  expect(await tienePin()).toBe(false)
})

test('crearPin sobre un PIN existente lo reemplaza', async () => {
  await crearPin('1234')
  await crearPin('9876')
  expect(await verificarPinGuardado('1234')).toBe(false)
  expect(await verificarPinGuardado('9876')).toBe(true)
})

test('si falta la sal el PIN guardado no se puede verificar: lanza en lugar de abrir', async () => {
  await guardarAjuste('pinHash', 'abc')
  await expect(verificarPinGuardado('1234')).rejects.toThrow()
})

test('quitarPin borra solo el hash y la sal, y deja anotado que ya se ofreció', async () => {
  await crearPin('1234')
  await guardarAjuste('ultimaCopia', '2026-10-27')
  await quitarPin()
  expect(await tienePin()).toBe(false)
  expect(await leerAjuste('pinSalt', null)).toBeNull()
  expect(await leerAjuste('ultimaCopia', null)).toBe('2026-10-27')
  expect(await leerAjuste('pinOfrecido', false)).toBe(true)
})

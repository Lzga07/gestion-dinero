import { expect, test } from '@playwright/test'

/**
 * Fecha fija del navegador: miércoles 15/10/2026 (mediodía, hora de Buenos Aires).
 * Cae a mitad de mes: el período de "Consultorio Sur" (cierra el último día) todavía está abierto y la
 * ventana de pago (21–31 del mes siguiente) no empezó, así que no aparece ningún aviso de "sin pago
 * registrado" y el único aviso de plata es la deuda de la diferencia, que no depende de la ventana de pago.
 */
const AHORA = '2026-10-15T12:00:00-03:00'

test('flujo completo de un mes', async ({ page, context }, testInfo) => {
  await page.clock.setFixedTime(new Date(AHORA))
  await page.goto('./')

  // Primer uso: en Android se ofrece el PIN (en la pestaña de Safari de iPhone no). Se descarta.
  if (testInfo.project.name === 'android') {
    await page.getByRole('button', { name: 'Ahora no' }).click()
  }
  await expect(page.getByRole('button', { name: 'Ahora no' })).toHaveCount(0)
  // Mientras no esté instalada, la app avisa cómo instalarla.
  await expect(page.getByRole('complementary', { name: 'Instalar la app' })).toBeVisible()

  // 1. Crear "Consultorio Sur": 40 %, cierre el último día, paga del 21 al 31.
  await page.getByRole('link', { name: 'Agregar lugar' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo lugar' })).toBeVisible()
  await page.getByLabel('Nombre').fill('Consultorio Sur')
  await page.getByRole('radio', { name: 'Porcentaje' }).check()
  await page.getByLabel('Porcentaje que te corresponde').fill('40')
  await expect(page.getByLabel('Cierra el período el día')).toHaveValue('ULTIMO')
  await page.getByLabel('Desde el día').fill('21')
  await page.getByLabel('Hasta el día').fill('31')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('heading', { name: 'Lugares' })).toBeVisible()
  await expect(page.getByText('Consultorio Sur')).toBeVisible()

  // 2. Anotar un trabajo: pagó 200.000, descuento 50.000 -> te corresponde 40 % de 150.000.
  await page.getByRole('link', { name: 'Inicio' }).click()
  await page.getByRole('link', { name: '+ Anotar trabajo' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo trabajo' })).toBeVisible()
  await page.getByLabel('¿Qué hiciste?').fill('Arreglo')
  await page.getByLabel('Lo que pagó el cliente').fill('200000')
  await page.getByLabel('Descuento antes del % (opcional)').fill('50000')
  await expect(page.locator('.resultado__monto')).toHaveText('$ 60.000')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()

  // 3. Inicio muestra la tarjeta del lugar con $ 60.000.
  const tarjeta = page.getByRole('link', { name: /Consultorio Sur/ })
  await expect(tarjeta).toBeVisible()
  await expect(tarjeta).toContainText('1 trabajo')
  await expect(tarjeta).toContainText('$ 60.000')
  await expect(page.getByRole('region', { name: 'Avisos' }).getByText(/te deben/)).toHaveCount(0)

  // 4. Registrar un pago de 40.000 con todo tildado: "Es todo lo que me van a pagar" -> deuda de $ 20.000.
  await tarjeta.click()
  await page.getByRole('link', { name: 'Registrar pago' }).click()
  await expect(page.getByRole('heading', { name: 'Pago · Consultorio Sur' })).toBeVisible()
  await page.getByLabel('¿Cuánto te pagaron?').fill('40000')
  await expect(page.getByRole('checkbox', { name: /Arreglo/ })).toBeChecked()
  await page.getByRole('button', { name: 'Guardar pago' }).click()
  await expect(page.getByRole('dialog', { name: '¿Es todo lo que te van a pagar?' })).toBeVisible()
  await page.getByRole('button', { name: 'Es todo lo que me van a pagar' }).click()
  await expect(page.getByRole('heading', { name: 'Consultorio Sur', level: 1 })).toBeVisible()

  await page.getByRole('link', { name: 'Inicio' }).click()
  const avisos = page.getByRole('region', { name: 'Avisos' })
  await expect(avisos.getByRole('heading', { name: 'Consultorio Sur: te deben $ 20.000' })).toBeVisible()

  // 5. Sin conexión: la app carga desde el service worker y los datos siguen ahí.
  if (testInfo.project.name === 'iphone') {
    // Limitación de la plataforma: el WebKit de Playwright (Windows) no registra service workers
    // (SW desactivados en el contexto), así que no hay caché sin conexión que probar.
    test.skip(!(await page.evaluate(() => 'serviceWorker' in navigator)), 'WebKit de Playwright sin service workers')
  }
  await page.evaluate(() => navigator.serviceWorker.ready)
  // Una recarga para que el service worker (recién activado) controle la página.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
  await expect(page.getByRole('link', { name: /Consultorio Sur/ })).toContainText('$ 60.000')
  await expect(page.getByRole('region', { name: 'Avisos' }).getByRole('heading', { name: 'Consultorio Sur: te deben $ 20.000' })).toBeVisible()
})

import { expect, test, type Page } from '@playwright/test'

/**
 * Fecha fija del navegador: miércoles 15/10/2026 (mediodía, hora de Buenos Aires).
 * Octubre es el mes en curso; julio ya es deuda vieja (hoy > 31/07 + 2 meses, desde el 01/10) y agosto/septiembre
 * se pueden cargar como meses pasados.
 */
const AHORA = '2026-10-15T12:00:00-03:00'

/** Carga un trabajo de la lista de precios en la fila de "Cargar meses anteriores"; `precio` cambia el de la lista. */
async function agregarTrabajo(page: Page, tipo: string, precio?: string) {
  await page.getByLabel('¿Qué hiciste?').selectOption({ label: tipo })
  if (precio !== undefined) await page.getByLabel('Precio').fill(precio)
  await page.getByRole('button', { name: 'Agregar' }).click()
}

test('cargar meses anteriores y ver las deudas viejas', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(AHORA))
  await page.goto('./')

  // Primer uso: en Android se ofrece el PIN (en la pestaña de Safari de iPhone no). Se descarta.
  if (testInfo.project.name === 'android') {
    await page.getByRole('button', { name: 'Ahora no' }).click()
  }
  await expect(page.getByRole('button', { name: 'Ahora no' })).toHaveCount(0)

  // 1. Crear un lugar de arancel fijo con "Limpieza $ 25.000".
  await page.getByRole('link', { name: 'Agregar lugar' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo lugar' })).toBeVisible()
  await page.getByLabel('Nombre').fill('Casa Norte')
  await expect(page.getByRole('radio', { name: 'Arancel fijo' })).toBeChecked()
  await page.getByRole('button', { name: '+ Agregar trabajo' }).click()
  await page.getByLabel('Trabajo', { exact: true }).fill('Limpieza')
  await page.getByLabel('Precio').fill('25000')
  await page.getByRole('button', { name: 'Guardar' }).click()

  // 2. Al crearlo se ofrece cargar los meses anteriores.
  const dialogo = page.getByRole('dialog', { name: '¿Ya trabajabas en Casa Norte?' })
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cargar meses anteriores' }).click()
  await expect(page.getByRole('heading', { name: 'Cargar meses anteriores' })).toBeVisible()

  // 3. Va al mes anterior al en curso (septiembre); se retrocede hasta julio.
  const mes = page.getByRole('group', { name: 'Mes', exact: true })
  await expect(mes).toContainText('1 – 30 sep 2026')
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  await expect(mes).toContainText('1 – 31 ago 2026')
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  await expect(mes).toContainText('1 – 31 jul 2026')
  await expect(mes).toContainText('Sin trabajos')

  // 4. Julio: dos trabajos (uno a precio de lista, otro con el precio cambiado a 20.000) = 45.000.
  await agregarTrabajo(page, 'Limpieza')
  await expect(mes).toContainText('1 trabajo')
  await agregarTrabajo(page, 'Limpieza', '20000')
  await expect(mes).toContainText('2 trabajos')
  await expect(page.getByRole('heading', { name: '2 trabajos · $ 45.000' })).toBeVisible()

  // 5. "Me pagaron una parte" por 30.000 (45.000 - 30.000 = 15.000 de diferencia); sigue agosto.
  await page.getByRole('radio', { name: 'Me pagaron una parte' }).check()
  await page.getByLabel('¿Cuánto te pagaron?').fill('30000')
  await page.getByRole('button', { name: 'Listo' }).click()
  await page.getByRole('button', { name: 'Seguir con 1 – 31 ago 2026' }).click()
  await expect(mes).toContainText('1 – 31 ago 2026')
  await expect(mes).toContainText('Sin trabajos')

  // 6. Agosto: un trabajo, pagado entero. Después solo se puede seguir con septiembre o terminar.
  await agregarTrabajo(page, 'Limpieza')
  await expect(mes).toContainText('1 trabajo')
  await page.getByRole('radio', { name: 'Me pagaron todo' }).check()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('button', { name: 'Seguir con 1 – 30 sep 2026' })).toBeVisible()
  await page.getByRole('button', { name: 'Terminar' }).click()
  await expect(page.getByRole('heading', { name: 'Casa Norte', level: 1 })).toBeVisible()

  // 7. Inicio: ningún aviso de pago atrasado ni tarjeta de deuda; la deuda de julio es una línea discreta.
  await page.getByRole('link', { name: 'Inicio' }).click()
  const linea = page.getByRole('link', { name: 'Te deben $ 15.000 de meses anteriores · Ver' })
  await expect(linea).toBeVisible()
  // Lo único en Avisos es el recordatorio de la copia de seguridad (primer uso): nada del lugar.
  const avisos = page.getByRole('region', { name: 'Avisos' })
  await expect(avisos.getByRole('heading')).toHaveText(['Todavía no hiciste una copia de seguridad'])
  await expect(avisos.getByText('Casa Norte')).toHaveCount(0)
  await expect(avisos.getByText(/sin pago registrado|te deben/)).toHaveCount(0)
  await expect(page.getByText(/te deben/i)).toHaveCount(1) // solo la línea, ninguna tarjeta de deuda

  // 8. La línea lleva a "Me deben": el lugar con la diferencia de julio.
  await linea.click()
  await expect(page.getByRole('heading', { name: 'Me deben', level: 1 })).toBeVisible()
  const bloque = page.getByRole('region', { name: 'Casa Norte' })
  await expect(bloque.getByRole('heading', { name: 'Casa Norte' })).toBeVisible()
  await expect(bloque).toContainText('Te deben $ 15.000')
  await expect(bloque.getByRole('heading', { name: '1 – 31 jul 2026' })).toBeVisible()
  await expect(bloque.getByText('Diferencia en pago: $ 15.000')).toBeVisible()
  await expect(bloque.getByRole('heading', { name: /ago 2026/ })).toHaveCount(0)
})

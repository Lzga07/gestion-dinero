import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { formatFechaLarga, mesClave, type FechaISO } from '../domain/dates'

/** Grupo del selector de fecha por su etiqueta ("Fecha", "Fecha del pago"), dentro de `en` si se da. */
function grupo(nombre: string, en?: HTMLElement): Promise<HTMLElement> {
  return (en ? within(en) : screen).findByRole('group', { name: nombre })
}

/** Elige `fecha` como una persona: "Otro día…", flechas hasta su mes y el día. */
export async function elegirFecha(user: UserEvent, fecha: FechaISO, nombre = 'Fecha', en?: HTMLElement) {
  const g = await grupo(nombre, en)
  if (!within(g).queryByRole('button', { name: 'Mes anterior' })) {
    await user.click(within(g).getByRole('radio', { name: 'Otro día…' }))
  }
  const objetivo = mesClave(fecha)
  for (let i = 0; i < 1200; i++) {
    const visible = g.querySelector('.calendario__mes')?.getAttribute('datetime')
    if (visible === objetivo) break
    await user.click(within(g).getByRole('button', { name: visible! > objetivo ? 'Mes anterior' : 'Mes siguiente' }))
  }
  await user.click(within(g).getByRole('button', { name: formatFechaLarga(fecha) }))
}

/** La fecha que muestra elegida el selector. */
export async function fechaElegida(nombre = 'Fecha', en?: HTMLElement): Promise<FechaISO | null> {
  const g = await grupo(nombre, en)
  return g.querySelector('.selector-fecha__elegida time')?.getAttribute('datetime') ?? null
}

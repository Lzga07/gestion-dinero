import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { archivarLugar } from '../../data/lugares'
import { lugarFijo, reiniciarDb } from '../../data/test-helpers'
import Lugares from './Lugares'

beforeEach(reiniciarDb)

async function renderLugares(ruta: string) {
  const id = await lugarFijo('ULTIMO', 'Clínica Vieja')
  await archivarLugar(id, true)
  await lugarFijo('ULTIMO', 'Clínica Centro')
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Lugares />
    </MemoryRouter>,
  )
  return (await screen.findByText('Archivados (1)')).closest('details')!
}

describe('archivados', () => {
  test('quedan cerrados por defecto', async () => {
    expect(await renderLugares('/lugares')).not.toHaveAttribute('open')
  })

  test('con ?archivados=1 se abren solos (así llega la opción de Más)', async () => {
    const archivados = await renderLugares('/lugares?archivados=1')
    expect(archivados).toHaveAttribute('open')
    expect(screen.getByRole('link', { name: /Clínica Vieja/ })).toBeVisible()
  })
})

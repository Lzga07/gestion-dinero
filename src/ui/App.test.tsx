import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('muestra las 5 pestañas de navegación', () => {
  render(<App />)
  for (const t of ['Inicio', 'Movimientos', 'Lugares', 'Estadísticas', 'Más'])
    expect(screen.getByRole('link', { name: t })).toBeInTheDocument()
})

test('Inicio es la pantalla por defecto', () => {
  render(<App />)
  expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
})

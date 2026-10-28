import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { simularDispositivo, UA_ANDROID, UA_IPHONE, UA_WINDOWS } from '../../platform/test-dispositivo'
import BannerInstalar from './BannerInstalar'

afterEach(() => vi.unstubAllGlobals())

function renderBanner(ruta = '/') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <BannerInstalar />
    </MemoryRouter>,
  )
}

describe('BannerInstalar', () => {
  test('aparece en una pestaña de Safari de iPhone con la advertencia de datos separados', () => {
    simularDispositivo({ userAgent: UA_IPHONE, maxTouchPoints: 5, standaloneIos: false })
    renderBanner()

    const banner = screen.getByRole('complementary', { name: 'Instalar la app' })
    expect(banner).toHaveTextContent('Para usarla como app: tocá Compartir → Agregar a inicio.')
    expect(banner).toHaveTextContent(
      'Importante: en iPhone, los datos que cargues acá en Safari no aparecen en la app instalada; usá siempre el ícono.',
    )
    expect(screen.getByRole('link', { name: 'Ver cómo' })).toHaveAttribute('href', '/mas/instalar')
  })

  test('en Android indica el menú del navegador', () => {
    simularDispositivo({ userAgent: UA_ANDROID, maxTouchPoints: 5 })
    renderBanner()

    expect(screen.getByRole('complementary', { name: 'Instalar la app' })).toHaveTextContent('Menú ⋮ → Instalar app')
    expect(screen.queryByText(/no aparecen en la app instalada/)).not.toBeInTheDocument()
  })

  test('no aparece si la app ya está instalada (standalone en iPhone y en Android)', () => {
    simularDispositivo({ userAgent: UA_IPHONE, maxTouchPoints: 5, standaloneIos: true })
    renderBanner()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    simularDispositivo({ userAgent: UA_ANDROID, maxTouchPoints: 5, standalone: true })
    renderBanner()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  test('en una computadora no muestra nada', () => {
    simularDispositivo({ userAgent: UA_WINDOWS })
    renderBanner()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  test('no se repite dentro de la propia guía de instalación', () => {
    simularDispositivo({ userAgent: UA_IPHONE, maxTouchPoints: 5 })
    renderBanner('/mas/instalar')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})

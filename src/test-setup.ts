import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Sin `globals: true`, Testing Library no limpia el DOM solo entre tests.
afterEach(() => cleanup())

// El módulo virtual del service worker solo existe en el navegador: en los tests nunca hay versión nueva
// (AvisoVersionNueva.test lo reemplaza por su propio mock).
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => undefined],
    offlineReady: [false, () => undefined],
    updateServiceWorker: async () => undefined,
  }),
}))

import { vi } from 'vitest'

interface Dispositivo {
  userAgent: string
  /** `matchMedia('(display-mode: standalone)')` (Android/escritorio instalada). */
  standalone?: boolean
  /** `navigator.standalone` de Safari de iPhone. */
  standaloneIos?: boolean
  maxTouchPoints?: number
}

export const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
export const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
export const UA_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
export const UA_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Simula el dispositivo y el modo de visualización. Cada test debe terminar con `vi.unstubAllGlobals()`. */
export function simularDispositivo(d: Dispositivo): void {
  vi.stubGlobal('navigator', {
    userAgent: d.userAgent,
    maxTouchPoints: d.maxTouchPoints ?? 0,
    ...(d.standaloneIos === undefined ? {} : { standalone: d.standaloneIos }),
  })
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta === '(display-mode: standalone)' && d.standalone === true,
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

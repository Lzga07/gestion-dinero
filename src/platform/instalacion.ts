/** `navigator.standalone` solo existe en Safari de iPhone. */
type NavegadorIos = Navigator & { standalone?: boolean }

/** True si la app se abrió desde el ícono de la pantalla de inicio (y no en una pestaña del navegador). */
export function esStandalone(): boolean {
  const modo = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return modo || (navigator as NavegadorIos).standalone === true
}

/** Dispositivo según el userAgent. Un iPad en modo escritorio se presenta como Macintosh con pantalla táctil. */
export function plataforma(): 'ios' | 'android' | 'otro' {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'otro'
}

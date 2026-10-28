import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'

const FOCUSABLES = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Comportamiento común de los diálogos y hojas modales: al abrir lleva el foco adentro (al elemento con
 * `data-foco-inicial`, o al primero que se pueda enfocar) y al cerrar lo devuelve a donde estaba; Tab y
 * Shift+Tab ciclan dentro de la caja; Escape y tocar el fondo cierran.
 */
export function useDialogoModal(onCerrar: () => void) {
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const inicial =
      caja.current?.querySelector<HTMLElement>('[data-foco-inicial]') ?? caja.current?.querySelector<HTMLElement>(FOCUSABLES)
    inicial?.focus()
    return () => previo?.focus?.()
  }, [])

  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCerrar()
      return
    }
    if (e.key !== 'Tab' || !caja.current) return
    const items = Array.from(caja.current.querySelectorAll<HTMLElement>(FOCUSABLES))
    if (items.length === 0) return
    const primero = items[0]
    const ultimo = items[items.length - 1]
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primero.focus()
    }
  }

  function alTocarFondo(e: MouseEvent) {
    if (e.target !== e.currentTarget) return
    // Sin esto el navegador manda el foco al <body> después de cerrar y se pierde el que devolvimos.
    e.preventDefault()
    onCerrar()
  }

  return { caja, alTeclear, alTocarFondo }
}

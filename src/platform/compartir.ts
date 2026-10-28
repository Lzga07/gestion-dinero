export type ResultadoCompartir = 'compartido' | 'descargado' | 'cancelado'

/** Descarga el archivo con un <a download> (sin menú de compartir, p. ej. en una computadora). */
function descargar(archivo: File): void {
  const url = URL.createObjectURL(archivo)
  const ancla = document.createElement('a')
  ancla.href = url
  ancla.download = archivo.name
  ancla.rel = 'noopener'
  ancla.style.display = 'none'
  document.body.appendChild(ancla)
  ancla.click()
  ancla.remove()
  // El navegador necesita la URL un instante para empezar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Abre el menú de compartir del celular con el archivo (Web Share API); si el navegador no puede compartir
 * archivos o el menú falla, lo descarga. Solo "cancelado" (la persona cerró el menú) no descarga. Tiene que llamarse directo desde el toque del usuario, con el archivo ya armado:
 * Safari de iPhone rechaza `share` si pasa trabajo asincrónico pesado entre el toque y la llamada.
 * Esa misma capa se cambia por la versión nativa más adelante.
 */
export async function compartirArchivo(archivo: File, titulo: string): Promise<ResultadoCompartir> {
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo })
      return 'compartido'
    } catch (e) {
      const nombre = e instanceof DOMException ? e.name : ''
      if (nombre === 'AbortError') return 'cancelado'
      // Cualquier otra falla (Safari rechaza `share` fuera del gesto del usuario con NotAllowedError, otros
      // navegadores fallan con DataError o TypeError): se descarga el archivo para que no se pierda.
      if (nombre !== 'NotAllowedError') console.warn('El menú de compartir falló; se descarga el archivo', e)
    }
  }
  descargar(archivo)
  return 'descargado'
}

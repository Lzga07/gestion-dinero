/** Lee un archivo elegido por la persona como texto. */
export function leerTextoArchivo(archivo: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result))
    lector.onerror = () => rechazar(lector.error ?? new Error('No se pudo leer el archivo'))
    lector.readAsText(archivo)
  })
}

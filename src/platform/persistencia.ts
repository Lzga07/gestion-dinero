/** Le pide al navegador que no borre los datos de la app por falta de espacio. False si no puede o no quiere. */
export async function pedirPersistencia(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false
}

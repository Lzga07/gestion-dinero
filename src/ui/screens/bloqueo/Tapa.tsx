/** Capa opaca y vacía que tapa la app mientras se comprueba si hay PIN, al volver tras mucho tiempo. */
export default function Tapa() {
  return <div className="bloqueo" role="dialog" aria-modal="true" aria-label="Abriendo la app" />
}

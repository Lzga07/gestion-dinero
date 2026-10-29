import Cargando from '../../components/Cargando'

/** Capa opaca que tapa la app mientras se comprueba si hay PIN, al volver tras mucho tiempo (si tarda, avisa). */
export default function Tapa() {
  return (
    <div className="bloqueo" role="dialog" aria-modal="true" aria-label="Abriendo la app">
      <Cargando />
    </div>
  )
}

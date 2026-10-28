/** Encabezado de una pantalla que se abre sobre otra: "✕" para cerrar y el título. */
export default function Encabezado({ titulo, onCerrar }: { titulo: string; onCerrar: () => void }) {
  return (
    <header className="screen-header">
      <button type="button" className="screen-header__back" aria-label="Cerrar" onClick={onCerrar}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <h1 className="screen-title screen-title--inline">{titulo}</h1>
    </header>
  )
}

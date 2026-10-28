import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { nombrePeriodo } from '../../domain/periodos'
import { armarPdfListado, nombreArchivoListado, type DatosListado } from '../../pdf/listado'
import { compartirArchivo } from '../../platform/compartir'
import Button from './Button'
import { useDialogoModal } from './useDialogoModal'

interface DialogCompartirProps {
  /** Lo que se va a listar; se toma tal como está al abrir el diálogo. */
  datos: Omit<DatosListado, 'incluirNotas'>
  onCerrar: () => void
}

/**
 * Compartir un listado (o un reclamo) en PDF. El archivo se arma al abrir y cada vez que cambia "Incluir
 * notas", antes del toque en "Compartir": Safari de iPhone solo deja abrir el menú de compartir si se lo
 * pide directo desde el toque, sin esperar a que se arme el PDF.
 */
export default function DialogCompartir({ datos, onCerrar }: DialogCompartirProps) {
  const id = useId()
  const { caja, alTeclear, alTocarFondo } = useDialogoModal(onCerrar)
  const [base] = useState(datos)
  const [incluirNotas, setIncluirNotas] = useState(true)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const ocupado = useRef(false)

  const nombre = useMemo(() => nombreArchivoListado({ ...base, incluirNotas }), [base, incluirNotas])
  const reclamo = base.tipo === 'RECLAMO'
  const titulo = reclamo ? 'Compartir reclamo' : 'Compartir listado'

  useEffect(() => {
    let vigente = true
    armarPdfListado({ ...base, incluirNotas })
      .then((blob) => {
        if (vigente) setArchivo(new File([blob], nombre, { type: 'application/pdf' }))
      })
      .catch((e: unknown) => {
        console.error('No se pudo armar el PDF', e)
        if (vigente) setError('No se pudo armar el PDF')
      })
    return () => {
      vigente = false
    }
  }, [base, incluirNotas, nombre])

  function cambiarNotas(incluir: boolean) {
    setIncluirNotas(incluir)
    setArchivo(null)
    setError(null)
    setMensaje(null)
  }

  async function compartir() {
    if (!archivo || ocupado.current) return
    ocupado.current = true
    setError(null)
    setMensaje(null)
    try {
      const resultado = await compartirArchivo(
        archivo,
        reclamo ? `Reclamo a ${base.lugar.nombre}` : `Listado de ${base.lugar.nombre}`,
      )
      if (resultado === 'compartido') onCerrar()
      else if (resultado === 'descargado') setMensaje('Se descargó el PDF')
    } catch (e) {
      console.error('No se pudo compartir el PDF', e)
      setError('No se pudo compartir el PDF')
    } finally {
      ocupado.current = false
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={alTocarFondo}>
      <div
        ref={caja}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-texto`}
        onKeyDown={alTeclear}
      >
        <h2 className="dialog__title" id={`${id}-titulo`}>
          {titulo}
        </h2>
        <p className="dialog__text" id={`${id}-texto`}>
          {reclamo || !base.periodo
            ? `Se arma un PDF con lo que te deben en ${base.lugar.nombre}.`
            : `Se arma un PDF con los trabajos de ${base.lugar.nombre} del ${nombrePeriodo(base.periodo)}.`}
        </p>
        <label className="dialog__opcion">
          <input
            className="dialog__caja"
            type="checkbox"
            checked={incluirNotas}
            aria-describedby={`${id}-ayuda`}
            onChange={(e) => cambiarNotas(e.target.checked)}
          />
          <span>Incluir notas</span>
        </label>
        <p className="field__hint dialog__ayuda" id={`${id}-ayuda`}>
          Las notas pueden tener nombres de tus clientes.
        </p>
        <p className="dialog__estado" role="status">
          {mensaje}
        </p>
        {error && (
          <p className="field__error dialog__error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__actions">
          <Button data-foco-inicial variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variante="primario" disabled={!archivo} onClick={compartir}>
            {archivo || error ? 'Compartir' : 'Preparando…'}
          </Button>
        </div>
      </div>
    </div>
  )
}

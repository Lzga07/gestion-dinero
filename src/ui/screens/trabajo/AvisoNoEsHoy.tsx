import { formatFechaLarga, type FechaISO } from '../../../domain/dates'
import Button from '../../components/Button'

interface AvisoNoEsHoyProps {
  fecha: FechaISO
  hoy: FechaISO
  onHoy: () => void
}

/** Debajo de la fecha del formulario: si no es hoy lo dice con todas las letras y ofrece volver a hoy. */
export default function AvisoNoEsHoy({ fecha, hoy, onHoy }: AvisoNoEsHoyProps) {
  if (fecha === '' || fecha === hoy) return null
  return (
    <div className="aviso-fecha">
      <p className="aviso-fecha__texto">{`No es hoy: ${formatFechaLarga(fecha)}`}</p>
      <Button variante="secundario" onClick={onHoy}>
        Hoy
      </Button>
    </div>
  )
}

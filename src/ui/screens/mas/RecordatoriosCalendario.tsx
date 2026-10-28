import { useId, useRef, useState } from 'react'
import { armarIcsLugar, nombreArchivoCalendario } from '../../../domain/calendario'
import type { FechaISO } from '../../../domain/dates'
import type { Lugar } from '../../../domain/types'
import { compartirArchivo } from '../../../platform/compartir'
import Button from '../../components/Button'
import Card from '../../components/Card'

/**
 * Un recordatorio mensual en el calendario del celular por cada lugar activo. El .ics se arma en el mismo
 * toque, sin esperar nada antes de compartir: Safari de iPhone solo abre el menú de compartir así.
 */
export default function RecordatoriosCalendario({ lugares, hoy }: { lugares: Lugar[]; hoy: FechaISO }) {
  const id = useId()
  const ocupado = useRef(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState<string | null>(null)

  function agregar(lugar: Lugar) {
    if (ocupado.current) return
    ocupado.current = true
    setMensaje('')
    setError(null)
    const archivo = new File([armarIcsLugar(lugar, hoy)], nombreArchivoCalendario(lugar), { type: 'text/calendar' })
    compartirArchivo(archivo, `Recordatorio de pago de ${lugar.nombre}`)
      .then((resultado) => {
        if (resultado === 'compartido') setMensaje(`Listo: compartiste el recordatorio de ${lugar.nombre}`)
        else if (resultado === 'descargado') {
          setMensaje(`Se descargó el recordatorio de ${lugar.nombre}. Abrilo para agregarlo al calendario.`)
        }
      })
      .catch((e: unknown) => {
        console.error('No se pudo compartir el recordatorio', e)
        setError('No se pudo crear el recordatorio. Probá de nuevo.')
      })
      .finally(() => {
        ocupado.current = false
      })
  }

  return (
    <section aria-labelledby={`${id}-titulo`}>
      <h2 className="section-title" id={`${id}-titulo`}>
        Recordatorios en el calendario
      </h2>
      <Card>
        <p className="copia__texto">
          Para que el celular te avise aunque no abras la app. Se crea un evento que se repite todos los meses el
          último día del rango de pago de cada lugar, con una alarma.
        </p>
        {lugares.length === 0 ? (
          <p className="muted">Cuando agregues un lugar vas a poder crear su recordatorio acá.</p>
        ) : (
          <div className="calendario__botones">
            {lugares.map((l) => (
              <Button key={l.id} variante="secundario" block onClick={() => agregar(l)}>
                {`Agregar al calendario · ${l.nombre}`}
              </Button>
            ))}
          </div>
        )}
        <p className="copia__estado" role="status">
          {mensaje}
        </p>
        {error && (
          <p className="field__error copia__error" role="alert">
            {error}
          </p>
        )}
      </Card>
    </section>
  )
}

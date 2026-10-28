import { useId, useRef, useState, type ChangeEvent } from 'react'
import { restaurarDatos } from '../../../data/copia'
import { hoy as fechaLocal, formatFechaCorta } from '../../../domain/dates'
import { leerCopia, type Copia } from '../../../domain/copia'
import { leerTextoArchivo } from '../../../platform/archivos'
import Card from '../../components/Card'
import ConfirmDialog from '../../components/ConfirmDialog'
import { mensajeErrorDatos } from '../../mensajes-datos'
import { plural } from '../periodo/utils'

interface Pendiente {
  copia: Copia
  resumen: string
}

function resumenDe(copia: Copia): string {
  const { datos } = copia
  const dia = fechaLocal(new Date(copia.creadoEn))
  return [
    `Copia del ${formatFechaCorta(dia)} ${dia.slice(0, 4)}`,
    plural(datos.lugares.length, 'lugar', 'lugares'),
    plural(datos.trabajos.length, 'trabajo', 'trabajos'),
    plural(datos.movimientos.length, 'movimiento', 'movimientos'),
  ].join(' · ')
}

/**
 * Restaurar desde un archivo de copia: lo valida entero, muestra qué trae y pide confirmación antes de
 * reemplazar los datos. Si el archivo no sirve, solo muestra el motivo: no se toca nada.
 */
export default function Restaurar() {
  const id = useId()
  const ocupado = useRef(false)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  async function elegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    // Se vacía siempre, para que elegir el mismo archivo otra vez vuelva a disparar el cambio.
    e.target.value = ''
    if (!archivo) return
    setError(null)
    setListo(false)
    try {
      const leida = leerCopia(await leerTextoArchivo(archivo))
      if (!leida.ok) setError(leida.error)
      else setPendiente({ copia: leida.copia, resumen: resumenDe(leida.copia) })
    } catch (err) {
      console.error('No se pudo leer el archivo de copia', err)
      setError('No se pudo leer el archivo. Probá de nuevo.')
    }
  }

  async function confirmar() {
    if (!pendiente || ocupado.current) return
    ocupado.current = true
    try {
      await restaurarDatos(pendiente.copia)
      setListo(true)
    } catch (err) {
      console.error('No se pudo restaurar la copia', err)
      setError(mensajeErrorDatos(err, 'No se pudo restaurar la copia. Tus datos no cambiaron.'))
    } finally {
      ocupado.current = false
      setPendiente(null)
    }
  }

  return (
    <Card as="section" aria-label="Restaurar">
      <h2 className="copia__titulo">Restaurar</h2>
      <p className="copia__texto">
        Elegí un archivo de copia (.json) para recuperar tus datos, por ejemplo en un celular nuevo. Antes de
        reemplazar nada te mostramos qué trae y te pedimos confirmación.
      </p>
      <input
        id={id}
        className="archivo-input"
        type="file"
        accept="application/json,.json"
        onChange={elegirArchivo}
      />
      <label className="btn btn--secundario btn--block" htmlFor={id}>
        Restaurar copia
      </label>
      <p className="copia__estado" role="status">
        {listo ? 'Listo: restauramos tus datos' : ''}
      </p>
      {error && (
        <p className="field__error copia__error" role="alert">
          {error}
        </p>
      )}

      {pendiente && (
        <ConfirmDialog
          titulo="¿Restaurar esta copia?"
          texto="Esto reemplaza todos tus datos actuales."
          confirmar="Restaurar"
          peligro
          onConfirm={confirmar}
          onCancel={() => setPendiente(null)}
        >
          <p className="dialog__text">{pendiente.resumen}</p>
        </ConfirmDialog>
      )}
    </Card>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { guardarAjuste, leerAjuste } from '../../data/ajustes'
import { exportarDatos } from '../../data/copia'
import { armarCopia, nombreArchivoCopia, type Datos } from '../../domain/copia'
import type { FechaISO } from '../../domain/dates'
import { compartirArchivo } from '../../platform/compartir'
import Button from '../components/Button'
import Card from '../components/Card'
import Encabezado from '../components/Encabezado'
import Field from '../components/Field'
import useVolver from '../components/useVolver'
import { useHoy } from '../hooks/useHoy'
import { diasDesdeCopia, textoUltimaCopia } from './copia/ultima'
import Restaurar from './copia/Restaurar'

const RECORDATORIOS = [
  { dias: 7, texto: 'Cada 7 días' },
  { dias: 14, texto: 'Cada 14 días' },
  { dias: 30, texto: 'Cada 30 días' },
  { dias: 0, texto: 'Desactivado' },
]

/** Todo lo que muestra la pantalla, siempre al día. `undefined` mientras carga. */
function useEstado() {
  return useLiveQuery(
    async () => ({
      datos: await exportarDatos(),
      ultimaCopia: await leerAjuste<string | null>('ultimaCopia', null),
      recordatorioDias: await leerAjuste<number>('recordatorioCopiaDias', 7),
    }),
    [],
  )
}

/** El archivo de copia, ya armado: así "Hacer copia" abre el menú de compartir directo desde el toque. */
function armarArchivo(datos: Datos, hoy: FechaISO): File {
  const json = JSON.stringify(armarCopia(datos, new Date()))
  return new File([json], nombreArchivoCopia(hoy), { type: 'application/json' })
}

/** Copia de seguridad (`/mas/copia`): hacer la copia, restaurarla y elegir cada cuánto recordarla. */
export default function Copia() {
  const volver = useVolver('/mas')
  const hoy = useHoy()
  const estado = useEstado()
  const datos = estado?.datos
  const archivo = useMemo(() => (datos ? armarArchivo(datos, hoy) : null), [datos, hoy])
  const ocupado = useRef(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function hacerCopia() {
    if (!archivo || ocupado.current) return
    ocupado.current = true
    setMensaje('')
    setError(null)
    try {
      const resultado = await compartirArchivo(archivo, 'Copia de seguridad de Gestión Dinero')
      if (resultado !== 'cancelado') {
        await guardarAjuste('ultimaCopia', new Date().toISOString())
        setMensaje('Copia guardada')
      }
    } catch (e) {
      console.error('No se pudo hacer la copia', e)
      setError('No se pudo hacer la copia. Probá de nuevo.')
    } finally {
      ocupado.current = false
    }
  }

  async function cambiarRecordatorio(dias: number) {
    setError(null)
    try {
      await guardarAjuste('recordatorioCopiaDias', dias)
    } catch (e) {
      console.error('No se pudo guardar el recordatorio', e)
      setError('No se pudo guardar el recordatorio. Probá de nuevo.')
    }
  }

  return (
    <section className="copia">
      <Encabezado titulo="Copia de seguridad" onCerrar={volver} />

      <Card as="section" aria-label="Hacer copia">
        {estado && <p className="copia__ultima">{textoUltimaCopia(diasDesdeCopia(estado.ultimaCopia, hoy))}</p>}
        <p className="copia__texto">
          Tus datos están solo en este celular. Si borrás la app o los datos del navegador, se pierden. Guardá la
          copia en tu Drive o en Archivos para poder recuperarlos.
        </p>
        <Button block disabled={!archivo} onClick={hacerCopia}>
          {archivo ? 'Hacer copia' : 'Preparando…'}
        </Button>
        <p className="copia__estado" role="status">
          {mensaje}
        </p>
        {error && (
          <p className="field__error copia__error" role="alert">
            {error}
          </p>
        )}
      </Card>

      <Restaurar />

      {estado && <Recordatorio dias={estado.recordatorioDias} onCambiar={cambiarRecordatorio} />}
    </section>
  )
}

function Recordatorio({ dias, onCambiar }: { dias: number; onCambiar: (dias: number) => void }) {
  // Si el ajuste trae un valor que no está en la lista (de una copia vieja), se conserva como opción.
  const opciones = RECORDATORIOS.some((r) => r.dias === dias)
    ? RECORDATORIOS
    : [{ dias, texto: `Cada ${dias} días` }, ...RECORDATORIOS]
  return (
    <Card as="section" aria-label="Recordatorio">
      <Field label="Recordatorio de copia" hint="Si pasan más días sin copia, te avisamos en Inicio.">
        {(control) => (
          <select {...control} className="input" value={dias} onChange={(e) => onCambiar(Number(e.target.value))}>
            {opciones.map((r) => (
              <option key={r.dias} value={r.dias}>
                {r.texto}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Card>
  )
}

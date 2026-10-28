import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { guardarAjuste, leerAjuste } from '../../data/ajustes'
import { exportarDatos } from '../../data/copia'
import { armarCopia, leerCopia, nombreArchivoCopia, type Datos } from '../../domain/copia'
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

interface Estado {
  /** null: no se pudieron leer los datos (se muestra el error con "Reintentar"). */
  datos: Datos | null
  ultimaCopia: string | null
  recordatorioDias: number
}

/**
 * Todo lo que muestra la pantalla, siempre al día. `undefined` mientras carga. Si la lectura falla no se
 * relanza (dejaría la pantalla en blanco): vuelve `datos: null`. Cambiar `intento` vuelve a leer.
 */
function useEstado(intento: number) {
  return useLiveQuery(async (): Promise<Estado> => {
    try {
      return {
        datos: await exportarDatos(),
        ultimaCopia: await leerAjuste<string | null>('ultimaCopia', null),
        recordatorioDias: await leerAjuste<number>('recordatorioCopiaDias', 7),
      }
    } catch (e) {
      console.error('No se pudieron leer los datos para la copia', e)
      return { datos: null, ultimaCopia: null, recordatorioDias: 7 }
    }
  }, [intento])
}

const NO_SE_LEYO = 'No pudimos leer tus datos para armar la copia.'

type Preparado = { ok: true; archivo: File } | { ok: false; error: string }

/** "La copia tiene…" → "la copia tiene…", siempre con punto final. */
function motivo(error: string): string {
  const t = error.charAt(0).toLowerCase() + error.slice(1)
  return t.endsWith('.') ? t : `${t}.`
}

/**
 * El archivo de copia, ya armado y validado con la misma lectura que usa "Restaurar": así "Hacer copia" abre
 * el menú de compartir directo desde el toque (Safari) y nunca se guarda una copia que después no se pueda
 * restaurar.
 */
function prepararArchivo(datos: Datos, hoy: FechaISO): Preparado {
  const json = JSON.stringify(armarCopia(datos, new Date()))
  const prueba = leerCopia(json)
  if (!prueba.ok) return { ok: false, error: `No pudimos armar una copia válida: ${motivo(prueba.error)} Avisanos.` }
  return { ok: true, archivo: new File([json], nombreArchivoCopia(hoy), { type: 'application/json' }) }
}

/** Copia de seguridad (`/mas/copia`): hacer la copia, restaurarla y elegir cada cuánto recordarla. */
export default function Copia() {
  const volver = useVolver('/mas')
  const hoy = useHoy()
  const [intento, setIntento] = useState(0)
  const estado = useEstado(intento)
  const datos = estado?.datos
  const preparado = useMemo<Preparado | null>(
    () => (datos ? prepararArchivo(datos, hoy) : datos === null ? { ok: false, error: NO_SE_LEYO } : null),
    [datos, hoy],
  )
  const archivo = preparado?.ok ? preparado.archivo : null
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
        // Una descarga queda en el celular: si se borran los datos del navegador, puede irse con ellos.
        setMensaje(resultado === 'compartido' ? 'Copia guardada' : 'Se descargó la copia: pasala a Drive o a Archivos')
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
        {estado?.datos && <p className="copia__ultima">{textoUltimaCopia(diasDesdeCopia(estado.ultimaCopia, hoy))}</p>}
        <p className="copia__texto">
          Tus datos están solo en este celular. Si borrás la app o los datos del navegador, se pierden. Guardá la
          copia en tu Drive o en Archivos para poder recuperarlos.
        </p>
        <Button block disabled={!archivo} onClick={hacerCopia}>
          {preparado ? 'Hacer copia' : 'Preparando…'}
        </Button>
        <p className="copia__estado" role="status">
          {mensaje}
        </p>
        {preparado?.ok === false && (
          <p className="field__error copia__error" role="alert">
            {preparado.error}
          </p>
        )}
        {datos === null && (
          <Button variante="secundario" block onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </Button>
        )}
        {error && (
          <p className="field__error copia__error" role="alert">
            {error}
          </p>
        )}
      </Card>

      <Restaurar />

      {estado?.datos && <Recordatorio dias={estado.recordatorioDias} onCambiar={cambiarRecordatorio} />}
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

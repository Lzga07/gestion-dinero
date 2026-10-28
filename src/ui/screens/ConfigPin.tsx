import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearPin, quitarPin, tienePin, verificarPinGuardado } from '../../data/pin'
import { pinValido } from '../../platform/pin'
import Button from '../components/Button'
import Card from '../components/Card'
import Encabezado from '../components/Encabezado'
import Field, { type FieldControlProps } from '../components/Field'
import useVolver from '../components/useVolver'

const ERROR_FORMATO = 'El PIN tiene que tener de 4 a 6 números.'
const ERROR_IGUALES = 'Los dos PIN tienen que ser iguales.'
const ERROR_ACTUAL = 'El PIN actual no es correcto.'
const ERROR_GUARDAR = 'No se pudo guardar el PIN. Probá de nuevo.'

/** Campo de PIN: solo números, hasta 6, teclado numérico en el celular y puntitos en lugar de dígitos. */
function CampoPin({
  label,
  valor,
  onCambio,
  error,
  hint,
}: {
  label: string
  valor: string
  onCambio: (v: string) => void
  error?: string | null
  hint?: string
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(control: FieldControlProps) => (
        <input
          {...control}
          className="input input--short"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={valor}
          onChange={(e) => onCambio(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      )}
    </Field>
  )
}

type Seccion = 'crear' | 'cambiar' | 'quitar'
type Campo = 'actual' | 'nuevo' | 'repetido'
interface Problema {
  campo: Campo
  texto: string
}

/** PIN (`/mas/pin`): crear, cambiar (pide el actual) o quitar (pide el actual). */
export default function ConfigPin() {
  const volver = useVolver('/mas')
  const navigate = useNavigate()
  const hay = useLiveQuery(() => tienePin(), [])
  const [actual, setActual] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [repetido, setRepetido] = useState('')
  const [actualQuitar, setActualQuitar] = useState('')
  const [problema, setProblema] = useState<(Problema & { seccion: Seccion }) | null>(null)
  const [ocupado, setOcupado] = useState(false)

  if (hay === undefined) return null // cargando

  const errorDe = (seccion: Seccion, campo: Campo) =>
    problema?.seccion === seccion && problema.campo === campo ? problema.texto : null

  /** Vuelve a Más con un aviso de que todo salió bien. */
  const terminar = (aviso: string) => navigate('/mas', { replace: true, state: { aviso } })

  /** Corre una acción que escribe en la base; si falla lo avisa en el campo `campo` de la sección. */
  async function guardar(seccion: Seccion, accion: () => Promise<void>, aviso: string) {
    setOcupado(true)
    try {
      await accion()
      terminar(aviso)
    } catch (e) {
      console.error('No se pudo guardar el PIN', e)
      setProblema({ seccion, campo: 'repetido', texto: ERROR_GUARDAR })
      setOcupado(false)
    }
  }

  /** Valida el PIN nuevo y su repetición; devuelve el problema si lo hay. */
  function validarNuevo(): Problema | null {
    if (!pinValido(nuevo)) return { campo: 'nuevo', texto: ERROR_FORMATO }
    if (nuevo !== repetido) return { campo: 'repetido', texto: ERROR_IGUALES }
    return null
  }

  /** Comprueba el PIN actual contra el guardado; si no coincide (o no se puede verificar) lo marca en el campo. */
  async function validarActual(pin: string, seccion: Seccion): Promise<boolean> {
    try {
      if (await verificarPinGuardado(pin)) return true
      setProblema({ seccion, campo: 'actual', texto: ERROR_ACTUAL })
    } catch (e) {
      console.error('No se pudo verificar el PIN actual', e)
      setProblema({ seccion, campo: 'actual', texto: 'No pudimos verificar tu PIN. Probá de nuevo.' })
    }
    return false
  }

  async function alCrear(e: FormEvent) {
    e.preventDefault()
    if (ocupado) return
    const p = validarNuevo()
    if (p) return setProblema({ ...p, seccion: 'crear' })
    setProblema(null)
    await guardar('crear', () => crearPin(nuevo), 'PIN creado. Desde ahora la app te lo pide al abrirla.')
  }

  async function alCambiar(e: FormEvent) {
    e.preventDefault()
    setProblema(null)
    if (ocupado) return
    const p = validarNuevo()
    if (p) return setProblema({ ...p, seccion: 'cambiar' })
    setOcupado(true)
    if (!(await validarActual(actual, 'cambiar'))) return setOcupado(false)
    await guardar('cambiar', () => crearPin(nuevo), 'PIN cambiado.')
  }

  async function alQuitar(e: FormEvent) {
    e.preventDefault()
    setProblema(null)
    if (ocupado) return
    setOcupado(true)
    if (!(await validarActual(actualQuitar, 'quitar'))) return setOcupado(false)
    await guardar('quitar', quitarPin, 'PIN quitado. La app abre sin pedirlo; tus datos siguen igual.')
  }

  return (
    <section className="copia">
      <Encabezado titulo="PIN" onCerrar={volver} />

      <Card>
        <p className="copia__texto">
          El PIN evita que otra persona vea tus datos si agarra tu celular. No cifra la información.
        </p>
        <p className="copia__texto">
          La app te lo pide al abrirla y cuando volvés después de más de 1 minuto. Si lo olvidás, podés quitarlo desde
          la pantalla del PIN y tus datos no se pierden.
        </p>
      </Card>

      {hay ? (
        <>
          <Card as="section" aria-label="Cambiar PIN">
            <h2 className="copia__titulo">Cambiar PIN</h2>
            <form onSubmit={(e) => void alCambiar(e)} noValidate>
              <CampoPin label="PIN actual" valor={actual} onCambio={setActual} error={errorDe('cambiar', 'actual')} />
              <CampoPin label="PIN nuevo" valor={nuevo} onCambio={setNuevo} error={errorDe('cambiar', 'nuevo')} hint="De 4 a 6 números." />
              <CampoPin label="Repetí el PIN nuevo" valor={repetido} onCambio={setRepetido} error={errorDe('cambiar', 'repetido')} />
              <Button type="submit" block disabled={ocupado}>
                Cambiar PIN
              </Button>
            </form>
          </Card>
          <Card as="section" aria-label="Quitar PIN">
            <h2 className="copia__titulo">Quitar PIN</h2>
            <form onSubmit={(e) => void alQuitar(e)} noValidate>
              <CampoPin
                label="PIN actual (para quitarlo)"
                valor={actualQuitar}
                onCambio={setActualQuitar}
                error={errorDe('quitar', 'actual') ?? errorDe('quitar', 'repetido')}
              />
              <Button type="submit" block variante="peligro" disabled={ocupado}>
                Quitar PIN
              </Button>
            </form>
          </Card>
        </>
      ) : (
        <Card as="section" aria-label="Crear PIN">
          <h2 className="copia__titulo">Crear PIN</h2>
          <form onSubmit={(e) => void alCrear(e)} noValidate>
            <CampoPin label="PIN nuevo" valor={nuevo} onCambio={setNuevo} error={errorDe('crear', 'nuevo')} hint="De 4 a 6 números." />
            <CampoPin label="Repetí el PIN" valor={repetido} onCambio={setRepetido} error={errorDe('crear', 'repetido')} />
            <Button type="submit" block disabled={ocupado}>
              Crear PIN
            </Button>
          </form>
        </Card>
      )}
    </section>
  )
}

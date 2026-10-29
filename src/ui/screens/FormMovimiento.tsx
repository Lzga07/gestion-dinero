import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../../data/db'
import { borrarMovimiento, guardarMovimiento } from '../../data/movimientos'
import { hoy } from '../../domain/dates'
import type { Centavos } from '../../domain/money'
import type { Categoria, Movimiento, TipoMovimiento } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Cargando from '../components/Cargando'
import ConfirmDialog from '../components/ConfirmDialog'
import Encabezado from '../components/Encabezado'
import Field from '../components/Field'
import MoneyInput, { ERROR_MONTO } from '../components/MoneyInput'
import useVolver from '../components/useVolver'
import { mensajeErrorDatos } from '../mensajes-datos'

const SUSTANTIVO: Record<TipoMovimiento, string> = { GASTO: 'gasto', INGRESO: 'ingreso' }

interface Datos {
  categorias: Categoria[]
  movimiento: Movimiento | null
}

/** Pantalla de alta (`/movimiento/nuevo?tipo=GASTO|INGRESO`) y de edición (`/movimiento/:id`) de un gasto u otro ingreso. */
export default function FormMovimiento() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const volver = useVolver('/movimientos')
  const datos = useLiveQuery(
    async (): Promise<Datos> => ({
      categorias: (await db.categorias.toArray()).sort((a, b) => a.orden - b.orden),
      movimiento: id ? ((await db.movimientos.get(id)) ?? null) : null,
    }),
    [id],
  )

  if (datos === undefined) return <Cargando />
  if (id && !datos.movimiento) {
    return (
      <section>
        <Encabezado titulo="Editar movimiento" onCerrar={volver} />
        <Card>
          <p className="muted">No encontramos este movimiento.</p>
        </Card>
      </section>
    )
  }
  const tipo: TipoMovimiento = datos.movimiento?.tipo ?? (params.get('tipo') === 'INGRESO' ? 'INGRESO' : 'GASTO')
  return <Formulario key={id ?? `nuevo-${tipo}`} tipo={tipo} datos={datos} />
}

function Chip({ categoria, elegida, invalido, onElegir }: {
  categoria: Categoria
  elegida: boolean
  invalido: boolean
  onElegir: () => void
}) {
  return (
    <label className="chip">
      <input
        className="chip__input"
        type="radio"
        name="categoria"
        value={categoria.id}
        checked={elegida}
        data-invalido={invalido ? 'true' : undefined}
        aria-describedby={invalido ? 'categoria-error' : undefined}
        onChange={onElegir}
      />
      <span className="chip__text">
        {categoria.icono && <span aria-hidden="true">{categoria.icono}</span>}
        {categoria.nombre}
      </span>
    </label>
  )
}

function Formulario({ tipo, datos }: { tipo: TipoMovimiento; datos: Datos }) {
  const volver = useVolver('/movimientos')
  const formRef = useRef<HTMLFormElement>(null)
  const guardandoRef = useRef(false)
  /** Id ya guardado: si algo falla después, un nuevo "Guardar" edita en vez de duplicar. */
  const idGuardado = useRef<string | null>(null)
  const [movimiento] = useState(datos.movimiento) // lo que se está editando, tal como se abrió

  const [monto, setMonto] = useState<Centavos | null>(movimiento?.monto ?? null)
  const [montoInvalido, setMontoInvalido] = useState(false)
  const [fecha, setFecha] = useState(movimiento?.fecha ?? hoy())
  const [categoriaId, setCategoriaId] = useState<string | null>(movimiento?.categoriaId ?? null)
  const [nota, setNota] = useState(movimiento?.nota ?? '')
  const [intentado, setIntentado] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState(false)

  const nombre = SUSTANTIVO[tipo]
  const delTipo = datos.categorias.filter((c) => c.tipo === tipo)
  const deTrabajo = delTipo.filter((c) => c.ambito === 'TRABAJO')
  const personales = delTipo.filter((c) => c.ambito !== 'TRABAJO')

  // ---- Validación ----
  const ver = intentado > 0
  const errMonto = !ver ? null : montoInvalido ? ERROR_MONTO : !monto ? 'Ingresá un monto mayor a 0' : null
  const errFecha = ver && fecha === '' ? 'Elegí la fecha' : null
  const errCategoria = ver && categoriaId === null ? 'Elegí una categoría' : null
  const hayErrores = montoInvalido || !monto || fecha === '' || categoriaId === null

  // Al fallar el guardado, el foco va al primer campo inválido.
  useEffect(() => {
    if (intentado > 0)
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalido="true"]')?.focus()
  }, [intentado])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (guardandoRef.current) return
    setErrorGeneral(null)
    if (hayErrores) {
      setIntentado((n) => n + 1)
      return
    }
    guardandoRef.current = true
    setGuardando(true)
    try {
      idGuardado.current = await guardarMovimiento({
        id: movimiento?.id ?? idGuardado.current ?? undefined,
        tipo,
        fecha,
        monto: monto as Centavos,
        categoriaId: categoriaId as string,
        nota: nota.trim(),
      })
      volver()
    } catch (err) {
      setErrorGeneral(mensajeErrorDatos(err, 'No se pudo guardar. Probá de nuevo.'))
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!movimiento || guardandoRef.current) return
    guardandoRef.current = true
    setDialogo(false)
    setBorrando(true)
    try {
      await borrarMovimiento(movimiento.id)
      volver()
    } catch {
      setErrorGeneral('No se pudo borrar. Probá de nuevo.')
      guardandoRef.current = false
      setBorrando(false)
    }
  }

  // El error de categoría enfoca la primera chip que haya, de cualquier grupo.
  const primeraId = (tipo === 'GASTO' ? [...deTrabajo, ...personales] : delTipo)[0]?.id
  const chip = (c: Categoria) => (
    <Chip
      key={c.id}
      categoria={c}
      elegida={categoriaId === c.id}
      invalido={c.id === primeraId && !!errCategoria}
      onElegir={() => setCategoriaId(c.id)}
    />
  )

  return (
    <section>
      <Encabezado titulo={`${movimiento ? 'Editar' : 'Nuevo'} ${nombre}`} onCerrar={volver} />

      <form ref={formRef} className="form--con-barra" onSubmit={guardar} noValidate>
        <Card>
          <MoneyInput label="Monto" value={monto} onChange={setMonto} onInvalidChange={setMontoInvalido} error={errMonto} />

          <Field label="Fecha" error={errFecha}>
            {(control) => (
              <input {...control} className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            )}
          </Field>

          <div className="field">
            <p className="field__label" id="categoria-titulo">
              Categoría
            </p>
            {delTipo.length === 0 ? (
              <>
                <p className="muted">{`Todavía no tenés categorías de ${nombre}`}</p>
                <Link className="btn btn--secundario categorias__crear" to="/mas/categorias">
                  Crear categoría
                </Link>
              </>
            ) : tipo === 'GASTO' ? (
              <>
                {[
                  { titulo: 'De trabajo', lista: deTrabajo },
                  { titulo: 'Personales', lista: personales },
                ]
                  .filter((g) => g.lista.length > 0)
                  .map((g) => (
                    <fieldset key={g.titulo} className="grupo-chips">
                      <legend className="grupo-chips__titulo">{g.titulo}</legend>
                      <div className="chips">{g.lista.map(chip)}</div>
                    </fieldset>
                  ))}
              </>
            ) : (
              <div className="chips" role="group" aria-labelledby="categoria-titulo">
                {delTipo.map(chip)}
              </div>
            )}
            {errCategoria && (
              <p className="field__error" id="categoria-error" role="alert">
                {errCategoria}
              </p>
            )}
          </div>

          <Field label="Nota (opcional)">
            {(control) => (
              <input
                {...control}
                className="input"
                type="text"
                autoComplete="off"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            )}
          </Field>
        </Card>

        {errorGeneral && (
          <p className="field__error form__error" role="alert">
            {errorGeneral}
          </p>
        )}

        <Button type="submit" block disabled={guardando || borrando} className="form__guardar form__guardar--fijo">
          Guardar
        </Button>

        {movimiento && (
          <div className="zona-lugar">
            <Button variante="peligro" block disabled={guardando || borrando} onClick={() => setDialogo(true)}>
              {`Borrar ${nombre}`}
            </Button>
          </div>
        )}
      </form>

      {dialogo && (
        <ConfirmDialog
          titulo={`¿Borrar este ${nombre}?`}
          texto="No se puede deshacer."
          confirmar="Borrar"
          peligro
          onConfirm={borrar}
          onCancel={() => setDialogo(false)}
        />
      )}
    </section>
  )
}

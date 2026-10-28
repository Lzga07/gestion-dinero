import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type FormEvent } from 'react'
import { borrarCategoria, guardarCategoria } from '../../../data/categorias'
import { db } from '../../../data/db'
import type { Ambito, Categoria, TipoMovimiento } from '../../../domain/types'
import Button from '../../components/Button'
import Card from '../../components/Card'
import ConfirmDialog from '../../components/ConfirmDialog'
import Encabezado from '../../components/Encabezado'
import Field from '../../components/Field'
import Segmented from '../../components/Segmented'
import { mensajeErrorDatos } from '../../mensajes-datos'
import { plural } from '../periodo/utils'
import { PALETA } from './paleta'

const ICONO_POR_DEFECTO = '🏷️'

type Dialogo =
  | { tipo: 'borrar' }
  | { tipo: 'mover'; cantidad: number }
  | { tipo: 'sin-destino'; cantidad: number }

interface Props {
  /** La categoría que se edita; null para crear una. */
  categoria: Categoria | null
  /** Todas las categorías (para elegir destino al borrar y para el orden de la nueva). */
  categorias: Categoria[]
  onListo: () => void
  onCerrar: () => void
}

/** Alta y edición de una categoría, con el borrado (que pide un destino si tiene movimientos). */
export default function FormCategoria({ categoria, categorias, onListo, onCerrar }: Props) {
  const ocupadoRef = useRef(false)
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoMovimiento>(categoria?.tipo ?? 'GASTO')
  const [ambito, setAmbito] = useState<Ambito>(categoria?.ambito ?? 'PERSONAL')
  const [icono, setIcono] = useState(categoria?.icono ?? '')
  const [color, setColor] = useState(categoria?.color || PALETA[0].valor)
  const [intentado, setIntentado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [destino, setDestino] = useState('')

  // Con movimientos, el tipo queda fijo: pasar un gasto a ingreso dejaría movimientos incoherentes.
  const usados = useLiveQuery(
    async () => (categoria ? db.movimientos.where('categoriaId').equals(categoria.id).count() : 0),
    [categoria?.id],
  )
  const tipoFijo = (usados ?? 0) > 0
  const candidatas = categorias.filter((c) => c.tipo === categoria?.tipo && c.id !== categoria?.id)

  // El color actual puede no ser de la paleta (las categorías iniciales traen el suyo): se conserva como opción.
  const colores = PALETA.some((c) => c.valor === color) ? PALETA : [{ valor: color, nombre: 'Actual' }, ...PALETA]
  const errNombre = intentado && nombre.trim() === '' ? 'Escribí un nombre' : null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (ocupadoRef.current) return
    setError(null)
    if (nombre.trim() === '') {
      setIntentado(true)
      return
    }
    ocupadoRef.current = true
    setOcupado(true)
    try {
      await guardarCategoria({
        id: categoria?.id,
        nombre: nombre.trim(),
        tipo,
        ambito: tipo === 'GASTO' ? ambito : null,
        icono: icono.trim() || ICONO_POR_DEFECTO,
        color,
        orden: categoria?.orden ?? Math.max(-1, ...categorias.map((c) => c.orden)) + 1,
      })
      onListo()
    } catch (err) {
      setError(mensajeErrorDatos(err, 'No se pudo guardar. Probá de nuevo.'))
      ocupadoRef.current = false
      setOcupado(false)
    }
  }

  async function pedirBorrar() {
    if (!categoria || ocupadoRef.current) return
    const cantidad = await db.movimientos.where('categoriaId').equals(categoria.id).count()
    if (cantidad === 0) setDialogo({ tipo: 'borrar' })
    else if (candidatas.length === 0) setDialogo({ tipo: 'sin-destino', cantidad })
    else {
      setDestino(candidatas[0].id)
      setDialogo({ tipo: 'mover', cantidad })
    }
  }

  async function borrar(moverA: string | null) {
    if (!categoria || ocupadoRef.current) return
    ocupadoRef.current = true
    setOcupado(true)
    setDialogo(null)
    try {
      await borrarCategoria(categoria.id, moverA)
      onListo()
    } catch (err) {
      setError(mensajeErrorDatos(err, 'No se pudo borrar. Probá de nuevo.'))
      ocupadoRef.current = false
      setOcupado(false)
    }
  }

  return (
    <section>
      <Encabezado titulo={categoria ? 'Editar categoría' : 'Nueva categoría'} onCerrar={onCerrar} />

      <form onSubmit={guardar} noValidate>
        <Card>
          <Field label="Nombre" error={errNombre}>
            {(control) => (
              <input
                {...control}
                className="input"
                type="text"
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            )}
          </Field>

          <Segmented
            legend="Tipo"
            options={[
              { value: 'GASTO', label: 'Gasto' },
              { value: 'INGRESO', label: 'Ingreso' },
            ]}
            value={tipo}
            onChange={setTipo}
            disabled={tipoFijo}
          />
          {tipoFijo && (
            <p className="field__hint field__hint--aviso">El tipo no se puede cambiar porque tiene movimientos.</p>
          )}

          {tipo === 'GASTO' && (
            <Segmented
              legend="¿De qué es el gasto?"
              options={[
                { value: 'TRABAJO', label: 'De trabajo' },
                { value: 'PERSONAL', label: 'Personal' },
              ]}
              value={ambito}
              onChange={setAmbito}
            />
          )}

          <Field label="Ícono" hint="Un emoji o una letra">
            {(control) => (
              <input
                {...control}
                className="input input--short"
                type="text"
                autoComplete="off"
                maxLength={8}
                placeholder={ICONO_POR_DEFECTO}
                value={icono}
                onChange={(e) => setIcono(e.target.value)}
              />
            )}
          </Field>

          <fieldset className="field">
            <legend className="field__label">Color</legend>
            <div className="chips">
              {colores.map((c) => (
                <label key={c.valor} className="muestra">
                  <input
                    className="muestra__input"
                    type="radio"
                    name="color"
                    aria-label={c.nombre}
                    checked={color === c.valor}
                    onChange={() => setColor(c.valor)}
                  />
                  <span className="muestra__color" style={{ background: c.valor }} />
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        {error && (
          <p className="field__error form__error" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" block disabled={ocupado} className="form__guardar form__guardar--fijo">
          Guardar
        </Button>

        {categoria && (
          <div className="zona-lugar">
            <Button variante="peligro" block disabled={ocupado} onClick={pedirBorrar}>
              Borrar categoría
            </Button>
          </div>
        )}
      </form>

      {dialogo?.tipo === 'borrar' && (
        <ConfirmDialog
          titulo={`¿Borrar la categoría ${categoria?.nombre}?`}
          texto="No se puede deshacer."
          confirmar="Borrar"
          peligro
          onConfirm={() => borrar(null)}
          onCancel={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'mover' && (
        <ConfirmDialog
          titulo="¿A qué categoría pasamos sus movimientos?"
          texto={`Tiene ${plural(dialogo.cantidad, 'movimiento', 'movimientos')}. Se pasan a la categoría que elijas y después se borra ${categoria?.nombre}.`}
          confirmar="Pasar y borrar"
          peligro
          onConfirm={() => borrar(destino)}
          onCancel={() => setDialogo(null)}
        >
          <div className="dialog__campos">
            <Field label="Pasar a">
              {(control) => (
                <select {...control} className="input" value={destino} onChange={(e) => setDestino(e.target.value)}>
                  {candidatas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </ConfirmDialog>
      )}
      {dialogo?.tipo === 'sin-destino' && (
        <ConfirmDialog
          titulo="No se puede borrar todavía"
          texto={`Tiene ${plural(dialogo.cantidad, 'movimiento', 'movimientos')} y no hay otra categoría de ${categoria?.tipo === 'GASTO' ? 'gasto' : 'ingreso'} a la que pasarlos. Creá otra categoría de ${categoria?.tipo === 'GASTO' ? 'gasto' : 'ingreso'} y volvé a intentar.`}
          confirmar="Entendido"
          cancelar={null}
          onConfirm={() => setDialogo(null)}
          onCancel={() => setDialogo(null)}
        />
      )}
    </section>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../data/db'
import type { Categoria } from '../../domain/types'
import Button from '../components/Button'
import Card from '../components/Card'
import Encabezado from '../components/Encabezado'
import useVolver from '../components/useVolver'
import FormCategoria from './categorias/FormCategoria'

const GRUPOS: { titulo: string; es: (c: Categoria) => boolean }[] = [
  { titulo: 'Gastos de trabajo', es: (c) => c.tipo === 'GASTO' && c.ambito === 'TRABAJO' },
  { titulo: 'Gastos personales', es: (c) => c.tipo === 'GASTO' && c.ambito !== 'TRABAJO' },
  { titulo: 'Ingresos', es: (c) => c.tipo === 'INGRESO' },
]

/** Categorías (`/mas/categorias`): ver, crear, editar y borrar. */
export default function Categorias() {
  const volver = useVolver('/mas')
  const categorias = useLiveQuery(async () => (await db.categorias.toArray()).sort((a, b) => a.orden - b.orden), [])
  /** `undefined` = mirando la lista; `null` = creando una nueva; una categoría = editándola. */
  const [editando, setEditando] = useState<Categoria | null | undefined>(undefined)

  if (categorias === undefined) return null // cargando
  if (editando !== undefined) {
    return (
      <FormCategoria
        key={editando?.id ?? 'nueva'}
        categoria={editando}
        categorias={categorias}
        onListo={() => setEditando(undefined)}
        onCerrar={() => setEditando(undefined)}
      />
    )
  }

  return (
    <section>
      <Encabezado titulo="Categorías" onCerrar={volver} />

      {categorias.length === 0 && (
        <Card>
          <p className="muted">Todavía no tenés categorías. Creá la primera para poder cargar gastos e ingresos.</p>
        </Card>
      )}
      {GRUPOS.map((g) => {
        const lista = categorias.filter(g.es)
        if (lista.length === 0) return null
        return (
          <section key={g.titulo} aria-label={g.titulo}>
            <h2 className="section-title">{g.titulo}</h2>
            <Card flush as="ul" className="lista">
              {lista.map((c) => (
                <li key={c.id}>
                  <button type="button" className="mov-fila" onClick={() => setEditando(c)}>
                    <span
                      className="mov-fila__icono"
                      aria-hidden="true"
                      style={c.color ? { background: `color-mix(in srgb, ${c.color} 16%, var(--card))` } : undefined}
                    >
                      {c.icono}
                    </span>
                    <span className="mov-fila__texto">
                      <span className="mov-fila__titulo">{c.nombre}</span>
                    </span>
                    <span className="mov-fila__flecha" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </Card>
          </section>
        )
      })}

      <Button block className="lugares__agregar" onClick={() => setEditando(null)}>
        Nueva categoría
      </Button>
    </section>
  )
}

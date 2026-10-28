import { useEffect, useId, useRef, type CSSProperties } from 'react'
import type { Centavos } from '../../domain/money'
import { pesosJuntos } from '../pesos'

export interface SegmentoBarra {
  clave: string
  nombre: string
  /** Valor CSS del color, p. ej. `var(--lugar-1)`. */
  color: string
  monto: Centavos
}

export interface Barra {
  clave: string
  /** Texto corto bajo la barra ("Oct"). */
  etiqueta: string
  /** Nombre completo para lectores de pantalla ("octubre 2026"). */
  nombre: string
  total: Centavos
  segmentos: SegmentoBarra[]
}

interface Props {
  /** Nombre del gráfico (lo leen los lectores de pantalla). */
  nombre: string
  barras: Barra[]
  seleccionada: string
  onSeleccionar: (clave: string) => void
  /** Texto alternativo con los totales; los lectores de pantalla lo leen como descripción. */
  resumen: string
  /** Nombre de la lista de colores. */
  nombreLeyenda: string
  leyenda: { clave: string; nombre: string; color: string }[]
}

const colorDe = (color: string) => ({ '--color-lugar': color }) as CSSProperties

/** Barras verticales apiladas, una por período; cada barra es un botón que la selecciona. */
export default function BarrasApiladas({
  nombre,
  barras,
  seleccionada,
  onSeleccionar,
  resumen,
  nombreLeyenda,
  leyenda,
}: Props) {
  const idResumen = useId()
  const columnas = useRef<HTMLDivElement>(null)
  // Cuando las columnas no entran (12 meses en un celular) se desplaza hasta el final: lo más reciente queda a la vista.
  useEffect(() => {
    const el = columnas.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [barras.length])
  const maximo = Math.max(...barras.map((b) => b.total), 0)
  return (
    <div>
      <div className="barras">
        {maximo > 0 && (
          <div className="barras__tope" aria-hidden="true">
            {pesosJuntos(maximo)}
          </div>
        )}
        <div ref={columnas} className="barras__columnas" role="group" aria-label={nombre} aria-describedby={idResumen}>
          {barras.map((b) => (
            <button
              key={b.clave}
              type="button"
              className="barras__col"
              aria-pressed={b.clave === seleccionada}
              aria-label={`${b.nombre}: ${pesosJuntos(b.total)}`}
              onClick={() => onSeleccionar(b.clave)}
            >
              <span className="barras__area">
                {b.total > 0 && (
                  <span className="barras__pila" style={{ height: `${(b.total / maximo) * 100}%` }}>
                    {b.segmentos.map((s) => (
                      <span
                        key={s.clave}
                        className="barras__segmento"
                        data-lugar={s.nombre}
                        style={{ ...colorDe(s.color), flex: `${s.monto} 1 0` }}
                      />
                    ))}
                  </span>
                )}
              </span>
              <span className="barras__mes" aria-hidden="true">
                {b.etiqueta}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p id={idResumen} className="sr-only">
        {resumen}
      </p>
      {leyenda.length > 0 && (
        <ul className="leyenda" aria-label={nombreLeyenda}>
          {leyenda.map((l) => (
            <li key={l.clave}>
              <span className="leyenda__muestra" data-lugar={l.nombre} style={colorDe(l.color)} aria-hidden="true" />
              {l.nombre}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

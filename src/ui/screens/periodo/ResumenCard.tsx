import { formatPesos } from '../../../domain/money'
import type { ResumenPeriodo } from '../../../domain/conciliacion'
import { plural, sumaMontos } from './utils'

/** Te corresponde / Cobrado / Falta cobrar (o A favor) del período, y lo que sigue sin pagar. */
export default function ResumenCard({ resumen: r }: { resumen: ResumenPeriodo }) {
  const sinPagar = sumaMontos(r.noPagados)
  return (
    <section className="card resumen" aria-label="Resumen del período">
      <dl className="resumen__lista">
        <div className="resumen__fila resumen__fila--principal">
          <dt>Te corresponde</dt>
          <dd>{formatPesos(r.teCorresponde)}</dd>
        </div>
        <div className="resumen__fila">
          <dt>Cobrado</dt>
          <dd className={r.cobrado > 0 ? 'texto-ok' : undefined}>{formatPesos(r.cobrado)}</dd>
        </div>
        {r.aFavor > 0 ? (
          <div className="resumen__fila">
            <dt>A favor</dt>
            <dd className="texto-ok">{formatPesos(r.aFavor)}</dd>
          </div>
        ) : (
          <div className="resumen__fila">
            <dt>Falta cobrar</dt>
            <dd className={r.faltaCobrar > 0 ? 'texto-neg' : undefined}>{formatPesos(r.faltaCobrar)}</dd>
          </div>
        )}
        {r.noPagados.length > 0 && (
          <div className="resumen__fila">
            <dt>Sin pagar</dt>
            <dd className="texto-neg">{`${plural(r.noPagados.length, 'trabajo', 'trabajos')}, ${formatPesos(sinPagar)}`}</dd>
          </div>
        )}
      </dl>
      {r.cobrado < 0 && <p className="resumen__aclaracion">Parte de un pago se aplicó a trabajos de otros meses.</p>}
    </section>
  )
}

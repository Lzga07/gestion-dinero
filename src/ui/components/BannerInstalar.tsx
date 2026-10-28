import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { esStandalone, plataforma } from '../../platform/instalacion'

/**
 * Aviso fijo arriba de todo mientras la app se use en una pestaña del navegador del celular. No se puede
 * cerrar: en iPhone los datos de la pestaña y los del ícono son distintos, y usar la equivocada se siente
 * como perder todo. En una computadora o ya instalada no aparece.
 */
export default function BannerInstalar() {
  const { pathname } = useLocation()
  const [donde] = useState(() => (esStandalone() ? 'otro' : plataforma()))
  if (donde === 'otro' || pathname === '/mas/instalar') return null

  return (
    <aside className="banner-instalar" aria-label="Instalar la app">
      <p className="banner-instalar__texto">
        {donde === 'ios'
          ? 'Para usarla como app: tocá Compartir → Agregar a inicio. Importante: en iPhone, los datos que cargues acá en Safari no aparecen en la app instalada; usá siempre el ícono.'
          : 'Para usarla como app: Menú ⋮ → Instalar app.'}{' '}
        <Link className="banner-instalar__enlace" to="/mas/instalar">
          Ver cómo
        </Link>
      </p>
    </aside>
  )
}

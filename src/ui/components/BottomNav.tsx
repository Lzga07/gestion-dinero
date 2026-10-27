import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Inicio', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { to: '/movimientos', label: 'Movimientos', icon: 'M4 7h13m0 0-4-4m4 4-4 4M20 17H7m0 0 4-4m-4 4 4 4' },
  { to: '/lugares', label: 'Lugares', icon: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zm0-8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  { to: '/estadisticas', label: 'Estadísticas', icon: 'M5 21V11m7 10V4m7 17v-7' },
  { to: '/mas', label: 'Más', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className="bottom-nav__link">
          <svg
            className="bottom-nav__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={t.icon} />
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

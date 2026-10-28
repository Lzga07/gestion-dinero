import { useLocation, useNavigate } from 'react-router-dom'

/** Vuelve a la pantalla anterior; si se abrió directo esta pantalla, va a `inicio`. */
export default function useVolver(inicio = '/') {
  const navigate = useNavigate()
  const { key } = useLocation()
  return () => (key === 'default' ? navigate(inicio) : navigate(-1))
}

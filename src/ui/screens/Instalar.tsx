import { esStandalone, plataforma } from '../../platform/instalacion'
import Card from '../components/Card'
import Encabezado from '../components/Encabezado'
import useVolver from '../components/useVolver'

const IPHONE = [
  'Abrí la app en Safari (en iPhone solo se puede instalar desde Safari).',
  'Tocá el botón Compartir, el cuadrado con una flecha hacia arriba, abajo en la pantalla.',
  'Deslizá el menú y tocá "Agregar a inicio".',
  'Tocá "Agregar". Va a aparecer el ícono en tu pantalla de inicio.',
  'Abrí la app siempre desde ese ícono.',
]

const ANDROID = [
  'Abrí la app en Chrome.',
  'Tocá el menú ⋮, arriba a la derecha.',
  'Tocá "Instalar app" (o "Agregar a la pantalla principal").',
  'Confirmá con "Instalar". Va a aparecer el ícono en tu pantalla de inicio.',
  'Abrí la app siempre desde ese ícono.',
]

function Pasos({ titulo, pasos }: { titulo: string; pasos: string[] }) {
  return (
    <Card as="section" aria-label={titulo}>
      <h2 className="copia__titulo">{titulo}</h2>
      <ol className="pasos">
        {pasos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
    </Card>
  )
}

/** Cómo instalar la app (`/mas/instalar`). Primero va la guía del celular que se está usando. */
export default function Instalar() {
  const volver = useVolver('/mas')
  const instalada = esStandalone()
  const guias = [
    <Pasos key="ios" titulo="En iPhone (Safari)" pasos={IPHONE} />,
    <Pasos key="android" titulo="En Android (Chrome)" pasos={ANDROID} />,
  ]
  if (plataforma() === 'android') guias.reverse()

  return (
    <section className="copia">
      <Encabezado titulo="Cómo instalar la app" onCerrar={volver} />

      {instalada && (
        <Card>
          <p className="copia__texto">Ya estás usando la app instalada. Está todo en orden.</p>
        </Card>
      )}

      <Card as="section" aria-label="Importante en iPhone">
        <h2 className="copia__titulo">Importante en iPhone</h2>
        <p className="copia__texto">
          Los datos que cargues en Safari no aparecen en la app instalada, y al revés: son dos lugares distintos. Usá
          siempre el ícono de la pantalla de inicio.
        </p>
        <p className="copia__texto">
          Si ya cargaste datos en Safari, hacé una copia de seguridad ahí, instalá la app y restaurá la copia desde
          el ícono (Más → Copia de seguridad).
        </p>
      </Card>

      {guias}
    </section>
  )
}

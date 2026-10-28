import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { guardarAjuste, leerAjuste } from '../../../data/ajustes'
import { esStandalone, plataforma } from '../../../platform/instalacion'
import ConfirmDialog from '../../components/ConfirmDialog'

/**
 * Primer uso: ofrece crear un PIN, una sola vez. En una pestaña de Safari de iPhone no se ofrece: los datos de
 * la pestaña y los del ícono instalado son distintos, así que se ofrece en la app instalada.
 */
export default function OfertaPin() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (plataforma() === 'ios' && !esStandalone()) return
    let cancelado = false
    Promise.all([leerAjuste<string | null>('pinHash', null), leerAjuste('pinOfrecido', false)]).then(
      ([hash, ofrecido]) => {
        if (!cancelado && hash === null && !ofrecido) setVisible(true)
      },
      (e: unknown) => console.error('No se pudo ver si corresponde ofrecer el PIN', e),
    )
    return () => {
      cancelado = true
    }
  }, [])

  /** Cierra la oferta y anota que ya se hizo, elija lo que elija. */
  async function cerrar(): Promise<void> {
    setVisible(false)
    try {
      await guardarAjuste('pinOfrecido', true)
    } catch (e) {
      console.error('No se pudo anotar que ya se ofreció el PIN', e)
    }
  }

  if (!visible) return null
  return (
    <ConfirmDialog
      titulo="¿Querés poner un PIN para abrir la app?"
      texto="El PIN evita que otra persona vea tus datos si agarra tu celular. No cifra la información. Podés cambiarlo o quitarlo cuando quieras desde Más."
      confirmar="Crear PIN"
      cancelar="Ahora no"
      onConfirm={() => void cerrar().then(() => navigate('/mas/pin'))}
      onCancel={() => void cerrar()}
    />
  )
}

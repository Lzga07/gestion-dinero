import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { pedirPersistencia } from '../platform/persistencia'
import AvisoVersionNueva from './components/AvisoVersionNueva'
import BannerInstalar from './components/BannerInstalar'
import BottomNav from './components/BottomNav'
import Cargando from './components/Cargando'
import Categorias from './screens/Categorias'
import { useBloqueo } from './hooks/useBloqueo'
import Bloqueo from './screens/Bloqueo'
import ConfigPin from './screens/ConfigPin'
import ErrorApertura from './screens/bloqueo/ErrorApertura'
import OfertaPin from './screens/bloqueo/OfertaPin'
import Tapa from './screens/bloqueo/Tapa'
import Copia from './screens/Copia'
import ConfigLugar from './screens/ConfigLugar'
import Estadisticas from './screens/Estadisticas'
import FormMovimiento from './screens/FormMovimiento'
import FormTrabajo from './screens/FormTrabajo'
import Inicio from './screens/Inicio'
import Instalar from './screens/Instalar'
import Lugares from './screens/Lugares'
import Mas from './screens/Mas'
import MeDeben from './screens/MeDeben'
import MesesAnteriores from './screens/MesesAnteriores'
import Movimientos from './screens/Movimientos'
import PeriodoLugar from './screens/PeriodoLugar'
import RegistrarPago from './screens/RegistrarPago'

export default function App() {
  // Una vez al iniciar: le pide al navegador que no borre los datos si falta espacio.
  useEffect(() => {
    pedirPersistencia().catch((e: unknown) => console.warn('No se pudo pedir almacenamiento persistente', e))
  }, [])

  const bloqueo = useBloqueo()
  // Al volver a bloquear, la app queda montada (un formulario a medio llenar no se pierde) pero tapada e inerte.
  const tapada = bloqueo.fase !== 'abierta'

  return (
    <>
      {bloqueo.appMontada && (
        <div inert={tapada} aria-hidden={tapada || undefined}>
          <HashRouter>
            <div className="app-shell">
              <AvisoVersionNueva />
              <BannerInstalar />
              <main className="app-content">
                <Routes>
                  <Route path="/" element={<Inicio />} />
                  <Route path="/movimientos" element={<Movimientos />} />
                  <Route path="/movimiento/nuevo" element={<FormMovimiento />} />
                  <Route path="/movimiento/:id" element={<FormMovimiento />} />
                  <Route path="/lugares" element={<Lugares />} />
                  <Route path="/lugares/nuevo" element={<ConfigLugar />} />
                  <Route path="/lugares/:id" element={<PeriodoLugar />} />
                  <Route path="/lugares/:id/config" element={<ConfigLugar />} />
                  <Route path="/lugares/:id/pago" element={<RegistrarPago />} />
                  <Route path="/lugares/:id/anteriores" element={<MesesAnteriores />} />
                  <Route path="/trabajo/nuevo" element={<FormTrabajo />} />
                  <Route path="/trabajo/:id" element={<FormTrabajo />} />
                  <Route path="/estadisticas" element={<Estadisticas />} />
                  <Route path="/mas" element={<Mas />} />
                  <Route path="/mas/categorias" element={<Categorias />} />
                  <Route path="/mas/copia" element={<Copia />} />
                  <Route path="/mas/me-deben" element={<MeDeben />} />
                  <Route path="/mas/instalar" element={<Instalar />} />
                  <Route path="/mas/pin" element={<ConfigPin />} />
                </Routes>
              </main>
              <BottomNav />
            </div>
            <OfertaPin />
          </HashRouter>
        </div>
      )}
      {/* Mientras se lee si hay PIN no se dibuja nada de la app; si la base no contesta, se avisa. */}
      {bloqueo.fase === 'cargando' && <Cargando />}
      {bloqueo.fase === 'comprobando' && <Tapa />}
      {bloqueo.fase === 'bloqueada' && <Bloqueo onDesbloquear={bloqueo.desbloquear} />}
      {bloqueo.fase === 'error' && <ErrorApertura onReintentar={bloqueo.reintentar} />}
    </>
  )
}

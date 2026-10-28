import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { pedirPersistencia } from '../platform/persistencia'
import BannerInstalar from './components/BannerInstalar'
import BottomNav from './components/BottomNav'
import Categorias from './screens/Categorias'
import Copia from './screens/Copia'
import ConfigLugar from './screens/ConfigLugar'
import Estadisticas from './screens/Estadisticas'
import FormMovimiento from './screens/FormMovimiento'
import FormTrabajo from './screens/FormTrabajo'
import Inicio from './screens/Inicio'
import Instalar from './screens/Instalar'
import Lugares from './screens/Lugares'
import Mas from './screens/Mas'
import Movimientos from './screens/Movimientos'
import PeriodoLugar from './screens/PeriodoLugar'
import RegistrarPago from './screens/RegistrarPago'

export default function App() {
  // Una vez al iniciar: le pide al navegador que no borre los datos si falta espacio.
  useEffect(() => {
    pedirPersistencia().catch((e: unknown) => console.warn('No se pudo pedir almacenamiento persistente', e))
  }, [])

  return (
    <HashRouter>
      <div className="app-shell">
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
            <Route path="/trabajo/nuevo" element={<FormTrabajo />} />
            <Route path="/trabajo/:id" element={<FormTrabajo />} />
            <Route path="/estadisticas" element={<Estadisticas />} />
            <Route path="/mas" element={<Mas />} />
            <Route path="/mas/categorias" element={<Categorias />} />
            <Route path="/mas/copia" element={<Copia />} />
            <Route path="/mas/instalar" element={<Instalar />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

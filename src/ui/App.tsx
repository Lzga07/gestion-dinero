import { HashRouter, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import ConfigLugar from './screens/ConfigLugar'
import Estadisticas from './screens/Estadisticas'
import FormTrabajo from './screens/FormTrabajo'
import Inicio from './screens/Inicio'
import Lugares from './screens/Lugares'
import Mas from './screens/Mas'
import Movimientos from './screens/Movimientos'
import PeriodoLugar from './screens/PeriodoLugar'
import RegistrarPago from './screens/RegistrarPago'

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/lugares" element={<Lugares />} />
            <Route path="/lugares/nuevo" element={<ConfigLugar />} />
            <Route path="/lugares/:id" element={<PeriodoLugar />} />
            <Route path="/lugares/:id/config" element={<ConfigLugar />} />
            <Route path="/lugares/:id/pago" element={<RegistrarPago />} />
            <Route path="/trabajo/nuevo" element={<FormTrabajo />} />
            <Route path="/trabajo/:id" element={<FormTrabajo />} />
            <Route path="/estadisticas" element={<Estadisticas />} />
            <Route path="/mas" element={<Mas />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

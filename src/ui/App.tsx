import { HashRouter, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Estadisticas from './screens/Estadisticas'
import Inicio from './screens/Inicio'
import Lugares from './screens/Lugares'
import Mas from './screens/Mas'
import Movimientos from './screens/Movimientos'

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/lugares" element={<Lugares />} />
            <Route path="/estadisticas" element={<Estadisticas />} />
            <Route path="/mas" element={<Mas />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

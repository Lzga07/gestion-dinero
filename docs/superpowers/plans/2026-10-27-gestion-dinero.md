# Gestión Dinero: plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Objetivo:** construir la app web instalable (PWA) "Gestión Dinero" descripta en el spec. Sirve para anotar trabajos por lugar, conciliar pagos, reclamar lo que falte y llevar gastos, ingresos y estadísticas, funcionando sin conexión en iPhone y Android.

**Arquitectura:** la lógica de dominio es TypeScript puro en `src/domain/` (sin React, sin navegador, 100 % testeada). La persistencia está en `src/data/` (Dexie/IndexedDB, operaciones multi-fila en transacciones). Todo lo que cambiaría con una app nativa (compartir archivos, persistencia, PIN, instalación) va en `src/platform/`. La interfaz React está en `src/ui/`, lee la base con `useLiveQuery` y calcula con funciones de `domain`.

**Stack:** Node 24, Vite, React 18, TypeScript (strict), react-router (HashRouter), Dexie + dexie-react-hooks, vite-plugin-pwa, jsPDF + jspdf-autotable, Vitest + @testing-library/react + fake-indexeddb, Playwright (webkit + chromium).

**Spec:** `docs/superpowers/specs/2026-10-27-gestion-dinero-design.md` (leer entero antes de empezar). Las maquetas aprobadas están en `docs/superpowers/mockups/`.

## Restricciones globales

- Costo cero: ninguna dependencia ni servicio pago. Ningún dato sale del dispositivo: la app no hace requests de red salvo cargar sus propios archivos.
- Soporte: Safari iOS 16.4+ y Chrome Android reciente, instalada en la pantalla de inicio y sin conexión.
- Montos en **centavos enteros** (`Centavos = number`, entero). Porcentajes en **puntos básicos** enteros (40 % = 4000; 37,5 % = 3750). Redondeo al centavo, mitad hacia arriba.
- Formato de pesos es-AR: `$ 1.234.567`; con centavos: `$ 1.234,50`. Los centavos se muestran solo si existen.
- Fechas de negocio como `FechaISO` (`'YYYY-MM-DD'`), en hora local del dispositivo y sin hora. Nunca `new Date('YYYY-MM-DD')` (eso se interpreta como UTC).
- Todo texto visible en español rioplatense ("vos"). Nada específico de odontología: se dice "lugar", "trabajo" y "lo que pagó el cliente".
- Dirección visual: fondo `#f6f4ef`, tarjetas blancas redondeadas, acento `#25685b` (ingresos y acciones), terracota `#9e4430` (gastos, deudas y diferencias), tipografía del sistema, contraste WCAG AA, ningún texto funcional por debajo de 12px.
- Base path de despliegue: `/gestion-dinero/` (GitHub Pages; el repo `Lzga07/gestion-dinero` es público).
- Los tests corren con `TZ=America/Argentina/Buenos_Aires` (lo fija el script `test` con `cross-env`).
- Mensajes de commit en español, terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de construir pantallas, cargar la skill `impeccable:impeccable` para el pulido visual. Antes de los gráficos, cargar la skill `dataviz`.

## Foco de revisión

1. **Montos tipeados en el teclado del iPhone** ("200.000", "1.234,50", "1234,5", "$ 200.000", con espacios, vacío o "abc"): se aceptan los válidos y los inválidos devuelven `null` sin romper nada. Test en la Tarea 2.
2. **Valores fuera de rango al anotar** (descuento mayor que lo que pagó el cliente, porcentaje 0 o mayor a 100, monto 0 o negativo): el formulario muestra el error y no guarda. Test en la Tarea 4.
3. **Copia de seguridad corrupta, a medias o de una versión más nueva:** la restauración la rechaza con un mensaje y no toca ni un dato existente. Tests en las Tareas 7 y 8.
4. **Trabajos con fecha muy vieja, anterior a un cambio de día de cierre o en un período ya pagado:** caen en el período correcto y disparan la pregunta de "trabajo olvidado". Tests en las Tareas 3 y 10.
5. **Abrir la app en una pestaña de Safari en lugar del ícono instalado:** la app lo detecta y muestra la guía de instalación (en iPhone los datos de la pestaña y del ícono son distintos). Test en la Tarea 16.

---

## Mapa de archivos

```
package.json, vite.config.ts, tsconfig.json, index.html, playwright.config.ts
.github/workflows/deploy.yml
public/icons/icon-192.png, icon-512.png, apple-touch-icon.png
src/main.tsx
src/domain/   types.ts money.ts dates.ts periodos.ts trabajos.ts conciliacion.ts
              avisos.ts totales.ts copia.ts calendario.ts  (+ *.test.ts al lado)
src/data/     db.ts seed.ts lugares.ts trabajos.ts pagos.ts movimientos.ts
              categorias.ts ajustes.ts copia.ts  (+ *.test.ts)
src/platform/ compartir.ts persistencia.ts pin.ts instalacion.ts  (+ *.test.ts)
src/pdf/      listado.ts
src/ui/       App.tsx theme.css  components/  screens/  (+ *.test.tsx)
e2e/          flujo.spec.ts
```

---

### Tarea 1: Esqueleto de la app

**Archivos:**
- Crear: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/theme.css`, `src/ui/components/BottomNav.tsx`, `src/ui/screens/*.tsx` (placeholders: Inicio, Movimientos, Lugares, Estadisticas, Mas), `public/icons/*`
- Test: `src/ui/App.test.tsx`, `src/test-setup.ts`

**Interfaces:**
- Produce: `<App />` con HashRouter y rutas `/`, `/movimientos`, `/lugares`, `/estadisticas`, `/mas`. Tokens CSS en `:root`: `--bg #f6f4ef`, `--card #fff`, `--accent #25685b`, `--neg #9e4430`, `--text #1f2a2a`, `--muted #565f5d`, `--line #e9e6df`, `--radius 16px`.
- Scripts: `dev`, `build` (`tsc -b && vite build`), `test` (`cross-env TZ=America/Argentina/Buenos_Aires vitest run`), `e2e` (`playwright test`).

- [ ] **Paso 1:** crear el proyecto con `npm create vite@latest . -- --template react-ts` e instalar: `dexie dexie-react-hooks react-router-dom jspdf jspdf-autotable` y, como dev, `vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom fake-indexeddb vite-plugin-pwa cross-env @playwright/test`. Vitest con `environment: 'jsdom'` y `setupFiles: ['src/test-setup.ts']` (importa `@testing-library/jest-dom` y `fake-indexeddb/auto`).
- [ ] **Paso 2: test que falla**

```tsx
test('muestra las 5 pestañas de navegación', () => {
  render(<App />);
  for (const t of ['Inicio', 'Movimientos', 'Lugares', 'Estadísticas', 'Más'])
    expect(screen.getByRole('link', { name: t })).toBeInTheDocument();
});
test('Inicio es la pantalla por defecto', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Paso 3:** `npm test -- src/ui/App.test.tsx` → FALLA.
- [ ] **Paso 4:** implementar el shell: `BottomNav` con `NavLink`, contenido con ancho máximo de 480px centrado, `theme.css` con los tokens y respetando `env(safe-area-inset-bottom)`. En `vite.config.ts`: `base: '/gestion-dinero/'` y `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Gestión Dinero', short_name: 'Gestión Dinero', lang: 'es-AR', display: 'standalone', background_color: '#f6f4ef', theme_color: '#25685b', start_url: '.', scope: '.', icons: [...] }, workbox: { globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] } })`. En `index.html`: `<html lang="es-AR">`, `apple-mobile-web-app-capable`, `apple-touch-icon` y `viewport-fit=cover`. Íconos simples (monograma "$" en verde sobre `#f6f4ef`).
- [ ] **Paso 5:** `npm test` → PASA; `npm run build` → sin errores y genera `dist/sw.js`.
- [ ] **Paso 6:** commit `chore: esqueleto de la PWA con navegación inferior`.

---

### Tarea 2: Montos y fechas

**Archivos:**
- Crear: `src/domain/money.ts`, `src/domain/dates.ts`
- Test: `src/domain/money.test.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Produce (`money.ts`): `type Centavos = number`; `formatPesos(c: Centavos): string`; `parsePesos(s: string): Centavos | null`; `parsePorcentaje(s: string): number | null` (devuelve puntos básicos); `formatPorcentaje(bp: number): string` ("40 %", "37,5 %"); `aplicarPorcentaje(base: Centavos, bp: number): Centavos`; `MAX_CENTAVOS = 100_000_000_000` (1.000 millones de pesos).
- Produce (`dates.ts`): `type FechaISO = string`; `hoy(now?: Date): FechaISO`; `parseFecha(f): {y, m, d}` (m de 1 a 12); `aFecha(y, m, d): FechaISO`; `diasEnMes(y, m): number`; `sumarDias(f, n): FechaISO`; `sumarMeses(y, m, n): {y, m}`; `diaAcotado(y, m, dia): FechaISO` (devuelve el último día si `dia` no existe en el mes); `mesClave(f): string` (`'YYYY-MM'`); `diasEntre(a, b): number`; `formatFechaCorta(f): string` ("27 oct").

- [ ] **Paso 1: tests que fallan**

```ts
test('formatPesos', () => {
  expect(formatPesos(123456700)).toBe('$ 1.234.567');
  expect(formatPesos(123450)).toBe('$ 1.234,50');
  expect(formatPesos(-4500000)).toBe('−$ 45.000');
  expect(formatPesos(0)).toBe('$ 0');
});
test.each([
  ['200.000', 20000000], ['1.234,50', 123450], ['1234,5', 123450], ['$ 200.000', 20000000],
  [' 38000 ', 3800000], ['0,01', 1], ['', null], ['abc', null], ['1,2,3', null], ['-5', null],
  ['2.000.000.000', null], // supera MAX_CENTAVOS
])('parsePesos(%s)', (s, esperado) => expect(parsePesos(s)).toBe(esperado));
test.each([['40', 4000], ['37,5', 3750], ['33,33', 3333], ['0', null], ['100', 10000], ['100,01', null], ['', null]])
  ('parsePorcentaje(%s)', (s, e) => expect(parsePorcentaje(s)).toBe(e));
test('aplicarPorcentaje redondea mitad hacia arriba', () => {
  expect(aplicarPorcentaje(15000000, 4000)).toBe(6000000);   // (200.000−50.000)×40 %
  expect(aplicarPorcentaje(1, 5000)).toBe(1);                // 0,5 centavo → 1
  expect(aplicarPorcentaje(333, 3333)).toBe(111);            // 110,9889 → 111
});
test('hoy usa la fecha local, no UTC', () => {
  expect(hoy(new Date('2026-10-28T02:30:00Z'))).toBe('2026-10-27'); // 23:30 en Buenos Aires
});
test('diaAcotado y diasEnMes', () => {
  expect(diaAcotado(2026, 11, 31)).toBe('2026-11-30');
  expect(diaAcotado(2028, 2, 31)).toBe('2028-02-29');
  expect(diaAcotado(2027, 2, 30)).toBe('2027-02-28');
  expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  expect(sumarMeses(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
});
```

- [ ] **Paso 2:** `npm test -- src/domain/money.test.ts src/domain/dates.test.ts` → FALLA.
- [ ] **Paso 3:** implementar. `parsePesos`: sacar `$` y espacios; el `.` es separador de miles (solo grupos de 3), la `,` es decimal (1 o 2 dígitos); rechazar negativos y valores > `MAX_CENTAVOS`. `aplicarPorcentaje`: `Math.floor((base * bp + 5000) / 10000)` (aritmética entera). `dates.ts` usa `Date` solo con constructores locales `new Date(y, m-1, d)`.
- [ ] **Paso 4:** los tests → PASAN.
- [ ] **Paso 5:** commit `feat(domain): montos en centavos y fechas locales`.

---

### Tarea 3: Períodos, día de cierre y rango de pago

**Archivos:**
- Crear: `src/domain/periodos.ts`
- Test: `src/domain/periodos.test.ts`

**Interfaces:**
- Consume: `dates.ts`.
- Produce:
```ts
export type DiaCierre = number | 'ULTIMO';                 // 1..31
export interface ReglaCierre { vigenteDesde: FechaISO; dia: DiaCierre }
export interface Periodo { inicio: FechaISO; fin: FechaISO } // fin identifica el período
export const INICIO_DE_LOS_TIEMPOS = '1900-01-01';
export function cierreEnMes(y: number, m: number, dia: DiaCierre): FechaISO;
export function siguienteCierre(desde: FechaISO, dia: DiaCierre): FechaISO;   // primer cierre >= desde
export function periodoQueContiene(reglas: ReglaCierre[], fecha: FechaISO): Periodo;
export function periodosEntre(reglas: ReglaCierre[], desde: FechaISO, hasta: FechaISO): Periodo[]; // más nuevo primero
export function cambiarDiaCierre(reglas: ReglaCierre[], nuevo: DiaCierre, hoy: FechaISO): ReglaCierre[];
export function ventanaPago(periodoFin: FechaISO, desdeDia: number, hastaDia: number): { desde: FechaISO; hasta: FechaISO };
export function nombrePeriodo(p: Periodo): string;          // "1 – 31 oct", "16 oct – 15 nov"
```

Algoritmo de `periodoQueContiene`: `r` es la última regla con `vigenteDesde <= fecha`, `fin = siguienteCierre(fecha, r.dia)` e `inicio = max(r.vigenteDesde, cierreAnterior(fin, r.dia) + 1 día)`. `cambiarDiaCierre` descarta las reglas con `vigenteDesde > hoy` y agrega `{ vigenteDesde: periodoQueContiene(reglas, hoy).fin + 1 día, dia: nuevo }`. Así el cambio rige desde el próximo período (spec §4.1).

- [ ] **Paso 1: tests que fallan**

```ts
const ult = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 'ULTIMO' as const }];
const d15 = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 15 }];
const d31 = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 31 }];
const d30 = [{ vigenteDesde: INICIO_DE_LOS_TIEMPOS, dia: 30 }];
test('último día = mes calendario', () =>
  expect(periodoQueContiene(ult, '2026-10-27')).toEqual({ inicio: '2026-10-01', fin: '2026-10-31' }));
test('cierre 15', () =>
  expect(periodoQueContiene(d15, '2026-10-20')).toEqual({ inicio: '2026-10-16', fin: '2026-11-15' }));
test('cierre 31 en febrero bisiesto', () => {
  expect(periodoQueContiene(d31, '2028-02-10')).toEqual({ inicio: '2028-02-01', fin: '2028-02-29' });
  expect(periodoQueContiene(d31, '2028-03-15')).toEqual({ inicio: '2028-03-01', fin: '2028-03-31' });
});
test('cierre 30 cruzando febrero no bisiesto', () => {
  expect(periodoQueContiene(d30, '2027-03-01')).toEqual({ inicio: '2027-03-01', fin: '2027-03-30' });
  expect(periodoQueContiene(d30, '2027-03-31')).toEqual({ inicio: '2027-03-31', fin: '2027-04-30' });
});
test('fecha muy vieja usa la regla vigente en ese momento', () => {
  const r = cambiarDiaCierre(ult, 15, '2026-10-20');
  expect(r.at(-1)).toEqual({ vigenteDesde: '2026-11-01', dia: 15 });
  expect(periodoQueContiene(r, '2024-03-10')).toEqual({ inicio: '2024-03-01', fin: '2024-03-31' });
  expect(periodoQueContiene(r, '2026-10-25')).toEqual({ inicio: '2026-10-01', fin: '2026-10-31' }); // el abierto no cambia
  expect(periodoQueContiene(r, '2026-11-05')).toEqual({ inicio: '2026-11-01', fin: '2026-11-15' }); // transición
  expect(periodoQueContiene(r, '2026-11-20')).toEqual({ inicio: '2026-11-16', fin: '2026-12-15' });
});
test('cambiar dos veces antes de que arranque reemplaza la regla futura', () => {
  const r = cambiarDiaCierre(cambiarDiaCierre(ult, 15, '2026-10-20'), 10, '2026-10-21');
  expect(r).toHaveLength(2);
  expect(r[1]).toEqual({ vigenteDesde: '2026-11-01', dia: 10 });
});
test('ventana de pago del mes siguiente, acotada', () => {
  expect(ventanaPago('2026-09-30', 21, 31)).toEqual({ desde: '2026-10-21', hasta: '2026-10-31' });
  expect(ventanaPago('2026-10-31', 21, 31)).toEqual({ desde: '2026-11-21', hasta: '2026-11-30' });
  expect(ventanaPago('2027-01-31', 29, 31)).toEqual({ desde: '2027-02-28', hasta: '2027-02-28' });
});
test('periodosEntre lista del más nuevo al más viejo', () =>
  expect(periodosEntre(ult, '2026-08-15', '2026-10-27').map(p => p.fin))
    .toEqual(['2026-10-31', '2026-09-30', '2026-08-31']));
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar según las firmas y el algoritmo de arriba.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(domain): períodos con historial de día de cierre y ventana de pago`.

---

### Tarea 4: Tipos de dominio y cálculo de un trabajo

**Archivos:**
- Crear: `src/domain/types.ts`, `src/domain/trabajos.ts`
- Test: `src/domain/trabajos.test.ts`

**Interfaces:**
- Produce (`types.ts`, la usan todas las tareas siguientes):
```ts
export type FormaCobro = 'ARANCEL_FIJO' | 'PORCENTAJE';
export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'NO_PAGADO';
export interface Lugar {
  id: string; nombre: string; formaCobro: FormaCobro;
  porcentajeBp: number | null;            // solo PORCENTAJE
  reglasCierre: ReglaCierre[];
  pagoDesdeDia: number; pagoHastaDia: number;
  archivado: boolean; creadoEn: string;   // ISO datetime
}
export interface TipoTrabajo { id: string; lugarId: string; nombre: string; precio: Centavos; orden: number }
export interface Trabajo {
  id: string; lugarId: string; fecha: FechaISO; descripcion: string;
  tipoTrabajoId: string | null; precioLista: Centavos | null;         // ARANCEL_FIJO
  montoCliente: Centavos | null; descuento: Centavos | null;          // PORCENTAJE
  descuentoMotivo: string | null; porcentajeBp: number | null;        // copia del % al anotar
  monto: Centavos;                                                    // "te corresponde"
  nota: string; estado: EstadoPago; pagoId: string | null;
  creadoEn: string; actualizadoEn: string;
}
export type TipoPago = 'A_CUENTA' | 'FINAL';
export interface Pago { id: string; lugarId: string; periodoFin: FechaISO; fecha: FechaISO; monto: Centavos; tipo: TipoPago; nota: string; creadoEn: string }
export type TipoMovimiento = 'GASTO' | 'INGRESO';
export type Ambito = 'TRABAJO' | 'PERSONAL';
export interface Categoria { id: string; nombre: string; tipo: TipoMovimiento; ambito: Ambito | null; icono: string; color: string; orden: number }
export interface Movimiento { id: string; tipo: TipoMovimiento; fecha: FechaISO; monto: Centavos; categoriaId: string; nota: string; creadoEn: string }
export interface Ajuste { clave: string; valor: unknown }
```
- Produce (`trabajos.ts`):
```ts
export type EntradaTrabajo =
  | { forma: 'ARANCEL_FIJO'; tipo: TipoTrabajo | null; otroNombre?: string; otroMonto?: Centavos | null }
  | { forma: 'PORCENTAJE'; descripcion: string; montoCliente: Centavos | null; descuento: Centavos | null; porcentajeBp: number };
export type ErrorTrabajo = 'FALTA_TIPO' | 'FALTA_DESCRIPCION' | 'MONTO_INVALIDO' | 'DESCUENTO_MAYOR' | 'PORCENTAJE_INVALIDO';
export function calcularTrabajo(e: EntradaTrabajo):
  { ok: true; monto: Centavos; descripcion: string; detalle: string } | { ok: false; error: ErrorTrabajo };
```
`detalle` es la cuenta visible, por ejemplo `"(200.000 − 50.000) × 40 %"`, o `""` en arancel fijo.

- [ ] **Paso 1: tests que fallan**

```ts
test('arancel fijo toma el precio de la lista', () =>
  expect(calcularTrabajo({ forma: 'ARANCEL_FIJO', tipo: { id: 't', lugarId: 'l', nombre: 'Arreglo', precio: 3800000, orden: 0 } }))
    .toMatchObject({ ok: true, monto: 3800000, descripcion: 'Arreglo' }));
test('arancel fijo "Otro…" usa nombre y monto a mano', () =>
  expect(calcularTrabajo({ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: 'Urgencia', otroMonto: 5000000 }))
    .toMatchObject({ ok: true, monto: 5000000, descripcion: 'Urgencia' }));
test('porcentaje con descuento: (200.000 − 50.000) × 40 % = 60.000', () =>
  expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: 'Corona', montoCliente: 20000000, descuento: 5000000, porcentajeBp: 4000 }))
    .toEqual({ ok: true, monto: 6000000, descripcion: 'Corona', detalle: '(200.000 − 50.000) × 40 %' }));
test('porcentaje sin descuento', () =>
  expect(calcularTrabajo({ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 10000000, descuento: null, porcentajeBp: 4000 }))
    .toMatchObject({ monto: 4000000, detalle: '100.000 × 40 %' }));
test.each([
  [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: 200, porcentajeBp: 4000 }, 'DESCUENTO_MAYOR'],
  [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 0, descuento: null, porcentajeBp: 4000 }, 'MONTO_INVALIDO'],
  [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: null, descuento: null, porcentajeBp: 4000 }, 'MONTO_INVALIDO'],
  [{ forma: 'PORCENTAJE', descripcion: '  ', montoCliente: 100, descuento: null, porcentajeBp: 4000 }, 'FALTA_DESCRIPCION'],
  [{ forma: 'PORCENTAJE', descripcion: 'X', montoCliente: 100, descuento: null, porcentajeBp: 0 }, 'PORCENTAJE_INVALIDO'],
  [{ forma: 'ARANCEL_FIJO', tipo: null }, 'FALTA_TIPO'],
  [{ forma: 'ARANCEL_FIJO', tipo: null, otroNombre: 'A', otroMonto: 0 }, 'MONTO_INVALIDO'],
])('rechaza entradas inválidas %#', (e, err) => expect(calcularTrabajo(e as EntradaTrabajo)).toEqual({ ok: false, error: err }));
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar `calcularTrabajo` con `aplicarPorcentaje` y `formatPesos`. En `detalle`, los montos van sin `$`.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(domain): tipos y cálculo de lo que corresponde por trabajo`.

---

### Tarea 5: Conciliación de pagos y resumen de período

**Archivos:**
- Crear: `src/domain/conciliacion.ts`
- Test: `src/domain/conciliacion.test.ts`

**Interfaces:**
- Consume: `types.ts`, `periodos.ts`.
- Produce:
```ts
export function requierePregunta(esperado: Centavos, recibido: Centavos, destildados: number): boolean; // recibido < esperado || destildados > 0
export interface CambioTrabajo { id: string; estado: EstadoPago; pagoId: string | null }
export function resolverPago(a: {
  pago: Pago; tildados: Trabajo[]; destildados: Trabajo[];   // destildados: solo los ofrecidos del período elegido
}): CambioTrabajo[];
export function cobradoPorPeriodo(lugar: Lugar, trabajos: Trabajo[], pagos: Pago[]): Map<FechaISO, Centavos>;
export interface ResumenPeriodo {
  periodo: Periodo; cantidad: number; teCorresponde: Centavos; cobrado: Centavos; faltaCobrar: Centavos;
  pendientes: Trabajo[]; noPagados: Trabajo[]; deudaPlata: Centavos; tienePagos: boolean; aFavor: Centavos;
}
export function resumenPeriodo(lugar: Lugar, periodo: Periodo, trabajos: Trabajo[], pagos: Pago[]): ResumenPeriodo;
export function trabajosOfrecidosParaPago(lugar: Lugar, periodoFin: FechaISO, trabajos: Trabajo[]):
  { delPeriodo: Trabajo[]; anteriores: { periodo: Periodo; trabajos: Trabajo[] }[] }; // anteriores: PENDIENTE o NO_PAGADO
```

Reglas (deciden lo que el spec deja abierto, §4.3 y §5.1):
- `resolverPago`: los tildados pasan a `PAGADO` con `pagoId = pago.id`. Los destildados pasan a `NO_PAGADO` si `pago.tipo === 'FINAL'` y siguen `PENDIENTE` si es `'A_CUENTA'`. Los trabajos de períodos anteriores que no se tildan no cambian.
- **Asignación de plata:** cada pago se reparte así: a cada trabajo tildado de **otro** período le toca su `monto`, y lo que sobra (aunque sea negativo) va a `pago.periodoFin`. `cobrado(P)` es la suma de lo asignado a P. Así, editar después un trabajo pagado no cambia lo cobrado.
- `faltaCobrar = teCorresponde − cobrado`. `aFavor = max(0, −faltaCobrar)`.
- `deudaPlata`: si el período tiene algún pago `FINAL`, es `max(0, faltaCobrar − Σ pendientes − Σ noPagados)`; si no, es 0.

- [ ] **Paso 1: tests que fallan.** Helper `t(id, fecha, monto, estado='PENDIENTE', pagoId=null)` y `lugarUlt` (cierre 'ULTIMO', paga del 21 al 31).

```ts
test('pago justo: todo PAGADO, nada falta', ...);   // 3 trabajos de sep = 495.000; FINAL por 495.000 → faltaCobrar 0, deudaPlata 0
test('lugar que paga un total menor, FINAL: la diferencia es deuda en plata', () => {
  // tildados los 3 (495.000), recibido 450.000, FINAL
  expect(r.cobrado).toBe(45000000); expect(r.faltaCobrar).toBe(4500000); expect(r.deudaPlata).toBe(4500000);
});
test('destildado con FINAL queda NO_PAGADO y no se cuenta dos veces como deuda', () => {
  // tildados 450.000 (2 trabajos), destildado Corona 45.000, recibido 450.000, FINAL
  expect(cambios.find(c => c.id === 'corona')!.estado).toBe('NO_PAGADO');
  expect(r.noPagados.map(x => x.id)).toEqual(['corona']); expect(r.deudaPlata).toBe(0); expect(r.faltaCobrar).toBe(4500000);
});
test('A_CUENTA deja destildados PENDIENTE y no genera deuda', () => {
  // recibido 200.000, tildados 210.000, destildados 285.000, A_CUENTA
  expect(r.pendientes).toHaveLength(2); expect(r.deudaPlata).toBe(0); expect(r.faltaCobrar).toBe(29500000);
});
test('A_CUENTA y después FINAL por el resto exacto: falta 10.000 y es deuda', () => {
  // 2º pago: recibido 285.000 por los 285.000 pendientes, FINAL
  expect(r.cobrado).toBe(48500000); expect(r.deudaPlata).toBe(1000000);
});
test('un pago que incluye un trabajo atrasado de agosto', () => {
  // pago de sep por 535.000: tilda los 495.000 de sep + 40.000 de ago (NO_PAGADO)
  expect(cobrado.get('2026-08-31')).toBe(4000000); expect(cobrado.get('2026-09-30')).toBe(49500000);
});
test('editar el monto de un trabajo ya pagado no cambia lo cobrado', ...);
test('recibido mayor que lo esperado: aFavor y sin deuda', ...);
test('requierePregunta', () => {
  expect(requierePregunta(495, 495, 0)).toBe(false);
  expect(requierePregunta(495, 450, 0)).toBe(true);
  expect(requierePregunta(450, 450, 1)).toBe(true);
  expect(requierePregunta(495, 500, 0)).toBe(false);
});
test('trabajosOfrecidosParaPago agrupa anteriores pendientes y no pagados', ...); // excluye PAGADO; el período elegido no aparece en anteriores
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar las funciones con las reglas de arriba.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(domain): conciliación de pagos con asignación de plata por período`.

---

### Tarea 6: Avisos, totales y estadísticas

**Archivos:**
- Crear: `src/domain/avisos.ts`, `src/domain/totales.ts`
- Test: `src/domain/avisos.test.ts`, `src/domain/totales.test.ts`

**Interfaces:**
- Consume: `conciliacion.ts`, `periodos.ts`.
- Produce (`avisos.ts`):
```ts
export type Aviso =
  | { tipo: 'PAGO_ATRASADO'; lugarId: string; periodo: Periodo; monto: Centavos }
  | { tipo: 'SIN_CONCILIAR'; lugarId: string; periodo: Periodo; trabajos: Trabajo[]; monto: Centavos }
  | { tipo: 'DEUDA'; lugarId: string; noPagados: Trabajo[]; deudasPlata: { periodo: Periodo; monto: Centavos }[]; monto: Centavos }
  | { tipo: 'COPIA'; diasSinCopia: number | null };   // null = nunca se hizo
export function calcularAvisos(a: {
  hoy: FechaISO; lugares: Lugar[]; trabajos: Trabajo[]; pagos: Pago[];
  ultimaCopia: string | null; recordatorioDias: number; hayDatos: boolean;
}): Aviso[];   // orden: PAGO_ATRASADO, DEUDA, SIN_CONCILIAR, COPIA
```
Reglas: `PAGO_ATRASADO` cuando `hoy > ventana.hasta`, el período no tiene pagos y tiene ≥1 `PENDIENTE`. `SIN_CONCILIAR` cuando `hoy > ventana.hasta`, el período tiene pagos y tiene ≥1 `PENDIENTE`. `DEUDA` es uno por lugar, con `NO_PAGADO` y `deudaPlata > 0` de todos sus períodos. Los lugares archivados también avisan (las deudas no desaparecen). `COPIA` aparece cuando `recordatorioDias > 0`, `hayDatos` y (nunca hubo copia o pasaron `>= recordatorioDias` días).
- Produce (`totales.ts`):
```ts
export function resumenMes(mes: string /*'YYYY-MM'*/, hasta: FechaISO, trabajos: Trabajo[], movimientos: Movimiento[]):
  { ganadoTrabajos: Centavos; otrosIngresos: Centavos; ganado: Centavos; gastos: Centavos; saldo: Centavos };
export function gananciaPorLugarPorMes(meses: string[], trabajos: Trabajo[]): Map<string, Map<string, Centavos>>; // mes → lugarId → monto
export function gastosPorCategoria(mes: string, movimientos: Movimiento[], categorias: Categoria[], ambito: Ambito | null):
  { categoria: Categoria; monto: Centavos }[];  // de mayor a menor, sin ceros
```

- [ ] **Paso 1: tests que fallan**

```ts
test('pago atrasado recién el día siguiente al fin de la ventana', () => {
  // lugar ULTIMO, paga 21–31; trabajo PENDIENTE del 2026-09-10, sin pagos
  expect(tipos(calcularAvisos({ ...base, hoy: '2026-10-31' }))).toEqual([]);
  expect(tipos(calcularAvisos({ ...base, hoy: '2026-11-01' }))).toEqual(['PAGO_ATRASADO']);
});
test('período sin trabajos no genera aviso', ...);
test('"No me pagaron" (todos NO_PAGADO) cambia atraso por DEUDA', ...);
test('trabajo olvidado PENDIENTE en período ya pagado → SIN_CONCILIAR', ...);
test('DEUDA suma NO_PAGADO y deuda en plata del mismo lugar en un solo aviso', ...);
test('lugar archivado con deuda sigue avisando', ...);
test('COPIA: nunca hecha con datos, a los 7 días, desactivada con 0, sin datos no avisa', ...);
test('resumenMes: ganado = trabajos + otros ingresos; saldo = ganado − gastos; solo hasta hoy', () => {
  expect(resumenMes('2026-10', '2026-10-27', trabajos, movs))
    .toEqual({ ganadoTrabajos: 112000000, otrosIngresos: 6000000, ganado: 118000000, gastos: 27750000, saldo: 90250000 });
});
test('gananciaPorLugarPorMes agrupa por mes calendario de la fecha', ...);
test('gastosPorCategoria ordena de mayor a menor y filtra por ámbito', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(domain): avisos de pago, resumen del mes y estadísticas`.

---

### Tarea 7: Formato de copia de seguridad y archivo de calendario

**Archivos:**
- Crear: `src/domain/copia.ts`, `src/domain/calendario.ts`
- Test: `src/domain/copia.test.ts`, `src/domain/calendario.test.ts`

**Interfaces:**
- Produce (`copia.ts`):
```ts
export const VERSION_COPIA = 1;
export interface Datos { lugares: Lugar[]; tiposTrabajo: TipoTrabajo[]; trabajos: Trabajo[]; pagos: Pago[];
  movimientos: Movimiento[]; categorias: Categoria[]; ajustes: Ajuste[] }
export interface Copia { app: 'gestion-dinero'; version: number; creadoEn: string; datos: Datos }
export function armarCopia(datos: Datos, ahora: Date): Copia;   // excluye de ajustes 'pinHash' y 'pinSalt'
export function nombreArchivoCopia(hoy: FechaISO): string;       // 'gestion-dinero-2026-10-27.json'
export function leerCopia(texto: string):
  { ok: true; copia: Copia; resumen: { creadoEn: string; lugares: number; trabajos: number; movimientos: number } }
  | { ok: false; error: string };  // mensaje en español, para mostrar
export const MIGRACIONES: Record<number, (c: any) => any>;      // vacío en v1; leerCopia aplica en orden hasta VERSION_COPIA
```
`leerCopia` valida todo: JSON parseable, `app`, que `version` sea ≤ `VERSION_COPIA` (si es más nueva: "Esta copia es de una versión más nueva de la app. Actualizá la app y volvé a intentar."), que existan todos los arrays, los campos requeridos con su tipo, montos enteros, fechas `YYYY-MM-DD`, ids únicos, y que las referencias existan (`trabajo.lugarId`, `trabajo.pagoId`, `movimiento.categoriaId`, `tipoTrabajo.lugarId`, `pago.lugarId`).
- Produce (`calendario.ts`): `armarIcsLugar(lugar: Lugar, hoy: FechaISO): string`. Es un VEVENT mensual a las 10:00 (hora flotante) con `SUMMARY:Revisar pago de <nombre>`, `RRULE:FREQ=MONTHLY;BYMONTHDAY=<hastaDia>` (o `BYMONTHDAY=-1` si `hastaDia >= 29`), `DTSTART` en la próxima ocurrencia `>= hoy` y un `VALARM` con `TRIGGER:PT0M`. Líneas separadas con CRLF; `UID` estable `pago-<lugarId>@gestion-dinero`.

- [ ] **Paso 1: tests que fallan**

```ts
test('ida y vuelta: armarCopia → JSON → leerCopia devuelve los mismos datos', ...);
test('la copia no incluye el PIN', ...);
test.each([
  ['no es JSON', '{', /no es una copia válida/i],
  ['otra app', JSON.stringify({ app: 'x' }), /no es una copia de Gestión Dinero/i],
  ['versión más nueva', copiaCon({ version: 99 }), /versión más nueva/i],
  ['monto con decimales', copiaCon(trabajoCon({ monto: 10.5 })), /monto/i],
  ['referencia rota', copiaCon(trabajoCon({ lugarId: 'no-existe' })), /lugar/i],
  ['array faltante', copiaSin('pagos'), /pagos/i],
])('rechaza %s', (_, texto, msg) => { const r = leerCopia(texto); expect(r.ok).toBe(false); expect((r as any).error).toMatch(msg); });
test('nombreArchivoCopia', () => expect(nombreArchivoCopia('2026-10-27')).toBe('gestion-dinero-2026-10-27.json'));
test('ICS mensual del día 31 usa el último día del mes', () => {
  const ics = armarIcsLugar({ ...lugar, nombre: 'Clínica Centro', pagoHastaDia: 31 }, '2026-10-27');
  expect(ics).toContain('SUMMARY:Revisar pago de Clínica Centro');
  expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=-1');
  expect(ics).toContain('DTSTART:20261031T100000');
  expect(ics).toContain('BEGIN:VALARM');
  expect(ics.split('\r\n').length).toBeGreaterThan(5);
});
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar (escapar `,` `;` `\` en el texto ICS).
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(domain): formato de copia validado y recordatorio de calendario`.

---

### Tarea 8: Base de datos y operaciones

**Archivos:**
- Crear: `src/data/db.ts`, `src/data/seed.ts`, `src/data/lugares.ts`, `src/data/trabajos.ts`, `src/data/pagos.ts`, `src/data/movimientos.ts`, `src/data/categorias.ts`, `src/data/ajustes.ts`, `src/data/copia.ts`
- Test: `src/data/*.test.ts` (fake-indexeddb; `beforeEach` borra y reabre la base)

**Interfaces:**
- Consume: todo `src/domain`.
- Produce:
```ts
// db.ts — Dexie 'gestion-dinero' versión 1
lugares: 'id'; tiposTrabajo: 'id, lugarId'; trabajos: 'id, lugarId, fecha, estado, pagoId';
pagos: 'id, lugarId, periodoFin'; movimientos: 'id, fecha, tipo, categoriaId'; categorias: 'id, tipo'; ajustes: 'clave'
export const db: GestionDB; export function nuevoId(): string; // crypto.randomUUID()
// seed.ts
export async function asegurarCategoriasIniciales(): Promise<void>; // solo si la tabla está vacía; lista exacta del spec §4.5
// lugares.ts
export async function crearLugar(d: Omit<Lugar,'id'|'creadoEn'|'archivado'|'reglasCierre'> & { diaCierre: DiaCierre }): Promise<string>;
export async function actualizarLugar(id: string, cambios: Partial<Omit<Lugar,'reglasCierre'>> & { diaCierre?: DiaCierre }, hoy: FechaISO): Promise<void>; // diaCierre distinto → cambiarDiaCierre
export async function archivarLugar(id: string, archivado: boolean): Promise<void>;
export async function borrarLugar(id: string): Promise<void>;   // lanza ErrorDatos('LUGAR_CON_TRABAJOS')
export async function guardarTipoTrabajo(t: Omit<TipoTrabajo,'id'> & { id?: string }): Promise<string>;
export async function borrarTipoTrabajo(id: string): Promise<void>; // trabajos existentes conservan su copia
// trabajos.ts
export async function guardarTrabajo(t: Omit<Trabajo,'id'|'creadoEn'|'actualizadoEn'|'estado'|'pagoId'> & { id?: string }):
  Promise<{ id: string; periodoYaPagado: boolean }>;   // periodoYaPagado: el período de la fecha tiene ≥1 pago y el trabajo es nuevo o cambió de período
export async function borrarTrabajo(id: string): Promise<void>;
// pagos.ts
export async function registrarPago(p: { lugarId: string; periodoFin: FechaISO; fecha: FechaISO; monto: Centavos; tipo: TipoPago; nota: string;
  tildados: string[]; destildados: string[] }): Promise<string>;   // transacción; usa resolverPago
export async function noMePagaron(lugarId: string, periodoFin: FechaISO): Promise<void>;   // PENDIENTE del período → NO_PAGADO
export async function marcarNoPagado(trabajoId: string): Promise<void>;                    // un trabajo PENDIENTE → NO_PAGADO
export async function yaMeLoPagaron(trabajoId: string, fecha: FechaISO, monto: Centavos): Promise<string>; // pago FINAL del período del trabajo
export async function saldarDiferencia(lugarId: string, periodoFin: FechaISO, fecha: FechaISO, monto: Centavos): Promise<string>; // pago FINAL sin trabajos
export async function borrarPago(id: string): Promise<void>;   // sus trabajos → PENDIENTE, pagoId null
// movimientos.ts / categorias.ts
export async function guardarMovimiento(m: Omit<Movimiento,'id'|'creadoEn'> & { id?: string }): Promise<string>;
export async function borrarMovimiento(id: string): Promise<void>;
export async function guardarCategoria(c: Omit<Categoria,'id'> & { id?: string }): Promise<string>;
export async function borrarCategoria(id: string, moverA: string | null): Promise<void>; // con movimientos y moverA null → ErrorDatos('CATEGORIA_EN_USO')
// ajustes.ts — claves: 'ultimaCopia' (ISO), 'recordatorioCopiaDias' (default 7), 'ultimoLugarId', 'pinHash', 'pinSalt'
export async function leerAjuste<T>(clave: string, porDefecto: T): Promise<T>;
export async function guardarAjuste(clave: string, valor: unknown): Promise<void>;
// copia.ts
export async function exportarDatos(): Promise<Datos>;
export async function restaurarDatos(c: Copia): Promise<void>;   // una transacción: vaciar todo + bulkAdd; conserva pinHash/pinSalt actuales
export class ErrorDatos extends Error { constructor(public codigo: string) }
```

- [ ] **Paso 1: tests que fallan**

```ts
test('categorías iniciales una sola vez', async () => {
  await asegurarCategoriasIniciales(); await asegurarCategoriasIniciales();
  expect(await db.categorias.count()).toBe(11);
});
test('borrar lugar con trabajos falla; archivar funciona', ...);
test('cambiar día de cierre agrega una regla desde el próximo período', ...);
test('guardarTrabajo marca periodoYaPagado en un período con pago', ...);
test('registrarPago aplica estados en una transacción', ...);
test('si falla a mitad, registrarPago no deja nada escrito', async () => {
  // destildados con un id inexistente → rechaza; el pago no existe y ningún trabajo cambió
});
test('borrarPago devuelve los trabajos a PENDIENTE', ...);
test('noMePagaron, marcarNoPagado, yaMeLoPagaron y saldarDiferencia', ...);
test('borrarCategoria en uso exige moverA y reasigna movimientos', ...);
test('restaurarDatos reemplaza todo y conserva el PIN actual', ...);
test('restaurarDatos con error a mitad no toca los datos existentes', async () => {
  // copia con ids duplicados que hacen fallar bulkAdd → los datos previos siguen intactos
});
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar. Toda operación que toca más de una fila va en `db.transaction('rw', ...)`, y `actualizadoEn` se actualiza en cada edición.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(data): base local con operaciones transaccionales`.

---

### Tarea 9: Lugares y configuración de lugar

**Archivos:**
- Crear: `src/ui/screens/Lugares.tsx`, `src/ui/screens/ConfigLugar.tsx`, `src/ui/components/{Card,Field,MoneyInput,Segmented,Button,ConfirmDialog}.tsx`
- Modificar: `src/ui/App.tsx` (rutas `/lugares`, `/lugares/nuevo`, `/lugares/:id/config`)
- Test: `src/ui/screens/ConfigLugar.test.tsx`

**Interfaces:**
- Consume: `data/lugares.ts`, `money.ts`, `periodos.ts`.
- Produce: componentes reutilizables. `MoneyInput({ value: Centavos|null, onChange, label, error? })` usa `inputmode="decimal"`, `parsePesos` y muestra `formatPesos` al salir del campo. `ConfirmDialog({ titulo, texto, confirmar, onConfirm, onCancel, peligro? })` es un diálogo propio, sin `window.confirm`.

Pantalla según `docs/superpowers/mockups/lugar.html` (derecha): nombre, segmento "Arancel fijo / Porcentaje", % (con `parsePorcentaje`) o lista de trabajos con precio (agregar, editar, borrar), "Cierra el período el día" (1–31 o "Último día del mes"), "Te pagan entre el día __ y el __ del mes siguiente", y el texto "Si cambiás un precio, los trabajos ya anotados mantienen el precio que tenían." Al cambiar el día de cierre de un lugar existente: "El cambio rige desde el próximo período (después del <fin actual>)." Si cambia el rango de pago, al guardar aparece: "Si agregaste el recordatorio al calendario, volvé a agregarlo desde Más → Recordatorios en el calendario." Al final, "Archivar lugar" o "Borrar lugar" (este último solo si no tiene trabajos). La lista `Lugares` muestra los activos, una sección "Archivados" plegada y "+ Agregar lugar".

- [ ] **Paso 1: tests que fallan**

```tsx
test('crea un lugar por porcentaje', async () => {
  // tipea nombre "Consultorio Sur", elige Porcentaje, "40", cierre 15, paga 21–31, Guardar
  expect(await db.lugares.toArray()).toMatchObject([{ nombre: 'Consultorio Sur', formaCobro: 'PORCENTAJE', porcentajeBp: 4000, pagoDesdeDia: 21, pagoHastaDia: 31 }]);
});
test('arancel fijo exige al menos un trabajo con precio', ...);
test('rango de pago inválido (desde > hasta) muestra error y no guarda', ...);
test('lugar con trabajos ofrece Archivar y no Borrar', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA. Verificar a ojo con `npm run dev` a 390px de ancho contra la maqueta.
- [ ] **Paso 5:** commit `feat(ui): lugares y su configuración`.

---

### Tarea 10: Anotar y editar un trabajo

**Archivos:**
- Crear: `src/ui/screens/FormTrabajo.tsx`
- Modificar: `src/ui/App.tsx` (rutas `/trabajo/nuevo`, `/trabajo/:id`)
- Test: `src/ui/screens/FormTrabajo.test.tsx`

**Interfaces:**
- Consume: `calcularTrabajo`, `guardarTrabajo`, `borrarTrabajo`, `yaMeLoPagaron`, `marcarNoPagado`, `leerAjuste/guardarAjuste('ultimoLugarId')`.
- Produce: ruta `/trabajo/nuevo?lugar=<id>`.

Pantalla según `docs/superpowers/mockups/anotar-trabajo.html`. El lugar viene por query o, si no, es el último usado; solo aparecen lugares activos. La fecha es hoy por defecto. En arancel fijo: chips con nombre y precio más "Otro…". En porcentaje: qué hizo, lo que pagó el cliente, el descuento opcional con motivo y el bloque "Te corresponde" con `detalle`, actualizado en vivo. Los errores de `calcularTrabajo` se muestran en español junto al campo:
- `DESCUENTO_MAYOR`: "El descuento no puede ser mayor que lo que pagó el cliente".
- `MONTO_INVALIDO`: "Ingresá un monto mayor a 0".
- `FALTA_TIPO`: "Elegí qué hiciste".
- `FALTA_DESCRIPCION`: "Escribí qué hiciste".

Si `periodoYaPagado`, aparece el diálogo "¿Este trabajo ya te lo pagaron?" con tres respuestas:
- **Sí:** llama a `yaMeLoPagaron(id, hoy, monto)`.
- **No:** `marcarNoPagado(id)`.
- **Todavía no sé:** no se hace nada.

Al editar un trabajo con `pagoId`, aparece el aviso "Este trabajo ya está en un pago: cambiarlo modifica la conciliación de ese período". Borrar pide confirmación.

- [ ] **Paso 1: tests que fallan**

```tsx
test('porcentaje muestra la cuenta en vivo y guarda 60.000', async () => {
  // lugar 40 %; pagó 200.000, descuento 50.000
  expect(screen.getByText('(200.000 − 50.000) × 40 %')).toBeInTheDocument();
  expect(screen.getByText('$ 60.000')).toBeInTheDocument();
  // Guardar → trabajo con monto 6000000, montoCliente 20000000, descuento 5000000, porcentajeBp 4000
});
test('descuento mayor muestra error y no guarda', ...);
test('arancel fijo: elegir "Arreglo" guarda 38.000 y precioLista', ...);
test('recuerda el último lugar usado', ...);
test('trabajo con fecha en período pagado pregunta y "No" lo deja NO_PAGADO', ...);
test('fecha de hace 2 años cae en su período y se guarda', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(ui): anotar y editar trabajos`.

---

### Tarea 11: Período del lugar y registrar pago

**Archivos:**
- Crear: `src/ui/screens/PeriodoLugar.tsx`, `src/ui/screens/RegistrarPago.tsx`
- Modificar: `src/ui/App.tsx` (rutas `/lugares/:id`, `/lugares/:id/pago?periodo=<fin>`)
- Test: `src/ui/screens/RegistrarPago.test.tsx`, `src/ui/screens/PeriodoLugar.test.tsx`

**Interfaces:**
- Consume: `resumenPeriodo`, `periodosEntre`, `trabajosOfrecidosParaPago`, `requierePregunta`, `registrarPago`, `yaMeLoPagaron`, `saldarDiferencia`, `noMePagaron`.

`PeriodoLugar` (maqueta `lugar.html`, izquierda):
- Arriba, selector de período (los 2 más recientes como pestañas, más "Historial", que lista `periodosEntre` desde la fecha del primer trabajo) y el engranaje que lleva a la configuración.
- La tarjeta muestra "Te corresponde", "Cobrado" y "Falta cobrar", o "A favor" si corresponde.
- Debajo, la lista de trabajos con su estado: ✓ pagado, ⚠ sin pagar, o sin marca si está pendiente. Cada trabajo sin pagar tiene "Ya me lo pagaron".
- Si hay `deudaPlata`, una fila "Diferencia en pago: $ X" con "Ya me lo pagaron" (llama a `saldarDiferencia`).
- "Pagos de este período": cada pago con fecha, monto y tipo ("a cuenta" o "final"), con opción de borrarlo (pide confirmación; sus trabajos vuelven a pendiente).
- Botones "Compartir listado" (se conecta en la Tarea 15) y "Registrar pago".

`RegistrarPago` (maqueta `registrar-pago.html`):
- Monto y fecha (hoy por defecto).
- Los trabajos del período, todos tildados.
- La sección "De períodos anteriores", destildados por defecto.
- El bloque de diferencia en vivo: "Esperabas $ X · te pagaron $ Y · Falta: n trabajos, $ Z".

Al guardar, si `requierePregunta`, aparece el diálogo con dos opciones: "Es un pago a cuenta, falta el resto" (`A_CUENTA`) y "Es todo lo que me van a pagar" (`FINAL`). Si no hace falta preguntar, el pago se guarda como `FINAL`.

- [ ] **Paso 1: tests que fallan**

```tsx
test('todo tildado y monto exacto guarda FINAL sin preguntar', ...);
test('destildar uno muestra "Falta: 1 trabajo, $ 45.000" y pregunta', ...);
test('"Es todo lo que me van a pagar" deja el destildado NO_PAGADO', ...);
test('"Es un pago a cuenta" deja el destildado PENDIENTE', ...);
test('trabajo atrasado de agosto aparece destildado en "De períodos anteriores"', ...);
test('PeriodoLugar muestra Te corresponde / Cobrado / Falta cobrar del período elegido', ...);
test('borrar un pago desde PeriodoLugar devuelve sus trabajos a pendiente', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(ui): período del lugar y registro de pagos con conciliación`.

---

### Tarea 12: Inicio

**Archivos:**
- Modificar: `src/ui/screens/Inicio.tsx`
- Crear: `src/ui/components/AvisoCard.tsx`, `src/ui/hooks/useHoy.ts`
- Test: `src/ui/screens/Inicio.test.tsx`

**Interfaces:**
- Consume: `resumenMes`, `calcularAvisos`, `resumenPeriodo`, `periodoQueContiene`, `noMePagaron`, `leerAjuste`.
- Produce: `useHoy(): FechaISO`, que se recalcula en `visibilitychange` (spec §5.2: los avisos se recalculan al volver a primer plano).

Según `inicio.html` (opción A):
- Arriba: "Octubre 2026 · hasta hoy", el saldo grande y debajo "Ganado $ X" y "Gastos $ Y".
- Después, los avisos `AvisoCard`:
  - `PAGO_ATRASADO`: "Registrar pago" y "No me pagaron" (con confirmación).
  - `DEUDA`: "Ver detalle" (lleva al lugar) y "Compartir reclamo" (Tarea 15).
  - `SIN_CONCILIAR`: "Revisar".
  - `COPIA`: "Hacer copia ahora" (Tarea 16).
- "Por lugar": una tarjeta por lugar activo con nombre, "cierra el <día>", cantidad de trabajos y total del período en curso. Al tocarla abre el lugar.
- Botón flotante "+ Anotar trabajo".
- Si no hay lugares, un estado vacío: "Empezá agregando los lugares donde trabajás" con el botón "Agregar lugar".

- [ ] **Paso 1: tests que fallan**

```tsx
test('sin lugares muestra el estado vacío con "Agregar lugar"', ...);
test('muestra saldo, ganado y gastos del mes', ...);
test('muestra aviso de pago atrasado y "No me pagaron" lo convierte en deuda', ...);
test('tarjeta por lugar con total del período en curso', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(ui): pantalla de inicio con saldo, avisos y lugares`.

---

### Tarea 13: Movimientos, gastos, ingresos y categorías

**Archivos:**
- Modificar: `src/ui/screens/Movimientos.tsx`
- Crear: `src/ui/screens/FormMovimiento.tsx`, `src/ui/screens/Categorias.tsx`
- Modificar: `src/ui/App.tsx` (rutas `/movimiento/nuevo?tipo=GASTO|INGRESO`, `/movimiento/:id`, `/mas/categorias`)
- Test: `src/ui/screens/Movimientos.test.tsx`, `src/ui/screens/FormMovimiento.test.tsx`

Según `movimientos-estadisticas.html` (izquierda):
- `Movimientos` muestra una lista agrupada por día ("Hoy", "Ayer" o "27 oct") que une trabajos (`+`, en verde, con "Descripción · Lugar"), otros ingresos y gastos (`−`, terracota, con etiqueta "trabajo" o "personal").
- Tiene un filtro Todo / Ingresos / Gastos y un selector de mes.
- "+ Nuevo" abre un menú con tres opciones: Trabajo, Gasto y Otro ingreso.
- Tocar un ítem abre su edición.

`FormMovimiento` pide monto, fecha, categoría (chips filtradas por tipo; en gastos, agrupadas en "De trabajo" y "Personales") y nota. `Categorias` permite crear, editar y borrar categorías. Si una categoría está en uso, pide a cuál pasar sus movimientos.

- [ ] **Paso 1: tests que fallan**

```tsx
test('lista une trabajos, ingresos y gastos agrupados por día con signo', ...);
test('filtro Gastos oculta ingresos y trabajos', ...);
test('crear gasto con categoría Supermercado', ...);
test('borrar categoría en uso pide categoría destino', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(ui): movimientos, gastos, ingresos y categorías`.

---

### Tarea 14: Estadísticas

**Archivos:**
- Modificar: `src/ui/screens/Estadisticas.tsx`
- Crear: `src/ui/components/BarrasApiladas.tsx`, `src/ui/components/BarrasHorizontales.tsx`
- Test: `src/ui/screens/Estadisticas.test.tsx`

Cargar la skill `dataviz` antes de escribir los gráficos. Los gráficos son SVG y CSS propios, sin librería: son dos gráficos simples y así la app pesa menos sin conexión.
- **"Cuánto ganás por lugar":** barras por mes de los últimos 4 o 12 meses (selector), apiladas por lugar, con leyenda. Los colores de los lugares salen de una paleta fija de 6 tonos, ordenados por id de lugar para que sean estables.
- **"En qué gastás más · <mes>":** barras horizontales con filtro Todos / Trabajo / Personal.
- Tocar un mes muestra su desglose por lugar con montos. Tocar una categoría lleva a Movimientos filtrado por ese mes.
- Cada gráfico tiene un texto alternativo con los totales, para lectores de pantalla.

- [ ] **Paso 1: tests que fallan**

```tsx
test('una barra por mes con un segmento por lugar y leyenda', ...);
test('ranking de gastos de mayor a menor y filtro Personal', ...);
test('sin datos muestra "Todavía no hay datos para este período"', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat(ui): estadísticas por lugar y por categoría`.

---

### Tarea 15: Compartir archivos y listados en PDF

**Archivos:**
- Crear: `src/platform/compartir.ts`, `src/pdf/listado.ts`, `src/ui/components/DialogCompartir.tsx`
- Modificar: `PeriodoLugar.tsx`, `Inicio.tsx` (conectar "Compartir listado" y "Compartir reclamo")
- Test: `src/platform/compartir.test.ts`, `src/pdf/listado.test.ts`

**Interfaces:**
- Produce:
```ts
export async function compartirArchivo(archivo: File, titulo: string): Promise<'compartido' | 'descargado' | 'cancelado'>;
// navigator.canShare?.({ files: [archivo] }) → navigator.share; AbortError → 'cancelado'; sin soporte → descarga con <a download>
export interface DatosListado { lugar: Lugar; periodo: Periodo | null; trabajos: Trabajo[]; resumen: ResumenPeriodo | null;
  deudasPlata: { periodo: Periodo; monto: Centavos; fechaPago: FechaISO }[]; incluirNotas: boolean; tipo: 'PERIODO' | 'RECLAMO' }
export async function armarPdfListado(d: DatosListado): Promise<Blob>;   // import dinámico de jspdf
export function filasListado(d: DatosListado): string[][];               // pura, testeable
```
Columnas: Fecha, Qué hizo, Nota (solo si `incluirNotas`), Pagó el cliente, Descuento, Te corresponde. Al pie van el total y lo cobrado. En el reclamo se agregan filas "Diferencia en pago del DD/MM: $ X". El archivo se llama `listado-<lugar>-<fin>.pdf` o `reclamo-<lugar>-<hoy>.pdf`, con el lugar en minúsculas, sin acentos y con guiones. `DialogCompartir` ofrece el interruptor "Incluir notas", encendido por defecto.

- [ ] **Paso 1: tests que fallan**

```ts
test('filasListado de período porcentaje incluye pagó, descuento y te corresponde', () =>
  expect(filasListado(d)[0]).toEqual(['26/09', 'Corona', 'Juan P.', '$ 200.000', '$ 50.000', '$ 60.000']));
test('sin notas no incluye la columna Nota', ...);
test('reclamo solo lleva NO_PAGADO y diferencias en plata', ...);
test('compartirArchivo usa navigator.share cuando canShare', ...);
test('compartirArchivo descarga cuando no hay Web Share', ...);
test('compartirArchivo devuelve "cancelado" ante AbortError', ...);
test('armarPdfListado devuelve un PDF', async () => expect((await armarPdfListado(d)).type).toBe('application/pdf'));
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat: listados y reclamos en PDF para compartir`.

---

### Tarea 16: Más, con copia de seguridad, calendario e instalación guiada

**Archivos:**
- Modificar: `src/ui/screens/Mas.tsx`
- Crear: `src/ui/screens/Copia.tsx`, `src/ui/screens/Instalar.tsx`, `src/platform/persistencia.ts`, `src/platform/instalacion.ts`, `src/ui/components/BannerInstalar.tsx`
- Modificar: `src/ui/App.tsx` (rutas `/mas/copia`, `/mas/instalar`; `BannerInstalar` arriba de todo; `pedirPersistencia()` al iniciar), `Inicio.tsx` (conectar "Hacer copia ahora")
- Test: `src/platform/instalacion.test.ts`, `src/ui/screens/Copia.test.tsx`

**Interfaces:**
- Produce:
```ts
export function esStandalone(): boolean;     // matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
export function plataforma(): 'ios' | 'android' | 'otro';   // por userAgent (iPhone/iPad/iPod, o Macintosh con touch → ios)
export async function pedirPersistencia(): Promise<boolean>; // navigator.storage?.persist?.() ?? false
```

`Mas` muestra la lista: Copia de seguridad, Categorías, PIN, Lugares archivados, Recordatorios en el calendario (uno por lugar activo: arma el ICS y lo comparte o descarga como `pago-<lugar>.ics`) y Cómo instalar la app.

`Copia`:
- Muestra "Última copia: hace N días" o "Nunca hiciste una copia".
- **"Hacer copia":** `exportarDatos` → `armarCopia` → `compartirArchivo`. Si el resultado no es `'cancelado'`, guarda `ultimaCopia`.
- **"Restaurar copia":** `<input type="file" accept="application/json,.json">` → `leerCopia`. Si da error, lo muestra y no hace nada más. Si sale bien, muestra el resumen (fecha y cantidades) y pide confirmación ("Esto reemplaza todos tus datos actuales") antes de `restaurarDatos`.
- **Recordatorio:** selector con Cada 7 días / 14 / 30 / Desactivado.

`BannerInstalar` aparece si `!esStandalone()`. En iOS dice "Para usarla como app: tocá Compartir → Agregar a inicio. Importante: en iPhone, los datos que cargues acá en Safari no aparecen en la app instalada; usá siempre el ícono." En Android: "Menú ⋮ → Instalar app". `Instalar` muestra los pasos con más detalle.

- [ ] **Paso 1: tests que fallan**

```ts
test('esStandalone detecta display-mode y navigator.standalone', ...);
test('plataforma detecta iPhone, iPad con Macintosh+touch y Android', ...);
test('BannerInstalar aparece en pestaña de Safari iOS con la advertencia de datos separados', ...);
test('hacer copia guarda ultimaCopia salvo si se cancela', ...);
test('restaurar copia inválida muestra el error y no toca los datos', ...);
test('restaurar copia válida pide confirmación y reemplaza', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat: copia de seguridad, recordatorios de calendario e instalación guiada`.

---

### Tarea 17: PIN de privacidad

**Archivos:**
- Crear: `src/platform/pin.ts`, `src/ui/screens/Bloqueo.tsx`, `src/ui/screens/ConfigPin.tsx`, `src/ui/hooks/useBloqueo.ts`
- Modificar: `src/ui/App.tsx` (envuelve todo con el bloqueo; ruta `/mas/pin`; primer uso ofrece crear PIN con "Ahora no")
- Test: `src/platform/pin.test.ts`, `src/ui/screens/Bloqueo.test.tsx`

**Interfaces:**
- Produce:
```ts
export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }>; // PBKDF2-SHA256, 150000 iteraciones, salt de 16 bytes, base64
export async function verificarPin(pin: string, hash: string, salt: string): Promise<boolean>;
export function pinValido(pin: string): boolean;   // /^\d{4,6}$/
export const BLOQUEO_TRAS_MS = 60_000;
```
`useBloqueo` bloquea al cargar si existe `pinHash`, y también al volver a `visible` si estuvo oculta más de `BLOQUEO_TRAS_MS`. `Bloqueo` es un teclado numérico grande. "Olvidé mi PIN" explica que el PIN es una pantalla de privacidad y no cifra los datos, pide confirmación, muestra una cuenta regresiva de 60 s y recién después habilita "Quitar PIN" (solo borra `pinHash` y `pinSalt`, nunca datos). `ConfigPin` permite crear, cambiar (pide el actual) o quitar el PIN, con el texto "El PIN evita que otra persona vea tus datos si agarra tu celular. No cifra la información."

- [ ] **Paso 1: tests que fallan**

```ts
test('hash y verificación de PIN', async () => {
  const { hash, salt } = await hashPin('1234');
  expect(await verificarPin('1234', hash, salt)).toBe(true);
  expect(await verificarPin('4321', hash, salt)).toBe(false);
  expect(hash).not.toContain('1234');
});
test.each([['123', false], ['1234', true], ['123456', true], ['1234567', false], ['12a4', false]])('pinValido(%s)', ...);
test('con PIN la app arranca bloqueada y desbloquea con el correcto', ...);
test('se vuelve a bloquear tras más de 1 minuto oculta', ...);   // vi.useFakeTimers + visibilitychange
test('"Olvidé mi PIN" espera 60 s, quita el PIN y conserva todos los datos', ...);
```

- [ ] **Paso 2:** ejecutar → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** ejecutar → PASA.
- [ ] **Paso 5:** commit `feat: PIN de privacidad al abrir la app`.

---

### Tarea 18: Prueba de punta a punta y publicación en GitHub Pages

**Archivos:**
- Crear: `playwright.config.ts`, `e2e/flujo.spec.ts`, `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- `playwright.config.ts`: `webServer: { command: 'npm run build && npx vite preview --port 4173', url: 'http://localhost:4173/gestion-dinero/' }`, proyectos `iphone` (`devices['iPhone 13']`, webkit) y `android` (`devices['Pixel 7']`, chromium), `timezoneId: 'America/Argentina/Buenos_Aires'`, `locale: 'es-AR'`.
- `deploy.yml`: corre en push a `main`; `npm ci`, `npm test`, `npm run build`; después `actions/upload-pages-artifact` con `dist` y `actions/deploy-pages`. Permisos `pages: write` e `id-token: write`.

- [ ] **Paso 1: test e2e que falla** (`e2e/flujo.spec.ts`), en ambos dispositivos:

```ts
test('flujo completo de un mes', async ({ page, context }) => {
  // 1. crear "Consultorio Sur" 40 %, cierre último día, paga 21–31
  // 2. anotar trabajo: pagó 200.000, descuento 50.000 → ver "$ 60.000"; guardar
  // 3. Inicio muestra tarjeta Consultorio Sur con $ 60.000
  // 4. registrar pago de 40.000 con todo tildado → "Es todo lo que me van a pagar" → Inicio muestra aviso de deuda $ 20.000
  // 5. context.setOffline(true); page.reload() → la app carga y los datos siguen ahí
});
```

- [ ] **Paso 2:** `npx playwright install webkit chromium` y `npm run e2e` → FALLA (si falla por un bug real, corregirlo en el código de la tarea que corresponda).
- [ ] **Paso 3:** ajustar hasta que pase en `iphone` y `android`.
- [ ] **Paso 4:** escribir `README.md` en español con el link de la app (`https://lzga07.github.io/gestion-dinero/`), cómo instalarla en iPhone y Android, la advertencia de hacer copias, y cómo desarrollar (`npm i`, `npm run dev`, `npm test`, `npm run e2e`). Agregar ahí la sección "Pendiente: app nativa (Capacitor)" con los puntos del spec §3.1.
- [ ] **Paso 5:** commit `test: flujo e2e en iPhone y Android; publicación en GitHub Pages`.
- [ ] **Paso 6:** **pedir confirmación a la persona** antes de publicar. Después, habilitar Pages con el workflow (`gh api -X POST repos/Lzga07/gestion-dinero/pages -f build_type=workflow`), hacer `git push` y verificar con `gh run watch` que el deploy termine bien y que `https://lzga07.github.io/gestion-dinero/` cargue.

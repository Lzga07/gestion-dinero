# Cargar meses anteriores y "Me deben" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las deudas de más de 2 meses pasen de Inicio a una pantalla "Me deben" (con una línea en Inicio), y que se puedan cargar los trabajos de meses pasados de corrido, diciendo cómo terminó cada mes.

**Architecture:** La regla de deuda vieja y la navegación entre períodos van en `src/domain` (puras, con tests). El cierre de un mes cargado va en `src/data` como una transacción que reusa `registrarPago` y `noMePagaron`. Las pantallas nuevas (`MeDeben`, `MesesAnteriores`) siguen el patrón actual: `useLiveQuery` + `<Cargando />`, componentes chicos en una carpeta por pantalla, tests con Testing Library sobre fake-indexeddb.

**Tech Stack:** React 19, TypeScript, Dexie 4 + dexie-react-hooks, react-router 7 (HashRouter), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-meses-anteriores-design.md` (complementa `docs/superpowers/specs/2026-10-27-gestion-dinero-design.md`).

## Global Constraints

- Todo texto en español rioplatense ("vos"); nada específico de un rubro (decir "trabajo", "lugar", "lo que pagó el cliente").
- Montos en centavos enteros (`Centavos`); se muestran con `pesosJuntos`.
- Fechas `FechaISO` ('YYYY-MM-DD') en hora local; los tests corren con `TZ=America/Argentina/Buenos_Aires` (`npm test`).
- Operaciones que tocan varias filas van en una transacción Dexie.
- Pantallas: mientras cargan muestran `<Cargando />` (`src/ui/components/Cargando.tsx`), nunca `null`.
- Fechas elegibles por la persona con `SelectorFecha` (`src/ui/components/SelectorFecha.tsx`); en tests, `elegirFecha` / `fechaElegida` de `src/ui/test-fecha.ts`.
- Deuda vieja: hoy > fin del período + 2 meses (mismo día, acotado a fin de mes). Aplica a todas las deudas.
- Commits en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verificación de cada tarea: `npm test`, `npm run lint` y `npm run build` sin errores.

## Review Focus

- Un lugar que cierra el día 15: el "mes" es "16 dic – 15 ene", cruza de año y de mes; los días ofrecidos tienen que ser los del período (16 dic … 15 ene), nunca futuros. → test en Tarea 7.
- Un lugar al que se le cambió el día de cierre (varias `reglasCierre`): ‹ › tiene que pasar de período en período sin saltear ni repetir al cruzar el cambio de regla. → test en Tarea 4.
- Límite de deuda vieja en fin de mes: período que cierra el 31/12 → vieja desde el 01/03 (el 28/02 todavía es reciente). → test en Tarea 1.
- "Me pagaron una parte" con un monto igual o mayor al total se trata como "todo" (sin deuda); un monto 0 o vacío no se acepta. → test en Tarea 5 y Tarea 9.
- Doble toque en "Agregar" o en "Listo" del cierre: un solo trabajo / un solo pago. → tests en Tareas 8 y 9.

---

### Tarea 1: Dominio de deudas (viejas y recientes)

**Files:**
- Create: `src/domain/deudas.ts`, `src/domain/deudas.test.ts`
- Modify: `src/domain/avisos.ts` (el aviso `DEUDA` solo con deudas recientes), `src/domain/avisos.test.ts`

**Interfaces:**
- Produces:
  - `MESES_DEUDA_VIEJA = 2`
  - `esDeudaVieja(periodoFin: FechaISO, hoy: FechaISO): boolean` — true si `hoy > diaAcotado(fin + 2 meses)`.
  - `interface DeudaPeriodo { periodo: Periodo; noPagados: Trabajo[]; plata: Centavos; monto: Centavos; vieja: boolean }`
  - `interface DeudasLugar { lugar: Lugar; periodos: DeudaPeriodo[]; monto: Centavos }` (periodos del más viejo al más nuevo)
  - `deudasPorLugar(a: { hoy: FechaISO; lugares: Lugar[]; trabajos: Trabajo[]; pagos: Pago[] }): DeudasLugar[]` — solo lugares con deuda (incluye archivados), por nombre (`localeCompare 'es'`); usa `conciliacionDelLugar` (noPagados + deudaPlata por período).
  - `soloRecientes(d: DeudasLugar): DeudasLugar | null` y `soloViejas(d: DeudasLugar): DeudasLugar | null` (null si queda sin períodos).
  - `avisoDeuda(d: DeudasLugar): AvisoDeuda` — `{ tipo: 'DEUDA', lugarId, noPagados (todos los períodos, por fecha), deudasPlata: [{ periodo, monto: plata }] (solo plata > 0), monto }`. `AvisoDeuda` es el tipo existente `Extract<Aviso, { tipo: 'DEUDA' }>` (moverlo/exportarlo desde `avisos.ts`; `AvisoCard` lo reexporta como hoy).

- [ ] **Step 1: Tests de `deudas.test.ts`**
  - `esDeudaVieja('2026-10-31', '2026-12-31')` → false; `('2026-10-31', '2027-01-01')` → true.
  - Fin de mes corto: `esDeudaVieja('2026-12-31', '2027-02-28')` → false; `('2026-12-31', '2027-03-01')` → true.
  - `deudasPorLugar`: lugar con un `NO_PAGADO` de agosto y una diferencia en plata de octubre (hoy 2026-12-15) → un `DeudasLugar` con dos períodos, agosto `vieja: true`, octubre `vieja: false`, `monto` = suma.
  - Lugar archivado con deuda aparece; lugar sin deuda no aparece; orden por nombre.
  - `soloRecientes` / `soloViejas` sobre el caso anterior dejan un período cada uno; sobre un lugar con todo viejo, `soloRecientes` → null.
- [ ] **Step 2: Correr y ver que fallan** — `npx cross-env TZ=America/Argentina/Buenos_Aires vitest run src/domain/deudas.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `src/domain/deudas.ts`.**
- [ ] **Step 4: Test nuevo en `avisos.test.ts`:** "el aviso de deuda solo junta deudas recientes": lugar con deuda vieja (agosto, hoy 2026-12-15) y reciente (octubre) → el aviso `DEUDA` trae solo lo de octubre; lugar con solo deuda vieja → sin aviso `DEUDA`. Ver que falla.
- [ ] **Step 5: Cambiar `calcularAvisos`** para armar los avisos `DEUDA` con `deudasPorLugar` → `soloRecientes` → `avisoDeuda` (mismo orden por nombre que hoy). Los avisos `PAGO_ATRASADO` y `SIN_CONCILIAR` no cambian.
- [ ] **Step 6: `npm test`, `npm run lint`, `npm run build`** → todo verde (ajustar tests existentes de avisos solo si usaban deudas de más de 2 meses, fijando `hoy`).
- [ ] **Step 7: Commit** — `feat(deudas): separar deudas viejas (más de 2 meses) de las recientes`

### Tarea 2: Pantalla "Me deben" y su fila en Más

**Files:**
- Create: `src/ui/screens/MeDeben.tsx`, `src/ui/screens/MeDeben.test.tsx`
- Modify: `src/ui/App.tsx` (ruta `/mas/me-deben`), `src/ui/screens/Mas.tsx` (fila), `src/ui/theme.css`

**Interfaces:**
- Consumes: `deudasPorLugar`, `avisoDeuda` (Tarea 1); `DialogoCobrarDeuda`, `cobrarDeuda`, `datosReclamo`, `DialogCompartir` (existentes, como los usa `Inicio.tsx`).
- Produces: ruta `/mas/me-deben`.

- [ ] **Step 1: Tests en `MeDeben.test.tsx`** (renderizando la ruta dentro de `MemoryRouter` como los tests de `Mas`):
  - Sin deudas: muestra "No te deben nada".
  - Con deudas en dos lugares: un bloque por lugar con su nombre y "Te deben $ X"; dentro, cada período con su nombre (`nombrePeriodo` + año) y sus trabajos (`etiquetaTrabajo` y monto) y la diferencia en plata como "Diferencia en pago: $ X". Incluye deuda vieja y reciente.
  - "Ya me lo pagaron" de un lugar abre el diálogo con todas sus deudas; al guardar con todo tildado la deuda desaparece de la pantalla.
  - "Compartir reclamo" abre el diálogo de compartir.
  - En Más hay una fila "Me deben" con detalle `$ X` (total de todas las deudas) o "Nada", que lleva a la pantalla.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar** `MeDeben` (título "Me deben", `Encabezado` con volver a `/mas`, `<Cargando />` mientras carga), la ruta y la fila en `Mas.tsx` (entre "Copia de seguridad" y "Categorías").
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(deudas): pantalla "Me deben" con todas las deudas por lugar`

### Tarea 3: Línea de deudas viejas en Inicio y enlace desde el lugar

**Files:**
- Modify: `src/ui/screens/Inicio.tsx`, `src/ui/screens/Inicio.test.tsx`, `src/ui/screens/PeriodoLugar.tsx`, `src/ui/screens/PeriodoLugar.test.tsx`, `src/ui/theme.css`

**Interfaces:**
- Consumes: `deudasPorLugar`, `soloViejas` (Tarea 1); ruta `/mas/me-deben` (Tarea 2).

- [ ] **Step 1: Tests:**
  - Inicio con una deuda vieja de $ 85.000: no hay tarjeta de deuda de ese lugar y sí un enlace con texto exacto "Te deben $ 85.000 de meses anteriores · Ver" que lleva a `/mas/me-deben`. Sin deudas viejas: no hay enlace.
  - La línea suma deudas viejas de todos los lugares, incluidos archivados.
  - PeriodoLugar de un lugar con deudas (viejas o recientes): enlace "Te deben $ X · Ver" a `/mas/me-deben`; sin deudas, no aparece.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** En Inicio la línea va después de la sección de avisos, como enlace de texto discreto (no tarjeta).
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(deudas): línea de deudas viejas en Inicio y acceso desde el lugar`

### Tarea 4: Dominio de la carga: períodos vecinos, días, fecha de pago y monto directo

**Files:**
- Modify: `src/domain/periodos.ts`, `src/domain/periodos.test.ts`, `src/domain/trabajos.ts`, `src/domain/trabajos.test.ts`

**Interfaces:**
- Produces:
  - `periodoAnterior(reglas: ReglaCierre[], p: Periodo): Periodo` = `periodoQueContiene(reglas, sumarDias(p.inicio, -1))`
  - `periodoSiguiente(reglas: ReglaCierre[], p: Periodo): Periodo` = `periodoQueContiene(reglas, sumarDias(p.fin, 1))`
  - `diasDelPeriodo(p: Periodo, hoy: FechaISO): FechaISO[]` — de `inicio` a `min(fin, hoy)`.
  - `fechaPagoPropuesta(p: Periodo, desdeDia: number, hastaDia: number, hoy: FechaISO): FechaISO` — `min(ventanaPago(...).desde, hoy)`.
  - En `EntradaTrabajo`, nueva variante `{ forma: 'MONTO_DIRECTO'; descripcion: string; monto: Centavos | null }`: `calcularTrabajo` valida descripción (`FALTA_DESCRIPCION`) y monto (`MONTO_INVALIDO`) y devuelve `{ ok, monto, descripcion, detalle: '' }`.

- [ ] **Step 1: Tests:**
  - Lugar que cierra el 15: `periodoAnterior` de "16 dic 2026 – 15 ene 2027" es "16 nov – 15 dic 2026"; `periodoSiguiente` lo invierte.
  - Lugar con dos reglas (cierre el 15 hasta un cambio, después el último día): recorrer con `periodoAnterior` desde hoy 12 períodos y comprobar que cada `fin` es el `inicio - 1` del siguiente (sin huecos ni repetidos).
  - `diasDelPeriodo({ inicio: '2026-12-16', fin: '2027-01-15' }, '2027-03-01')` tiene 31 días, de '2026-12-16' a '2027-01-15'; con hoy '2027-01-03' termina en '2027-01-03'.
  - `fechaPagoPropuesta` con ventana 1–10 del mes siguiente: período que cierra el 31/08 → '2026-09-01'; si hoy es anterior a esa fecha, devuelve hoy.
  - `calcularTrabajo({ forma: 'MONTO_DIRECTO', descripcion: ' Arreglo ', monto: 4000000 })` → ok, `descripcion: 'Arreglo'`, `monto: 4000000`; sin descripción → `FALTA_DESCRIPCION`; monto null/0 → `MONTO_INVALIDO`.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(periodos): períodos vecinos, días del período, fecha de pago propuesta y monto directo`

### Tarea 5: Cerrar un mes cargado (datos)

**Files:**
- Create: `src/data/mesesAnteriores.ts`, `src/data/mesesAnteriores.test.ts`

**Interfaces:**
- Consumes: `registrarPago`, `noMePagaron` (existentes), `resumenPeriodo`.
- Produces:
  - `type CierreMes = { tipo: 'TODO'; fecha: FechaISO } | { tipo: 'PARTE'; fecha: FechaISO; monto: Centavos } | { tipo: 'NADA' }`
  - `cerrarMes(lugarId: string, periodo: Periodo, cierre: CierreMes): Promise<void>` — en una transacción `rw` sobre `lugares`, `trabajos`, `pagos`: toma los trabajos `PENDIENTE` del período; `TODO` → `registrarPago` `FINAL` por la suma, todos tildados; `PARTE` → si `monto >= suma`, igual que `TODO` con ese monto; si no, `FINAL` por `monto` con todos tildados (la diferencia queda como `deudaPlata`); `NADA` → `noMePagaron`. Lanza `ErrorDatos('LUGAR_INEXISTENTE')` si no existe el lugar y no hace nada si no hay pendientes. `PARTE` con `monto <= 0` lanza `ErrorDatos('MONTO_INVALIDO')` (agregar el código a `src/data/errores.ts` si no existe).
  - `mesCerrado(r: ResumenPeriodo): boolean` = `r.tienePagos || r.noPagados.length > 0`.

- [ ] **Step 1: Tests** (con `reiniciarDb`, `lugarFijo`, `anotarTrabajo` de `test-helpers`):
  - `TODO`: 3 trabajos de agosto → un pago `FINAL` por la suma y los 3 `PAGADO`; `resumenPeriodo` con `deudaPlata` 0.
  - `PARTE` por menos: `deudaPlata` = suma − monto, trabajos `PAGADO`.
  - `PARTE` por igual o más → sin deuda, monto del pago = lo escrito.
  - `PARTE` con monto 0 → lanza y no escribe nada.
  - `NADA` → los 3 `NO_PAGADO`, sin pagos.
  - `mesCerrado` true con un pago o con un `NO_PAGADO`; false con solo pendientes.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(datos): cerrar un mes cargado (todo, una parte o nada)`

### Tarea 6: Editar un trabajo "lo que me tocó" en un lugar por porcentaje

**Files:**
- Modify: `src/ui/screens/FormTrabajo.tsx`, `src/ui/screens/FormTrabajo.test.tsx`

**Interfaces:**
- Consumes: variante `MONTO_DIRECTO` (Tarea 4).

- [ ] **Step 1: Tests:**
  - Editar un trabajo de un lugar por porcentaje guardado con `montoCliente: null`, `porcentajeBp: null`, `monto: 4000000`: el formulario muestra "¿Qué hiciste?" y un campo "Lo que te tocó" con $ 40.000 (no pide "Lo que pagó el cliente"); cambiar a 45.000 y guardar deja `monto: 4500000`, `montoCliente: null`, `porcentajeBp: null`.
  - Un trabajo nuevo en ese lugar sigue pidiendo "Lo que pagó el cliente" como hoy.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar:** en el formulario, `esDirecto = esPorcentaje && !!trabajo && trabajo.lugarId === lugarId && trabajo.montoCliente === null`; con `esDirecto` la entrada es `MONTO_DIRECTO` y el campo de monto usa `MoneyInput` con etiqueta "Lo que te tocó". Al cambiar de lugar deja de ser directo.
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(trabajo): editar trabajos cargados con el monto que te tocó`

### Tarea 7: Pantalla "Cargar meses anteriores": elegir el mes y ver lo cargado

**Files:**
- Create: `src/ui/screens/MesesAnteriores.tsx`, `src/ui/screens/MesesAnteriores.test.tsx`, `src/ui/screens/anteriores/SelectorMes.tsx`
- Modify: `src/ui/App.tsx` (ruta `/lugares/:id/anteriores`, con `?periodo=<fin>` opcional), `src/ui/theme.css`

**Interfaces:**
- Consumes: `periodoAnterior`, `periodoSiguiente`, `periodoQueContiene`, `nombrePeriodo`, `resumenPeriodo`, `mesCerrado` (Tareas 4–5).
- Produces: `MesesAnteriores` con estado `periodo` (arranca en `?periodo=` si es un período cerrado válido, si no en el anterior al actual); `SelectorMes({ lugar, periodo, hoy, onCambiar })` con ‹ › ("Mes anterior" / "Mes siguiente"), texto `nombrePeriodo(p)` + año (p. ej. "1 – 31 ago 2026" o "16 dic – 15 ene 2027") y la cantidad de trabajos de ese período ("3 trabajos" / "Sin trabajos"). › deshabilitado si el siguiente es el período en curso; ‹ deshabilitado a 5 años (60 meses) de hoy.

- [ ] **Step 1: Tests:**
  - Título "Cargar meses anteriores" y subtítulo con el nombre del lugar; arranca en el período anterior al actual.
  - ‹ y › cambian de período; › deshabilitado en el anterior al actual.
  - Lugar que cierra el 15 muestra "16 sep – 15 oct 2026" (hoy fijado en fin de octubre con `vi.setSystemTime` + `toFake: ['Date']`).
  - Lista del período: trabajos ordenados por fecha con `etiquetaTrabajo` y monto, y el total "3 trabajos · $ 75.000"; tocar uno navega a `/trabajo/<id>`.
  - Período cerrado (con pago o `NO_PAGADO`): muestra "Este mes ya está cerrado." y un enlace "Ver el período" a `/lugares/<id>?periodo=<fin>`, sin fila de carga.
  - Lugar archivado o inexistente: "No encontramos este lugar." (archivado: "Este lugar está archivado.").
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar** (todavía sin fila de carga ni cierre; dejar el lugar donde irán).
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(anteriores): pantalla para elegir un mes pasado y ver lo cargado`

### Tarea 8: Fila de carga de trabajos

**Files:**
- Create: `src/ui/screens/anteriores/FilaCarga.tsx`
- Modify: `src/ui/screens/MesesAnteriores.tsx`, `src/ui/screens/MesesAnteriores.test.tsx`, `src/ui/theme.css`

**Interfaces:**
- Consumes: `diasDelPeriodo`, `calcularTrabajo` (incl. `MONTO_DIRECTO`), `guardarTrabajo` (existente), `MoneyInput`, `formatPorcentaje`, `parsePorcentaje`.
- Produces: `FilaCarga({ lugar, tipos, periodo, hoy, porcentajeBp, onPorcentaje, modo, onModo })` — el % del mes y el modo ('CLIENTE' | 'DIRECTO') viven en `MesesAnteriores` para recordarse al pasar de mes.

- [ ] **Step 1: Tests:**
  - **Día:** un `select` "Día" con los días del período (`formatFechaCorta`, p. ej. "16 dic"), sin futuros; arranca en el primer día del período y, después de agregar, queda en el día del último agregado.
  - **Arancel fijo:** elegir "Limpieza" pone el precio $ 25.000 en "Precio", editable; cambiarlo a 20.000 y "Agregar" guarda `{ tipoTrabajoId, precioLista: 2000000, monto: 2000000, descripcion: 'Limpieza', fecha }` y la fila queda vacía con el mismo día y el foco en el primer campo. "Otro…" pide nombre y precio.
  - **Porcentaje, modo cliente:** "Porcentaje de este mes" arranca en el % del lugar (40); cambiarlo a 35 y cargar pagó 100.000 guarda `porcentajeBp: 3500`, `monto: 3500000` y el lugar sigue con 4000. Se ve la cuenta ("100.000 × 35 %").
  - **Porcentaje, modo "Lo que me tocó":** selector "Anoté:" con "Lo que pagó el cliente" / "Lo que me tocó"; en "Lo que me tocó" guarda `montoCliente: null`, `descuento: null`, `porcentajeBp: null`, `monto` = lo escrito.
  - Errores en línea como en "Nuevo trabajo" (falta qué hiciste, monto inválido) y no guarda.
  - Doble toque en "Agregar" crea un solo trabajo.
  - El trabajo agregado aparece en la lista y el total se actualiza.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.** Sin campo de nota (`nota: ''`). El % y el modo pasan por props desde `MesesAnteriores`.
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(anteriores): cargar los trabajos del mes de corrido`

### Tarea 9: Cómo terminó el mes y seguir con el siguiente

**Files:**
- Create: `src/ui/screens/anteriores/CierreMes.tsx`
- Modify: `src/ui/screens/MesesAnteriores.tsx`, `src/ui/screens/MesesAnteriores.test.tsx`, `src/ui/theme.css`

**Interfaces:**
- Consumes: `cerrarMes`, `CierreMes`, `fechaPagoPropuesta` (Tareas 4–5), `SelectorFecha`.

- [ ] **Step 1: Tests:**
  - Sin trabajos no aparece la sección. Con trabajos aparece "¿Cómo terminó este mes?" con opciones "Me pagaron todo", "Me pagaron una parte", "No me pagaron", "Todavía no sé" y un botón "Listo".
  - "Me pagaron todo": muestra "Fecha del pago" con la fecha propuesta (`fechaPagoPropuesta`); "Listo" cierra el mes (pago FINAL por el total) y pasa al estado cerrado.
  - "Me pagaron una parte": pide "¿Cuánto te pagaron?"; vacío o 0 muestra "Ingresá un monto mayor a 0" y no guarda; 50.000 de 75.000 deja `deudaPlata` 25.000.
  - "No me pagaron": todos `NO_PAGADO`.
  - "Todavía no sé": muestra el texto "Este mes va a aparecer en Inicio como pago atrasado hasta que lo resuelvas." y "Listo" no escribe nada.
  - Después de cerrar: botón "Seguir con {nombre del período siguiente}" que cambia al período siguiente (y conserva % y modo de la fila); si el siguiente es el período en curso, solo "Terminar", que navega a `/lugares/<id>`.
  - Doble toque en "Listo" registra un solo pago.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(anteriores): decir cómo terminó el mes y seguir con el siguiente`

### Tarea 10: Entradas a "Cargar meses anteriores"

**Files:**
- Create: `src/ui/screens/anteriores/ElegirLugar.tsx`
- Modify: `src/ui/App.tsx` (ruta `/mas/anteriores`), `src/ui/screens/Mas.tsx`, `src/ui/screens/PeriodoLugar.tsx`, `src/ui/screens/ConfigLugar.tsx` y sus tests

**Interfaces:**
- Consumes: ruta `/lugares/:id/anteriores` (Tarea 7); `guardarLugarConTipos` devuelve el id (existente).

- [ ] **Step 1: Tests:**
  - PeriodoLugar: enlace "Cargar meses anteriores" a `/lugares/<id>/anteriores`.
  - ConfigLugar, alta de un lugar nuevo: al guardar aparece un diálogo "¿Ya trabajabas en {nombre}?" con texto "Cargá los meses anteriores para tener todo en la app." y botones "Cargar meses anteriores" (navega a `/lugares/<id>/anteriores`) y "Ahora no" (navega a `/lugares`, como hoy). Editar un lugar existente no lo muestra.
  - Más: fila "Cargar meses anteriores"; `/mas/anteriores` con un solo lugar activo redirige a su pantalla; con varios, lista para elegir; sin lugares, "Primero agregá un lugar donde trabajás" con enlace a `/lugares/nuevo`.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `npm test`, lint, build** → verde.
- [ ] **Step 5: Commit** — `feat(anteriores): entradas desde el lugar, al crear un lugar y desde Más`

### Tarea 11: Prueba de punta a punta

**Files:**
- Create: `e2e/meses-anteriores.spec.ts`

- [ ] **Step 1: Escribir el test** (mismo estilo que `e2e/flujo.spec.ts`, `page.clock.setFixedTime('2026-10-15T12:00:00-03:00')`): crear un lugar de arancel fijo con "Limpieza $ 25.000", aceptar "Cargar meses anteriores", ir a "1 – 31 jul 2026", cargar 2 trabajos (uno con precio cambiado a 20.000), "Me pagaron una parte" por 30.000 → "Seguir con 1 – 31 ago 2026", cargar 1 trabajo, "Me pagaron todo", "Terminar". En Inicio: sin avisos de pago atrasado ni tarjeta de deuda, y la línea "Te deben $ 15.000 de meses anteriores · Ver"; tocarla muestra "Me deben" con el lugar y "Diferencia en pago: $ 15.000".
- [ ] **Step 2: Correr** `npx playwright test e2e/meses-anteriores.spec.ts` → pasa en `android` e `iphone`.
- [ ] **Step 3: `npm test`, lint, build** → verde.
- [ ] **Step 4: Commit** — `test(e2e): cargar meses anteriores y ver las deudas viejas`

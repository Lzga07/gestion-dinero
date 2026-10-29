# Cargar meses anteriores y deudas viejas — Documento de diseño

Fecha: 2026-10-28
Estado: borrador para revisión
Complementa a `2026-10-27-gestion-dinero-design.md` (conceptos de lugar, período, trabajo, pago, deuda y avisos).

Las marcas **[decisión del diseñador]** señalan cosas que no definió la persona sino que se resolvieron durante el diseño; pueden revisarse.

---

## 1. Para qué es y por qué

La app está pensada para anotar el trabajo del día. Pero quien recién empieza a usarla tiene meses de trabajo **anotados en un cuaderno, trabajo por trabajo, con el día, qué hizo y el precio**, y quiere pasarlos a la app (por ejemplo, todo lo del año, mes por mes, desde enero). Hoy eso es confuso: hay que entrar a "Nuevo trabajo" una vez por trabajo, elegir la fecha cada vez, y al terminar Inicio se llena de avisos de "sin pago registrado" de cada mes viejo.

Además, una deuda (lo que un lugar no pagó) hoy queda como tarjeta en Inicio para siempre hasta cobrarla. Con meses viejos cargados, Inicio quedaría tapado de deudas antiguas.

Dos partes, en este orden:

1. **Deudas viejas → "Me deben".** Las deudas de hace más de 2 meses salen de las tarjetas de Inicio y pasan a una pantalla propia. En Inicio queda una sola línea discreta.
2. **Cargar meses anteriores.** Una pantalla aparte, separada del uso diario, para cargar los trabajos de un mes pasado de corrido y decir cómo terminó ese mes (me pagaron todo, una parte, nada, o todavía no sé).

Se hace primero la parte 1 para que lo que se cargue del cuaderno ya caiga en "Me deben" y no en Inicio.

**Éxito:** alguien con un cuaderno de meses puede pasarlo a la app mes por mes sin entrar y salir de pantallas por cada trabajo, y al terminar Inicio sigue mostrando solo lo de ahora (más una línea con lo que le deben de antes).

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Cargar los trabajos de un mes pasado uno tras otro en una misma pantalla, con pocos toques por trabajo.
- Decir cómo terminó ese mes y que la app lo deje conciliado (pagado, deuda o pendiente) con la misma lógica que ya usa.
- Que las deudas viejas no invadan Inicio pero no se pierdan: siguen reclamables desde "Me deben".

**No-objetivos**
- Importar desde un archivo, una foto del cuaderno o texto pegado.
- Cargar el mes en curso desde esta pantalla (para eso está "Anotar trabajo", que ahora tiene el selector de fecha con calendario).
- Cambiar cómo termina un mes ya cerrado desde esta pantalla (para eso están el período del lugar y sus acciones actuales: borrar pago, volver a pendiente, etc.).

**Anti-objetivos (sería un fracaso aunque funcione)**
- Que cargar el pasado llene Inicio de avisos viejos.
- Tener que entrar y salir de pantallas por cada trabajo del cuaderno.
- Perder trabajos ya cargados si la app se cierra a mitad de un mes.
- Que una deuda vieja desaparezca sin dejar rastro en Inicio (tiene que quedar la línea).

## 3. Parte 1 — Deudas viejas y la pantalla "Me deben"

### 3.1 Qué es una deuda vieja
Una deuda es, como hoy, un trabajo `NO_PAGADO` o una diferencia en plata de un período cerrado con "es todo lo que me van a pagar" (`resumenPeriodo().deudaPlata`). Cada deuda pertenece al período de su lugar.

**Deuda vieja:** la de un período cuyo cierre (`periodo.fin`) fue hace **más de 2 meses**: hoy > `periodo.fin` + 2 meses (mismo día dos meses después, acotado a fin de mes). **[decisión del diseñador]** el límite exacto; la persona pidió "si pasa más de 1 mes o un par de meses".

Aplica a **todas** las deudas, no solo a las cargadas desde el cuaderno: una deuda de hoy, al cumplir 2 meses, también pasa a "Me deben".

### 3.2 Inicio
- La tarjeta de deuda de cada lugar ("Clínica: te deben $ X", con "Ya me lo pagaron" y "Compartir reclamo") pasa a incluir **solo las deudas recientes** de ese lugar. Si un lugar tiene solo deudas viejas, no tiene tarjeta.
- Si hay deudas viejas (de cualquier lugar, incluidos los archivados), Inicio muestra **una sola línea discreta**: *"Te deben $ 85.000 de meses anteriores · Ver"*, que lleva a "Me deben". Va después de las tarjetas de avisos. **[decisión del diseñador]** la ubicación y el texto exacto.

### 3.3 Pantalla "Me deben"
- Ruta propia (p. ej. `/mas/me-deben`). Se llega desde la línea de Inicio, desde **Más → "Me deben"** y desde la pantalla del período de un lugar cuando ese lugar tiene deudas.
- Muestra **todas** las deudas, recientes y viejas, para tener la vista completa en un lugar **[decisión del diseñador]**: agrupadas por lugar (con el total del lugar) y, dentro de cada lugar, por período (del más viejo al más nuevo), con los trabajos `NO_PAGADO` y las diferencias en plata de cada período.
- Por lugar, las mismas acciones de hoy: **"Ya me lo pagaron"** (el diálogo actual de cobrar deuda, con todas las deudas de ese lugar) y **"Compartir reclamo"** (el PDF de reclamo actual, con todas las deudas de ese lugar).
- Sin deudas: un texto tranquilo, "No te deben nada".
- Incluye lugares archivados (una deuda no se pierde por archivar el lugar, como hoy).

## 4. Parte 2 — Cargar meses anteriores

### 4.1 Cómo se llega
- **Desde la pantalla de cada lugar** (período del lugar): botón "Cargar meses anteriores".
- **Al crear un lugar nuevo:** al guardarlo, la app pregunta *"¿Ya trabajabas en {lugar}? Cargá los meses anteriores"* con "Cargar meses anteriores" y "Ahora no". Es el momento en que más se necesita.
- **Desde Más:** "Cargar meses anteriores", que primero pide elegir el lugar (si hay uno solo activo, va directo).

### 4.2 Elegir el mes
- Siempre es **un lugar y uno de sus períodos**. El "mes" es el período del lugar: si cierra el último día es "Enero 2026"; si cierra el 15 es "16 dic – 15 ene", con el nombre que ya usa la app (`nombrePeriodo`).
- Solo **períodos ya cerrados** (el `fin` es anterior a hoy). El período en curso no se ofrece.
- Selector con flechas ‹ › entre períodos, como el calendario del selector de fecha, arrancando en el período anterior al actual **[decisión del diseñador]**. Al lado de cada período se ve si ya tiene trabajos cargados y cuántos. Se puede ir hacia atrás hasta 5 años **[decisión del diseñador]**.
- Solo lugares activos: un lugar archivado no se ofrece (se puede desarchivar para cargarle meses) **[decisión del diseñador]**.
- **Un período que ya tiene algún pago o algún trabajo `NO_PAGADO` está cerrado:** se muestra su resumen y un enlace "Ver el período", pero no se cargan trabajos ahí desde esta pantalla **[decisión del diseñador]**: así esta pantalla nunca tiene que resolver "trabajos olvidados" en un período ya pagado. Para agregar a un período cerrado está "Anotar trabajo", que ya pregunta "¿Este trabajo ya te lo pagaron?".

### 4.3 Cargar los trabajos del mes
- Una fila de carga corta, siempre visible arriba de la lista:
  - **Día:** se elige entre los días del período (solo el número, o "16 dic" si el período cruza de mes), sin escribir. No ofrece días futuros. Arranca en el día del último trabajo cargado en esa sesión **[decisión del diseñador]**, porque el cuaderno va en orden.
  - **Arancel fijo:** "¿Qué hiciste?" con la lista de trabajos del lugar más "Otro…". Al elegir un trabajo de la lista, el **precio** aparece solo pero **se puede cambiar** (el cuaderno puede tener precios viejos). Con "Otro…", nombre y precio a mano.
  - **Porcentaje:** el cuaderno a veces tiene **lo que pagó el cliente** y a veces **directamente lo que le tocó a la persona** (las dos cosas, decisión de la persona). La fila tiene un selector chico "Anoté: Lo que pagó el cliente · Lo que me tocó":
    - *Lo que pagó el cliente:* qué hiciste (texto), lo que pagó el cliente y el descuento opcional; la app calcula lo que te corresponde con el porcentaje del mes (abajo) y muestra la cuenta, igual que hoy.
    - *Lo que me tocó:* qué hiciste (texto) y el monto que le tocó, sin cuenta. Se guarda como un trabajo de ese lugar sin monto del cliente (`montoCliente`, `descuento` y `porcentajeBp` en `null`, `monto` = lo escrito).
    - El selector recuerda la última opción usada en la sesión **[decisión del diseñador]**.
  - **El porcentaje puede haber sido otro en meses viejos** (decisión de la persona). En un lugar por porcentaje, arriba de la fila se ve **"Porcentaje de este mes: 40 %"**, editable, que arranca en el porcentaje actual del lugar y, al pasar al mes siguiente, en el último usado **[decisión del diseñador]**: el porcentaje cambia de una época a otra, no trabajo por trabajo. Cambiarlo acá **no** cambia el porcentaje del lugar; cada trabajo guarda el suyo (`porcentajeBp`), como ya hace la app.
  - **Editar un trabajo cargado "lo que me tocó"** (sin monto del cliente) desde la pantalla normal de editar trabajo tiene que funcionar: en un lugar por porcentaje, si el trabajo no tiene monto del cliente, se muestra y se edita su monto directo en vez de pedir lo que pagó el cliente. Lo mismo vale para el listado en PDF: ese trabajo muestra su monto sin cuenta.
  - Sin campo de nota **[decisión del diseñador]**: el cuaderno no la tiene; se puede agregar después editando el trabajo.
  - Botón **"Agregar"**: guarda el trabajo **en ese momento** (no al final del mes), deja la fila lista para el siguiente (mismo día, el resto vacío) y lleva el foco al primer campo.
- Debajo, **la lista de trabajos del mes** ordenada por día, con la cantidad y el **total** ("12 trabajos · $ 480.000"). Tocar un trabajo abre la pantalla normal de editar trabajo (corregir o borrar) y al volver se sigue cargando **[decisión del diseñador]**.
- Un trabajo de la lista con precio cambiado respecto de la lista guarda ese precio como su precio de lista (es el precio que tenía cuando se hizo), así nada cambia solo después.

### 4.4 Cómo terminó el mes
Debajo de la lista, una vez que hay al menos un trabajo: **"¿Cómo terminó este mes?"**
- **Me pagaron todo:** registra un pago `FINAL` por el total, con todos los trabajos del período tildados. Quedan `PAGADO`.
- **Me pagaron una parte:** pide **cuánto** (menor al total; si es igual o mayor, se trata como "todo"). Registra un pago `FINAL` con todos los trabajos tildados: la diferencia queda como **deuda en plata del período**, igual que hoy "es todo lo que me van a pagar". Si el período es viejo (más de 2 meses), esa deuda va directo a "Me deben".
- **No me pagaron:** todos los trabajos del período pasan a `NO_PAGADO` (la acción "No me pagaron" actual). Quedan como deuda.
- **Todavía no sé:** no registra nada; los trabajos quedan `PENDIENTE`, como un mes normal. Como la ventana de pago ya pasó, ese mes **sí** aparece en Inicio con su aviso de pago atrasado, igual que cualquier mes impago sin resolver. Se avisa en pantalla antes de elegirlo **[decisión del diseñador]**.
- **Fecha del pago** (para "todo" y "una parte"): viene propuesta en el primer día del rango de pago del lugar para ese período (`ventanaPago(fin).desde`), acotada a hoy si cayera en el futuro **[decisión del diseñador]**. Se puede cambiar con el selector de fecha nuevo. No hace falta precisión.
- Al confirmar, el período queda cerrado (ver 4.2) y la pantalla ofrece **"Seguir con {mes siguiente}"** (el período siguiente, hacia hoy, porque el cuaderno se carga de enero en adelante) o "Terminar". Si el siguiente es el período en curso, solo "Terminar", que vuelve a la pantalla del lugar.

### 4.5 Lo que no cambia
- Los trabajos cargados acá son trabajos normales: aparecen en Movimientos, Estadísticas, el período del lugar, listados y copias de seguridad.
- Las operaciones que tocan varias filas (registrar el pago del mes, "no me pagaron") van en una transacción, como hoy.

## 5. Calidad

- La regla de "deuda vieja" y el reparto entre tarjetas de Inicio, la línea y "Me deben" van en el dominio (junto a `calcularAvisos`) con tests unitarios: límite de 2 meses (justo el día, un día antes y uno después), fin de mes corto, lugar con deudas solo viejas, solo recientes y mezcladas, lugares archivados.
- Pantallas con tests de interfaz como las actuales: cargar varios trabajos seguidos, cambiar el precio de lista, en porcentaje cargar por lo que pagó el cliente y por lo que me tocó, cambiar el porcentaje del mes sin tocar el del lugar, editar después un trabajo "lo que me tocó", cada una de las cuatro formas de terminar el mes, período ya cerrado, ir al mes siguiente, y que Inicio no muestre avisos de los meses cargados y cerrados.
- Un test de punta a punta (Playwright, Android y iPhone): crear un lugar, aceptar "cargar meses anteriores", cargar dos meses (uno pagado entero, uno con pago parcial de hace más de 2 meses) y comprobar Inicio y "Me deben".
- Todo en español rioplatense, sin nada específico de un rubro.

## 6. Lo que queda a criterio del builder

- Ruta exacta de las pantallas y nombres internos.
- Diseño fino de la fila de carga, la lista y el selector de períodos, respetando la dirección visual actual (chips, tarjetas, selector de fecha).
- Cómo reusar el diálogo de cobrar deuda y el PDF de reclamo para "Me deben" (con todas las deudas del lugar en vez de solo las del aviso).
- Si la pregunta al crear un lugar es un diálogo o una tarjeta en la pantalla del lugar recién creado.

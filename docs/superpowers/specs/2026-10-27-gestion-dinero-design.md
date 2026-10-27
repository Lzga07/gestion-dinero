# Gestión Dinero — Documento de diseño

Fecha: 2026-10-27
Estado: borrador para revisión

Las marcas **[decisión del diseñador]** señalan cosas que no definió la usuaria/el usuario sino que se resolvieron durante el diseño; pueden revisarse.

---

## 1. Para qué es y por qué

Una persona trabaja en varios lugares (la primera usuaria es odontóloga en varias clínicas y consultorios). Cada trabajo que hace en cada lugar le genera un ingreso, y a fin de período el lugar le paga. Hoy anota los trabajos en papel o en las notas del celular y:

- se le pierden trabajos;
- no puede verificar si el dueño del lugar le pagó todos los trabajos;
- algunos lugares le dan una liquidación con detalle, otros solo un monto total, y en otros ella misma tiene que mostrar lo que hizo.

La app resuelve eso: **anotar cada trabajo en el momento, saber cuánto le corresponde por lugar y en total, comprobar cada pago contra lo trabajado y reclamar lo que falte.** Además funciona como control de su plata personal: gastos (de trabajo y personales), otros ingresos, saldo del mes y estadísticas.

**Éxito:** deja el papel y las notas; al llegar la fecha de pago de cada lugar sabe exactamente cuánto le deben, detecta lo que no le pagaron y lo puede reclamar con un listado.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Cargar un trabajo en pocos toques, en el momento.
- Lugares configurables a mano por la persona, cada uno con su forma de cobro, su día de cierre y su rango de pago.
- Ver lo que le corresponde por lugar (por período del lugar) y en general (mes calendario).
- Registrar pagos marcando qué trabajos le pagaron y cuáles no; seguir los pendientes de reclamar.
- Avisar cuando pasó el rango de pago de un lugar y no hay pago registrado.
- Generar un listado compartible (por período y de reclamo).
- Gastos y otros ingresos con categorías; saldo del mes; estadísticas.
- Copia de seguridad manual con recordatorio.
- Interfaz agradable y sencilla.
- **Funcionar en iPhone y en Android** (la primera usuaria usa iPhone).
- Costo cero: nada pago (ni cuentas de desarrollador, ni hosting, ni servicios).

**No-objetivos (por ahora)**
- Publicar en tiendas (App Store / Play Store).
- App nativa instalable (ver sección 3.1: queda pendiente para más adelante).
- Notificaciones push del sistema (ver 5.2).
- Varias monedas (todo en pesos argentinos).
- Varios usuarios, cuentas o sincronización entre dispositivos.
- Copia automática a Google Drive (solo manual).
- Servidor o backend de cualquier tipo.

**Anti-objetivos (sería un fracaso aunque funcione)**
- **Perder datos.** Es la razón de la app.
- Cualquier texto, campo o lógica específica de odontología. La app habla de "lugares", "trabajos", "cliente/paciente" solo como texto genérico ("lo que pagó el cliente"). Nada hardcodeado para un rubro.
- Una carga de trabajo lenta o con muchos pasos: si anotar cuesta más que escribirlo en papel, no lo va a usar.
- Montos que cambian solos en el pasado (por ejemplo, al editar un precio de la lista).

## 3. Restricciones técnicas

- **App web instalable (PWA)**, decisión de la persona. Originalmente se pensó en Android nativo con Java; se descartó porque la primera usuaria usa iPhone e instalar apps propias en iPhone sin pagar la cuenta de desarrollador de Apple (USD 99/año) obliga a renovarlas cada 7 días.
- Se publica gratis como sitio estático (GitHub Pages desde el repo, o Cloudflare Pages / Netlify si el repo es privado, porque GitHub Pages gratis requiere repo público). Sin servidor propio: el sitio solo entrega los archivos de la app.
- La persona la abre en Safari (iPhone) o Chrome (Android) y la agrega a la pantalla de inicio. Desde ahí abre a pantalla completa, como una app.
- **Funciona sin internet** (service worker con todo en caché) y los **datos quedan solo en el dispositivo** (IndexedDB). Nunca se envían a ningún lado.
- Se ve y funciona bien en iPhone (Safari iOS 16.4+) y Android (Chrome reciente). Diseñada para celular. En computadora se ve centrada con ancho de celular.
- Todo en pesos argentinos, formato `$ 1.234.567` (es-AR). Los centavos se guardan pero no se muestran salvo que existan.
- Repositorio: `https://github.com/Lzga07/gestion-dinero.git`, rama `main`.

**[decisión del diseñador]** Stack sugerido: TypeScript, Vite, React, Dexie (IndexedDB), vite-plugin-pwa (Workbox) para el modo sin conexión, una librería de PDF del lado del cliente (pdf-lib o jsPDF) y una de gráficos liviana (Chart.js o similar). El builder puede cambiar librerías puntuales si hay una razón concreta. La lógica de dominio va en TypeScript puro, sin depender de React ni del navegador, para poder testearla y reutilizarla.

### 3.1 Pendiente para más adelante: app nativa en Android e iPhone

La persona dejó explícito que **la app tiene que servir tanto en Android como en iOS**, y que la forma de tenerla como app "de verdad" (notificaciones del sistema, Face ID / huella, menos riesgo de que se borren los datos) **se resuelve después**. Para no cerrar esa puerta:
- El código no debe depender de nada que impida empaquetarlo más adelante con una herramienta como Capacitor (que convierte la misma app web en app de Android e iPhone).
- El acceso a lo que cambiaría con una app nativa (guardar datos, notificaciones, bloqueo, compartir archivos) va detrás de una capa propia y chica, para poder cambiar la versión web por la nativa sin tocar el resto.
- El formato de la copia de seguridad es el mismo en cualquier versión, para pasar los datos de la app web a la futura app nativa restaurando una copia.

## 4. Conceptos del dominio

### 4.1 Lugar
Donde la persona trabaja. Lo crea y edita ella.

| Campo | Notas |
|---|---|
| Nombre | Texto libre. |
| Forma de cobro | `ARANCEL_FIJO` o `PORCENTAJE`. |
| Porcentaje | Solo si es `PORCENTAJE` (ej. 40 %). Admite decimales (ej. 37,5 %). |
| Lista de trabajos y precios | Solo si es `ARANCEL_FIJO`: pares nombre → precio. Editable. |
| Día de cierre | 1–31 o "último día del mes". |
| Rango de pago | Día desde – día hasta, **del mes siguiente al cierre del período** (ej. del 21 al 31). |
| Archivado | Un lugar con trabajos no se borra: se archiva (deja de aparecer en Inicio y al anotar, pero su historial queda). Un lugar sin trabajos se puede borrar. **[decisión del diseñador]** |

**Período de un lugar.** Con día de cierre D, el período va del día D+1 del mes anterior al día D del mes actual. Con "último día del mes", el período es el mes calendario. Si D no existe en un mes (ej. 31 en noviembre), se usa el último día de ese mes. El período se nombra por el mes en que cierra.

**Rango de pago.** Para un período que cierra en el mes M, el pago se espera entre el día X y el día Y del mes M+1 (si Y no existe en ese mes, se usa el último día). Ejemplo real de la usuaria: cierra el último día del mes, le pagan del 21 al 31 del mes siguiente.

Cambiar el día de cierre o la forma de cobro de un lugar no altera trabajos ya anotados. **[decisión del diseñador]** Un cambio de día de cierre aplica **desde el próximo período**: el período abierto termina en la fecha que tenía al momento del cambio, y el siguiente arranca al otro día y cierra en el nuevo día de cierre (puede quedar un período de transición más largo o más corto). Los períodos cerrados no se reacomodan. Un cambio en el rango de pago aplica a todos los períodos que todavía no tienen pago registrado. El builder decide cómo guardar ese historial.

### 4.2 Trabajo
Un trabajo hecho en un lugar.

| Campo | Notas |
|---|---|
| Lugar | Obligatorio. |
| Fecha | Por defecto hoy. Puede ser pasada. |
| Qué hizo | En arancel fijo: elegido de la lista del lugar, o "Otro…" con nombre y monto a mano. En porcentaje: texto libre. |
| Lo que pagó el cliente | Solo porcentaje. |
| Descuento antes del % | Solo porcentaje, opcional: monto + motivo libre (laboratorio, materiales…). |
| Nota | Opcional, texto libre (ej. nombre o referencia). |
| Te corresponde | Calculado y **guardado** al momento de anotar. |
| Estado de pago | `PENDIENTE` (aún no hubo pago), `PAGADO`, `NO_PAGADO` (pendiente de reclamar). |

**Cálculo.**
- Arancel fijo: te corresponde = precio de la lista (o el monto escrito en "Otro…").
- Porcentaje: te corresponde = (pagó el cliente − descuento) × porcentaje. Se muestra la cuenta en pantalla: `(200.000 − 50.000) × 40 % = $ 60.000`.
- El precio de lista, el porcentaje y el resultado se guardan en el trabajo (copia), así cambiar la lista o el % del lugar no modifica trabajos anteriores.
- **[decisión del diseñador]** Montos guardados como enteros en centavos; el resultado del porcentaje se redondea al centavo (mitad hacia arriba). El descuento no puede superar lo que pagó el cliente.

### 4.3 Pago
Lo que un lugar le pagó por un período.

| Campo | Notas |
|---|---|
| Lugar y período | |
| Monto recibido | |
| Fecha | |
| Trabajos incluidos | Los trabajos que este pago cubre. |
| Nota | Opcional. |

Puede haber más de un pago por período (pagos en partes). **[decisión del diseñador]**

**[decisión del diseñador]** Un pago pertenece a un lugar, no a un único período: su lista para tildar muestra los trabajos sin pagar del período elegido **y también** los trabajos `PENDIENTE` o `NO_PAGADO` de períodos anteriores del mismo lugar (agrupados por período, estos últimos destildados por defecto). Así una sola transferencia real que incluye trabajos atrasados se registra una sola vez. El "cobrado" de cada período es la suma de sus trabajos pagados.

### 4.4 Movimiento (gasto u otro ingreso)
| Campo | Notas |
|---|---|
| Tipo | `GASTO` o `INGRESO`. |
| Monto, fecha, categoría | Obligatorios. |
| Nota | Opcional. |

### 4.5 Categoría
Creadas y editables por la persona. Cada categoría es de gasto o de ingreso; las de gasto están marcadas como **de trabajo** o **personal**. Tiene un ícono o emoji y un color.

**[decisión del diseñador]** Categorías iniciales (editables y borrables):
- Gasto · trabajo: Materiales, Traslado, Cursos, Otros de trabajo.
- Gasto · personal: Supermercado, Alquiler, Servicios, Salud, Ocio, Otros personales.
- Ingreso: Otros ingresos.

Una categoría que ya tiene movimientos no se borra directamente: se pide elegir otra categoría a la que pasarlos.

## 5. Comportamiento clave

### 5.1 Registrar un pago (conciliación)
1. Desde el período de un lugar (o desde un aviso), "Registrar pago".
2. Escribe el monto recibido y la fecha.
3. Aparecen todos los trabajos del período que aún no están pagados, **todos tildados**. Destilda los que no le pagaron.
4. La app muestra lo esperado (suma de los trabajos del período sin pagar), lo recibido y la diferencia, y cuántos trabajos quedan sin pagar.
5. Al guardar: los tildados pasan a `PAGADO` y quedan asociados al pago; los destildados pasan a `NO_PAGADO` (pendientes de reclamar).

**Cuando el monto no cierra** (lo recibido es menor que la suma de los tildados, o hay trabajos destildados), antes de guardar la app pregunta (decisión de la persona):
- **"Es un pago a cuenta, falta el resto":** los trabajos destildados quedan `PENDIENTE` (no son deuda todavía, no generan aviso de reclamo) y la diferencia en plata queda como "a cuenta, falta cobrar" en el período. El próximo pago del período los vuelve a ofrecer en la lista. Si termina el rango de pago y siguen pendientes, entran en el aviso de "trabajos sin conciliar".
- **"Es todo lo que me van a pagar":** los destildados pasan a `NO_PAGADO`, y si además el monto recibido es menor que la suma de los tildados, esa **diferencia en plata** queda como **deuda reclamable del período** (sin estar atada a un trabajo puntual). Aparece en el aviso de Inicio y en el listado de reclamo como "Diferencia en pago del DD/MM: $ X".

Si lo recibido es mayor que lo esperado, se guarda igual y se muestra la diferencia a favor; no genera aviso. "Falta cobrar" de un período = te corresponde − cobrado en plata (no por cantidad de trabajos).

Un trabajo `NO_PAGADO` puede luego marcarse "Ya me lo pagaron" (con fecha y monto, por defecto su monto), que lo pasa a `PAGADO`. **[decisión del diseñador]** Esto se registra como un pago adicional del mismo período.

### 5.2 Avisos de pago
**Cómo avisa una app web.** En iPhone, una app web no puede programar notificaciones sin un servidor. Por eso, en esta versión los avisos aparecen **al abrir la app**, arriba de todo en Inicio. Para que el celular le avise aunque no abra la app, cada lugar ofrece **"Agregar al calendario"**: genera un archivo de calendario (.ics) con un evento mensual repetido el último día del rango de pago ("Revisar pago de Clínica Centro") y una alarma. Ella lo abre y queda en el calendario del iPhone o Android. Si cambia el rango de pago, la app sugiere volver a agregarlo. **[decisión del diseñador]**

- **Pago atrasado:** si terminó el rango de pago de un período, el período tiene trabajos, y no hay ningún pago registrado ni se marcó "No me pagaron", aparece un aviso en Inicio. El aviso ofrece "Registrar pago" y "No me pagaron".
- **"No me pagaron":** deja todos los trabajos del período como `NO_PAGADO` y el aviso de atraso desaparece. A partir de ahí se ve como deuda.
- **Trabajos sin pagar:** mientras un lugar tenga trabajos `NO_PAGADO`, aparece un aviso en Inicio con el monto y las opciones "Ya me lo pagaron" y "Compartir reclamo".
- **Trabajos olvidados:** **[decisión del diseñador]** si se anota un trabajo con fecha en un período que ya tiene un pago registrado, al guardar la app pregunta "¿Este trabajo ya te lo pagaron?" (Sí → `PAGADO` como pago adicional; No → `NO_PAGADO`; Todavía no sé → queda `PENDIENTE`). Además, cualquier trabajo `PENDIENTE` de un período cuyo rango de pago ya terminó entra en el aviso de "trabajos sin conciliar" de Inicio, para que ninguno quede olvidado.
- Los avisos se recalculan cada vez que se abre la app o vuelve a primer plano.

### 5.3 Listados compartibles
- **Listado del período:** lugar, período, cada trabajo (fecha, qué hizo, nota, lo que pagó el cliente y el descuento si aplica, te corresponde), total, y lo cobrado si hubo pagos.
- **Listado de reclamo:** igual, pero solo los trabajos `NO_PAGADO`.
- Se genera un PDF en el dispositivo y se abre el menú de compartir del celular (WhatsApp, mail, Drive…) con la Web Share API. Si el navegador no lo permite, se descarga el PDF.
- **[decisión del diseñador]** Al compartir se puede elegir si incluir las notas (pueden tener nombres de pacientes). Por defecto, incluidas.

### 5.4 Saldo y totales
- **Inicio (vista general, mes calendario):** ganado = suma de "te corresponde" de los trabajos con fecha en el mes + otros ingresos del mes; gastos del mes; saldo = ganado − gastos. **[decisión del diseñador]** El saldo se calcula sobre lo ganado (devengado), no sobre lo cobrado; lo cobrado se ve por lugar.
- **Por lugar (período del lugar):** te corresponde (total del período), cobrado, falta cobrar.
- **Estadísticas:** por mes calendario según la fecha del trabajo.

### 5.5 Editar y borrar
Todo se puede editar y borrar (trabajos, pagos, movimientos, categorías, lugares con las reglas de arriba). Borrar pide confirmación.
- **[decisión del diseñador]** Editar o borrar un trabajo que ya está en un pago avisa que cambia la conciliación de ese período. Borrar un pago devuelve sus trabajos a `PENDIENTE`.

### 5.6 Bloqueo
La persona pidió huella o PIN al abrir. En la versión web eso se resuelve con un **PIN propio de la app** (4 a 6 dígitos), porque la huella o Face ID desde la web es rebuscada y poco confiable en iPhone. La huella o Face ID real queda para la app nativa (3.1).
- Se configura en el primer uso (se puede omitir) y desde "Más". Se guarda solo un hash del PIN (WebCrypto, PBKDF2 con sal), nunca el PIN.
- **[decisión del diseñador]** Lo pide al abrir y al volver después de más de 1 minuto en segundo plano.
- Es una **pantalla de privacidad**, no un cifrado: impide que alguien que agarra el celular vea los datos, pero los datos en el dispositivo no están cifrados. El documento y la app lo dicen así, sin prometer más.
- **[decisión del diseñador]** "Olvidé mi PIN" **nunca borra datos** (perder datos es el anti-objetivo principal). Permite quitar el PIN después de una confirmación explícita y una espera de 1 minuto con la explicación de por qué. Es suficiente contra la mirada casual, que es lo que busca la persona.

### 5.7 Copia de seguridad
En una app web la copia es **todavía más importante**: si ella borra el ícono de la pantalla de inicio, o borra los datos de navegación de ese sitio, se pierde todo lo que no esté copiado.
- **Hacer copia:** genera un único archivo y abre el menú de compartir del celular (Web Share API) para guardarlo en Google Drive, Archivos de iPhone, etc. Si el navegador no lo permite, se descarga. Nombre sugerido: `gestion-dinero-AAAA-MM-DD.json`.
- **Restaurar:** elige un archivo de copia; la app muestra su fecha y cuántos datos tiene, pide confirmación y **reemplaza** todos los datos actuales.
- **Recordatorio:** si pasaron N días (por defecto 7, configurable, o desactivado) desde la última copia, un aviso visible en Inicio (no solo en "Más") con el botón "Hacer copia ahora". **[decisión del diseñador]**
- **[decisión del diseñador]** La app pide almacenamiento persistente al navegador (`navigator.storage.persist()`) para reducir el riesgo de que el sistema borre los datos.
- **[decisión del diseñador]** **Instalación guiada:** si la app se abre en una pestaña normal del navegador (no desde el ícono), muestra cómo agregarla a la pantalla de inicio, con instrucciones para iPhone y para Android, y avisa que los datos de la pestaña y los del ícono son distintos en iPhone, así que hay que usar siempre el ícono.
- **Sin contraseña ni cifrado** (decisión de la persona: el riesgo de olvidar la contraseña y perder todo pesa más; la copia queda en su propia cuenta de Google).
- **[decisión del diseñador]** Formato: JSON con número de versión de esquema, para que copias viejas se puedan restaurar en versiones nuevas de la app. Antes de restaurar se valida el archivo completo; si algo falla, no se toca nada.

## 6. Pantallas

Maquetas aprobadas en `docs/superpowers/mockups/` (abrir los `.html` en el navegador; son fragmentos, se ven sin estilos de marco pero legibles). Son bocetos de estructura y tono, no diseño final pixel a pixel.

Navegación inferior con 5 pestañas: **Inicio · Movimientos · Lugares · Estadísticas · Más**.

1. **Inicio** (`inicio.html`, opción A, la elegida): saldo del mes hasta hoy (grande), ganado y gastos; avisos (pago atrasado, trabajos sin pagar); una tarjeta por lugar activo con el total del período en curso, cantidad de trabajos y cuándo cierra. Botón flotante "+ Anotar trabajo". Tocar una tarjeta abre el lugar.
2. **Anotar trabajo** (`anotar-trabajo.html`): lugar (por defecto el último usado **[decisión del diseñador]**), fecha, qué hizo, campos según forma de cobro, nota, y el resultado "Te corresponde" visible en todo momento con la cuenta.
3. **Lugares**: lista de lugares activos (y archivados aparte), "+ Agregar lugar".
4. **Período del lugar** (`lugar.html`, izquierda): selector de período (actual, anteriores, historial), te corresponde / cobrado / falta cobrar, lista de trabajos con su estado de pago, botones "Compartir listado" y "Registrar pago".
5. **Configurar lugar** (`lugar.html`, derecha): nombre, forma de cobro, % o lista de precios, día de cierre, rango de pago.
6. **Registrar pago** (`registrar-pago.html`, izquierda).
7. **Movimientos** (`movimientos-estadisticas.html`, izquierda): lista por día con trabajos, otros ingresos y gastos; filtro Todo / Ingresos / Gastos y selector de mes. "+ Nuevo" pregunta: trabajo, gasto u otro ingreso.
8. **Nuevo gasto / ingreso**: monto, fecha, categoría, nota.
9. **Estadísticas** (`movimientos-estadisticas.html`, derecha): barras por mes apiladas por lugar (cuánto gana en cada lugar), y ranking de categorías de gasto del mes elegido (con filtro trabajo/personal). Tocar un mes o categoría abre el detalle.
10. **Más**: copia de seguridad (hacer, restaurar, última copia, recordatorio), categorías, PIN, lugares archivados, "Agregar al calendario" de cada lugar, cómo instalar la app.

**Dirección visual:** fondo blanco cálido (#f6f4ef), tarjetas blancas redondeadas, acento verde profundo (#25685b) para ingresos y acciones, terracota (#9e4430) para gastos, deudas y diferencias. Tipografía del sistema, números grandes y claros. Contraste WCAG AA. Todo el texto en español rioplatense ("vos").

## 7. Calidad

- La lógica de dominio (períodos, rangos de pago, cálculo de montos, redondeo, conciliación, detección de atrasos, exportar/importar copia) va separada de la interfaz y del navegador, con tests unitarios.
- Se prueba en Safari de iPhone (o su simulación más fiel disponible) y en Chrome de Android, en modo instalado y sin conexión.
- Fechas: todo en hora local del dispositivo; las fechas de trabajos se guardan como fecha calendario (sin hora) para que no cambien de día por zona horaria.
- Casos borde a cubrir con tests: día de cierre 29/30/31 en meses cortos y febrero bisiesto; rango de pago que cae en un mes más corto; período sin trabajos (no genera aviso); varios pagos en un período; restaurar una copia inválida o de versión anterior.
- Ningún dato se escribe a medias: las operaciones que tocan varias filas (registrar pago, restaurar) van en transacción.

## 8. Lo que queda a criterio del builder

- Arquitectura interna, estructura de paquetes y nombres.
- Librerías puntuales dentro del stack sugerido.
- Diseño visual fino a partir de las maquetas (espaciados, íconos, animaciones), respetando la dirección visual.
- Formato y diseño exacto del PDF.
- Selección de íconos/emojis para categorías.
- Cómo modelar en la base el historial de días de cierre.
- Ícono de la app y pantalla de inicio de la PWA.

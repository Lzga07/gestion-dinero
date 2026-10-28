# Gestión Dinero

App: https://lzga07.github.io/gestion-dinero/

Sirve para llevar tu plata en el celular: anotás los trabajos que hacés en cada lugar, la app calcula lo que te corresponde por período, registrás los pagos que te hacen y te avisa cuando algo no cierra (un pago atrasado, una diferencia, una deuda). También tiene movimientos de gastos e ingresos, estadísticas y listados en PDF para compartir o reclamar. Funciona sin conexión y no manda ningún dato a ningún lado.

## Instalarla en el iPhone

1. Abrí el link en **Safari**.
2. Tocá **Compartir** y después **Agregar a inicio**.
3. Abrí la app desde el ícono nuevo.

Importante: en iPhone, los datos que cargues en la pestaña de Safari **no aparecen** en la app instalada (son almacenamientos distintos). Instalala antes de cargar nada y usá siempre el ícono.

## Instalarla en Android

1. Abrí el link en **Chrome**.
2. Tocá el menú **⋮** y después **Instalar app**.
3. Abrila desde el ícono nuevo.

En Android la copia de seguridad y el archivo del calendario se **descargan** (no se comparten directamente como en iPhone): después tenés que pasar la copia a Drive u otro lugar a mano.

## Hacé copias de seguridad

Tus datos viven **solo en tu celular**. Si perdés el teléfono, desinstalás la app o borrás los datos del navegador, se pierden. Hacé una copia desde **Más → Copia de seguridad** cada tanto y guardala en otro lado (Drive, iCloud, mail). La app te lo recuerda.

## Desarrollo

```
npm i
npm run dev      # servidor de desarrollo
npm test         # tests unitarios y de pantallas (vitest)
npm run e2e      # prueba de punta a punta en iPhone (WebKit) y Android (Chromium)
npm run build    # compila a dist/
npm run lint
```

La primera vez, para `npm run e2e`: `npx playwright install webkit chromium`.

Se publica sola en GitHub Pages con cada push a `main` (`.github/workflows/deploy.yml`).

## Pendiente: app nativa (Capacitor)

La forma de tenerla como app "de verdad" (notificaciones del sistema, Face ID / huella, menos riesgo de que se borren los datos) queda para más adelante, por ejemplo empaquetando esta misma app con Capacitor. Para no cerrar esa puerta:

- El código no depende de nada que impida empaquetarlo con una herramienta como Capacitor.
- El acceso a lo que cambiaría en una app nativa (guardar datos, notificaciones, bloqueo, compartir archivos) está detrás de una capa propia y chica (`src/platform`), para cambiar la versión web por la nativa sin tocar el resto.
- El formato de la copia de seguridad es el mismo en cualquier versión: los datos pasan de la app web a la nativa restaurando una copia.

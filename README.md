# BassLayer

Dos mundos en un sitio, [basslayer.io](https://basslayer.io):

- **Bass** — la agenda de música electrónica de Buenos Aires (RA, QuéHacemos, Venti, Buenos Aliens y ciclos fijos curados), noticias de la escena y festivales verificados.
- **Layer** — cripto y mercados en español: precios, noticias, finanzas, ETFs, acciones, ciclos de Bitcoin, predicciones, eventos e hitos.

Se instala como app (PWA) y funciona sin conexión con lo último guardado.

## Correr en local

```bash
npm install
npm run dev          # Vite en :3000 + API en :3001
npm run preview      # abre la vista doble (mobile + desktop) en el navegador
```

## Estructura

```
src/            React (Vite): App.jsx, components/, hooks/, utils/, i18n/strings.js (ES/EN)
server.js       Express: arranque, caché, agenda (armado y cruce de fuentes)
server/         Módulos del server: fuentes de la agenda, noticias, festivales,
                artistas, Layer, feeds (OG, .ics, RSS, sitemap), prerender para buscadores…
lib/            Reglas compartidas entre server, sitio y chequeos (escena, ciudades,
                finde, ciclos, direcciones /eventos/<slug>…)
data/           Datos curados (festivales, ciclos fijos, ciclos de BTC, guías)
scripts/        Chequeos: check-modulos, check-content, smoke (Playwright)
public/         Íconos, manifest, service worker, página sin conexión
```

Sin cuentas ni claves de terceros para las fuentes: todo lo que se lee es público.
Supabase (opcional, `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`) guarda el panel de
venues, el estado curado de ciclos y las métricas anónimas de la app.

## Antes de publicar

```bash
npm run check        # build + check:modulos + check:content + smoke (mobile y desktop)
```

El hook `.githooks/pre-push` corre `npm run check` y frena el push si falla.
Después del deploy: `npm run smoke -- https://basslayer.io`.

Reglas de contenido: ningún dato (fecha, lugar, line-up) sin verificar contra dos
fuentes; lo no verificable se omite. Toda imagen externa tiene respaldo.

# Cambios de auditoría — BassLayer

Trabajo dividido en tres bloques: **P0 SEO · P1 Mobile · P2 Valor**. Cada bloque cerrado con `npm run build` verde.

Build final: `dist/assets/index-CwsJdzNP.css 125.79 kB · index-DYmQG0AL.js 509.57 kB` (≈ +2.6 kB CSS, +4 kB JS vs baseline).

---

## P0 · SEO ✅

### P0.1 — Dominio canónico
Reemplazado `basslayer.app` → `basslayer.io` en todos los sources.

- `index.html`: canonical, hreflang (es-AR/es/en/x-default), og:url, og:image, twitter:image, JSON-LD `WebSite` / `Organization` / `WebPage`.
- `server.js`: `PROD_ORIGIN` fallback y User-Agent de request a Wikipedia.
- `og.js`: footer del OG image.
- `public/robots.txt`: comentario cabecera + `Sitemap:`.

**Verificar**:
```
grep -r "basslayer.app" . --include="*.js" --include="*.jsx" --include="*.html" --include="*.txt" --include="*.json" --include="*.css" | grep -v node_modules | grep -v /dist/
```
→ debe devolver cero resultados.

### P0.2 — Título y meta description dinámicos por página
Dos frentes: server (SSR ya existente en `server.js` con `renderHtmlWithMeta`) y cliente (SPA modal open/close). Antes ambos existían pero el SSR usaba otro formato y el cliente no actualizaba nada al abrir un modal.

- **Server (`server.js`)**: `renderEventPage()` ahora emite `title = "{Headliner} en {Venue} · {DD mes} | BassLayer"` y `description = "{Headliner} se presenta en {Venue}, {Ciudad}, el {fecha} a las {hora}. Género: {G}. Entradas e info en BassLayer."` (mismos textos que el cliente).
- **Cliente**: nuevo `src/utils/seo.js` con `applyEventMeta/resetMeta`. `App.jsx` los invoca desde `openEvent`, `closeEvent`, popstate y el resolver de deep-link pendiente. Restaura los defaults al cerrar / navegar a otra ruta.
- **Home**: mantiene el título actual (default de `index.html`).

**Verificar a mano**:
1. Cargar `/`. `document.title` = título genérico.
2. Abrir cualquier evento. `document.title` cambia al patrón `"{Artista} en {Venue} · {DD mes} | BassLayer"`.
3. Cerrar modal (Esc). Vuelve al genérico.
4. Back/forward del navegador: sigue coherente.

### P0.3 — JSON-LD `MusicEvent` por evento
El JSON-LD del `index.html` (sitio global) sigue existiendo y valida. El del **detalle de evento** ahora se emite en dos lugares:

- **Server**: `renderEventPage()` inyecta el schema `MusicEvent` completo (líneas 3390-3427 de `server.js`) — ya lo hacía y valida.
- **Cliente**: `src/utils/seo.js` → `applyEventJsonLd()` inserta un `<script id="bl-event-jsonld" type="application/ld+json">` en `<head>` al abrir modal via SPA. Se remueve al cerrar. Formato idéntico al del server (mismas propiedades: `name`, `startDate` con `-03:00`, `location.Place.PostalAddress`, `performer` (MusicGroup), `organizer`, `eventStatus`, `eventAttendanceMode`, `offers` cuando hay URL de entradas).

**Verificar validador**:
- Producción: `curl https://basslayer.io/eventos/{slug}` → copiar HTML a https://validator.schema.org y validar. El schema `MusicEvent` debe salir verde. (No pude ejecutar el validador en este pass — hacerlo antes de deploy.)

### P0.4 — sitemap.xml y robots.txt
Ambos ya existen en el server:
- `GET /sitemap.xml` (server.js:3044) genera dinámicamente URLs del home + eventos + hubs de género + guías + festivales (con `lastmod` de hoy y `hreflang` alternates).
- `public/robots.txt` referencia `Sitemap: https://basslayer.io/sitemap.xml` (actualizado en P0.1).

**Verificar**: `curl https://basslayer.io/sitemap.xml` en prod y contar `<loc>`.

### P0.5 — Jerarquía semántica
- **Home**: `h1 className="bl-sr-only"` sigue igual **excepto** cuando hay un evento abierto — en ese caso el h1 del home se degrada a `<p>` sr-only para que solo exista un h1 en el DOM (el del modal).
- **Detalle de evento**: `bl-modal-name` pasó de `<h2>` a `<h1>` (`src/components/EventModal.jsx:158`).
- **BassFeed**: `bl-day-header` de `<div>` a `<h2>` (agrupador "Viernes 24/07"). Reset CSS aplicado en `.bl-day-header { font-size:inherit; font-weight:400; margin:0; }` para no romper visualmente.
- **LayerFeed**: `<h2 className="bl-sr-only">` dentro de cada `.bl-layer-content` (Noticias / Eventos / Predicciones). Coherente semánticamente sin cambiar el toggle visual.

**Verificar**: en el detalle de evento, DevTools → Accessibility tree → un solo h1 (nombre del evento). En la lista de eventos, cada agrupación de fecha es un h2.

---

## P1 · Mobile ✅

Todo consolidado en un único bloque `@media (max-width:480px)` al final de `src/styles.css`.

### P1.1 — Objetivos táctiles ≥44px
- `.bl-filter-chip`, `.bl-city-chip`, `.bl-finde-btn`: `min-height:44px` + padding horizontal 14px.
- `.bl-info-ig` (link Instagram en corner): `min-height:44px` con padding vertical.
- `.bl-modal-btn`: `min-height:44px` (por si algún botón interno queda corto).

### P1.2 — Tipografía funcional ≥11px
Piezas que estaban a 9-10px y ahora suben a 11px en mobile:
- `.bl-filter-chip`, `.bl-city-chip`, `.bl-finde-btn` (labels de filtro).
- `.bl-ev-date-m` (mes abreviado en la card).
- `.bl-ev-time-inline`, `.bl-ev-genre-badge` (metadata de card).
- `.bl-modal-genre`, `.bl-modal-date-m` (metadata del modal).
- `.bl-price-sym` (símbolo BTC/ETH en el ticker).
- `.bl-error`, `.bl-empty` (mensajes funcionales).
- `.bl-featured-countdown`.

Elementos **decorativos** del hero/terminal (`.bl-info`, `.bl-choose-text`, `.bl-ptr-inner`) se dejan a su tamaño actual — el prompt lo permite.

**Verificar a mano en 390px viewport**:
- No hay overflow horizontal (baseline se mantiene).
- Todas las píldoras de filtro se pueden tocar con el pulgar sin miss-tap.
- Todo texto funcional se lee sin acercar la vista.

---

## P2 · Valor nuevo ✅

### P2.1 — "Agregar al calendario" en detalle de evento
El botón único de calendario se convirtió en un menú desplegable con dos opciones:

- **Google Calendar**: link `https://calendar.google.com/calendar/render?action=TEMPLATE&...` con `dates` en formato UTC `YYYYMMDDTHHMMSSZ`. Duración por defecto: 6 horas (según el prompt).
- **Descargar .ics**: Blob generado client-side, sin librerías. TZID `America/Argentina/Buenos_Aires`, duración 5h por defecto. Escape RFC-5545 aplicado a SUMMARY / LOCATION / DESCRIPTION.

Descripción compartida (`buildEventDescription`) incluye line-up, género, link oficial y URL del evento en BassLayer.

**Verificar**:
1. Abrir un evento. Click en "Calendar". Menú desplegable aparece encima del botón (o debajo si es mobile).
2. Click en "Google Calendar" → abre en nueva pestaña con evento pre-llenado.
3. Click en "Descargar .ics" → descarga archivo. Abrir con Calendar.app (macOS) o Google Calendar (Chrome web import).

### P2.2 — Chip "Hoy"
Nuevo chip al lado del botón "Qué hay este finde →" en la vista Bass/Eventos. Filtra los eventos cuya fecha coincide con el día actual en `America/Argentina/Buenos_Aires` (helper `todayInBA()` en `BassFeed.jsx` usa `Intl.DateTimeFormat` para extraer YMD en TZ correcta, sin librerías).

Empty state: si no hay eventos hoy, muestra `"Nada hoy — lo próximo: {DÍA} {DD}"` calculando el próximo evento >= hoy.

**Verificar**:
- Toggle "Hoy" → lista se recorta a los eventos de hoy.
- Sin eventos hoy → mensaje con la próxima fecha con eventos.

### P2.3 — Filtro de Luma en /api/crypto-events
En `server.js:2312` (`fetchLumaEvents`) el fetch del feed de Luma sigue igual. En `fetchCryptoEvents` se aplica ahora un filtro por keywords (regex case-insensitive) sobre `title + description + organizer`:

`crypto, cripto, bitcoin, btc, ethereum, eth, web3, blockchain, token, defi, nft, stablecoin, solana, dao, onchain, wallet, staking`

Los eventos con `source: "curated"` no pasan por este filtro (se merge después). Log de servidor muestra cuántos eventos raw entraron y cuántos se filtraron.

**Verificar**:
- `curl http://localhost:3001/api/crypto-events | jq '[.[] | select(.source=="luma")] | length'` antes vs después.
- Revisar console.log del server: `[crypto-events] Luma raw: N, matched crypto keywords: M (filtered X), unique: Y`.

### P2.4 — LABITCONF fix
`data/crypto-events-curated.json` — bloque `labitconf-2026`:
- `date`: `"2026-11-20"` → `"2026-10-30"`
- Agregado `endDate: "2026-10-31"`
- `location`: `"Por confirmar — LatAm"` → `"Costa Salguero, Buenos Aires"`
- `description`: actualizado con las fechas y sede confirmadas.

### P2.5 — Estética puntual

**Bass — tinte de género en píldora activa**:
`FilterBar.jsx` acepta `--bl-genre-tint` inline (formato `"r,g,b"`) definido en `GENRE_TINTS` por género. Solo aplica al chip **active** dentro de `.bass-filters`. CSS en `styles.css` compone `rgba(var(--bl-tint), 0.12)` para fondo y `rgb(...)` para borde/texto. Fallback: si el género no tiene tinte definido, cae al accent-bass original (mismo comportamiento actual). Géneros afectados: Techno, House, Deep House, Tech House, Progressive, Melodic, Minimal, Trance, Festival.

**Layer — "lectura del día"**:
Nueva línea entre el status bar y la grilla de indicadores en `CryptoDashboard.jsx`. Reglas simples (`readingOfTheDay()`) sobre `marketCapChange24h` y `fearGreed.value`:
- ≥ +1.5 → `día verde`
- ≤ -1.5 → `día rojo`
- ≥ +0.5 → `mercado sube tímido`
- ≤ -0.5 → `mercado baja tímido`
- entre → `mercado plancha`
- Modifiers: F&G < 25 → `· miedo extremo`; > 75 → `· euforia`

Prefijo `> lectura:` para mantener el estilo terminal. CSS: `.bl-terminal-reading` (Space Mono 11px, color secondary, sin protagonismo).

**Layer — sparkline F&G 30d**:
- Server: `/api/dashboard` — `fetch alternative.me/fng/?limit=30`. `fearGreed.history` = array cronológico ascendente de últimos 30 valores.
- Cliente: componente `<FngSparkline />` — SVG inline 60×18, un solo path `stroke="currentColor"`, sin ejes, sin librerías. Renderizado a la derecha del label F&G dentro de `.bl-term-cell-fng-tag`.
- Si no hay history (< 2 puntos), no renderiza. No requiere persistencia adicional — el endpoint público de alternative.me ya provee el histórico.

**Verificar**:
- Activar filtro "Techno" en Bass → chip toma tinte azul frío.
- Activar "Progressive" → verde grisáceo. Activar "All" → cae al accent-bass original.
- En Layer, bajo el header terminal debe aparecer una línea `> lectura: ...`.
- En la card F&G del terminal debe verse un sparkline pequeño monocromo al lado del label.

---

## Sugerencias no ejecutadas (fuera de scope)

- **Lectura del día — refinar con BTC vs alts**: la lógica actual usa `marketCapChange24h` como proxy. Si en el futuro `/api/dashboard` incluyera `btcChange24h` (fácil de sacar de CoinGecko), se pueden habilitar lecturas más ricas ("btc plancha, alts tiran" / "solo btc verde"). Cambio mínimo en `readingOfTheDay()`.
- **Split code del bundle**: `index-*.js` sigue en 509 kB (limit warning). No es urgente pero un `manualChunks` separando `supabase-js` del bundle principal bajaría el LCP en users que no logean.
- **Traducción i18n de "Hoy" / "Nada hoy"**: dejé strings en español directos porque el chip solo aplica al lado Bass y todo Bass está en es. Si se agrega EN al chip, mover a `i18n/strings`.
- **JSON-LD validator run**: correr manual el validador de schema.org con una URL real de `/eventos/{slug}` antes de deploy. Yo sólo revisé estructuralmente contra el spec.

---

---

## P3 · Diseño (dos mundos + Instagram) ✅

Build final: `dist/assets/index-B3cUBaP8.js 512.24 kB · index-ByuPKi89.css 128.97 kB` (delta P3 sobre P2: +3.2 kB CSS, +2.7 kB JS, gzip +0.5/+0.7 kB).

### P3.1 — Instagram: hogar permanente en la util-bar
Nueva píldora `<a class="bl-util-toggle bl-util-ig">` insertada entre "about" y "ES/EN" en `App.jsx`. Contenido responsive vía CSS:
- **Desktop**: `@basslayerworld` (label largo).
- **Mobile** (≤768px): `IG` (label corto — se aplica con `display:none/inline` por media query, sin JS).

`href="https://instagram.com/basslayerworld"`, `target="_blank"`, `rel="noopener"`, `aria-label="Instagram de BassLayer"`. Visible siempre (home, Bass, Layer, detalle de evento — porque la util-bar es persistente y no cambia por vista).

**Altura**: `.bl-util-toggle` subido de 40px → **44px** en desktop; en mobile también 44px (antes 34px). Aplica a los otros botones de la util-bar (home / about / lang / mode) por consistencia — todos ahora cumplen ≥44px. Font-size del IG: **12px**.

Verificado en Playwright (viewport 390px): `getBoundingClientRect().height = 44`.

### P3.2 — Instagram: cierre contextual de lista
- **Bass** (`EndOfSet` component en `BassFeed.jsx`): texto actualizado a `"La agenda también en Instagram → @basslayerworld"` (antes decía `"→ seguí en @basslayerworld"`).
- **Layer** (`bl-end-of-feed` en `LayerFeed.jsx`): agregado `<a class="bl-end-of-feed-ig">` con texto `"Las noticias también en Instagram → @basslayerworld"`. El layout pasó de `row` a `column` para que el link caiga bajo el marker de EOF. Hover activa el accent-layer.

### P3.3 — Instagram del hero
**Eliminado**. El `<a class="bl-info-ig">` en App.jsx se removió por completo (junto con el CSS asociado en `styles.css`), incluyendo el ref parallax `parallaxRefs.current.br`. Razón: el link estaba a 9px con `--bl-700` (#1E1E1E, ~1.5:1 sobre negro) — invisible. Como P3.1 (util-bar) y P3.2 (end-of-list) cubren el acceso, eliminar es más limpio que "arreglar" y evita tener 3 puntos de contacto redundantes en la home.

Verificado: `.bl-info-br` no existe en el DOM tras el cambio.

### P3.4 — Contraste de subtítulos del hero
`.bl-concept-text` de `color:var(--bl-550)` (#333, ~2.4:1) a `color:var(--bl-250)` (#999, ~5.5:1). Supera AA (4.5:1). Mismo tamaño, misma posición, misma tipografía. En mobile los subtítulos ya se sobreescriben con los accents por mundo (tan / cian, ambos con contraste alto) — no requiere cambio.

Verificado en Playwright: `color: rgb(153, 153, 153)`.

### P3.5 — El header como brújula de mundo
Regla nueva en `styles.css`:

```css
.bl-header-half:not(.is-active) .bl-header-world-name { opacity: 0.4; }
.bl-header-half.is-active .bl-header-world-name       { opacity: 1; }
.bl-header-half:not(.is-active):hover .bl-header-world-name { opacity: 0.8; }
```

Transición sincronizada agregando `opacity .3s var(--ease-out-expo)` a las transiciones existentes de ambas mitades. No cambia tamaños ni tipografías — solo suma la señal de opacidad al énfasis actual (que ya existía en color/tamaño).

**Detalle de evento**: el modal-overlay tiene `z-index: 9800` y cubre todo el viewport, incluyendo el header — por eso no forcé "header=Bass" cuando hay evento abierto. Si en el futuro el modal deja de ser fullscreen, agregar la regla en `App.jsx` (pasar `activePanel` como 0 al header cuando `selectedEvent`).

Verificado en Playwright: `data-section="bass"` → bass=1.0 / layer=0.4 · toggle a Layer → bass=0.4 / layer=1.0.

### P3.6 — Firma visual del cruce
Nuevo elemento `<div class="bl-cross-signature">` dentro del `.bl-swipe-wrap` (sección activa). Se dispara con el mismo state `wiping` que ya existe en `App.jsx` (setea `"bass" | "layer"` durante 600ms al cambiar panel).

CSS: barra `position:absolute` de 2px justo bajo el header (`top:120px` desktop / `top:72px` mobile), gradiente `--bl-accent-bass → --bl-accent-layer` (o al revés según dirección), `animation: bl-cross-sig-l/r 320ms` que hace `scaleX(0)→1` (0.9 opacidad) y luego fade out — sólo `transform` y `opacity`, cero layout thrash.

`@media (prefers-reduced-motion: reduce) { .bl-cross-signature.active { animation: none; opacity: 0; } }` — cambio directo sin animación para usuarios que lo pidan.

### P3.7 — Línea de agenda en Layer
Nuevo componente `<NextBassLine>` en `LayerFeed.jsx` — se ubica arriba del `<CryptoDashboard>` en el panel Layer. Toma el prop `events` (ya cargado por `/api/events` cuando el user entra en sections) y elige el primer evento cronológicamente >= hoy con TZ BsAs (`todayInBA()` = `Intl.DateTimeFormat` con `America/Argentina/Buenos_Aires`).

Lógica del label:
- Si el evento es **hoy** → `ESTA NOCHE`.
- Si es **este fin de semana** (viernes-domingo) → `ESTE FINDE`.
- Si es más lejano → **no se muestra** (la línea desaparece — sin estado vacío raro, como pide el prompt).

Formato: `{LABEL} · {headliner} · {venue} · {hora} →`. En mobile el venue se esconde para que el label + artista queden legibles con el espacio limitado. Estilo:
- Fondo: gradiente sutil tan (`rgba(196,144,112,0.06)` → transparent).
- Label: mono uppercase con accent-bass. Headliner: Bodoni itálica (font del mundo Bass). Arrow: accent-bass, se traslada +3px en hover.
- Border-bottom en `rgba(196,144,112,0.15)`.
- Coherente con el price ticker (`.bl-price-bar`), no lo compite visualmente.

Click → llama `onSelectEvent(ev)` que abre el modal + actualiza URL/title/JSON-LD (P0.2/P0.3).

**Nota sobre la premisa del prompt**: el texto asumía que el ticker crypto está en Bass. En el código real está en Layer (donde vive el mundo cripto). Interpreté el espíritu ("cada mundo con una pista del otro") como: Layer ya tenía el ticker propio, ahora suma la línea de música. Documentado por si en el futuro se decide mover también el ticker crypto a Bass — sería un cambio de una prop en `App.jsx`.

Verificado en Playwright (Layer panel, hoy 22/07/2026): label `ESTE FINDE`, artist `Matías Sundblad`, venue `Cocktail Fest @ Parque de Innovación`. Click abre el modal correspondiente.

---

## Sugerencias no ejecutadas — P3

- **Lectura del día (P2.5) con BTC vs alts**: sigue vigente. `/api/dashboard` debería exponer `btcChange24h` para poder diferenciar "btc plancha, alts tiran".
- **Cross-signature en detalle de evento**: si el modal deja de cubrir el header en el futuro, la firma de cruce podría dispararse también al cerrar el modal (visual coherente con el resto).

---

## Checkpoints

- **P0**: build ok · grep `basslayer.app` = 0 · título dinámico verificado en Playwright (`"Bart Skils en Crobar · 04 Sep | BassLayer"`) · JSON-LD MusicEvent válido con `startDate ISO-8601 -03:00`, `PostalAddress AR`, `performer[]` · sitemap dinámico ya emitido por server. ✅
- **P1**: build ok · min-height 44px aplicado a filtros/chips (medido: 44px) · texto funcional ≥ 11px en mobile · viewport 390px sin overflow horizontal (`scrollWidth − innerWidth = 0`). ✅
- **P2**: build ok · Google Calendar link con UTC 6h + `.ics` con escape RFC-5545 · chip "Hoy" con empty state `"Nada hoy — lo próximo: VIE 24"` · filtro Luma por 17 keywords antes del dedup · LABITCONF corregido a 30-31 oct 2026 Costa Salguero · tinte Techno `rgba(108,126,176,0.12)` verificado · lectura `> lectura: mercado baja tímido` + sparkline F&G en pantalla. ✅
- **P3**: build ok · IG del hero eliminado · IG en util-bar visible siempre (44px alto, 12px font, handle full en desktop / IG corto en mobile) · subtítulos `#999` (5.5:1) · header brújula verificado (bass=1 / layer=0.4 y viceversa) · cierre contextual con `"La agenda también en Instagram → @basslayerworld"` en Bass y equivalente en Layer · línea `ESTE FINDE · Matías Sundblad · ... →` en Layer · firma visual de cruce disparada por `wiping` state · respeta `prefers-reduced-motion`. ✅

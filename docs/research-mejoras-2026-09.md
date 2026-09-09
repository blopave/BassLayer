# Research de mejoras — 2026-09-09

Cuatro investigaciones paralelas por internet: benchmark de descubrimiento de eventos (RA, DICE, Shotgun, Fever, Xceed, Partiful/Luma), benchmark de terminales crypto (Coinglass, DeFiLlama, Arkham, mempool.space), capacidades de plataforma web 2026 (verificadas contra caniuse/MDN/web.dev), y growth/SEO para eventos locales (docs de Google, Nieman Lab, competidores AR). Todo verificado contra fuentes primarias; las APIs crypto testeadas con curl real (200 sin key).

## Convergencias (lo que apareció en varias investigaciones a la vez)

1. **WhatsApp es EL canal en Argentina (93% de penetración)** y BassLayer no lo explota: ni share optimizado (hoy comparte texto+URL pelado), ni Channel. La distribución real de la escena BA es el grupo de WhatsApp y las stories.
2. **BassLayer es "página que miro", no "herramienta con la que organizo mi finde"**: no se puede guardar un evento, no hay loop de retorno. Todos los líderes del rubro (DICE, RA, Songkick) se construyen sobre intención guardada.
3. **El SEO programático es el playbook de RA/Songkick y la infra ya existe**: prerender + JSON-LD + sitemap están; faltan las páginas temporales ("hoy", "este finde"), las de venue, y completar el MusicEvent para el carrusel de Google (disponible en LatAm, requisitos exactos conocidos).
4. **QuéHacemos (competidor directo) dejó cuatro huecos abiertos**: sin WhatsApp Channel, sin ICS, sin RSS, sin widgets.

## Paquete 1 — "Compartible y guardable" (distribución + retención, sin backend)
- **Share con imagen**: story-card del evento generada en canvas (artwork + fecha + venue) vía `navigator.share({files})` (~universal en móvil) + botón directo `wa.me/?text=`. Lo que termina en stories de IG y estados de WhatsApp no es un link, es una card.
- **Guardar evento** (corazón → "mi agenda" en localStorage, sin login). Primer ladrillo de retención; después alimenta social proof y recomendaciones heurísticas.
- **ICS con MIME correcto**: el modal ya genera ICS client-side; servirlo desde Express con `Content-Type: text/calendar` arregla la fricción #1 en iOS.
- **Feed ICS "suscribite a la agenda"** (webcal://, variantes por género) — nadie lo hace en la escena BA. Mismo serializador sirve para RSS público.

## Paquete 2 — "Google nos liste" (SEO programático)
- **Completar JSON-LD MusicEvent** para el carrusel: `offers` (precio visible en página + moneda + availability), `endDate`, `performer`, `eventStatus`, `image` en 3 ratios (1:1, 4:3, 16:9, mín 720px). Títulos "limpios" (sin lenguaje promo, descalifica). Validar con Rich Results Test.
- **Páginas temporales**: `/eventos/hoy`, `/eventos/este-finde` (+ cruce con género: "techno este finde") con ItemList JSON-LD. Es lo que activa "fiestas hoy buenos aires".
- **Páginas de venue** `/venue/:slug` con próximas fechas — queries "crobar eventos" tienen intención altísima y competencia baja. Requiere normalizar venues.
- **`lastmod` honesto en el sitemap** (el ping de Google murió en 2023; lastmod es la señal de recrawl). IndexNow solo para Bing (trivial, marginal).

## Paquete 3 — "Layer argentino" (profundidad, no más módulos)
La memoria previa ("más noticias ES, no más módulos") quedó parcialmente obsoleta: los feeds ES están agotados (5 activos, Cointelegraph ES muerto, CriptoNoticias bloqueado). Los gaps reales, todos con APIs sin key verificadas con curl:
- **Dólar cripto argentino** — USDT/ARS multi-exchange + brecha (criptoya.com/api + dolarapi.com). Lo único que ninguna terminal global tiene; máximo valor/esfuerzo.
- **On-chain en el dashboard de ciclos** — MVRV Z-score, NUPL, realized price, Puell (bitcoin-data.com, gratis lo que Glassnode cobra $50+/mes). Realized price se superpone a la curva log existente.
- **Panel de red Bitcoin** — fees + countdown de ajuste de dificultad + halving con progress bar ASCII (mempool.space/api). Hermano temático de los halvings.
- Candidatos B: flujos ETF BTC (bitcoin-data.com, lag 3-4 días), stablecoin supply one-liner (stablecoins.llama.fi), DVOL de Deribit (VIX crypto, sparkline hermano del F&G), funding rates vía Hyperliquid (una llamada trae Binance+Bybit+HL; evitar Binance directo por el 451).
- **Descartado con evidencia**: liquidation heatmap (sin API gratis), long/short de Binance (riesgo geo).

## Paquete 4 — "Polish de plataforma" (verificado contra caniuse)
- **View Transitions API** para el swap Bass↔Layer (~92% soporte, degradación limpia al wipe actual). Consolida el gesto identitario en CSS declarativo.
- **Pack CSS de una tarde**: `text-wrap:balance` en títulos, `pretty` en descripciones, `content-visibility:auto` + `contain-intrinsic-size` en cards del feed (única ganancia de perf de scroll medible), container queries donde aplique.
- **Manifest**: `shortcuts` (Eventos/Crypto) + `screenshots` (habilita richer install UI en Android) + maskable 512.
- **Auditar bfcache** (que el HTML no mande no-store — mata el back/forward instantáneo desde el browser de IG, exactamente nuestro tráfico) + preload del subset latino de Geist.
- **Descartado con evidencia**: scroll-driven animations (Safari 26/Firefox 158 muy recientes; los reveals actuales son "once-only", migrar sería por migrar), Speculation Rules (no aplica a SPA), Badging (sin caso de uso).

## Fuera de código (decisión de Pablo)
- ~~WhatsApp Channel~~ — **DESCARTADO por decisión de Pablo (2026-09-09): nada relacionado a WhatsApp**, ni canal ni botones wa.me en el producto. El share usa solo el sheet nativo del sistema + copiar link. No re-proponer.
- **Telegram** para la audiencia Layer queda como opción si algún día se quiere canal propio.
- **Widget embebible** para venues/blogs ("powered by BassLayer") — cada embed es backlink + adquisición; el loop de Bandsintown.
- **Roadmap de producto más grande** (requiere backend/decisiones): seguir venues/artistas con alertas, "avisame" de eventos, social proof "X interesados", listas curadas con nombre, páginas de venue como entidad seguible, embeds de audio por artista del lineup (patrón Xceed).

## Fuentes principales
Google Event structured data · caniuse (view-transitions, web-share, css-has, container-queries) · web.dev (content-visibility, bfcache, installation-prompt) · docs.criptoya.com · dolarapi.com · mempool.space/docs/api · bitcoin-data.com · api-docs.defillama.com · docs.deribit.com · Hyperliquid docs · RA Pro/Guide · Trustpilot DICE · caso Fever (A/B: búsqueda +12% revenue, ratings +5.1% conversión) · Nieman Lab (WhatsApp Channels) · LatAm Journalism Review · QuéHacemos (auditado).

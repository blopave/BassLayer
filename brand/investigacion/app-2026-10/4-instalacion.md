# Instalar y volver a BassLayer como PWA: investigación de UX (2026-10-12)

Alcance: la experiencia de instalar BassLayer y de volver a usarla, en Argentina, sin cuentas y sin redes. Los hallazgos se cruzaron con 2 o más fuentes cuando fue posible; donde hay una sola fuente o una contradicción, lo marco con **[1 fuente]** o **[conflicto]**.

---

## 0. Estado actual del repo (lo miré antes de recomendar)

- `public/manifest.json` está bien encaminado: tiene `id`, `start_url`, `scope`, `display: standalone`, `lang es-AR`, **3 shortcuts** (Hoy / Finde / Layer), **screenshots narrow + wide** y descripción. Es la "UI de instalación enriquecida" que Chrome recomienda.
- Faltan dos cosas en el manifest: no hay **ícono maskable de 512** (el único maskable es `icon-192.png`) y `orientation: portrait` deja la versión instalada en desktop o tablet trabada en vertical.
- `public/sw.js` (v6): navegación network-first con fallback a la caché. **Si la URL nunca se cacheó, offline devuelve `undefined` y aparece el error del navegador**: no hay página offline ni fallback al shell `/`.
- `index.html` tiene `apple-mobile-web-app-status-bar-style: black-translucent` **pero el viewport no lleva `viewport-fit=cover`**. Sin `viewport-fit=cover`, `env(safe-area-inset-*)` vale 0 en iOS. Con `black-translucent` el contenido igual se dibuja **debajo de la hora y la batería**. Los `env(safe-area-inset-bottom)` de `styles.css` probablemente no hacen nada en el iPhone. **Hay que verificarlo en un dispositivo.**
- No hay ningún código de `beforeinstallprompt`, `appinstalled` ni `display-mode`.
- Analítica: Cloudflare Web Analytics, que **no tiene eventos personalizados ni guarda query strings** ([FAQ de Cloudflare](https://developers.cloudflare.com/web-analytics/faq/); [Plausible vs CF](https://plausible.io/vs-cloudflare-web-analytics)). Con eso solo no se pueden medir instalaciones ni aperturas desde el ícono.
- "Mi agenda" (`useSavedEvents`) y `bl-onboarded` viven en `localStorage`. **En iOS esto importa mucho** (ver el riesgo R1).

---

## 1. Estado 2026 de la instalación

### 1.1 `beforeinstallprompt` por navegador

| Navegador | ¿Dispara `beforeinstallprompt`? | Notas |
|---|---|---|
| Chrome Android | **Sí** | Muestra un mini-infobar automático; `preventDefault()` lo oculta y vuelve a aparecer a los ~90 días si se descarta ([a2hs-updates, 2018](https://developer.chrome.com/blog/a2hs-updates); [web.dev promote-install](https://web.dev/articles/promote-install)). `prompt()` se puede llamar una sola vez por evento y debe ir dentro de un gesto del usuario ([web.dev learn/pwa installation-prompt, 2022](https://web.dev/learn/pwa/installation-prompt)). |
| Edge (desktop y Android) | **Sí** (Chromium) | |
| Samsung Internet | **[conflicto]** | MDN y la documentación históricos dicen que sí. Desde la versión **27.x hay reportes en el foro de Samsung de que no se dispara**, sin respuesta oficial ([foro Samsung](https://forum.developer.samsung.com/t/in-android-samsung-internet-browser-of-version-27-x-not-fired-befo/38806); [openpwa Samsung](https://openpwa.net/reference/platforms/samsung-internet/)). Samsung tiene su propio badge "+" en la barra cuando el manifest pide `standalone`. **Diseñar asumiendo que puede no dispararse.** |
| Firefox Android | **No** | Se instala desde el menú → "Instalar" / "Agregar a inicio". Mozilla propuso sacar el evento del estándar ([MDN Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable); [whatpwacando](https://whatpwacando.today/installation/)). |
| Safari iOS / macOS | **No** | No hay ninguna API ([Safari 27.0, 2026-09-17](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/), sin novedades de instalación). |
| Chrome/Edge/Firefox en iOS | No | Pero **pueden "Agregar a inicio" desde su menú Compartir desde iOS 16.4** ([9to5mac, 2023-07](https://9to5mac.com/2023/07/14/google-chrome-web-apps-ios/); [WebKit 16.4](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). |

**Novedad a vigilar: Web Install API (`navigator.install()`).** Está en origin trial en Chrome y Edge 143–148 y expiró el 2026-07-14. Safari y Firefox la ignoran ([Edge blog, 2025-11-24](https://blogs.windows.com/msedgedev/2025/11/24/the-web-install-api-is-ready-for-testing/); [InfoQ, 2026-03-27](https://www.infoq.com/news/2026/03/web-install-api-origin-trial)). No vale la pena para BassLayer todavía.

**Rótulos del menú de Chrome Android [1 fuente, sin verificar]:** un resultado decía que Chrome 150 renombró el ítem a "Install and create shortcut". No lo pude confirmar. **No escribir el texto exacto del menú de Chrome en la UI**: alcanza con "menú ⋮ → Instalar".

### 1.2 Criterios de instalabilidad (Chromium)

Para que se dispare `beforeinstallprompt` ([web.dev install-criteria, act. 2024-09-19](https://web.dev/articles/install-criteria); [Chrome blog](https://developer.chrome.com/blog/update-install-criteria)):

- HTTPS y la app no instalada todavía.
- **Engagement**: al menos un clic o tap en la página (puede ser de una sesión anterior) y **al menos 30 s** viéndola.
- Manifest con `name` o `short_name`, íconos de **192 y 512**, `start_url`, `display` standalone/fullscreen/minimal-ui y `prefer_related_applications` en false o ausente.
- **Service worker con `fetch`**: ya no es obligatorio para instalar desde el menú (Chrome 108 en mobile, 112 en desktop). El blog de Chrome dice que **sigue siendo requisito para el prompt automático**.

BassLayer cumple todo esto hoy.

**Dato útil:** la UI de instalación enriquecida (screenshots + descripción en el manifest) **duplicó la tasa de instalación de algunas PWA en Android**. El "in-product help" dirigido solo a usuarios con engagement dio **+100 % de instalaciones** en desktop. "Install" resultó la palabra más clara para los usuarios ([Chrome blog, nov 2021](https://developer.chrome.com/blog/pwa-install-features)).

### 1.3 Safari iOS 26 / 27

- **iOS 26 (sept 2025):** todo sitio agregado a inicio **abre como web app por defecto**, con o sin manifest. En la hoja de "Agregar a inicio" hay un **interruptor "Abrir como app web"** que el usuario puede apagar para que quede como marcador ([WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); [heise, 2025-10-10](https://www.heise.de/en/news/iOS-26-and-iPadOS-26-Changed-web-app-behaviour-on-the-home-screen-10749652.html); [Michael Tsai, 2025-10-03](https://mjtsai.com/blog/2025/10/03/web-apps-in-ios-26/); [iDownloadBlog](https://www.idownloadblog.com/2025/06/17/apple-ios-26-safari-web-apps-home-screen-bookmarks/)).
- **No hay API para disparar la instalación.** Sigue siendo manual.
- **El flujo cambió de lugar en iOS 26:** **⋯ (a la derecha de la barra de direcciones) → Compartir → (deslizar) Agregar a pantalla de inicio → "Abrir como app web" encendido → Agregar** ([MacRumors, 2025-08-20](https://www.macrumors.com/how-to/save-safari-bookmark-web-app-iphone-home-screen/); [Apple Support](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)). Si la barra de pestañas está en modo clásico, el botón Compartir sigue estando a la vista. **La explicación tiene que mencionar ⋯ y Compartir**, no solo "el botón Compartir".
- **iOS 27 / Safari 27 (2026-09-17):** las notas de WebKit **no traen novedades de instalación, manifest ni push** ([Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/); [Safari 27 beta, 2026-06-08](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/)). Trae *scroll anchoring* (`overflow-anchor`), que sirve para el feed.
- **Aislamiento de datos:** la web app de inicio **no comparte cookies, `localStorage` ni el service worker con Safari** ([WebKit bug 181849](https://bugs.webkit.org/show_bug.cgi?id=181849); [Netguru](https://www.netguru.com/blog/how-to-share-session-cookie-or-state-between-pwa-in-standalone-mode-and-safari-on-ios); [eclecticlight sobre macOS](https://eclecticlight.co/2023/10/05/how-do-sonomas-web-apps-work/)). Ver R1.

### 1.4 Safari macOS: Agregar al Dock

Desde Sonoma 14 / Safari 17: **Archivo → Agregar al Dock** o Compartir → Agregar al Dock. Funciona con cualquier sitio, tenga o no manifest. Lee `name`, `display`, `theme_color` y `start_url`, y en macOS soporta **`shortcuts`** (aparecen en el menú Archivo y en el Dock). Corre en su propia ventana, con cookies propias, y tiene push y badging ([Apple Support](https://support.apple.com/en-us/104996); [9to5mac](https://9to5mac.com/2023/11/17/safari-add-to-dock-macos-sonoma/); [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10120/)). Apple pide un ícono cuadrado, opaco y full-bleed de 1024 o SVG.

### 1.5 Cuota de mercado en Argentina (StatCounter)

| Período | Android | iOS | Fuente |
|---|---|---|---|
| Sept 2026 | **87,37 %** | **12,63 %** | [StatCounter OS mobile AR](https://gs.statcounter.com/os-market-share/mobile/argentina) |
| Ago 2026 | 82,07 % | 17,84 % | mismo sitio (dato del buscador) |

Navegadores mobile en Argentina, sept 2026: **Chrome 85,9 %**, Safari 9,0 %, **Samsung Internet 4,3 %**, Firefox 0,3 % ([StatCounter browser AR](https://gs.statcounter.com/browser-market-share/mobile/argentina)).

**[1 fuente]:** no encontré una segunda fuente pública con datos de Argentina; Kantar, IDC y Counterpoint no publican el desglose. La cifra mensual se mueve unos 5 puntos.

**Lectura:** en el país Android es más del 80 % y casi todo es Chrome, así que `beforeinstallprompt` cubre a la gran mayoría. Pero **el público de electrónica de CABA probablemente tenga más iPhone que el promedio**. Hay que medirlo con los datos propios de Cloudflare Web Analytics (que sí reporta OS y navegador) antes de priorizar.

---

## 2. Patrones de invitación

### 2.1 Guía de web.dev ([promote-install](https://web.dev/articles/promote-install), 2019; [installation-prompt](https://web.dev/learn/pwa/installation-prompt), 2022; [drive-business-success](https://web.dev/articles/drive-business-success), 2020)

- **Fuera del flujo de la tarea:** debajo de la acción principal, nunca encima.
- **Que se pueda cerrar y recordar el rechazo.**
- Mostrarla **después de una señal de engagement**: visita repetida, tarea terminada, segunda página vista.
- Ubicaciones que propone: **botón en el menú de navegación (debajo de los otros ítems)**, header fijo, banner, **snackbar abajo (4–7 s)**, inline en el feed (con baja frecuencia y descartable) y después de una conversión.
- Para iOS: mostrar las instrucciones manuales **solo si `display-mode: browser`**.
- Funnel a medir: elegibles → clics en la invitación → aceptan o rechazan el diálogo → instalados.

El plan que ya existe ("una vez, abajo, en la segunda visita, cerrable para siempre + entrada fija en ⋯") **coincide con estas guías**.

### 2.2 Casos con números

Casi todos son de 2016–2019; ninguno es reciente.

| Caso | Números | Qué hicieron / qué enseña | Fuentes |
|---|---|---|---|
| **Flipkart Lite** | **60 % de las visitas desde el ícono**; quienes llegan desde Add to Home Screen convierten **70 % más**; 3× tiempo en el sitio; +40 % de re-engagement | El ícono trae a los mejores usuarios | [web.dev case study](https://web.dev/case-studies/flipkart); [Medium Flipkart](https://medium.com/progressive-web-apps/building-flipkart-lite-a-progressive-web-app-2c211e641883) |
| **Weekendesk** | Instalados: **2× más probabilidad de reservar**; la invitación iba **en la segunda página vista** | **Es el respaldo directo de "segunda visita"** | [web.dev drive-business-success](https://web.dev/articles/drive-business-success) |
| **Trivago** | +500 000 instalaciones; **+150 % de engagement**; visitas repetidas de 0,8 a 2 por usuario; el 67 % de los que perdían conexión seguían navegando al volver | Offline + push + ícono | [Mobiloud](https://www.mobiloud.com/blog/progressive-web-app-examples/); [Progressier PWA Stats](https://progressier.com/pwa-stats) **[fuentes secundarias]** |
| **Twitter Lite** | +65 % páginas por sesión; +75 % tweets; −20 % rebote; 600 KB contra 23,5 MB de la app nativa; vuelve a arrancar en menos de 3 s | Velocidad de re-entrada | [web.dev twitter](https://web.dev/case-studies/twitter); [CSS-Tricks PWA Stats](https://css-tricks.com/pwa-stats/) |
| **Pinterest** | +60 % engagement; +44 % ingresos por anuncios; +40 % tiempo; ~150 KB | Rendimiento ante todo | [Addy Osmani](https://medium.com/@addyosmani/a-pinterest-progressive-web-app-performance-case-study-3bd6ed2e6154); [pwastats](https://www.pwastats.com/2017/12/pinterest/) |
| **Starbucks** | 2× usuarios activos diarios; 233 KB contra 148 MB de iOS | Pedido offline | [Progressier](https://progressier.com/pwa-stats/brand/starbucks); [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/) |
| **Uber (m.uber)** | Núcleo de 50 KB; carga en menos de 3 s en 2G | Liviano | múltiples secundarias |
| **Tinder** | Carga de 11,91 s → 4,69 s; 90 % más chica que la app de Android | | múltiples secundarias |
| **AliExpress** | +104 % de conversión en usuarios nuevos; 2× páginas por sesión; +74 % de tiempo | | [web.dev aliexpress](https://web.dev/case-studies/aliexpress); [pwastats](https://www.pwastats.com/2017/03/aliexpress/) |
| **Spotify (desktop)** | Se citan +30 % MAU, +45 % usuarios de desktop y +40 % horas | **[sin fuente primaria; números dudosos, no usar]** | [Tigren](https://www.tigren.com/blog/spotify-pwa/) |

**Ojo:** son correlaciones. Los que instalan ya eran los usuarios más comprometidos, así que estos números **no prueban que instalar cause el engagement**.

### 2.3 Ejemplos elegantes y no invasivos (patrones, no marcas)

- **Entrada fija en el menú** que solo aparece si la instalación es posible y desaparece en standalone. Es el patrón "Navigation Menu" de web.dev.
- **Línea discreta al pie, una sola vez, después de una señal real** (segunda visita + haber hecho algo: guardar un evento, abrir el finde). Con ✕ que la descarta para siempre.
- **Contextual a un valor:** después de guardar el primer evento en "Mi agenda", una línea del tipo "Tenelo a mano: sumá BassLayer a tu inicio". Es el patrón "post-conversión".
- **No usar:** modales, overlays a pantalla completa, flechas animadas apuntando a Compartir, ni la invitación en la primera visita.

---

## 3. Medición (sin cuentas ni cookies invasivas)

| Qué | Cómo |
|---|---|
| Elegibles para instalar | `beforeinstallprompt` (solo Chromium) |
| Invitación vista / cerrada / clic | eventos propios |
| Aceptó o rechazó el diálogo | `deferredPrompt.userChoice` → `accepted` / `dismissed` |
| Instalación | `window.addEventListener('appinstalled')`. Dispara venga de la invitación propia o del menú del navegador, **solo en Chromium** ([web.dev](https://web.dev/learn/pwa/installation-prompt)) |
| Instalación en iOS | **No hay evento.** Se infiere por la **primera apertura en standalone** (ver la fila siguiente) |
| Apertura desde el ícono | `matchMedia('(display-mode: standalone)').matches \|\| navigator.standalone === true` al arrancar ([web.dev detection](https://web.dev/learn/pwa/detection); [Pete LePage](https://petelepage.com/blog/2020/08/measure-understand-how-installed-pwa-users-differ-from-browser-tab-users/)). Alternativa: `start_url: "/?src=app"`, pero Cloudflare **no guarda query strings** |
| Uso de shortcuts | marcar cada `url` de los shortcuts (por ejemplo `?src=sc-hoy`) y contarlo en el server |

**Sin cookies:** Cloudflare Web Analytics no sirve para esto porque no tiene eventos. La opción simple es un **endpoint propio `POST /api/m` con `navigator.sendBeacon`**, que reciba solo `{evento, plataforma (ios/android/desktop), modo (browser/standalone)}`. Sin ID ni IP guardada, **solo contadores diarios agregados** (en Supabase, que ya usan). Sirve para el funnel y para comparar aperturas en standalone contra visitas totales, sin identificar a nadie.

**Lo que no se puede medir sin un ID:** retención por usuario ("¿el que instaló volvió a los 7 días?"). Como proxy: **aperturas diarias en standalone / instalaciones acumuladas**.

---

## 4. Volver

### 4.1 Web Push

- **iOS 16.4+:** solo en la web app **agregada a inicio**. El permiso **tiene que pedirse con un gesto directo** (tocar un botón "Avisame…"). Se integra con Focus y no hace falta cuenta de Apple Developer ([WebKit, 2023-02-16](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [OneSignal iOS](https://documentation.onesignal.com/docs/en/web-push-for-ios)).
- **iOS 18.4+: Declarative Web Push.** Push sin service worker que se muestra aunque el código del SW falle, para web apps de inicio; es retrocompatible ([WebKit 18.4, 2025-03-31](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/); [WWDC25](https://developer.apple.com/videos/play/wwdc2025/235/)).
- **Android Chrome:** funciona **sin instalar y sin cuenta**: la suscripción es anónima (endpoint + claves VAPID), con un servidor propio y la librería `web-push` en Node. No hace falta Firebase en el cliente.
- **Chrome revoca solo** el permiso de notificaciones de los sitios que el usuario no visita, porque **menos del 1 % de las notificaciones recibe interacción**. **Esa revocación no alcanza a las web apps instaladas** ([Google blog, 2025-10-10](https://blog.google/chromium/automatic-notification-permission/); [BleepingComputer](https://www.bleepingcomputer.com/news/google/google-chrome-to-revoke-notification-access-for-inactive-sites/)). Es un **argumento fuerte para pedir push recién después de instalar**.
- **Chrome limita a los sitios que mandan mucho con poco engagement** desde enero de 2026 ([Chrome blog](https://developer.chrome.com/blog/web-push-rate-limits)). Una notificación por semana no corre peligro.
- **UI silenciosa de Chrome:** los sitios con aceptación muy baja pasan automáticamente al prompt silencioso ([9to5google](https://9to5google.com/2020/01/07/chrome-quiet-notification-ui/); [OneSignal](https://onesignal.com/blog/web-push-permission-prompting-changes/)). **Pedir el permiso al cargar la página quema el sitio.**

**Buenas prácticas de permiso:**
1. Nunca pedirlo al cargar la página.
2. Primero un **botón propio con la promesa concreta** ("Avisame cuando estén los elegidos del finde · una vez por semana"), y solo al tocarlo el diálogo del sistema.
3. Ofrecerlo **dentro de la app instalada** o en el lugar donde vive el contenido prometido (la franja del finde en la Agenda).
4. Si rechaza, no volver a ofrecerlo.
5. Dar una forma visible de desactivarlo (en el menú ⋯).

### 4.2 Tasas de aceptación y rechazo conocidas

- **Chrome UX Report (feb 2020), prompts de notificación:** global, aceptan **16,7 %**, rechazan 40,7 %, cierran 23,8 %, ignoran 18,7 %. **Celular: aceptan 22,8 % / rechazan 57,3 %**. Desktop: 6,1 % / 11,6 % ([CrUX notification data](https://developer.chrome.com/blog/notification-permission-data-in-crux); [dev.to Chromium](https://dev.to/chromiumdev/yestifications-exploring-how-users-engage-with-notification-prompts-in-the-chrome-ux-report-4h7c); [paper USENIX Sec'21](https://www.usenix.org/system/files/sec21-bilogrevic.pdf): 21 % Android / 10 % desktop). **Esto es para prompts genéricos al azar.** Con pre-permiso contextual se espera bastante más.
- **Proveedores de push** (OneSignal, PushEngage y similares): de 5 a 15 % de opt-in sobre todos los visitantes. Son **fuentes interesadas; usar solo como rango**.
- **Frecuencia (apps nativas, encuesta vieja de Localytics/Business of Apps):** con **1 push por semana, ~10 % desactiva las notificaciones y ~6 % desinstala**; con 2–5 por semana, 46 % se da de baja ([Business of Apps](https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/); [Mobiloud](https://www.mobiloud.com/blog/push-notification-statistics/)). **[No pude abrir la fuente primaria]**.
- **Opt-in de push en iOS web:** no encontré datos públicos confiables.

**Para BassLayer:** **una sola notificación por semana, fija (jueves a la tarde, hora de Buenos Aires), con contenido real** ("Ya están los elegidos del finde: X, Y, Z") y **nada más**. Es el techo sano según los datos. Se puede usar `tag` para que una notificación reemplace a la anterior.

### 4.3 Badging API

- `navigator.setAppBadge(n)` / `clearAppBadge()`.
- **iOS 16.4+** en web apps de inicio (requiere permiso de notificaciones).
- **Chrome/Edge desktop** instalada.
- **No en Android**: ahí el sistema pone el punto solo cuando hay una notificación sin leer.

Fuentes: [Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/badging-api); [caniuse](https://caniuse.com/mdn-api_navigator_setappbadge); [WebKit 16.4](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

**Uso sobrio posible:** marcar `1` cuando se publican los elegidos del finde y limpiarlo al abrir. **Riesgo:** un badge rojo permanente es exactamente lo que el cliente odia, así que **es opcional y conviene ponerlo solo con el push**.

### 4.4 Periodic Background Sync

- Solo Chromium.
- Solo **instalada y lanzada como app**.
- La frecuencia la decide Chrome según el engagement, sin garantías.
- **Ni Safari ni Firefox la soportan.**

Fuentes: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API); [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/background-syncs); [openpwa](https://openpwa.net/compatibility/periodic-background-sync/).

**Uso:** precargar la agenda o el finde para que la app abra con datos frescos en Android. Es **un "después" de bajo impacto.**

---

## 5. Sentirse app de verdad en standalone

| Tema | Hallazgo | Fuentes |
|---|---|---|
| **Safe area y status bar en iOS** | `black-translucent` dibuja el contenido debajo del status bar. **Hace falta `viewport-fit=cover`** en el meta viewport para que `env(safe-area-inset-*)` valga algo. Entonces: `padding-top: env(safe-area-inset-top)` en el header/util-bar y `bottom` en los FAB y sheets. `apple-touch-startup-image` sigue siendo la única forma de tener splash en iOS. | [firt PWA tips](https://firt.dev/pwa-design-tips/); [firt iOS notes](https://firt.dev/notes/pwa-ios/); [Progressier status bar](https://intercom.help/progressier/en/articles/10574799-complete-guide-to-customizing-the-mobile-status-bar-in-a-website-or-pwa) |
| **Atrás** | **iOS:** desde 12.2 funciona el gesto de borde para atrás/adelante en standalone, dentro del scope y con rutas del cliente ([firt iOS 12.2](https://firt.dev/ios-12.2/)). Algunos issues dicen lo contrario **[conflicto menor]**. **Android:** el botón o gesto atrás del sistema sigue el historial; si un modal no hace `pushState`, "atrás" **cierra la app** en vez del modal. **No hay botón atrás de la UI del navegador**: cada vista profunda necesita su propio "volver". | [firt iOS 12.2](https://firt.dev/ios-12.2/); [issue Flutter](https://github.com/flutter/flutter/issues/76478) |
| **Links externos (entradas, RA, Passline)** | **iOS:** los links fuera del scope abren un **navegador in-app (vista de Safari)** encima de la app; con `target="_blank"` se vuelve a la app sin recargar. **No hay forma confiable de forzar Safari completo.** **Android Chrome:** fuera del scope abre una Custom Tab sobre la app. **Recomendación:** dejar `target="_blank" rel="noopener"` en todo link externo (ya hay 16 en el código) y **no intentar sacar al usuario al navegador**. Para comprar entradas la vista in-app funciona, pero ojo con logins de terceros. | [firt iOS 12.2](https://firt.dev/ios-12.2/); [codelessgenie](https://www.codelessgenie.com/blog/ios-pwa-how-to-open-external-link-on-mobile-default-safari-not-in-app-browser/) |
| **Pull-to-refresh** | **iOS standalone no tiene pull-to-refresh nativo.** En Android standalone sí existe, salvo que `overscroll-behavior` o un contenedor interno de scroll lo bloqueen. Ojo: Chrome lo respeta en `html` y Safari en `body`. Para BassLayer, con datos que cambian (precios, agenda), conviene **refrescar solo al volver** (`visibilitychange` + SWR) en vez de un gesto propio. | [firt](https://firt.dev/pwa-design-tips/); [Matuzović](https://www.matuzo.at/blog/2022/100daysof-day53) |
| **Página offline** | Chrome da una página offline por defecto si el SW no la provee. **El SW actual devuelve `undefined` para navegaciones no cacheadas.** Hace falta precachear el shell (`/`) y una `/offline` propia, y que las vistas muestren "lo último guardado". | [Chrome blog](https://developer.chrome.com/blog/update-install-criteria) |
| **Arranque y splash** | Android genera el splash con `background_color`, `name` e ícono. iOS necesita `apple-touch-startup-image` por tamaño, o queda pantalla blanca/negra. Con el fondo `#000` y el body negro, **el riesgo es bajo** si el primer paint es inmediato. Mantener el shell precacheado (Twitter Lite reabría en menos de 3 s). | [firt iOS notes](https://firt.dev/notes/pwa-ios/) |
| **Transiciones de vista** | Same-document `document.startViewTransition` es **Baseline desde Firefox 144 (2025-10-14)**: Chrome 111+, Safari 18+, Firefox 144+. Ya se usa en `App.jsx:506` con `prefers-reduced-motion`. Las de documento cruzado no hacen falta (es SPA). | [Chrome VT 2025](https://developer.chrome.com/blog/view-transitions-in-2025); [WebKit](https://webkit.org/blog/16967/two-lines-of-cross-document-view-transitions-code-you-can-use-on-every-website-today/) |
| **App shortcuts** | **Android Chrome** (muestra los primeros 3 en el long-press), Chrome/Edge desktop y **Safari macOS (Dock)**. **iOS los ignora.** BassLayer ya tiene 3, que es el máximo útil. | [whatpwacando](https://whatpwacando.today/shortcuts/); [web.dev learn/pwa enhancements](https://web.dev/learn/pwa/enhancements); [Apple WWDC23](https://developer.apple.com/videos/play/wwdc2023/10120/) |
| **Share target** | Solo Android (WebAPK) y ChromeOS, y solo instalada; **iOS no lo soporta**. Para BassLayer **no aplica**: nadie va a "compartir hacia" BassLayer. **Además, un `share_target` con POST hace fallar en silencio la instalación en Samsung Internet.** | [web.dev OS integration](https://web.dev/learn/pwa/os-integration/); [openpwa Samsung](https://openpwa.net/reference/platforms/samsung-internet/) |
| **`launch_handler`** | `client_mode: navigate-existing` evita ventanas duplicadas en desktop; no está en iOS. | [Chrome docs](https://developer.chrome.com/docs/web-platform/launch-handler/) |

**Errores típicos que delatan que "es una web":**

1. Contenido debajo del notch o de la hora (falta de `viewport-fit=cover` + safe-area).
2. Long-press en un botón o link que selecciona texto o abre el callout de vista previa. Se arregla con `-webkit-touch-callout:none; user-select:none` **solo en los controles**, nunca en `body`.
3. Flash gris o azul al tocar (`-webkit-tap-highlight-color: transparent`).
4. Rebote elástico que deja ver el fondo, o pull-to-refresh que recarga todo.
5. `100vh` que salta con el teclado o en el arranque en frío.
6. Ninguna forma de volver atrás, o un "atrás" de Android que cierra la app.
7. Pantalla de error del navegador sin conexión.
8. Ícono sin versión maskable: en Android queda chico, dentro de un círculo blanco.
9. Texto de "Instalá la app" visible **dentro** de la app ya instalada.
10. Hover pegado en touch (usar `@media (hover:hover)`).
11. Onboarding repetido en la app instalada de iOS (ver R1).

Fuentes: [firt PWA tips](https://firt.dev/pwa-design-tips/); [egghead](https://egghead.io/lessons/react-disable-text-selection-and-touch-callouts-in-a-pwa-on-ios); [dev.to keyboard bug](https://dev.to/cederhook/fixing-the-ios-standalone-pwa-keyboard-bug-that-shrinks-your-viewport-for-good-63d).

---

## 6. Casos premium (2025–2026) y qué hacen bien

- **Excalidraw, Squoosh y Photopea:** funcionan offline después de instalar, el arranque es instantáneo desde la caché y la UI no tiene nada de "página" (sin selección accidental, atajos de app). Son el estándar de "se siente nativa" ([Mobiloud 2026](https://www.mobiloud.com/blog/progressive-web-app-examples/); [Progressier examples](https://progressier.com/pwa-examples-you-can-learn-from)).
- **Twitter/X Lite y Pinterest:** shell mínimo y re-entrada en menos de 3 s; el ícono como canal principal ([web.dev](https://web.dev/case-studies/twitter)).
- **Starbucks:** sigue funcionando sin red (armar el pedido offline). El paralelo para BassLayer es **ver la agenda del finde sin señal en el boliche**.
- **Flipkart:** la entrada desde el ícono como métrica principal (60 % de las visitas).

**Sin verificar:** no encontré auditorías serias de PWA "premium" fechadas en 2025–2026 con números nuevos. Las listas de 2026 (Mobiloud, Progressier) repiten los casos de 2017–2019.

---

## 7. Recomendaciones para BassLayer

### Imprescindible (antes de invitar a instalar)

1. **Arreglar el standalone en iOS.** Agregar `viewport-fit=cover` al meta viewport, revisar con `env(safe-area-inset-top)` todo lo fijo arriba (util-bar, encabezado, modales) y probar en un iPhone real instalado. Si no, la primera impresión de la app es el reloj encima del contenido.
2. **Offline digno.** El SW tiene que precachear el shell y caer a `/` (SPA) o a una `/offline` propia en el estilo de la casa ("Sin señal. Esto es lo último que guardamos."). Si es posible, cachear la última respuesta del finde y de la Agenda con stale-while-revalidate, para que la agenda abra en el boliche sin señal. Sumar un paso al smoke que cargue con la red apagada.
3. **Resolver la amnesia de iOS (R1).** Al abrir la app instalada por primera vez en iOS: **no mostrar el onboarding** si `navigator.standalone` (quien instaló ya conoce el sitio) y, si es viable, **mover "Mi agenda" a algo que viaje**. Opciones: la URL de instalación (hacer que el `start_url` real de iOS sea la URL actual: iOS usa el `start_url` del manifest, a verificar en un dispositivo) o la Cache API, que reportes viejos dicen que se comparte (**a verificar en iOS 26/27**). Mínimo: avisar en el texto de iOS "Lo que guardaste en Safari no pasa a la app" o no invitar a instalar a quien tiene eventos guardados sin resolverlo.
4. **Invitación según el plan existente, con reglas exactas:**
   - Segunda visita **y** una señal de interés (abrir un evento, guardar, ver el finde). Nunca en la primera ni encima del contenido.
   - **Una línea abajo** que no tape el CTA del evento ni la util-bar FAB. Texto: "Sumá BassLayer a tu inicio", con [Sumar] y ✕.
   - **✕ = nunca más**, guardado en `localStorage`. Si el usuario borra datos, se puede ver una vez más; es aceptable.
   - **Android/Chromium:** el botón llama a `deferredPrompt.prompt()`. Hacer `preventDefault()` del mini-infobar solo si la línea propia se va a mostrar, para no perder la vía del navegador.
   - **iOS Safari:** el texto explica "⋯ → Compartir → Agregar a inicio". **Chrome en iOS** también puede (Compartir → Agregar a inicio). Detectar las dos variantes.
   - **Samsung/Firefox sin evento:** instrucciones de menú ("⋮ → Instalar") o **no mostrar nada**. Sin evento, no hay línea; mejor quedarse corto que mentir.
   - **Ocultar todo si ya está en `display-mode: standalone`** (y también la entrada del menú).
5. **Entrada fija en ⋯ "Sumar a inicio"**, visible solo si es instalable o es iOS en el navegador. Abre el mismo texto o diálogo.
6. **Medición mínima** con un beacon propio agregado (sección 3): `install_eligible`, `invite_shown`, `invite_dismissed`, `invite_clicked`, `prompt_accepted/dismissed`, `appinstalled`, `launch_standalone` (por plataforma). Sin IDs.
7. **Ícono maskable de 512** y revisar el recorte en Android (maskable.app). `orientation`: quitarlo, o usar `any`, para no trabar desktop y tablet.

### Conviene (siguiente ronda, cuando haya instalaciones)

8. **Push semanal "Ya están los elegidos del finde",** con opt-in **solo dentro de la app instalada** o desde la franja del finde en la Agenda, con botón propio y promesa explícita ("una vez por semana, jueves").
   - Android: funciona aunque no esté instalada. **Priorizar a los instalados**, porque Chrome no les revoca el permiso.
   - iOS: solo instalada; usar Declarative Web Push (18.4+), con fallback al SW.
   - Backend: VAPID + `web-push` en Express, guardando la suscripción en Supabase **sin datos personales**. Baja con un toque en ⋯.
   - **Nunca más de una por semana.**
9. **Atrás coherente en standalone:** cada modal o vista profunda hace `pushState`, y el atrás de Android o el gesto de iOS cierra el modal, no la app. El smoke ya cubre Escape; sumar `history.back()` con un modal abierto.
10. **Pulido de standalone:** tap-highlight transparente, `touch-callout:none` en los controles, `overscroll-behavior-y: none` en `html,body` solo en standalone, hover solo con `(hover:hover)`, y refrescar los datos al volver (`visibilitychange`) en vez de pull-to-refresh.
11. **Shortcuts con marca de medición** (`?src=sc-hoy`, etc.). Ya están Hoy, Finde y Layer; es lo correcto. Revisar que el texto quede bien en el long-press de Android.
12. **Splash en iOS:** con fondo negro alcanza; si en un dispositivo se ve un flash blanco, generar `apple-touch-startup-image` para 3–4 tamaños.

### Después

13. **Badge** `1` cuando salen los elegidos del finde (iOS y desktop), solo si el push ya está y solo ese caso.
14. **Periodic Background Sync** en Android instalada para precargar el finde.
15. **`launch_handler: navigate-existing`** para desktop.
16. **Web Install API** si sale del origin trial y llega a stable (hoy no).
17. **Agregar al Dock** (macOS): ícono de 1024 opaco. Los shortcuts ya sirven ahí.

**No hacer:** `share_target` (no aplica y rompe Samsung), modales de instalación, invitar en la primera visita, push diario o de "nuevo evento", banners nativos de app stores (`prefer_related_applications`).

---

## 8. Riesgos

- **R1. Amnesia de iOS (alto).** La web app instalada en iOS arranca con `localStorage` vacío: se pierden "Mi agenda" y el onboarding hecho, y vuelve a mostrar el onboarding. Quien instaló porque guardó cosas abre la app y no encuentra nada. Hay que resolverlo o avisarlo antes de invitar en iOS.
- **R2. Safe area (alto, verificar).** `black-translucent` sin `viewport-fit=cover` probablemente pone el contenido debajo del reloj en el iPhone instalado.
- **R3. Offline roto (medio).** Hoy, sin red y con una ruta no cacheada, aparece el error del navegador: es lo opuesto a una app.
- **R4. Samsung 27+ sin `beforeinstallprompt` (bajo-medio).** Es el 4 % del tráfico mobile en Argentina. Sin evento no hay botón; no prometer un botón que no existe.
- **R5. Interrupción (medio para la marca).** Cualquier invitación mal ubicada tapa la util-bar o el CTA del modal de evento. Revisar en preview mobile + desktop con el modal abierto.
- **R6. Push (medio).** Un pedido mal hecho quema el permiso y Chrome manda el sitio a la UI silenciosa. Un push que no cumple lo prometido produce bajas (~10 % con 1/semana en apps nativas).
- **R7. Datos de casos viejos.** Los números famosos son de 2016–2019 y correlacionales. No prometerle a Pablo un "+150 %".
- **R8. Atrás de Android cierra la app** si los modales no empujan historial.
- **R9. Links externos dentro del navegador in-app en iOS:** algunos checkouts de terceros (login, pagos) pueden comportarse distinto. Probar un flujo de compra de entradas real desde la app instalada.

---

## 9. Qué medir

1. **Base de plataformas propia:** % iOS / Android / desktop y % Chrome / Samsung / Safari en BassLayer (Cloudflare Web Analytics ya lo da). Define cuánto esfuerzo poner en iOS.
2. **Funnel de instalación por plataforma:** elegibles → invitación vista → ✕ / clic → diálogo aceptado → `appinstalled`. En iOS: invitación vista → primera apertura en standalone.
3. **Tasa de cierre con ✕** de la invitación. Si pasa el ~70–80 %, el momento o el texto están mal.
4. **Aperturas en standalone por día / instalaciones acumuladas:** proxy de retención sin IDs. Es la métrica de "volver".
5. **% de visitas totales que vienen en standalone** (Flipkart llegó al 60 %; es la meta de largo plazo).
6. **Uso de shortcuts** (`src=sc-*`).
7. **Push** (cuando exista): mostrados el pre-permiso → aceptados / rechazados por el sistema → suscripciones activas → bajas por semana → clics por envío. Referencia: CrUX mobile 23 % de aceptación en prompts genéricos; con pre-permiso contextual debería ser mucho mayor.
8. **Offline:** cuántas aperturas en standalone sirven el shell desde la caché sin red (contador desde el SW con un beacon diferido).

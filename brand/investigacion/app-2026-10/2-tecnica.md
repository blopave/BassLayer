# Ícono y apertura de una PWA: guía técnica (estado al 2026-10-12)

Investigación con fuentes oficiales primero (Apple HIG, notas de versión de Safari y blog de WebKit, web.dev, Chrome for Developers, MDN, Android Developers, Microsoft Learn) y, cuando no hay documento oficial, al menos dos fuentes de la comunidad que coincidan. Cada dato lleva su fuente y su fecha.

Cómo leer las marcas:
- **[V]**: verificado con 2 o más fuentes, con al menos una oficial.
- **[V-com]**: verificado con 2 o más fuentes de la comunidad que coinciden, sin documento oficial.
- **[1F]**: una sola fuente.
- **[NV]**: no se pudo verificar.

---

## 0. Estado actual de BassLayer (lo revisé en el repo)

| Archivo / tag | Hoy | Problema |
|---|---|---|
| `public/apple-touch-icon.png` | 180×180, RGBA, el píxel (0,0) es transparente | iOS pinta de negro lo transparente (ver §1.1). Si la idea es que el ícono sea negro, el resultado da igual, pero no lo controlamos nosotros. |
| `public/icon-192.png` y `icon-512.png` | RGBA con esquinas transparentes, `purpose: any` | Sirven como `any`. |
| Maskable | Se reusa `icon-192.png` (transparente y sin margen) como `maskable` | **Está mal.** web.dev pide íconos maskable opacos y con margen, separados de los `any`. Además falta el de 512. Android va a recortar el arte y rellenar lo transparente. |
| `favicon.svg` | Existe | Revisar que traiga `@media (prefers-color-scheme)` adentro. |
| `favicon.ico` | **No existe** | Lo siguen pidiendo algunos navegadores y lectores de RSS. |
| Ícono 1024 o SVG maskable para Safari en Mac | No existe | WebKit recomienda uno opaco y a sangre (§3.2). |
| `theme-color` | `#000000`, sin `media` | En Safari 26 y 27 no tiene efecto (§1.6). En Chrome y Edge sí. |
| `apple-mobile-web-app-status-bar-style` | `black-translucent` | Sigue siendo la única forma de que la web ocupe también la zona de la barra de estado en iOS. |
| Shortcuts | Los 3 reusan `icon-192` | Funciona, pero el mínimo de Android es 96×96, y con un ícono propio por acceso se distingue cada uno. |
| Screenshots | narrow 390×844 y wide 1280×800 | Cumplen las reglas de Chrome (≥320, relación ≤2,3). El de 390×844 es chico: conviene pasarlo a resolución retina, por ejemplo 1170×2532 (también ≤2,3). |

---

## 1. iOS / iPadOS (iOS 26, y también 27)

### 1.1 apple-touch-icon
- **Tamaño:** con un PNG de 180×180 alcanza. La guía de Apple (archivada, actualizada en 2016) lista 152 (iPad), 167 (iPad Retina) y 180 (iPhone Retina). Elige "el más adecuado y, si no hay, el más chico de los que son más grandes". [V] [Apple, Configuring Web Applications, rev. 2016-12-12](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) · [Evil Martians, act. 2026-01-21](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs)
- **Redondeo:** lo pone el sistema. El archivo va cuadrado, sin esquinas redondeadas. La HIG dice que en iOS, iPadOS y macOS "el sistema aplica la máscara que produce las esquinas redondeadas", y que entregar capas ya enmascaradas "afecta los reflejos y deja bordes serruchados". Desde iOS 7 Safari no le agrega efectos (brillo) al ícono. [V] [HIG App icons, cambio 2026-06-08](https://developer.apple.com/design/human-interface-guidelines/app-icons) · [Apple archivada](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- **Transparencia:** no se respeta. iOS rellena con **negro** todo lo transparente. [V-com] [RealFaviconGenerator](https://realfavicongenerator.net/blog/apple-touch-icon-turns-black) · [makandra](https://makandracards.com/makandra/26757-do-not-use-transparent-pngs-for-ios-favicons) · [Apple Forums 713895](https://developer.apple.com/forums/thread/713895)
- **Si no hay `<link>`:** iOS busca en la raíz archivos `apple-touch-icon*.png`. Si no hay ninguno, arma el ícono con una captura de la página o con una letra. [V-com] (lo de la raíz figura en la guía archivada de Apple; lo de captura o letra lo describen RealFaviconGenerator y [tomayac sobre macOS](https://dev.to/tomayac/web-apps-on-macos-sonoma-14-beta-83i))
- **¿apple-touch-icon o manifest?** Desde iOS 15.4 WebKit lee los `icons` del manifest, pero **si hay `apple-touch-icon`, gana el link** (firt.dev, 2023). Safari 26 confirma que "si definís tus íconos en el manifest, se usan". WebKit todavía ignora `maskable` y `monochrome` (firt.dev). [V] [WebKit WWDC25, 2025-06-09](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/) · [firt.dev iOS PWA, 2023-06-06](https://firt.dev/notes/pwa-ios/)
- **SVG:** Safari 26 acepta SVG "en todos los lugares donde hay íconos, incluidos los favicons". Lo que no está claro es si un `apple-touch-icon` en SVG termina como ícono del inicio. [1F, oficial] [WebKit WWDC25](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/) · [Notas Safari 26: "Added support for SVG icons"](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes). Recomendación: **seguir con PNG 180** para el inicio de iOS.

### 1.2 Modo oscuro, tintado, transparente y Liquid Glass en las web apps del inicio
- **Para las apps nativas:** la HIG define seis apariencias (default, dark, clear light, clear dark, tinted light, tinted dark) y dice que **"el sistema genera automáticamente las variantes que no proveés"**. [V] [HIG, cambio 2026-06-08](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- **Para las web apps no hay forma de entregar variantes.** No existe ningún link, meta ni campo del manifest para dark, tinted o clear. Hay un hilo en los foros de Apple preguntando exactamente eso (iOS 26 y macOS 26) que sigue **sin respuesta de Apple**. [V-com] [Apple Forums 787919, jun 2025](https://developer.apple.com/forums/thread/787919) · [Apple Forums 761615 (iOS 18)](https://developer.apple.com/forums/thread/761615)
- **Lo que pasa en la práctica:** el sistema le aplica a las web apps su versión automática de dark, clear y tinted (la misma que a las apps nativas sin variantes), y se ve mal sobre todo en Clear y Tinted ("casi no se ve nada", según el hilo 787919). Para que el sistema aplique ese tratamiento hace falta `apple-touch-icon`: con íconos solo en el manifest, el ícono quedaría siempre igual. [V-com] [branclon, 2026-01-30](https://branclon.com/blog/liquid-glass-pwa-icons/) · Apple Forums 787919
- **Liquid Glass sobre el ícono plano:** iOS 26 le pone su material de vidrio encima a un ícono plano de web app. La franja de lente del borde inferior puede volver gris lo oscuro y empastarlo. No se puede desactivar. [V-com, débil] [PR pipetooling #4001](https://github.com/clickconstruction/pipetooling.github.io/pull/4001) + el hilo 787919 sobre la mala legibilidad. **Ojo:** ninguna fuente oficial lo dice así.
- **El viejo truco de JS** (cambiar el `apple-touch-icon` según `prefers-color-scheme` antes de agregar al inicio) solo fija la variante del momento en que se instala; si el usuario después cambia de modo, no se actualiza. [1F] Apple Forums 761615.
- **Safari 27 (salió el 2026-09-14):** no cambió nada sobre web apps ni íconos. Lo revisé en las notas de 26.1 a 26.5 y en la [página de funciones de Safari 27.0 (2026-09-17)](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/), y además en la [nota de versión de Safari 27](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes). [V]

### 1.3 Safari 26: "Abrir como web app"
- En iOS y iPadOS 26, **todo** sitio agregado al inicio se abre como web app por defecto. El usuario puede apagar "Open as Web App" en el momento de agregarlo. Ya no hace falta ni el manifest ni la meta `apple-mobile-web-app-capable`: "cero requisitos de instalabilidad". Si hay manifest, sus beneficios se aplican. [V] [WebKit Safari 26.0, sept 2025](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) · [WebKit WWDC25](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/) · [Notas Safari 26: "Added support for any website to become a web app on iOS or iPadOS"](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes) · [Michael Tsai, 2025-10-03](https://mjtsai.com/blog/2025/10/03/web-apps-in-ios-26/)
- Esto mismo ya pasaba en Mac desde Sonoma (sept 2023).

### 1.4 Cómo se actualiza un ícono ya instalado en iOS
- **No se actualiza.** iOS guarda la imagen que tomó al instalar. Hay que **borrar y volver a agregar**. Cambiar el nombre del archivo o agregarle `?v=N` solo sirve para instalaciones nuevas y para el caché de Safari. [V-com] [Apple Forums 23984](https://developer.apple.com/forums/thread/23984) · [Apple Forums 31599](https://developer.apple.com/forums/thread/31599) · Apple Forums 761615 ("tendrían que reinstalar"). Apple no tiene documentación oficial sobre esto.
- **Consecuencia:** el ícono de iOS hay que acertarlo de entrada. Cada cambio posterior solo les llega a los que instalen de nuevo.

### 1.5 Pantallas de arranque (`apple-touch-startup-image`)
- iOS **ignora `background_color`** del manifest para la pantalla de arranque. La única forma de definirla sigue siendo `<link rel="apple-touch-startup-image">`, con una imagen por tamaño de dispositivo y orientación (media queries con `device-width`, `device-height`, `-webkit-device-pixel-ratio` y `orientation`). [V-com] [firt.dev](https://firt.dev/notes/pwa-ios/) · [gist de Evan Bacon](https://gist.github.com/EvanBacon/7fd4dc3be3d00096579bb0b134c56ec7) · [spomky-labs](https://pwa.spomky-labs.com/favicons/startup-images)
- **¿Hace falta?** No es obligatoria. La guía de Apple de 2016 decía que sin ella se usa "una captura de la última vez que se abrió". Cómo se comporta eso en iOS 26 no lo pude verificar. [NV]
- **Tamaños:** hay que generar uno por modelo de iPhone y iPad, vertical y horizontal (más de 20 archivos). Ejemplos: 1290×2796, 1179×2556, 1170×2532, 1284×2778, 1125×2436, 750×1334, 640×1136, más los iPad. Lo práctico es generarlos con [pwa-asset-generator](https://github.com/elegantapp/pwa-asset-generator) o con [progressier](https://progressier.com/pwa-icons-and-ios-splash-screen-generator). Los tamaños de los modelos 2025 y 2026 (iPhone 17 y 18) no los verifiqué contra Apple. [NV para los modelos nuevos]
- **Recomendación para BassLayer:** el fondo ya es negro (`#000`). Una pantalla de arranque negra con el símbolo al centro es la opción mínima. Generarlas solo si el arranque en blanco o la captura molestan en un iPhone real.

### 1.6 `apple-mobile-web-app-status-bar-style` y `theme-color` en iOS
- **`status-bar-style`:** acepta `default`, `black` y `black-translucent`. `black-translucent` es la única forma de que la web se dibuje debajo de la barra de estado (pantalla completa). Antes solo funcionaba en modo standalone; ahora todo lo agregado al inicio es standalone (§1.3). [V] [Apple archivada](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) · [firt.dev](https://firt.dev/notes/pwa-ios/)
- **`theme-color` en Safari 26 y 27: no se usa.** Safari todavía lo lee, pero **toma el color de la interfaz del `background-color` de `body`/`html` o de un elemento `position: fixed` o `sticky` pegado al borde**. No hay documento de Apple que lo diga. [V-com] [Danny Moerkerke](https://x.com/dannymoerkerke/status/1995944519632912570) · [Ben Frain](https://benfrain.com/ios26-safari-theme-color-tab-tinting-with-fixed-position-elements/) · [grooovinger, 2026-02-27](https://grooovinger.com/notes/2026-02-27-safari-26-header-background) · [1ar.io, 2026-05-13](https://1ar.io/updates/safari-26-liquid-glass-web/) · [nasedk.in (Safari 26–27)](https://nasedk.in/blog/ios26-safari-toolbar-colors/)
- **Trampa (1ar.io):** un elemento fijo con `opacity:0` o `pointer-events:none` **igual tiñe** la barra. Solo `display:none` lo saca del cálculo. Para que la barra inferior sea transparente hace falta `viewport-fit=cover`. [1F]

---

## 2. Android / Chrome

### 2.1 Íconos maskable
- **Zona segura:** todo lo importante tiene que caber en un círculo centrado de **radio 40 % del ancho** (diámetro 80 %). El 10 % de cada borde se puede recortar. En 512 px eso es un círculo de unos 409 px. [V] [web.dev maskable](https://web.dev/articles/maskable-icon) · [MDN Define app icons, 2025-06-30](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) · [Evil Martians ("409×409")](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs)
- **Tiene que ser opaco y a sangre.** No conviene usar `"purpose": "any maskable"` en un mismo archivo: hay que tener **archivos separados**. Usar un maskable como `any` le agrega margen de más, y usar un `any` como maskable recorta el arte. [V] web.dev · [dev.to/progressier](https://dev.to/progressier/why-a-pwa-app-icon-shouldnt-have-a-purpose-set-to-any-maskable-4c78)
- **Sin maskable:** Android centra el ícono `any` dentro de un círculo con **fondo blanco**. [V] MDN · web.dev
- **Como referencia, la zona segura del ícono adaptativo nativo** es más chica: lienzo de 108 dp, zona segura de 66 dp (61 %), logo de 48 a 66 dp. El 80 % de los maskable es de la especificación web; quedarse en un 60 a 66 % cubre ambos casos. [V] [Android adaptive icons, act. 2026-09-22](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive)

### 2.2 Ícono "monochrome" (íconos temáticos de Android 13+)
- El manifest acepta `"purpose": "monochrome"` (solo se usa el canal alfa) y Edge lo documenta como valor válido. Pero **Chrome para Android NO lo usa para los íconos temáticos de las PWA instaladas**. El issue [crbug 40277264 "Chrome Android PWA is not using monochrome icons to create Material You themed icons"](https://issues.chromium.org/issues/40277264) se abrió el 2023-07-30, tuvo actividad hasta el 2026-10-11 y sigue abierto. El estado lo deduje de los datos del tracker, sin iniciar sesión. [V] crbug · [detail.design](https://detail.design/detail/themed-icon-for-pwa-on-android) · [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/icon-theme-color)
- **Consecuencia:** con el tema de íconos activado en Android, una PWA de BassLayer va a aparecer **a color, sin teñir**. Agregar un monochrome no cuesta nada y queda preparado para cuando Chrome lo soporte, pero hoy no cambia nada.

### 2.3 WebAPK y pantalla de arranque
- Al instalar desde Chrome, Android genera un **WebAPK** (una app real en el lanzador) con el `name`, los íconos y los colores del manifest.
- **Pantalla de arranque:** Chrome la arma sola con `name`, `background_color` y el ícono. Elige el ícono que mejor encaja con la densidad del dispositivo, y con 192 y 512 se cubre la mayoría de los casos. [V] [web.dev Add manifest, act. 2024-09-18](https://web.dev/articles/add-manifest) · [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons)
- Que el ícono de la pantalla de arranque salga del maskable con la máscara circular de Android 12+, lo dicen fuentes secundarias. El tamaño mínimo exacto no lo verifiqué. [NV]
- **Para BassLayer:** `background_color: #000000` y el ícono centrado. Si el maskable tiene fondo negro, la pantalla de arranque se ve continua.

### 2.4 Cuándo se actualiza el ícono instalado
- **Android (WebAPK):** Chrome revisa el manifest como mucho una vez cada 24 h. Si falla, espera hasta 30 días. El WebAPK nuevo se pide **cuando se cerraron todas las ventanas de la app, el teléfono está cargando y conectado a WiFi**. `icons` está entre los campos que disparan la actualización. Hay un umbral de diferencia visual para pedir confirmación. [V] [web.dev manifest-updates, act. 2024-09-19](https://web.dev/articles/manifest-updates) · [Chrome blog 2026-01-21](https://developer.chrome.com/blog/improvements-to-web-app-updates)
- **Escritorio (Chrome 144, enero 2026):** vuelve la actualización de ícono y nombre. Ya no aparece un diálogo que obliga a decidir: queda una sugerencia en el menú de tres puntos ("Review app update"). **Para que el ícono se actualice hay que cambiar la URL del ícono o su metadata**, porque Chrome trata las URLs de íconos como inmutables. Los cambios de menos de 10 % de píxeles se aplican solos (como mucho una vez por día). Se sacó el límite de una revisión diaria. [V] [Chrome blog, 2026-01-21](https://developer.chrome.com/blog/improvements-to-web-app-updates) · [blink-dev Intent to Ship (M143, escritorio)](https://groups.google.com/a/chromium.org/g/blink-dev/c/3h-Rx2kVQow)
  - Las fuentes no coinciden en las plataformas: el Intent to Ship dice "solo escritorio" y el blog muestra Android y escritorio. Lo seguro: en escritorio es así; en Android sigue el flujo WebAPK de arriba.
- **Regla práctica:** cada ícono nuevo va con nombre nuevo (`icon-512.v2.png`). El `id` del manifest no se cambia nunca.

### 2.5 Accesos directos (`shortcuts`)
- Chrome para Android muestra **3**, y Chrome y Edge en Windows hasta **10**. El ícono tiene que ser **de al menos 96×96** (en Android, la mitad del tamaño ideal de 48 dp; Bubblewrap exige 96). [V] [web.dev App shortcuts, 2020](https://web.dev/articles/app-shortcuts) · [MDN shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts)
- Que los íconos de los accesos directos acepten `maskable` no lo verifiqué. [NV] Lo seguro es un 96 y un 192 opacos con el glifo dentro del 80 %.

---

## 3. Escritorio

### 3.1 Chrome y Edge (Windows y macOS)
- **Windows:** usa los `icons` del manifest **sin máscara** (el PNG `any` tal cual, con transparencia). Edge recomienda como mínimo un 512 (nivel 1) y, para afinar, 44/71/150/310 con escalas de 1,25×, 1,5×, 2× y 4×, más tamaños exactos de 16, 24, 32, 48 y 256. La barra de título toma el color de `theme_color` o de la meta `theme-color` (la meta tiene prioridad). [V] [Microsoft Learn, act. 2026-09-02](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/icon-theme-color) · [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons)
- **macOS con Chrome:**
  - Hasta macOS 15, Chrome dibujaba él mismo la forma de ícono de macOS. Usaba el maskable si había, con un recorte de alrededor de 80 %.
  - **Desde macOS 26, Chrome ya no enmascara nada**: le pasa la imagen entera a macOS, que redondea las esquinas. Lo confirmé en el [commit de Chromium 751e1bea "Stop masking web app icons on macOS 26", 2026-08-18](https://chromium.googlesource.com/chromium/src/+/751e1bea6746b7f04a6061940e900be14e5f0e9f): `ShouldUseSystemAppIconMasking()` devuelve verdadero si la versión mayor de macOS es 26 o más. **En qué versión estable de Chrome entró no lo verifiqué** (fue en main en agosto de 2026, así que sería alrededor de M147–M148). [V para el código, NV para la versión]
  - Que Chrome en Mac prefiera el `maskable` sobre el `any` lo dicen fuentes de la comunidad. [V-com] [recollect.fyi](https://notes.recollect.fyi/share/6V2TIdUxZzRTHAQpi1R7tM) · [PR tome #344, 2026-10-04](https://github.com/nicolasances/tome/pull/344)
- **macOS 26 y la "cárcel del squircle":** si un ícono no llena la forma de rectángulo redondeado, **macOS lo mete en una placa gris** y lo achica. [V-com] [lapcatsoftware, 2025-06-11](https://lapcatsoftware.com/articles/2025/6/2.html) · [Michael Tsai](https://mjtsai.com/blog/2025/11/11/tahoes-terrible-icons/) · PR tome #344
- **Conclusión para Mac:** el ícono va **cuadrado, opaco y a sangre, sin dibujar el squircle**. La forma la pone el sistema.

### 3.2 Safari "Agregar al Dock" (macOS Sonoma en adelante, incluido Tahoe 26)
- Se abre siempre como web app. WebKit recomienda **al menos un ícono `maskable` cuadrado, opaco y a sangre en el manifest, en SVG (cualquier tamaño) o en bitmap de 1024×1024**. Si no lo hay, puede usar el `apple-touch-icon`. Si solo hay un ícono transparente con forma propia, Safari lo acomoda sobre el fondo del sistema. Guarda todos los tamaños: el más grande va a Finder y Quick Look, uno mediano al Dock y Launchpad, y uno chico a Spotlight. Sin ícono, genera uno con la primera letra del título. [V] [WebKit Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) · [tomayac, 2023-06-07](https://dev.to/tomayac/web-apps-on-macos-sonoma-14-beta-83i)
  - Hay una fuente de la comunidad (recollect.fyi) que dice que Safari usa el `any`, lo que choca con lo que dice WebKit. Me quedo con WebKit.
- La HIG de 2026 dice que en macOS **el sistema enmascara** (provee capas cuadradas) y que las apariencias dark, clear y tinted también existen en macOS 26. Para las web apps del Dock, ahí tampoco hay forma de entregar variantes. [V para las nativas, NV para las web apps]

---

## 4. Favicon 2026: el set mínimo

Basado en [Evil Martians, act. 2026-01-21](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs), [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) y [web.dev](https://web.dev/articles/add-manifest). [V]

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"> <!-- 180, opaco -->
<link rel="manifest" href="/manifest.json">
```

- **SVG con modo oscuro:** se pone un `<style>@media (prefers-color-scheme: dark){…}</style>` adentro del SVG. Funciona en Chrome, Edge y Firefox. Safari 26 sumó favicons SVG [V oficial], pero que respete el `prefers-color-scheme` dentro del favicon no lo verifiqué. [NV]
- **Pestaña a 16 px:** el `.ico` de 32 se achica a 16. Si a 16 se ve borroso, conviene dibujar a mano una versión de 16 (Evil Martians). A ese tamaño entran el símbolo y nada más: nada de palabras ni trazos de menos de 2 px a 32.

---

## 5. Manifest

| Campo | Qué hace hoy | Fuente |
|---|---|---|
| `screenshots` | Activan el **diálogo de instalación enriquecido** (estilo tienda de apps). Chrome para Android lo tiene desde la versión 94 y escritorio desde la 108. Hace falta al menos 1 captura del `form_factor` que corresponda: `wide` en escritorio, `narrow` en móvil. Reglas: lados entre 320 y 3840 px, el lado mayor no más de 2,3 veces el menor, la misma relación de aspecto entre las del mismo `form_factor`. Chrome muestra de 1 a 8 en escritorio y de 1 a 5 en Android. Conviene ponerles `label` (texto alternativo). | [V] [web.dev add-manifest](https://web.dev/articles/add-manifest) · [Chrome blog richer install UI desktop](https://developer.chrome.com/blog/richer-install-ui-desktop) · [MDN screenshots, 2025-06-23](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/screenshots) |
| `description` | Sale en ese diálogo. Máximo 300 caracteres en Chrome; si se pasa, lo corta con "…". | [V] web.dev · web.dev patterns |
| `id` | Es la identidad de la app. Se resuelve contra el origen del `start_url`. **Si se cambia, pasa a ser otra app.** Además es obligatorio para poder cambiar el `start_url` sin romper la app. | [V] [MDN id, 2025-05-05](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id) · web.dev manifest-updates |
| `display_override` | Una lista de modos de visualización que se prueba antes de `display`, en orden. | [V] web.dev · MDN |
| `launch_handler` | `client_mode`: `auto`, `focus-existing`, `navigate-existing` o `navigate-new`. Es experimental y funciona en Chromium. Safari y Firefox no lo soportan. | [V] [MDN, 2025-11-13](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler) · [Chrome docs](https://developer.chrome.com/docs/web-platform/launch-handler/) |
| `theme_color` claro/oscuro | **El manifest no acepta `media`.** Para tener dos colores se usan dos `<meta name="theme-color" media="(prefers-color-scheme: …)">` en el HTML. Eso funciona en Chrome y Edge; en Safari 26 y 27 no tiene efecto (§1.6). | [V] [MDN theme_color, 2025-12-18](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/theme_color) · [MDN meta theme-color, 2026-04-22](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color) |

**Lo que pide Chrome para ofrecer la instalación** ([web.dev install-criteria, act. 2024-09-19](https://web.dev/articles/install-criteria) · [Chrome blog dic 2023](https://developer.chrome.com/blog/update-install-criteria)) [V]:
- HTTPS.
- Que la app no esté instalada ya.
- Interacción mínima: al menos un clic o toque y 30 segundos en la página.
- Manifest con `name` o `short_name`, `icons` de **192 y 512**, `start_url`, `display` en `fullscreen`, `standalone`, `minimal-ui` o `window-controls-overlay`, y `prefer_related_applications` ausente o en false.
- **Ya no hace falta un service worker con `fetch`**: desde Chrome 108 en móvil y 112 en escritorio para instalar desde el menú. El blog de dic 2023 aclara que el aviso automático de instalación todavía lo pedía en ese momento; que hoy siga así no lo verifiqué. [NV para el aviso automático en 2026] BassLayer tiene `sw.js`, así que no le afecta.

---

## 6. Tabla de archivos a exportar

Un solo arte maestro vectorial (SVG), con dos versiones de composición: **"a sangre"** (fondo que llena todo el cuadrado) y **"glifo"** (solo el símbolo, con fondo transparente).

| Archivo | Tamaño | Fondo | Propósito / dónde se ve | Zona segura |
|---|---|---|---|---|
| `favicon.svg` | vector | transparente; `prefers-color-scheme` adentro | Pestaña en Chrome, Edge, Firefox y Safari 26 | Símbolo legible a 16 px |
| `favicon.ico` | 32 (adentro también 16) | transparente o sólido | Navegadores viejos, RSS, Windows | Ídem; dibujado a mano a 16 si hace falta |
| `apple-touch-icon.png` | **180×180** | **opaco, a sangre, sin esquinas redondeadas** | Inicio de iOS y iPadOS; respaldo para el Dock de Safari en Mac | Esquinas redondeadas del sistema y Liquid Glass. Símbolo de alrededor de **60 a 65 % del lado**, centrado y lejos del borde inferior. [V-com, débil] |
| `icon-192.png` | 192 | transparente (glifo) o a sangre (ver §7) | `any`: Windows, instalación de Chrome, notificaciones | Sin máscara |
| `icon-512.png` | 512 | ídem | `any`: Windows (nivel 1), pantalla de arranque, requisito de Chrome | Sin máscara |
| `icon-maskable-192.png` | 192 | **opaco, a sangre** | `maskable`: lanzador de Android | Círculo de radio 40 % (≈154 px de diámetro); ideal de 61 a 66 % |
| `icon-maskable-512.png` | 512 | **opaco, a sangre** | `maskable`: Android, pantalla de arranque de Android, Chrome en macOS | Círculo de ≈409 px; ideal de 315 a 340 px |
| `icon-1024.png` (o `icon-maskable.svg`) | 1024 | **opaco, a sangre**, `purpose: maskable` | Safari "Agregar al Dock" (Finder, Quick Look, Dock); Chrome en macOS 26 (nitidez) | Lo enmascara macOS; mismo criterio de 60 a 66 % |
| `icon-monochrome-512.png` (opcional) | 512 | silueta sola, alfa | `monochrome`: preparado para el día que Chrome lo soporte (hoy no hace nada) | Ídem maskable |
| `shortcut-hoy-96.png`, `-192` (×3 accesos) | 96 y 192 | opaco | Accesos directos en Android (3) y Windows | Glifo dentro del 80 % |
| `screenshot-narrow.png` | p. ej. **1170×2532** (relación 2,16) | — | Diálogo de instalación enriquecido en móvil | — |
| `screenshot-wide.png` | p. ej. **1920×1080** o 1280×800 | — | Diálogo de instalación enriquecido en escritorio | — |
| `apple-touch-startup-image-*.png` (opcional) | uno por dispositivo y orientación | negro + símbolo | Arranque en iOS | Símbolo centrado, fuera de la isla dinámica |
| Windows (opcional, nivel 4) | 16/24/32/48/256 + tiles 44/71/150/310 ×1–4 | transparente | Barra de tareas, inicio, Alt+Tab | Sin máscara |

Para Retina y escalas: iOS es @3x (180 = 60 pt × 3) y @2x (152/167 en iPad). Android tiene densidades de mdpi a xxxhdpi, y con 192 y 512 se cubren (Chrome escala). macOS va de 16 a 1024, y con un 1024 o un SVG se cubre. Windows escala de 1× a 4× (si no se dan, los saca del 512).

---

## 7. Qué controlamos y qué decide el sistema

| Plataforma | Controlamos | Decide el sistema |
|---|---|---|
| iOS/iPadOS 26–27 | El PNG de 180 (contenido y color de fondo), el nombre (`apple-mobile-web-app-title` o `short_name`), `status-bar-style`, las pantallas de arranque | La máscara redondeada, la capa de **Liquid Glass**, las **variantes dark, clear y tinted (automáticas, sin forma de entregar las nuestras)**, el color de la interfaz de Safari (sale del CSS, no de `theme-color`), si se abre como web app (el usuario puede apagarlo), cuándo se actualiza el ícono (nunca) |
| Android / Chrome | El ícono maskable y el `any`, `background_color`, `theme_color`, el nombre, los accesos directos, las capturas, la descripción | La forma de la máscara (círculo, squircle, etc., según el lanzador), la pantalla de arranque (la arma Chrome), el tema de íconos (hoy no tiñe las PWA), cuándo se actualiza el WebAPK |
| Windows (Chrome/Edge) | Los PNG por tamaño y escala, `theme_color` (barra de título) | No enmascara; usa el ícono tal cual |
| macOS (Chrome) | Ícono maskable o a sangre | En macOS 26+ **el sistema redondea**; si el ícono no llena la forma, lo pone en una placa gris |
| macOS (Safari Dock) | Maskable 1024 o SVG; respaldo `apple-touch-icon` | La máscara, el fondo del sistema para íconos transparentes, el ícono con letra si no hay ninguno |
| Pestaña | SVG con modo oscuro, ICO | El tamaño (16 o 32 según la densidad) |

---

## 8. Trampas conocidas

1. **Un `apple-touch-icon` transparente se ve con fondo negro** en iOS. Hoy el nuestro tiene esquinas transparentes.
2. **Usar el mismo archivo como `any` y `maskable`** (como hoy en BassLayer): o se recorta el arte o queda chico. Van separados.
3. **Íconos solo en el manifest sin `apple-touch-icon`:** en iOS, el link gana sobre el manifest, y sin link se pierde el tratamiento de Liquid Glass (comunidad).
4. **Cambiar el ícono "en el mismo archivo":** iOS no lo actualiza nunca, y Chrome de escritorio desde la versión 144 tampoco si no cambia la URL. Cada versión va con nombre nuevo.
5. **Cambiar el `id` del manifest** pasa a ser otra app instalada.
6. **`theme-color` en Safari 26+ no tiene efecto:** el color de la barra sale del `background` del `body` o de un elemento fijo arriba. Un elemento fijo invisible (`opacity:0`) igual tiñe.
7. **macOS 26:** dibujar el squircle con margen transparente termina en una placa gris (doble marco). Hay que entregar el cuadrado a sangre.
8. **Ícono oscuro sobre fondo oscuro en iOS:** en las variantes automáticas Dark, Clear y Tinted, un símbolo negro sobre fondo negro **desaparece** (Apple Forums 787919: "casi no se ve nada"). Lo que sobrevive es el contraste de luminancia del símbolo contra su fondo, no el color.
9. **Banda inferior de Liquid Glass:** puede empastar los detalles finos de la parte de abajo del ícono (comunidad).
10. **Las capturas** de un mismo `form_factor` tienen que tener la misma relación de aspecto, con una relación de 2,3 como máximo. Si no, Chrome no muestra el diálogo enriquecido.
11. **Android sin maskable:** pone el ícono sobre un círculo blanco, que con una marca negra queda como un parche.
12. **Íconos temáticos de Android:** aunque declaremos `monochrome`, hoy no se usa. No hay que prometer "el ícono se adapta al tema".

---

## 9. Consecuencias para el diseño

- **En iOS el ícono VA a aparecer sobre fondos que no elegimos.** Pasa si el usuario usa Dark, Clear o Tinted, y Apple genera esas versiones sola a partir de nuestro PNG de 180. Además, en Default le pone el vidrio encima. Eso exige:
  - un **símbolo único y grueso**, sin texto ni trazos finos, con **contraste de luminancia fuerte** contra su propio fondo (en Tinted y Clear sobrevive casi solo la silueta);
  - nada importante en la franja inferior; el símbolo en alrededor del **60 a 65 % del lado**, centrado;
  - un fondo **opaco** (negro BassLayer está bien como fondo, pero el símbolo tiene que ser claro).
- **Un solo ícono para dos mundos:** como iOS no permite variantes y Android no tiñe, el ícono tiene que ser **neutral** y no favorecer a Bass ni a Layer (coherente con la regla de "reposo neutral").
- **Composición "a sangre" como base:** sirve para iOS (180), Android maskable, macOS (Chrome y Safari) y la pantalla de arranque de Android. La versión "glifo transparente" queda para el favicon, el `any` de Windows y la pestaña.
  - **Duda abierta:** ¿el `any` de 192 y 512 va a sangre o como glifo? En Windows, a sangre queda como un cuadrado negro en la barra de tareas; como glifo se ve más nativo. En Mac con Chrome se usa el maskable, así que da igual. **Recomiendo el glifo para `any` y a sangre para el maskable y la Apple.**
- **Zona segura común:** si el símbolo cabe en un **círculo centrado de 61 a 66 % del lado**, funciona en todas: Android nativo (66/108), maskable (80 %), iOS con vidrio y macOS.
- **16 px:** el símbolo tiene que leerse como silueta a 16 px. Si no se lee, hay que hacer una versión simplificada para la pestaña.
- **Apertura:** en Android la pantalla de arranque es `background_color` negro + ícono + nombre (la arma Chrome). En iOS no hay pantalla de arranque si no generamos los PNG por dispositivo. Para que la apertura sea continua, el primer cuadro del home tiene que ser negro (ya lo es) y conviene que el `body` tenga fondo explícito, porque Safari 26 también saca de ahí el color de su interfaz.
- **Primero hay que acertar el ícono:** en iOS cambiarlo después obliga a reinstalar. Vale la pena probarlo en un iPhone real con Default, Dark, Clear y Tinted antes de publicarlo.

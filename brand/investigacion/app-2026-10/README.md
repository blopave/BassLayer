# App instalable · investigación (2026-10-12)

Investigación previa al ícono y a la app instalable (PWA) de BassLayer. Va antes de dibujar cualquier opción. Se trabajó en cuatro frentes, cada uno con su informe completo en esta carpeta:

| Archivo | Frente |
|---|---|
| `1-interna.md` | Lo nuestro: anatomía de la ficha, candidatos a ícono, reglas de Pablo, lecciones de las rondas 1–27, problemas de los íconos actuales. |
| `2-tecnica.md` | Reglas de iOS 26/27, Android, escritorio, favicon y manifest. Cada dato con fuente y nivel de verificación. |
| `3-referencias.md` | El oficio del ícono, de identidad viva a ícono fijo (19 casos), rubros música y finanzas, marcas duales, ícono como merch, 6 territorios. |
| `4-instalacion.md` | Instalar y volver: estado 2026, patrones de invitación con casos medidos, medición sin cuentas, push, sentirse app. |
| `prueba-escala-ficha.png` | La ficha real (`src/brand/ficha.js`) y la "B · Ficha" de la ronda 21 a 180/96/48/32/16 px, desenfocadas y en grises. Se genera con `prueba-escala-ficha.mjs`. |

Niveles de verificación usados en los informes: [V] = 2 fuentes o más, con al menos una oficial; [V-com] = comunidad; [1F] = una sola fuente; [NV] = no verificado.

---

## 1. El problema, en una frase

La marca es una **escena viva** (vinilo + velas del BTC real sobre un horizonte, con los mundos en equilibrio). Un ícono es lo contrario: **fijo, chiquito, a veces sin color**. Hay que destilar la escena sin que deje de parecerse a ella.

Las dos maneras de errar ya están probadas en `prueba-escala-ficha.png`:
- **Achicar la ficha tal cual:** a 96 px ya es ruido, y en reposo es casi negra (cobre y celeste al 32 %, contraste 1,7). La auditoría de la ronda 20 le dio Escala 3/10.
- **Un símbolo correcto pero ajeno:** la "B · Ficha" de la ronda 21 pasó todas las pruebas (16 px, un color, grises, áreas 49/51), y Pablo la vio "genérica, plana, sin la escena". Se lee como un domo al lado de un gráfico de barras.

**La vara entonces son dos:** que pase la escala **y** que alguien que vio el home lo reconozca como la ficha.

## 2. Lo que dicen los cuatro frentes juntos

### Qué tiene que ser el ícono
1. **La forma fija que está debajo de la escena.** Lo vivo (datos, movimiento) va encima como relleno o luz; la silueta no cambia nunca. Es la lección del MIT Media Lab, que abandonó su logo generativo a los 3 años y volvió a un signo fijo, y también de Nordkyn, Casa da Música, Spotify 2015 e Instagram 2022 (`3-referencias.md` §2).
2. **Una sola forma focal**, que se reconozca en silueta negra y desenfocada (Apple HIG, Flarup). A 48 px entran 3 formas sólidas y 1 línea; a 16 px, 2 o 3 manchas (`1-interna.md` §2).
3. **La dualidad, por forma y no por color.** iOS 18/26 en modo tintado y oscuro pasa el ícono a un tono por luminancia, y cobre contra celeste da 1,23 de contraste: en grises son el mismo color. **Curva contra recto** (analógico contra digital) es lo que tiene que separar a Bass de Layer. El cobre y el celeste refuerzan, no explican.
4. **El horizonte es el elemento que une.** Las marcas duales que funcionan (Mastercard, Dolby, Ualá) repiten o reflejan la misma forma, o tienen un tercer elemento compartido. En BassLayer ese tercero ya existe, es neutral por definición y es lo que mejor sobrevive a 16 px.
5. **El 50/50 se mide, no se iguala por áreas.** Un círculo tiene que medir el 112,84 % del lado de un cuadrado para pesar igual (Bjango). El celeste es más luminoso que el cobre (L .416 contra .329). Hay que medir área ponderada por brillo a 512 y a 48 px, como en las rondas 19 y 21.
6. **Un solo ícono, neutral.** iOS no acepta variantes por modo y Android no tiñe las PWA (el `monochrome` sigue sin soporte en Chrome, crbug 40277264). Cumple con "una sola marca" y con el reposo neutral.
7. **Funciona como objeto.** Tiene que poder ser, sin cambios, favicon, sticker troquelado y pin esmaltado: 2 colores planos, sin degradés ni vidrio, con contorno propio fuera del squircle.

### Clichés que hay que evitar
- **Música:** el vinilo literal (Discogs), el ecualizador (SoundCloud), la onda (Spotify), el slipmat con texto (Boiler Room) y la corchea (Apple Music). RA, DICE y Tidal no usan ninguno.
- **Finanzas:** las velas como gráfico (más de 6.000 logos de stock; ninguna marca líder las usa; TradingView las abstrajo).
- **En BassLayer se salvan** porque son datos reales que se mueven. En un ícono fijo eso se pierde, así que **no pueden aparecer literales y solos**: lo propio es su relación (sobre el mismo horizonte, uno reflejo o continuación del otro).
- **Trampa de la casa:** 3 barras celestes de alturas crecientes se leen como ecualizador, y en el sitio las barras son el idioma de Bass (títulos de barras). Si aparecen velas, tienen que conservar algo de vela.

### Reglas de plataforma que fijan el dibujo (`2-tecnica.md`)
- **Arte a sangre y opaco** para iOS, maskable y Mac: el fondo llena todo el cuadrado y el sistema redondea. Hoy los PNG tienen esquinas transparentes y un redondeo propio, y en iOS eso sale negro.
- **Zona segura común:** el glifo dentro de un círculo centrado del **61–66 % del lado**, que sirve para el maskable de Android (40 % de radio), el adaptativo nativo (66/108) y el squircle de iOS.
- **Fondo oscuro siempre.** El boleto hueso "rompió la estética" y la ficha es oscura también de día. Falta decidir el tono exacto: el `#0E0E0F` de la ficha o el `#000` del manifest.
- **Escalera de dibujos, no un achique:** completo para ≥ 64 px, medio para 32–48 px, mini para ≤ 24 px (rondas 22–23). Bjango arma capas alternativas por tamaño.
- **Sin texto ni trazos finos.** El nombre ya aparece debajo del ícono (sería duplicado), y lo que no llega a 48 px no entra.
- **Hay que acertarlo de entrada:** en iOS el ícono instalado no se actualiza nunca (hay que borrarlo y volver a agregarlo). En Chrome de escritorio, desde la versión 144 solo se actualiza si cambia la URL del archivo. Probarlo en un iPhone real, en los modos Default, Dark, Clear y Tinted, antes de invitar a instalar.

## 3. Territorios para explorar

Salen de `3-referencias.md` §7 filtrados por las reglas de la casa. En los cuatro, el horizonte cruza el ícono de borde a borde y la máscara del sistema hace de ficha; el disco no va dentro del cuadrado.

| | Territorio | Idea | Fundamento | Riesgo |
|---|---|---|---|---|
| **I** | **Fotograma destilado** | La ficha reducida a sus 3 formas: medio vinilo, velas y horizonte, a plena luz y parejas. Es "la escena dormida". | Es la conexión más directa con el home y con lo que la gente ve. Retoma la escalera de las rondas 22–23. | Quedar cerca de la "B · Ficha" archivada. Tiene que ganar en dibujo propio, no en literalidad. |
| **II** | **El reflejo traduce** | Una sola forma arriba del horizonte y su reflejo abajo, pero el agua traduce: el arco del vinilo se refleja en bloques escalonados. Bass arriba, Layer en el reflejo, o al revés. | Dolby y Mastercard: la misma forma da el 50/50 exacto. La escena ya tiene reflejos en bloques y ondas. | Que se lea como yin-yang o como un logo de audio genérico si la traducción es débil. |
| **III** | **Una línea, dos lecturas** | Un solo gesto sobre el horizonte: de un lado curva (surco), del otro escalón (vela). La metamorfosis en lugar de la suma. | Tidal y Ualá. Es coherente con la transición onda↔curva del sitio (WorldLine, "una sola línea"). | El más difícil de dibujar. Necesita una versión mini propia para 16 px. |
| **IV** | **El horizonte con dueño** | El signo es la línea compartida y cada mundo es lo mínimo que la toca, de un lado y del otro. | Mastercard: el elemento compartido es la marca. Es neutral por construcción y lo que mejor sobrevive a 16 px. | Pablo vio el Horizonte del 5 de octubre "muy básico". Necesita un rasgo propio que lo haga nuestro. |

**Descartados:**
- **Monograma "BL"** (T5): genérico, y Pablo rechazó las letras.
- **Ficha-moneda con partición interna** (T4): demasiado cerca de Boiler Room, del yin-yang y de la ronda 21. Sus lecciones de objeto y merch se aplican a los cuatro territorios.

**Cómo se prueba cada opción** antes de mostrarla: silueta negra; desenfoque; 16, 29, 48, 60 y 180 px; iOS Default, Dark, Clear y Tinted, y Android; pantalla de inicio con otras apps; sticker troquelado y pin de 2 colores; 50/50 medido; y la prueba nueva, **¿se reconoce la ficha?**, con el home al lado.

## 4. Más allá del ícono: la app (`4-instalacion.md`)

**Arreglar antes de invitar a instalar** (encontrado en el código, sin probar en un iPhone real):
1. **El contenido queda debajo del reloj en iPhone:** `index.html` usa `black-translucent` sin `viewport-fit=cover`, así que los `env(safe-area-inset-*)` valen 0.
2. **En iOS la app instalada arranca vacía:** no comparte `localStorage` con Safari, así que "Mi agenda" aparece vacía y el onboarding se repite. Como mínimo, no repetir el onboarding dentro de la app.
3. **Sin conexión sale la pantalla de error del navegador:** falta precachear el shell o tener una página offline propia (`public/sw.js`).
4. **Manifest:**
   - Falta un maskable de 512.
   - `orientation: portrait` traba la app en desktop y tablet.
   - Las capturas muestran el home viejo (HomeFusion), con Instagram.
5. **Generador peligroso:** `brand/logo/web.mjs` (en `main`) exporta el boleto descartado a `public/`, incluida `og-image.png`. Hay que reemplazarlo por el exportador del ícono nuevo, que tome todo de `brand/` como dice el README.

**La invitación** (el plan del 4 de octubre, confirmado por web.dev y por el caso Weekendesk):
- Una línea abajo, en la segunda visita y con una señal de interés.
- La ✕ la cierra para siempre.
- Una entrada fija en el menú ⋯.
- Nunca aparece dentro de la app instalada.
- Si el navegador no ofrece la instalación, no se muestra nada.
- En iPhone el camino es **⋯ → Compartir → Agregar a inicio**: desde iOS 26 todo se abre como web app y no hay API para instalar.

**El público:**
- Argentina, según StatCounter (septiembre 2026): Android 87 %, iOS 13 %. No hay una segunda fuente con datos del país.
- El público de electrónica de CABA probablemente tiene más iPhone que el promedio: conviene mirarlo en las visitas propias antes de decidir cuánto invertir en iOS.
- Chrome concentra el 86 % del celular.

**Medir sin cuentas:** un `sendBeacon` a un endpoint propio con contadores diarios (evento, plataforma, modo), sin IDs. Mide la invitación vista, la ✕, la instalación (`appinstalled` en Chromium, primera apertura standalone en iOS) y las aperturas desde el ícono.

**Volver, después:**
- **Push semanal** "Ya están los elegidos del finde": jueves, una por semana, ofrecido solo dentro de la app instalada. Chrome no les quita el permiso a las apps instaladas (Google, 2025-10-10).
- **Datos de referencia:** en celular se acepta el 23 % de los pedidos de permiso genéricos.
- **Badges en el ícono:** iOS y escritorio sí, Android no.

## 5. Preguntas para Pablo antes de dibujar

1. ¿Qué territorios exploramos? Recomendación: **I, II y III**, con IV como control.
2. **Shortcuts:** ¿el mismo ícono "encendido" de un lado para Hoy/Finde (Bass) y para Layer, o todos neutrales?
3. **Pantalla de arranque:** ¿el ícono se abre en la ficha del home desde el mismo encuadre (continuidad), o simple?
4. ¿Seguimos la sugerencia de que el ícono **no lleve letras**? Es la regla de las portadas, extendida al ícono.

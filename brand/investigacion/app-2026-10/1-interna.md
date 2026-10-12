# Ícono de la app instalable · auditoría interna (2026-10-12)

Brief de investigación previo a diseñar. Solo lectura del repo; no se modificó nada.
Evidencia visual propia: `scratchpad/lamina.png` (la ficha real renderizada con `src/brand/ficha.js` en reposo / Bass / Layer, a 180·96·48·32·16 px, desenfocada y en grises, junto al símbolo "B · Ficha" de la ronda 21 en las mismas pruebas).

---

## 1. Anatomía exacta de la ficha

Fuente: `src/brand/ficha.js` (port fiel de `marca-escena:brand/investigacion/ronda-19/ficha.html`), `src/components/HomeFicha.jsx` y `src/styles.css` 5774–5798. Lienzo: `viewBox 0 0 400 400`.

### Elementos y geometría (unidades del viewBox)
| Pieza | Dónde | Medidas |
|---|---|---|
| **Disco (la ficha)** | ficha.js:109, 114 | Recorte `circle r=176` en (200,200) = 88 % del lado; fondo `r=182` (#0E0E0F) = 91 % (CSS 5777: "el disco ocupa el 91 % del dibujo"). Sin aro ni borde. |
| **Horizonte** | ficha.js:35, 123 | Línea a `y=228` (H), de borde a borde, `#EDEAE4` (papel) trazo 1,6, opacidad .42. Cae al **58 %** de la altura del disco (más cielo que agua). Es lo único neutral (ni cobre ni celeste). |
| **Vinilo (Bass)** | ficha.js:36–37, 82–87 | Centro x=124 (mitad izquierda), `VR=100`. Cuerpo `#151515` (contraste 1,06 contra el fondo: **el cuerpo no se ve**, solo el surco y la etiqueta). Surco en espiral de 22 vueltas, r 38→100, trazo .8 cobre al 50 %. Dos gajos de brillo (papel .07 / .05) que giran. Etiqueta `r=34` cobre `#C49070` + agujero `r=3`. En reposo `rise=.65` → centro en y≈241,7, **13,7 bajo el horizonte**: se ve un poco menos de medio disco ("sale como un sol", ficha.js:37). |
| **Velas (Layer)** | ficha.js:40–60 | 12 velas japonesas del BTC real de 7 días (`setPrecio`, HomeFicha.jsx:24–25), entre x=226 y 368 (mitad derecha), ancho 8,4–9,4, mecha 2. Rellena si subió, hueca (relleno 18 % + borde) si bajó. Altura escalada bajo la cúpula del disco (`techo`, :46). En reposo crecen al 60 % (`grow .6`). |
| **Reflejos (el agua)** | ficha.js:67–79, 120–122 | Bajo el horizonte: "mar" de capas celestes en bloques (`dash`: el largo de cada bloque sale de los saltos del precio, :30); dentro del reflejo del vinilo las mismas líneas se vuelven **ondas cobre** (el sonido); debajo de cada vela, sus **luces en bloques** punteadas. Paso 9,5, trazo 3,4. |
| **Cielo** | ficha.js:80, 116 | Líneas celestes horizontales punteadas, muy tenues (opacidad .07 en reposo). |
| **Franja del nombre** | ficha.js:38, 108 | Banda y=292–362 enmascarada (sin agua) para que el nombre HTML se lea encima. |
| **Nombre "Bass LAYER"** | HomeFicha.jsx:101–104; CSS 5784–5795 | En HTML, encima, centrado al **79 %** de la altura, `font-size 8cqw` (8 % del ancho de la ficha). "Bass" Geist 700, −0,03 em, `#C49070`, opacidad .72; "LAYER" Geist 300 al 80,5 %, +0,1 em, `#6CB8C8`, opacidad 1; aire .28 em. Sombra negra fuerte para separarlo del agua. Es el **selector**, no un rótulo. |

### Color (tokens reales)
- Cobre `#C49070` (`--bl-accent-bass`, styles.css:79; `CU` ficha.js:10). Celeste `#6CB8C8` (`--bl-accent-layer`, :80; `CY`). Papel `#EDEAE4`. Fondo de ficha `#0E0E0F`; vinilo `#151515`.
- Fondo del home: radial `#121214 → #050505` (CSS 5775). Día: papel `#F3EFE8 → #E2DCD2`, **la ficha sigue oscura** ("un vinilo es negro", CSS 5796–5797).
- Par de día de la marca: `#8E5B3A` / `#2A6E7C` (styles.css:212–213), 5,2 y 5,3 sobre hueso.
- Medido hoy: cobre 6,96 y celeste 8,57 sobre `#0E0E0F`; **cobre contra celeste 1,23** (misma luz: en grises son iguales, ya lo marcó la ronda 20).

### Comportamiento
- Estados (`objetivo`, ficha.js:128–131): **reposo** `dimL=dimB=.32`, vinilo a .65, velas al 60 %, todo quieto (HomeFicha.jsx:46–47: asentada, no se redibuja); **Bass** el vinilo sube entero y gira, las ondas suenan, Layer cae a .16, arco "MÚSICA · FESTIVALES · AGENDA"; **Layer** el vinilo se pone, las velas crecen, cursor de lectura, cielo y mar corren, lista "CRIPTO · FINANZAS · NOTICIAS".
- Calibración medida en la ronda 19: `IDLE .65` = cobre/celeste 50/50 en reposo; `IL 3`, `KL .8` = intensidad y movimiento de Layer igualados a Bass (ficha.js:11–14).
- Reposo en números: cobre a .32 queda `#48382E` y celeste `#2C444A`, **contraste 1,7–1,9 contra el fondo**. El reposo es penumbra a propósito.

### Qué la hace reconocible
Por orden de peso: (1) **la silueta redonda** con un **horizonte claro que la parte por debajo de la mitad**; (2) **medio disco a la izquierda / barras a la derecha** sobre esa línea: curva contra barras, analógico contra digital; (3) la etiqueta cobre como único punto lleno de color; (4) el agua en bloques y ondas (textura, no forma); (5) el nombre bicolor encima. En la prueba de retina de la ronda 20 (y en `lamina.png`) solo queda "un disco oscuro con una mancha cobre": lo reconocible está en la **composición**, no en el detalle.

---

## 2. Inventario de candidatos, ranqueados

Escala: ★★★ se lee solo · ★★ se lee con ayuda · ★ ruido.

| # | Elemento | 48 px | 16 px | Riesgo |
|---|---|---|---|---|
| 1 | **Horizonte** (línea clara que cruza el disco) | ★★★ | ★★★ | Solo, es una raya: no dice nada. Es el **pegamento**, no el signo. Neutral (papel): la única pieza que no favorece a ningún mundo. |
| 2 | **Medio vinilo** (semicírculo cobre sobre el horizonte, con agujero) | ★★★ | ★★ (sin agujero) | A 16 px es un "sol naciente" o un domo: pierde lo "disco". Ronda 21: "un vinilo que no se leía". Necesita etiqueta o surco para ser vinilo, y eso muere bajo 32 px. |
| 3 | **Velas** (3 barras celestes de alturas crecientes) | ★★★ (3 velas) | ★★ (3 barras, sin mechas) | Con 3 alturas que suben se lee "gráfico de barras / señal / batería", no velas japonesas; 12 velas reales son ruido bajo 96 px. Riesgo de leerse como **ecualizador**, que en el sitio es de Bass (las barras de la onda). |
| 4 | **Disco contenedor** (la ficha) | ★★★ | ★★★ | Es la silueta que sobrevive al desenfoque. Pero adentro de la máscara del sistema (squircle iOS, círculo Android) un círculo en un cuadrado se achica (~80 % útil) y puede leerse como "botón". Con aro (ronda 21) suma línea fina que a 16 px se empasta. |
| 5 | **Etiqueta cobre** (el punto lleno) | ★★ | ★ | Es lo que queda en la retina, pero sola es un punto naranja: genérico. |
| 6 | **Reflejo del vinilo** (ondas cobre) | ★★ | ★ | La onda literal es cliché (NTS, informe-2026-10.md:17). Ronda 21 C "se empasta en chico por el reflejo". |
| 7 | **Luces de las velas / mar en bloques** | ★ | ★ | Textura pura; trazos de 3,4/400 = 0,4 px a 48 px. Desaparece. |
| 8 | **Surcos en espiral** | ★ | — | Trazo .8/400. Invisible bajo 128 px. Ronda 26 los redibujó en "tres pistas" para el escalón completo; el mini se queda con un surco. |
| 9 | **Cielo** | — | — | Invisible a cualquier tamaño de ícono. |
| 10 | **Nombre "Bass LAYER"** | ★ (ilegible en 1 renglón a 48) | — | El sistema ya escribe "BassLayer" debajo del ícono: **duplicado**. Además 2 pesos + 2 colores a 8 px de alto. |
| 11 | **B / L / "BL"** | ★★★ | ★★★ | Lo más legible y lo menos propio ("cualquier marca puede tener dos iniciales", borrador C). Es lo que hay hoy. Ronda 6 "B" y el boleto BL ya se probaron y se archivaron. |
| 12 | **Muescas** en el borde, a la altura del horizonte (ronda 25–26) | ★★ | ★★ | Es "lo único que sobrevive de lejos y a 16 px" según la ronda 25, pero viene del camino archivado; en el logotipo (ronda 27 C) "parece defecto de cerca". |

**Lectura de conjunto:** a 48 px funcionan **3 piezas sólidas + 1 línea** (disco, medio vinilo, 3 velas, horizonte). A 16 px, 2–3 manchas (el informe ya lo dice: "a 16 px sobreviven 2–4 piezas", informe-2026-10.md:15). La ficha tal cual, en cambio, es ruido desde 96 px y casi negra en reposo (ver `lamina.png`, fila 2).

---

## 3. Reglas de Pablo que el ícono no puede romper

| Regla (fuente) | Traducción a un ícono estático |
|---|---|
| **Equilibrio 50/50 medido, no estimado** (memoria project-marca-basslayer; ronda 15, 19; `IDLE .65`) | Medir el área cobre vs celeste ponderada por brillo (método `energia`/`medir` de rondas 19 y 21) **a 512 y a 48 px**. Ojo: el celeste es más luminoso (L .416 vs .329): a igual área, Layer pesa más. La ronda 21 compensó con el ancho de las velas (49/51). |
| **Reposo neutral y quieto** (feedback-reposo-neutral; HomeFicha.jsx:9–10) | El ícono es por definición el reposo: ningún mundo "elegido" (nada de vinilo subido ni velas encendidas de más). Pero el reposo del home es penumbra (contraste 1,7): el ícono necesita el **equilibrio** del reposo con la **luz** de un estado elegido. Las dos mitades a plena luz y parejas. |
| **Menos es más** (feedback-less-is-more) | Sacar antes que agregar. Nada de reflejos, cielo, surcos ni texto. Lo que no sobrevive a 48 px no entra. |
| **Nada duplicado** (memoria marca; home-ficha: "sin esquinas, repetían el nombre") | El nombre ya aparece bajo el ícono en la pantalla de inicio: el ícono **no lleva "BassLayer"** ni "Bass LAYER". Tampoco dos horizontes, dos discos, etc. |
| **Sin letras sueltas A/B/C** (feedback-less-is-more: "ya tienen nombre") | No rotular piezas. Extensible a monogramas: "BL" es la opción que la investigación ya descartó por genérica. |
| **Títulos de Bass hechos de barras** (feedback-bass-titulos-barras) | En el sitio, **las barras son de Bass** (la onda). Si Layer se dibuja con barras (velas simplificadas), se cruza el idioma. Las velas deben conservar algo de vela (mecha o cuerpo hueco/lleno) para no leerse como ecualizador. |
| **Movimiento lento y con causa** (ronda 19) | No aplica (estático), pero el ícono es el fotograma de partida de la escena: la pantalla de arranque podría continuar en la ficha sin salto. |
| **Calidad premium / costuras** (feedback-premium-design-qa) | Revisar recortes ampliados: costuras donde el horizonte toca el disco, el agujero del vinilo, bordes antialias del semicírculo a 48 px, pixel-snapping de las velas a 16. Medir colores con píxeles. |
| **Toda imagen externa con fallback** (CLAUDE.md) | El ícono no puede depender de datos vivos ni de fuentes del sistema: vector puro, sin `<text>` (hoy `favicon.svg` usa `font-family="sans-serif"`). Las velas, fijas (una "línea madre", idea de la ronda 5). |
| **Una sola marca; Bass y Layer sin logo propio, solo color** (README.md:23) | Si hubiera íconos por mundo (shortcuts), se diferencian por color/estado de la misma pieza, nunca por otro símbolo. |
| **iOS no actualiza íconos instalados** (project-app-instalable) | No invitar a instalar con un ícono provisorio: el ícono tiene que ser el definitivo. |

---

## 4. Lecciones de las rondas rechazadas o archivadas

- **Ronda 1–2** (signos de dos partes, 8 territorios): "se leen como dos cosas pegadas"; Pablo "perdido" (README.md:39–40). → Un ícono de "cobre a la izquierda + celeste a la derecha" sin algo que los una cae acá. El horizonte es lo que los une.
- **Ronda 3–4 Horizonte**: "muy básico, más que el nombre con dos colores y una línea" (README.md:42). → El corte/línea solo no alcanza: necesita los objetos.
- **Ronda 5 el pase / la línea de la semana**: "demasiadas cosas" (README.md:27). → Datos y fechas no van en la marca chica.
- **Ronda 6 el boleto**: aprobado y después frenado: "el ticket sin color (hueso) rompe con toda la estética" (README.md:32). Los íconos con el boleto llegaron a `main` (4527f65) y se revirtieron (b1ebace). → **Fondo claro/hueso, fuera**; el ícono vive sobre oscuro con color.
- **Prueba de retina** (ronda 6): "que se grabe": calco en la luneta + entrecerrar los ojos. Sigue siendo la vara.
- **Ronda 20 (auditoría, 5,5/10)** de la ficha: Memoria 4 ("desenfocada queda un disco oscuro con una mancha cobre"), **Escala 3 ("a 32 y 16 px es ruido… no sirve como favicon ni como ícono de app")**, Distintividad 5 ("vinilo y velas como los de cualquier banco de íconos"), Color 6 (1,23 entre mundos). Receta: "tres formas sólidas (medio vinilo, tres velas, el horizonte)… versión reducida diseñada aparte, no achicada".
- **Ronda 21 (rama `marca`, `f16fc6e`)**: 4 candidatos con las mismas pruebas. **B · Ficha** pasó todo: geometría en viewBox 100 → disco r 48 con aro papel 22 %, horizonte y=60 (2,6 de grueso, x 6–94), medio vinilo cx 33 r 22 con agujero r 6,5, velas en x 63/74/85 de alto 14/23/33 con mecha 6, ancho calculado para igualar áreas (≈ 49/51). A ≤32 px versión reducida sin mechas ni agujero. A perdió la silueta; C se empastó por el reflejo; D (dos campos) era la más fuerte para sticker pero el mar celeste desbalanceaba. **Pero Pablo no la eligió**: la ronda 22 arranca con "el símbolo de la ronda 21 se veía genérico, plano, sin la escena y con un vinilo que no se leía". → **Pasar las pruebas de escala no alcanza: tiene que parecer la ficha.** En `lamina.png` (fila 3) se ve por qué: es correcto pero es "un gráfico de barras al lado de un domo".
- **Ronda 22–23**: eligió **E · Fotograma** (la escena congelada, con surcos, etiqueta, velas huecas/llenas, reflejo) + **escalera de tamaños**: completo ≥64, medio 32–48, mini ≤24; "el símbolo no se achica, se redibuja… conserva siempre vinilo, velas y horizonte". Ícono de la app = escalón medio sobre negro.
- **Ronda 25–26**: dibujo propio: muescas en el borde a la altura del horizonte ("lo único que sobrevive de lejos y a 16 px"), tres pistas + mini horizonte en la etiqueta, cabeza de nota en las velas. En el mini (16–24) "solo quedan las muescas: son la silueta".
- **Ronda 27**: rasgo del logotipo (A Corte recomendada; B Hilo "lee guion bajo"; C Muescas "parece defecto de cerca"); **debajo de 24 px el rasgo se apaga**.
- **Archivo del camino** (2026-10-10 tarde): Pablo volvió a la escena viva y archivó el símbolo fijo. Leo que lo que no quiso fue **separar un símbolo de la escena**; lo que sí quiere es que la escena sea la marca. El ícono es el lugar donde la escena *tiene* que destilarse: el aprendizaje de escala (escalones, 3 formas, áreas iguales) es reutilizable; la estética "plana/genérica" no.
- **Borrador del 4 oct** (`brand/aplicaciones/app-instalable-borrador.html:98–107`): A "las dos firmas" (barras cobre + cursor celeste del header), B "una sola línea" (trazo cobre→celeste), C monograma BL. Los tres son anteriores a la ficha y quedaron viejos: A usa el idioma del header (ya no es la marca), B es la onda literal (cliché), C es genérico.

---

## 5. Estado y problemas de los íconos actuales y del manifest

Archivos: `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180), `favicon.svg`, `manifest.json`, `index.html:43–49`, `public/sw.js:1–2`.

**Íconos**
1. **"BL" genérico** que no es de la marca, y mal renderizado: en los PNG la letra salió de una fuente de reserva fina (la B parece un "8"), no Geist 800 como pide el SVG. Ocupa ~43 % del lado (bbox 145–367 en 512).
2. **Esquinas transparentes con redondeo horneado** (alfa 0 en (0,0) en los tres PNG). Apple pide arte a sangre sin redondear (informe-2026-10.md:16, 74); en iOS lo transparente se rellena y el redondeo propio choca con la máscara del sistema.
3. **No hay maskable propio**: `manifest.json:53` reusa el 192 como `maskable` (con esquinas transparentes, sin zona segura pensada y a 192 px: se ve borroso en launchers de alta densidad). Falta `icon-maskable-512.png`.
4. **Falta ícono `monochrome`** (Android 13+ temático) y `favicon.ico` 32 (informe-2026-10.md:73–76).
5. **`favicon.svg`** usa `<text font-family="sans-serif">`: depende de la fuente de cada sistema; sin versión para pestaña clara (el texto `#e5e5e5` sobre negro va bien, pero cambia con el SO).
6. **Shortcuts** (`manifest.json:13–31`): los tres usan el mismo `icon-192.png`. Oportunidad: Hoy/Finde = Bass, Layer = Layer.
7. **Generador peligroso**: `brand/logo/web.mjs` está en `main` y exporta **el boleto** (marca descartada) a `public/` (favicon.svg/.ico, apple-touch, icon-192/512, maskable, **og-image.png**). Correrlo hoy pisaría los íconos con el boleto. El pipeline nuevo debería reemplazarlo (y es una buena base: sharp + ICO + maskable al 80 %).
8. **Caché**: el SW cachea `/favicon.svg` y `/icon-192.png` (`sw.js:2`, `basslayer-v6`): al cambiar íconos hay que subir `CACHE_VERSION`. El server los revalida siempre (`server.js:211–215`). El JSON-LD usa `icon-512.png` como logo (`server.js:6490`).

**Manifest**
- `theme_color` y `background_color` `#000000`: coherentes con `--bl-bg` (#000) pero la ficha vive sobre `#121214→#050505` y `#0E0E0F`; la pantalla de arranque (ícono centrado sobre `background_color`) debería empalmar con el home.
- `screenshots`: `screenshot-desktop.png` muestra **HomeFusion** (el home viejo, reemplazado el 2026-10-10); `screenshot-mobile.png` muestra la agenda de Bass. Ninguna muestra la ficha.
- `orientation: "portrait"` fuerza vertical también en tablets.
- Coherencia de textos: `description` está bien ("La noche y el mercado…"), pero `index.html:40–41` (twitter) sigue con "Crypto LATAM" / "crypto" (regla del sitio: "cripto" en ES).
- Sin `purpose` separado para un maskable 512; sin `monochrome`.

---

## 6. Preguntas abiertas que el ícono tiene que resolver

1. **¿Un ícono neutral o uno por mundo?** La regla de una sola marca y el reposo neutral piden **uno neutral**. ¿Los shortcuts (Hoy/Finde → Bass, Layer) llevan la misma pieza "encendida" de un lado?
2. **¿Qué estado de la ficha es el ícono?** El reposo real es penumbra (1,7 de contraste): ¿"reposo con luz" (los dos a plena luz, 50/50) o un fotograma propio?
3. **¿Disco dentro del cuadrado o escena a sangre?** El disco es la silueta reconocible, pero dentro del squircle de iOS deja un anillo negro y achica todo al ~80 %. ¿El horizonte puede ir de borde a borde del ícono (la máscara del sistema hace de ficha)?
4. **¿Fondo oscuro siempre?** Todo indica que sí (el boleto hueso rompió la estética; en día la ficha sigue oscura). ¿`#0E0E0F` de la ficha o `#000` del manifest? ¿Qué pasa con el monochrome de Android?
5. **¿Cuántas velas y cuáles?** 3 sólidas (ronda 21) se leen pero parecen barras/ecualizador (idioma de Bass); 5 (ronda 24) son el BTC real pero más finas. ¿Velas fijas con forma de vela (mecha, una hueca)? ¿De qué semana?
6. **¿Cómo se lee "vinilo" a 48 px y no "sol/domo"?** Etiqueta cobre sobre disco oscuro (como la ficha) vs medio disco cobre lleno (ronda 21). El cuerpo `#151515` no se ve sobre negro: hay que decidir cómo se separa del fondo.
7. **¿Cómo se mide el 50/50 con el celeste más luminoso?** ¿Área, brillo ponderado (método ronda 19) o ambos, y a qué tamaños?
8. **¿Grises?** Cobre y celeste dan 1,23: ¿el ícono debe distinguirse sin color (forma curva vs barras alcanza)?
9. **¿Escalera?** ¿Un dibujo para ≥48 (app), otro para 16–32 (favicon/pestaña)? ¿Se acepta que el favicon pierda el agua y quede disco + horizonte + vinilo + velas?
10. **¿Reflejo sí o no?** Es lo que hace "ficha" a la ficha (el agua debajo del horizonte), pero se empasta. ¿Una sola insinuación (franja oscura bajo el horizonte) o nada?
11. **¿Recupera algo del dibujo propio archivado** (muescas en el borde a la altura del horizonte, etiqueta con mini horizonte) o queda fuera por venir del camino que Pablo dejó?
12. **¿Pantalla de arranque**: el ícono sobre el fondo y luego la ficha del home "se enciende" desde el mismo encuadre (continuidad), o simple?
13. **¿Pipeline**: reemplazar `brand/logo/web.mjs` por un exportador desde un SVG fuente en `brand/logo/` (regla del README: el sitio toma los íconos de `brand/`, nunca al revés)?

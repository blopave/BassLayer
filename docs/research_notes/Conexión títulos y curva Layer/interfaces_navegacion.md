# Interfaces donde un gráfico, una línea o un diagrama funciona como navegación (y cómo se conectan sus rótulos con la forma)

Contexto de aplicación: curva log de BTC 2012→hoy, una sola línea celeste #6CB8C8 sobre casi negro, 8 secciones como puntos parejos sobre la curva, cada una con título (nombre + dato vivo gris mono) en el cielo vacío de arriba. El foco al hover ya está resuelto; lo que falta es el REPOSO. Hoy hay una rama Bézier ondulada que termina en una "regla" vertical, y se lee pegada, tiembla, compite con la curva y la diagonal larga obliga a seguirla con el ojo.

Nota de método: hice unas 18 búsquedas y lecturas. Varias fuentes primarias no se pudieron leer: la página de Apple HIG "Charting data" se renderiza con JS y volvió vacía, y el artículo de Urban Institute dio 403. Eso queda en Gaps; no completé nada de memoria como si fuera un dato citado.

## 1. Sitios premiados donde una línea, un timeline o un mapa es el menú

### Takeaway
Awwwards tiene catalogados varios "timeline menus" reales, pero casi todos son menús cronológicos (una regla horizontal con hitos), no un gráfico de datos usado como índice. El caso "curva de datos = único índice de la portada" casi no tiene antecedentes documentados, y eso es una oportunidad: no hay un patrón de referencia que copiar.

### Cited Findings
- **"Timeline Selection Menu"** en *When to Travel* (Inside Asia Tours), de Unseen Studio: es un "chronological menu" para elegir meses o temporadas y filtrar destinos según el momento del viaje. URL: https://www.insideasiatours.com/when-to-travel — [Awwwards](https://www.awwwards.com/inspiration/timeline-selection-menu)
- **"Interactive Timeline Menu"** en *TIM: The History of Connection* (archivo histórico de Gruppo TIM), de Tommaso Mezzavilla, con tags interactive / navigation / hover / timeline / menu. URL: http://archiviostoricoexperience.gruppotim.it/en/ — [Awwwards](https://www.awwwards.com/inspiration/interactive-timeline-menu)
- Otros elementos catalogados: "Navigation Timeline" (*10 Years of Impact*, The DataFace, con panel de filtros), "Circular Timeline Navigation" (narrativa, drag, web audio), "Horizontal timeline navigation" (*European Music Incubator*, de Murmure) y "Timeline Navigation Bar and Scroll Triggered Animations" (step navigation) — [Awwwards búsqueda](https://www.awwwards.com/inspiration/navigation-timeline-10-years-of-impact), [Circular](https://www.awwwards.com/inspiration/circular-timeline-navigation), [Horizontal](https://www.awwwards.com/inspiration/horizontal-timeline-navigation), [Scroll-triggered](https://www.awwwards.com/inspiration/timeline-navigation-bar-and-scroll-triggered-animations)
- **Stripe Press** (referente de minimal premium sobre casi negro): libros 3D sobre fondo casi negro, rótulos de autor y título "in small serif type", un wordmark "whisper-quiet" y "a tiny vertical index at the edge". La navegación es un scroll paralelo en el que los libros rotan — [Siiimple](https://siiimple.com/stripe-press/); [WebGPU showcase](https://www.webgpu.com/showcase/3d-books-by-stripe-press/); [Yuin Chien](https://yuinchien.com/p/stripe-press)

### Inferences
- Lo que comparten estos menús de timeline es que **el rótulo se ancla a una posición del eje (x), no a la forma**. La línea es un riel de lectura y no algo que haya que perseguir con el ojo. Eso apoya resolver el reposo con **alineación vertical (columna) en vez de un conector diagonal**.
- Stripe Press muestra el tono que busca Pablo: la tipografía chica y callada hace de índice y el objeto (acá, la curva) se lleva el protagonismo. Su "índice vertical al borde" se parece a la "franja índice" ya descartada, así que **solo sirve como referencia de tono**, no de estructura.

### Gaps
- No pude revisar Godly, Siteinspire, Minimal Gallery ni CSS Design Awards en este tiempo: no encontré ni verifiqué un ejemplo concreto ahí de "gráfico de datos como menú".
- Las fichas de Awwwards no describen cómo se ven los rótulos y su conector en reposo. Habría que abrir cada sitio con el navegador para describirlos (TIM y When to Travel son los primeros a mirar).

## 2. Fintech y producto de datos: cómo marcan eventos sobre una serie temporal

### Takeaway
Las herramientas profesionales separan dos lugares. Hay marcas **sobre la serie** (círculos con una letra pegados a la barra) y marcas **sobre el eje de tiempo** ("timescale marks", figuras chicas apoyadas en la escala de abajo). Las segundas no tapan la línea. Apple (Swift Charts) usa la **RuleMark**: una regla vertical con la anotación arriba. Es el antecedente directo de la "regla" actual, pero sin la Bézier.

### Cited Findings
- **TradingView Charting Library, dos familias de marcas.** Las *Chart marks* son "circles that are attached to bars and contain a character inside"; se pueden personalizar el tamaño, el color y labels de 2 caracteres. Al hover en desktop o tap en touch "a tooltip appears", y con `pin_bar_mark_tooltips_on_click` el tooltip queda fijo al click. Las *Timescale marks* son "figures above the time scale", con forma (`shape`) e imagen (`imageUrl`) configurables, y abren un tooltip — [TradingView docs: Marks](https://www.tradingview.com/charting-library-docs/latest/ui_elements/Marks/)
- En TradingView los earnings aparecen como **íconos "E" sobre el eje X** en la fecha del reporte, y la forma y el color cambian según la sorpresa (verde hacia arriba, rojo hacia abajo, cuadrado gris si es 0 o falta, rosa si todavía no se conoce) — [TradingView: Earnings](https://www.tradingview.com/support/solutions/43000629790-earnings/). Los dividendos se ven como señales azules en la escala inferior — [BlackBull](https://blackbull.com/en/support/how-do-i-customise-my-tradingview-chart/). Todo esto se apaga o se prende desde Settings → Events — [TradingView soporte](https://www.tradingview.com/support/solutions/43000494799-how-can-i-enable-disable-colored-circles-of-earnings-splits-or-dividends-on-a-chart/)
- **Swift Charts (Apple), RuleMark.** Es una línea vertical si solo se fija x. Con `.annotation` se le suma un texto que "adds a text label at the top of the rule mark, with leading alignment". El modificador `.annotation` coloca una vista relativa a cualquier mark para rotular puntos u outliers — [Create with Swift](https://www.createwithswift.com/customizing-a-chart-in-swift-charts/); [Swift Charts guía](https://swiftcrafted.dev/article/swift-charts-complete-guide-data-visualization-swiftui); [WWDC22 "Swift Charts: Raise the bar"](https://developer.apple.com/videos/play/wwdc2022/10137/)
- **Robinhood, scrubbing.** Al arrastrar el dedo sobre el gráfico, "a gold crosshair, dot and price/time tag follow the finger", el precio grande de la tarjeta muestra el valor en ese punto y hay un "light haptic tick" por punto en Android (descripción de un clon open source que replica el comportamiento) — [GitHub PR que replica Robinhood](https://github.com/odia11/social-multi-trading-chain-/pull/86); el scrubbing sirve para "compare their securities at specific points in time" — [Robinhood: Using charts](https://robinhood.com/gb/en/support/articles/using-the-charts/); librería oficial de sparkline con scrub: [robinhood/spark](https://github.com/robinhood/spark)

### Inferences (traducción a la curva)
- **Patrón "regla pura" (RuleMark).** Sacar la Bézier y dejar **solo una regla vertical hairline** desde el título hasta un poco antes de tocar la curva (un hueco de 4–8 px), con el título alineado a la izquierda arriba de la regla, igual que la anotación de Swift Charts. Funciona porque la vertical no compite con la forma de la curva, que es diagonal o ascendente, y el ojo la lee como "esta x" sin tener que seguirla. El riesgo es que, con 8 reglas parejas, se forme una "rejilla" de barrotes que se parezca al "riel parejo" ya descartado. Para mitigarlo: largos variables (cada regla termina donde está la curva, así que su largo copia la forma de la curva en negativo) y opacidad muy baja (~15–20 %).
- **Patrón "timescale mark".** El conector es el **eje**, no la curva: un tick mínimo sobre una línea base o sobre la fecha, y el título encima. Choca con "títulos en el cielo arriba" y suma un eje que hoy no existe. Lo anoto como alternativa, no como recomendación.
- **Patrón "chart mark" (círculo con letra pegado a la serie):** **descartado**, porque equivale a las "cápsulas sobre la curva".
- **Scrubbing a lo Robinhood en mobile.** Con la curva vertical, arrastrar el dedo por el tronco va "pasando" por las 8 secciones con un tick háptico (`navigator.vibrate` en Android; en iOS Safari no hay API equivalente, ver Gaps) y enciende el nombre de cada una. En reposo no se mueve nada. Es la versión táctil del "foco" ya resuelto.

### Gaps
- No pude leer la HIG de Apple "Charting data" (https://developer.apple.com/design/human-interface-guidelines/charting-data), que se renderiza con JS. Tampoco hay citas verificadas de cómo Apple Bolsa, Salud o Fitness marcan eventos.
- No investigué Linear, Vercel, Coinbase ni Bloomberg Terminal; no tengo fuentes.
- El soporte de vibración en iOS Safari no está verificado con fuente en estas notas.

## 3. Timelines y scrollytelling (NYT, The Pudding, Reuters): la línea como hilo, la anotación como capa

### Takeaway
En el periodismo de datos la conexión entre texto y forma se resuelve con una **capa de anotación mínima**: punteros, notas breves y labels directos, no leyendas. La regla de Amanda Cox (NYT), "the annotation layer is the most important thing", junto con "no scavenger hunts", aplica tal cual: el lector no tiene que ir a buscar qué título es de qué punto.

### Cited Findings
- Amanda Cox (NYT): "The annotation layer is the most important thing"; "we don't want to make scavenger hunts" — [Simply Statistics, entrevista](https://simplystatistics.org/posts/2012-06-01-interview-with-amanda-cox-graphics-editor-at-the-new/)
- La anotación "should be minimal, consisting of no more than a layer of pointers or outlines or brief notes superimposed onto graphics" — [data.europa.eu, guía de visualización](https://data.europa.eu/apps/data-visualisation-guide/visual-annotations-introduction)
- **Tufte, direct labeling.** Eliminar la leyenda y rotular cada elemento directamente, porque las leyendas obligan al ojo a ir y venir entre dato y rótulo — [Wikipedia: Chartjunk](https://en.wikipedia.org/wiki/Chartjunk); [caylent/tufte-data-viz](https://github.com/caylent/tufte-data-viz)
- **Anatomía de una anotación (d3-annotation, Susie Lu):** sujeto (punto: circle/path/rect), conector (tipos **line** y **elbow**; react-annotation suma **curve**: `AnnotationCalloutElbow`, `AnnotationCalloutCurve`) y nota (título + texto); también hay "badge" (un círculo con texto sobre el punto) — [d3-annotation About.md](https://github.com/susielu/d3-annotation/blob/master/docs/About.md); [react-annotation](https://react-annotation.susielu.com/); [d3-annotation 2.0](https://www.susielu.com/data-viz/d3-annotation-2)

### Inferences (traducción)
- La Bézier ondulada de hoy es, en vocabulario de d3-annotation, un conector **curve**: el más expresivo y el que más compite con una serie que ya es curva. Los periodistas de datos usan sobre todo **line** o **elbow**. Un conector *elbow* (vertical que baja y quiebra en un tramo corto horizontal, o directamente nada más que vertical) **contrasta en geometría con la curva** (ortogonal contra orgánica), así que se distingue sin color extra.
- **"Sin conector" (direct label puro):** el título va justo arriba de su punto, misma x, y la conexión la da la **alineación en columna** (ley gestáltica de continuidad y proximidad). Es lo más "less is more". El riesgo: donde la curva sube empinada, el hueco vertical entre título y punto cambia mucho y la relación se debilita. Se compensa con una marca mínima en el punto: un tick de 3–4 px perpendicular a la curva o un hueco en la línea, que no es una cápsula ni un punto suelto.
- **"No scavenger hunts" como test.** Con la portada quieta, ¿se puede decir en 1 segundo qué punto es de "ETFs"? Si hay que seguir una diagonal, falla. Ese es exactamente el problema que se reporta hoy.

### Gaps
- No encontré ni leí piezas concretas de The Pudding o Reuters en este tiempo, así que no tengo URLs de ejemplos específicos.

## 4. Estudios de identidad con gráficos de datos o líneas como identidad

### Takeaway
Hay antecedentes de identidades "esculpidas por datos" (Pentagram), pero no encontré casos documentados en los que esa línea de datos sea además la navegación del sitio.

### Cited Findings
- Pentagram para **Cytora** (insurtech): una identidad "sculpted by the continuous flow of data", con bloques que cambian de forma según datos nuevos — [Dezeen](https://www.dezeen.com/2018/06/06/pentagram-creates-ever-evolving-brand-identity-sculpted-by-the-continuous-flow-of-data/)
- Pentagram para **Dataland**: gráficos y charts diseñados para hacer eco de la geometría del logotipo — [Pentagram: Dataland](https://www.pentagram.com/work/dataland)

### Inferences
- Lo que suma a BassLayer: en estas identidades **la línea de datos es la marca y el texto se le subordina**. Eso refuerza no ponerle a la curva conectores que la "decoren" (Bézier ondulada) y dejar que la tipografía se acomode en la grilla del cielo.

### Gaps
- No encontré material verificado de Collins, Locomotive, Active Theory, Resn ni Studio Dumbar con gráficos de línea como identidad o navegación.

## 5. Affordance: cómo comunicar que un rótulo es clickeable sin cajas ni subrayado

### Takeaway
La evidencia de NN/g dice que los elementos flat con señales débiles cuestan más (+22 % de tiempo, +25 % de fijaciones). También dice cuándo el flat funciona igual: **baja densidad, layout convencional y contraste**. Los links sin subrayado se reconocen si tienen un color que contrasta. La portada de Layer ya cumple baja densidad; le falta ser "convencional" en la relación título↔punto.

### Cited Findings
- Estudio de eye-tracking de NN/g: 71 participantes, 9 sitios en dos versiones (señales fuertes contra débiles). Con señales débiles hubo 22 % más de tiempo y 25 % más de fijaciones — [NN/g](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/)
- "As long as in-line text links are presented in a contrasting color, users will recognize their purpose, even without an underline". Las condiciones para que el flat funcione son baja densidad de información, layout tradicional y targets de alto contraste — [NN/g](https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/)
- Con la exposición prolongada a señales débiles, los usuarios terminan haciendo hover y click "con duda" — [NN/g: Long-term exposure to flat design](https://www.nngroup.com/articles/flat-design-long-exposure/)
- Hacer foco en el punto más cercano al cursor con Voronoi (`voronoi.find(x, y, radius)`) mejora la interacción con elementos chicos, porque el target es la región del espacio y no la marca diminuta — [Fil / Nadieh Bremer gist](https://gist.github.com/Fil/f49b5cf943a0210212994aa5860ac4a8); [Visionscarto: state of d3 Voronoi](https://www.visionscarto.net/the-state-of-d3-voronoi); con radio limitado: [d3-distanceLimitedVoronoi](https://github.com/Kcnarf/d3-distanceLimitedVoronoi)

### Inferences (traducción)
- **Contraste como señal (sin color nuevo).** El nombre en blanco o gris claro y el dato en gris mono más bajo ya es la jerarquía "link contra metadato". Lo que dice NN/g: si el nombre es **el elemento de mayor contraste del cielo**, se lee como clickeable sin subrayado. Hay que evitar que la regla o el conector tenga más contraste que el nombre.
- **Zonas de foco grandes (Voronoi o columnas).** Dividir el ancho en 8 columnas invisibles, o celdas Voronoi de los 8 puntos limitadas por radio: el hover en cualquier parte de la columna (cielo + tramo) dispara el foco ya resuelto. Mejora Fitts, no agrega nada visual y en reposo no cambia nada. En mobile, con la curva vertical, son 8 franjas horizontales.
- **Cursor `pointer` en toda la columna** y foco de teclado visible (`:focus-visible` = mismo foco que el hover). No se ven en reposo.
- **Numeración mínima (01–08) en mono gris antes del nombre:** es una señal de "índice" fuerte sin caja. El riesgo es sumar ruido y parecerse a "estaciones" (descartado). Si se prueba, que sea solo en el dato mono, no como display.
- **Flecha mínima (→ o ↗) que aparece solo al hover:** sirve de confirmación, no de señal en reposo; respeta "quieto".

### Gaps
- No encontré estudios específicos de NN/g o Smashing sobre **rótulos clickeables dentro de gráficos** (lo citado es sobre UI flat en general).

## 6. Reposo quieto y microinteracciones por proximidad ("magnetismo")

### Takeaway
La técnica de proximidad es directa (distancia cursor↔elemento mapeada a variables CSS dentro de un radio de unos 150 px). La versión habitual mueve el elemento hacia el cursor ("magnetic"), lo que contradice "quieto y neutral". La versión compatible usa la distancia solo para **opacidad o grosor**, nunca para desplazar.

### Cited Findings
- *magnetic-hover* (Halo Lab) dispara el hover cuando el cursor está *cerca* pero todavía no encima, calculando la distancia relativa al centro en un `pointermove` — [GitHub Halo-Lab/magnetic-hover](https://github.com/Halo-Lab/magnetic-hover)
- Implementación típica: atracción dentro de unos 150 px con una fuerza de alrededor del 30 % del offset, con la distancia mapeada a variables CSS; variantes con parallax de dos capas y "spring wobble" al soltar — [inithtml](https://en.inithtml.com/resources/magnetic-hover-effect-creating-cursor-attracted-buttons-with-vanilla-javascript/); [Codefronts magnetic pull](https://codefronts.com/motion/css-link-effects/magnetic-pull/)

### Inferences (traducción)
- **"Proximidad sin movimiento".** Con el cursor a menos de unos 120 px de una columna, la regla o el tramo de esa sección sube de ~15 % a ~40 % de opacidad. Lejos, todo queda en reposo parejo. No hay traslación, wobble ni parallax: el "spring wobble" es justo lo que Pablo rechaza ("tiembla").
- **Anticipo gradual hacia el foco ya resuelto:** cerca = insinuación (solo esa conexión gana algo de contraste), encima = foco completo. Al salir, todo vuelve a neutral. Respeta la regla de reposo neutral (sin interacción ningún mundo ni sección predomina).
- **Riesgo:** si el radio es grande, al mover el mouse por el cielo hay un "barrido" constante que se lee como animación. Conviene un radio chico (o la columna exacta) y transiciones de 150–200 ms sin easing elástico. Con `prefers-reduced-motion`, cambio instantáneo.
- **Mobile:** sin hover, el "acercarse" es el scrubbing por el tronco (sección 2). En reposo, nombres alternados quietos.

### Gaps
- No encontré documentación de un sitio premiado que use proximidad sin desplazamiento sobre un gráfico; es una inferencia de diseño, no un patrón verificado.

## Síntesis de patrones candidatos para el reposo (ordenados de menos a más tinta)

1. **Columna sin conector (direct label + alineación):** el título arriba de su punto, misma x; en el punto, como mucho, un tick perpendicular de 3–4 px o un micro-hueco en la línea. Fuentes: Tufte y Cox (secciones 3 y 5). Riesgo: tramos empinados.
2. **Regla pura (RuleMark):** una vertical hairline de ~15–20 % de opacidad del título a la curva, con hueco antes de tocarla; el largo variable "dibuja" la curva en negativo. Fuente: Swift Charts (sección 2). Riesgo: parecerse a una rejilla o al "riel parejo".
3. **Elbow corto:** vertical y un quiebre horizontal mínimo, solo donde el título no puede quedar exactamente arriba del punto (por colisión). Fuente: d3-annotation (sección 3). Reemplaza la Bézier en los casos de colisión.
4. En todos los casos: **zona de foco = columna o Voronoi** (sin efecto visual en reposo), **proximidad solo como opacidad**, cursor pointer y `:focus-visible`, y en mobile **scrubbing por el tronco** con tick háptico donde haya soporte.

Descartados por el brief, que mapean a patrones de la industria: chart marks con letra (cápsulas), índice vertical al borde (franja índice), timescale marks con color por tipo (hilo de color por sección o rojo/verde).

# Cartografía, diagramas de redes y tipografía sobre trazado: cómo unir un nombre con su lugar en una línea

Contexto de aplicación: curva BTC log (2012→hoy), una línea celeste sobre casi negro, 8 secciones como puntos parejos sobre la curva, cada uno con título (nombre + dato vivo gris mono) en el cielo vacío arriba. Problemas actuales: rama Bézier ondulada que sube y termina en "regla" vertical; unión pegada, temblor, compite con la curva, a veces la cruza, diagonal larga. Mobile: curva vertical (tronco central) con nombres alternados.

## Imhof (1962/1975): reglas de ubicación de nombres de puntos, líneas y áreas; jerarquía; posiciones preferidas

### Takeaway
Imhof fija seis exigencias (legibilidad, asociación inequívoca, evitar conflictos con el dibujo, mostrar extensión, reforzar jerarquía, distribución ni pareja ni amontonada) y un orden de posiciones para puntos encabezado por "arriba a la derecha"; las posiciones directamente a izquierda/derecha son las peores, y junto a una línea fuerte el nombre va del mismo lado que el punto, cerca pero sin tocar.

### Cited Findings
- El ensayo de Imhof es de 1962 (alemán); la traducción "Positioning Names on Maps" salió en The American Cartographer, vol. 2, n.º 2, pp. 128–144 (1975) — [arXiv: Automated Label Placement via LLMs](https://arxiv.org/html/2507.22952v1); [ResearchGate](https://www.researchgate.net/publication/239538755_Positioning_Names_on_Maps)
- Principios de Imhof: legibilidad, asociación (el lector debe conectar cada nombre con su elemento), evitar conflictos/superposición, indicar extensión, reforzar jerarquía, y distribución: "Names should not be evenly dispersed over the map, nor should names be densely clustered" — [Wikipedia: Labeling (map design)](https://en.wikipedia.org/wiki/Labeling_(map_design))
- Proximidad: "Labels should be placed as close to the associated map symbol as possible, without touching it." — [Wikipedia: Labeling (map design)](https://en.wikipedia.org/wiki/Labeling_(map_design))
- Orden de posiciones para puntos (idiomas izquierda→derecha): 1) arriba-derecha, 2) abajo-derecha, 3) arriba-izquierda, 4) abajo-izquierda; "Positioning directly above, below, or to the sides is not preferred." — [Axis Maps, Labeling](https://www.axismaps.com/guide/labeling)
- Ordnance Survey da la misma secuencia y suma arriba-centro y abajo-centro al final; directamente a izquierda/derecha es lo menos preferible — [OS, Text on maps](https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/text-on-maps)
- Directamente a izquierda/derecha es problemático porque punto y nombre "se funden"; centrado arriba/abajo hoy se desaconseja por problemas de asociación; junto a elementos lineales fuertes, el nombre va del mismo lado que el punto — [Wikipedia: Labeling (map design)](https://en.wikipedia.org/wiki/Labeling_(map_design))
- El nombre debe reforzar relaciones espaciales: un pueblo al oeste de un río lleva su nombre al oeste del río — [OS, Text on maps](https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/text-on-maps)
- Jerarquía: antes de rotular, ordenar los elementos por importancia ("intellectual hierarchy"); tamaño mínimo en pantalla ~9–10 pt — [Axis Maps, Labeling](https://www.axismaps.com/guide/labeling)
- Áreas: centrar visualmente y abrir el interletrado para mostrar extensión; mayúsculas para áreas — [Axis Maps, Labeling](https://www.axismaps.com/guide/labeling)
- "Shoddy labeling destroys maps" (resumen de la postura de Imhof) — [Middlebury, Mapmaking patterns](https://sites.middlebury.edu/mapmakingpatterns/2015/01/15/according-to-imhof/)

### Inferences
- La curva es una "línea fuerte": por Imhof, los 8 títulos deberían quedar todos del mismo lado (el cielo, arriba) y cerca del punto sin tocarlo. El cielo ya cumple; el problema es la distancia: una rama larga viola "lo más cerca posible".
- Posición preferida para un punto sobre una curva ascendente: arriba-derecha del punto. Ojo: en una curva que sube de izquierda a derecha, arriba-derecha cae sobre el tramo futuro de la propia curva (riesgo de cruce). Arriba-izquierda (posición 3) suele quedar en cielo libre en curvas ascendentes; conviene elegir por punto según la pendiente local, no una sola regla global.
- "Ni parejo ni amontonado": repartir los 8 puntos exactamente parejos sobre la curva es una decisión de producto; pero los títulos pueden respirar con la forma (alturas distintas según el cielo disponible) en vez de alinearse en una fila rígida.
- Jerarquía con un solo color: nombre en blanco/celeste pleno, dato vivo en gris mono más chico — coincide con la jerarquía tipográfica de Imhof sin agregar color.

### Gaps
- No pude acceder al texto completo de Imhof 1975 (paywall); las reglas citadas vienen de resúmenes secundarios (Wikipedia, Axis Maps, OS). Los croquis originales de ríos y la regla exacta "sobre la línea antes que debajo" se citan vía Wikipedia, no del original.

## Rotulado de ríos/rutas: texto que sigue el trazado, espaciado, curvatura máxima legible

### Takeaway
El nombre de una línea va paralelo y al lado, sin tocarla, sobre el tramo más recto/horizontal, curvándose suavemente como el trazado; los motores de mapas limitan el quiebre entre letras adyacentes (Mapbox: 45° por defecto). Aplicado a gráficos, existe la "river label" para series de línea, pero exige tramos suaves.

### Cited Findings
- Ríos y rutas: "placed alongside and parallel to the feature but not touching it"; elegir "a relatively horizontal or gently curving section" y poner el nombre "on a gentle curve which mimics the curvature of the feature"; evitar curvas complejas; en tramos verticales, orientar para que el texto no quede cabeza abajo — [OS, Text on maps](https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/text-on-maps)
- Líneas largas: repetir el nombre a intervalos, a menudo cerca de cruces — [OS, Text on maps](https://docs.os.uk/more-than-maps/geographic-data-visualisation/guide-to-cartography/text-on-maps)
- "Labels should generally follow the direction and curvature of the line feature"; algo preferible arriba que abajo de la línea; desaconsejado el espaciado entre caracteres — [Wikipedia: Labeling (map design)](https://en.wikipedia.org/wiki/Labeling_(map_design))
- Mapbox GL: `text-max-angle` = "Maximum angle change between adjacent characters", default 45; `text-keep-upright` default true; `symbol-spacing` default 250 px — [Mapbox Style Spec](https://docs.mapbox.com/style-spec/reference/layers/)
- Técnica: rotar y ubicar cada letra sobre el trazado ("wrapping") en vez de deformar un rectángulo, porque no distorsiona letras en curvatura alta; Imhof recomienda curvar el texto en ríos — [Red Blob Games, SDF curved text](https://www.redblobgames.com/blog/2024-10-09-sdf-curved-text/)
- "River labels" en gráficos de líneas: el nombre va a lo largo de la serie, elimina la consulta a la leyenda; riesgos: líneas densas/cruzadas, segmentos muy curvos deforman letras, más difícil técnicamente; usar solo en tramos suaves — [visualizing.jp, Line chart with river labels](https://visualizing.jp/en/line-chart-with-river-label/)

### Inferences
- Una curva de precio BTC en escala log es dentada (picos 2013/2017/2021/2024): casi ningún tramo es "suave" a escala de palabra; el texto-sobre-trazado temblaría igual que la rama actual. Además "rótulos sobre la curva" ya fue descartado por Pablo. Lo rescatable no es el textPath sino dos reglas: (a) "paralelo, al lado, sin tocar" y (b) elegir el tramo más horizontal para anclar.
- Si se quisiera un leve eco de la curva sin texto curvo: inclinar la línea base del título según la pendiente suavizada (promedio de varios meses) del tramo, limitado a unos pocos grados. Es una especulación de diseño, no una regla documentada.

### Gaps
- No encontré estudios empíricos con un umbral de curvatura legible en px/radio para texto en pantalla, más allá del default de Mapbox (45° entre caracteres), que es una convención de ingeniería, no un resultado perceptivo.

## Mapas de subte/metro (Beck, Vignelli, TfL, MTA): rotulado de estaciones, ticks, 45°, nombres a un lado

### Takeaway
El diagrama del subte resuelve "nombre ↔ punto sobre línea" con el conector más corto posible: un tick perpendicular a la línea, del color de la línea, del lado del nombre, y el nombre horizontal, a distancia fija del borde de la línea y del mismo lado en lo posible. Es la referencia más directa para eliminar la rama.

### Cited Findings
- Beck diferenció estaciones comunes (ticks cortos) de combinaciones (rombos); estaciones repartidas parejas; líneas solo horizontales, verticales o a 45° — [Wikipedia: Tube map](https://en.wikipedia.org/wiki/Tube_map); [London Transport Museum](https://www.ltmuseum.co.uk/collections/stories/design/mapping-london-iconic-tube-map)
- Tick TfL: cuadrado de 0,66x (x = grosor de línea), perpendicular a la línea en el nodo, en el borde exterior, del lado del nombre (si no, a la derecha), del color de la línea; doble pestaña en terminales; los ticks no sirven en combinaciones ("a tick has no side where lines cross") — [legible-cities, issue 74](https://github.com/richc117/legible-cities/issues/74)
- Pauta TfL: distancia fija del nombre al borde de la línea, no al marcador; un rediseño alineó todos los nombres horizontalmente a lo largo de la línea "without some bumping lower or higher" porque "looks smoother and makes them easier to follow"; grilla modular (marcadores nunca a menos de 5x) y evitar huecos que "break the rhythm" — [Transit Maps, Tube design notes](https://transitmap.net/tube-design-notes/)
- Nombres del mismo lado de la línea tanto como se pueda — [resumen en búsqueda; ver Tube map](https://en.wikipedia.org/wiki/Tube_map) (afirmación de fuente secundaria)
- Los métodos automáticos de metro usan orientaciones octilineales (0°, 90°, ±45°) y resuelven el rotulado de estaciones con MIP de restricciones estéticas — [Nöllenburg & Wolff, Drawing and Labeling High-Quality Metro Maps by MIP](https://www.researchgate.net/publication/44626536_Drawing_and_Labeling_High-Quality_Metro_Maps_by_Mixed-Integer_Programming)

### Inferences
- Traducción directa: reemplazar rama+regla por un tick: un trazo corto, recto, perpendicular a la tangente local de la curva (o simplemente vertical hacia el cielo), del mismo celeste y grosor que la curva, que sale del punto hacia arriba; el título empieza a distancia fija del extremo del tick. Unión limpia (sale del borde, no se pega encima), cero temblor (recto), no puede cruzar la curva (corto y hacia el cielo) y no compite (es la misma tinta, se lee como parte de la línea).
- Problema: si la curva está baja y el título alto (cielo grande), el tick solo no alcanza; el título debe bajar hacia la curva (Imhof: "lo más cerca posible") en vez de que el conector suba. Es decir, mover el texto, no estirar el hilo.
- Riesgo: "estaciones" ya fue descartado por Pablo. Hay que distinguir: el tick es el conector, no un marcador de estación con punto/círculo. Si lo descartado eran los círculos/estaciones, el tick sin punto puede ser distinto; conviene confirmarlo.
- Mobile (tronco vertical): es literalmente una línea de subte vertical; la convención TfL es todos los nombres del mismo lado. "Alternado" ya está descartado, coherente con Beck. Ticks horizontales a un solo lado + nombres alineados a distancia fija del tronco.

### Gaps
- No encontré documentación primaria de Vignelli (NYC 1972) o del manual MTA sobre ticks; Max Roberts no apareció con texto accesible en esta búsqueda.

## Constelaciones y cartas celestes

### Takeaway
Las cartas celestes conectan puntos con líneas finas de pesos jerárquicos y ponen los nombres junto a la estrella, sin conector; la línea "es" la figura y el nombre se asocia por proximidad.

### Cited Findings
- Las cartas de la IAU se hicieron con Sky & Telescope (Sinnott y Fienberg) usando las figuras estándar de S&T — [IAU, The Constellations](https://iauarchive.eso.org/public/themes/constellations/)
- Las figuras de S&T conectan estrellas con tres pesos de línea distintos; derivan de H. A. Rey (1952); la IAU no define figuras oficiales — [dcf21/constellation-stick-figures](https://github.com/dcf21/constellation-stick-figures)
- Las letras griegas marcan las estrellas por brillo (alfa la más brillante) — [IAU, The Constellations](https://iauarchive.eso.org/public/themes/constellations/)

### Inferences
- Lección: proximidad (Gestalt) en vez de conector; y jerarquía por peso de línea, no por color. Para la curva: si el título está a pocos px del punto, el conector puede desaparecer. Pero "punto suelto" ya está descartado, y con cielo grande el nombre quedaría lejos; útil solo como argumento de acortar.

### Gaps
- No encontré guías publicadas sobre la regla de ubicación de nombres de estrellas (offset, cuadrante) en atlas profesionales.

## Algoritmos de etiquetado (external/boundary labeling, leaders s/po/opo/do, curvos, D3 labeler)

### Takeaway
La evidencia empírica más sólida (Barth et al., 31 sujetos) dice: po-leaders (un tramo paralelo + uno ortogonal, una sola curva) son los más rápidos de asociar y bien valorados; do (con quiebre a 45°) son los más lindos y apenas menos legibles; s (rectos) se asocian bien pero se ven caóticos; opo (dos quiebres) son los peores. Los criterios de calidad: leader corto, sin cruces, pocos quiebres, direcciones preferidas, reparto parejo, espacio entre leaders.

### Cited Findings
- Taxonomía: s = segmento recto de pendiente libre; o = ortogonal a una referencia; p = paralelo; d = diagonal; un leader se describe por la secuencia (po, opo, do, pd) — [Bekos et al., External Labeling Techniques: A Taxonomy and Survey (2019)](https://arxiv.org/pdf/1902.01454)
- En figuras reales se usan solo leaders simples (rectas y polilíneas) "to avoid cluttered illustrations and to sustain legibility. In rare cases, curved leaders such as Bézier arcs are used." — [Bekos et al. 2019](https://arxiv.org/pdf/1902.01454)
- Hay que poder distinguir las líneas del fondo de los leaders: en ilustraciones de formas irregulares (mapas, anatomía) "straight and polyline leaders are preferable", y en ilustraciones de muchas rectas regulares conviene curvos o pendientes no alineadas — [Bekos et al. 2019](https://arxiv.org/pdf/1902.01454)
- Richards: leaders rectos siempre que se pueda; separar el leader del fondo con una línea fina de contraste a un lado; terminar con un punto o flecha — [Bekos et al. 2019, citando Ric17](https://arxiv.org/pdf/1902.01454)
- Criterios estáticos: C1 leaders cortos; C2 pocos cruces/superposiciones; C3 los labels imitan la forma de la imagen; C4 reparto parejo; C5 direcciones preferidas; C6 pocos quiebres; C7 espacio suficiente entre leaders; C8 una sola línea de texto; C9 agrupar lo relacionado. Respaldados por proximidad, planaridad, rectitud/poco desvío y poca tinta (Imhof, Tufte) — [Bekos et al. 2019](https://arxiv.org/pdf/1902.01454)
- Etiquetado dinámico: evitar parpadeos y saltos; mantener el orden; coherencia temporal entre cuadros — [Bekos et al. 2019](https://arxiv.org/pdf/1902.01454)
- do/pd con quiebre de ±45° son más cortos que po y "empirically confirmed to be aesthetically more pleasing, yet slightly less readable than po-leaders" — [Bekos et al. 2019](https://arxiv.org/pdf/1902.01454)
- Barth, Gemsa, Niedermann, Nöllenburg, "On the Readability of Boundary Labeling" (31 sujetos + 8 entrevistas): opo queda atrás en todo; do, po y s tienen errores similares pero po es significativamente más rápido; preferencia: do > po > s > opo; s "chaotic", po "structured"; recomiendan po como mejor compromiso y do por estética — [Barth et al.](https://arxiv.org/pdf/1509.00379)
- Hipótesis de Barth: la dificultad crece con la cantidad de segmentos paralelos y cercanos alrededor de un leader — [Barth et al.](https://arxiv.org/pdf/1509.00379)
- Leaders curvos: Wu et al. (metro maps, B-splines, minimizando cruces con el mapa) mostraron con eye-tracking que superaban a rectos y ortogonales; Kindermann et al. convierten un rotulado recto plano en Béziers cúbicas ajustadas por fuerzas — [Bekos et al. 2019, §4.3](https://arxiv.org/pdf/1902.01454)
- D3-Labeler: recocido simulado que mueve una etiqueta por iteración y acepta peores soluciones con probabilidad decreciente para salir de óptimos locales — [D3-Labeler](http://tinker10.github.io/D3-Labeler/); alternativa greedy/annealing en [d3fc-label-layout](https://github.com/ColinEberhardt/d3fc-label-layout)

### Inferences
- La rama actual (Bézier ondulada + regla vertical) es en la práctica un leader de tres tramos tipo "opo/curvo", el tipo que peor rinde. El paso a po (o a do con quiebre a 45°) es la mejora respaldada por datos.
- Para una curva irregular (BTC), Bekos/Richards recomiendan leaders rectos o polilíneas, no curvos: un leader curvo sobre una curva curva se confunde con el fondo, que es exactamente el "compite con la curva".
- Propuesta "po" concreta: tramo vertical recto desde el punto hacia el cielo (o), y el título apoyado en el extremo superior, con la línea base del nombre como el tramo "p". Variante "do": vertical corto + quiebre a 45° hacia el título, solo si hay que desplazar lateralmente para no cruzar la curva.
- C7 y la hipótesis de Barth: 8 verticales paralelas muy juntas empeoran la asociación; mantener separación pareja y largos variables pero cortos.
- Para el reposo quieto: los algoritmos dinámicos recomiendan evitar movimiento continuo; calcular posiciones una vez por tamaño de ventana (no animar el leader) elimina el "temblor".

### Gaps
- Barth et al. evaluó sobre fondo vacío; los autores mismos notan que el fondo afecta. No hay estudio específico de leaders sobre un gráfico de líneas.
- No pude leer el paper de D3-Labeler (error de certificado); no cito sus pesos de energía.
- No encontré fuente accesible sobre "Voronoi labeling" con evaluación.

## Perfiles altimétricos (etapas del Tour/Giro): rotulado de cumbres sobre una línea

### Takeaway
Es el referente más cercano (línea con picos, nombres en el cielo), pero no encontré una guía de diseño publicada sobre cómo los perfiles oficiales ubican nombres; solo está documentado que las subidas llevan categoría (HC, 1–4) junto al perfil y que a veces hay demasiadas para rotularlas todas.

### Cited Findings
- En perfiles de Tour/Giro/Vuelta aparecen números o "HC" junto a las subidas; HC = "fuera de categoría", luego categorías 1 a 4 — [Wikipedia: Hors catégorie](https://en.wikipedia.org/wiki/Hors_cat%C3%A9gorie)
- Reuters genera los perfiles de elevación con un charter D3 y agrega marcadores y etiquetas; a veces hay demasiadas montañas para rotularlas todas (según resumen de búsqueda del artículo) — [Mapping the Tour de France (Medium)](https://medium.com/diarium-da-pacific/mapping-tour-de-france-dbe1d9faf50f) (no pude abrir el texto completo: 403)
- En software de perfiles técnicos se usa una línea vertical en cada ubicación rotulada y leaders hacia puntos del perfil — [Terrasolid, Label Profile Elevations](https://terrasolid.com/guides/tmodel/labelprofileelevations.html)
- Catálogo de perfiles de subidas del Tour 2026 para observación visual — [PJAMM Cycling](https://pjammcycling.com/grandTour/8.Tour-de-France)

### Inferences
- Por observación general (no verificada en una fuente escrita en esta búsqueda): los perfiles de etapa suelen poner el nombre del puerto arriba del pico, a menudo en texto vertical o con una recta vertical fina hasta la cima, con la altura en número. Esto es un po-leader vertical: el mismo patrón que el tick del subte, pero más largo. Antes de usarlo como argumento, verificar mirando perfiles oficiales (letour.fr) — no se cita como hecho.
- Para la curva: anclar cada título exactamente en vertical sobre su punto (misma x), con un hilo recto, sin quiebre; si un pico de la curva queda entre el punto y el título, desplazar el título en altura (no el hilo en diagonal). Vertical-puro garantiza no cruzar una curva que es función de x (una sola y por x): una vertical que sube desde el punto nunca vuelve a tocar la curva. Esta es la propiedad geométrica clave para eliminar los cruces en desktop.
- En mobile, con la curva vertical (x = f(y)), la propiedad equivalente es el hilo horizontal: un trazo horizontal desde el tronco no puede volver a cortar la curva.

### Gaps
- Sin fuente escrita sobre convenciones tipográficas de perfiles de etapa (orientación de texto, offset). Pendiente verificar con imágenes oficiales de ASO/RCS.

## Para cada técnica: Gestalt, riesgos y traducción a 8 títulos (síntesis)

### Takeaway
Todas las tradiciones convergen: conector corto, recto, de una sola dirección principal, del mismo lado, en la misma tinta que la línea; y si hay distancia, se acerca el texto antes que estirar el hilo. Para esta curva, la opción con más respaldo es un leader vertical recto (po/tick) que sale del punto hacia el cielo, con el título apoyado en su extremo.

### Cited Findings
- Proximidad + "sin tocar" (Imhof) — [Wikipedia: Labeling](https://en.wikipedia.org/wiki/Labeling_(map_design))
- po más rápido, do más lindo, opo peor — [Barth et al.](https://arxiv.org/pdf/1509.00379)
- Rectos/polilíneas sobre fondos irregulares; los leaders deben distinguirse del fondo — [Bekos et al. 2019](https://arxiv.org/pdf/1902.01454)
- Tick perpendicular, color de línea, del lado del nombre; nombres alineados a distancia fija — [legible-cities #74](https://github.com/richc117/legible-cities/issues/74); [Transit Maps](https://transitmap.net/tube-design-notes/)

### Inferences
- Gestalt: proximidad (texto cerca del punto), conexión uniforme (un trazo une dos elementos y vence a la proximidad; por eso un hilo mal trazado asocia mal), continuidad (una Bézier ondulada que se parece a la curva se agrupa con la curva y no con el título: por eso "compite"), y semejanza (misma tinta = misma familia; si el hilo tiene que distinguirse de la curva, hacerlo más fino o con menor opacidad, no de otro color).
- Desktop, propuesta concreta derivada: (1) hilo vertical recto, 1 px o menos que la curva, misma tinta a menor opacidad; (2) arranca a 2–4 px del borde de la curva (no pegado: "sin tocar"); (3) el título se apoya con su línea base o su borde inferior en el extremo superior, alineado a la izquierda del hilo (el hilo como borde izquierdo del bloque nombre/dato, es decir, la "regla" pero sin rama); (4) altura del título = altura mínima que libra el máximo de la curva en el ancho del título + margen, de modo que el hilo sea lo más corto posible; (5) cálculo estático por resize, sin animación en reposo.
- Riesgo del vertical puro: si el ancho del título se extiende sobre un pico cercano más alto, hay que subir el título (hilo más largo) o anclar el título a la izquierda del hilo (posición arriba-izquierda de Imhof) en tramos ascendentes.
- Mobile: tronco vertical al centro → hilos horizontales cortos (tick) hacia un solo lado, nombres alineados a una columna a distancia fija (TfL). Si el tronco ondula, alinear los nombres en una columna recta y dejar que los ticks varíen de largo (po: horizontal + borde de columna).
- Lo que no conviene según la evidencia: Bézier sobre curva irregular (se confunde con el fondo), diagonales largas (s caótico, más cruces), dos quiebres (opo), texto sobre la curva.

### Gaps
- No hay estudio empírico que compare leaders sobre un gráfico de línea de datos como fondo; todas las traducciones de arriba son inferencias de principios generales y deberían validarse con un comparador lado a lado (desktop + mobile) como pide Pablo.

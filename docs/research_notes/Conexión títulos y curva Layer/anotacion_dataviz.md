# Conexión etiqueta↔punto en diseño de información y dataviz editorial (aplicado a la curva BTC de Layer)

Contexto del problema: curva de precio BTC (log, 2012→hoy), una sola línea celeste sobre casi negro, que es el ÚNICO índice de navegación. 8 secciones = 8 puntos parejos sobre la curva, cada uno ligado a su título (nombre + dato vivo gris mono) que flota en el cielo vacío. Hoy: rama Bézier ondulada que sube y termina en una "regla" vertical junto al nombre → se lee pegada, tiembla, compite con la curva, a veces la cruza, la diagonal larga obliga a seguirla con el ojo.

## 1. Principios de los maestros (Tufte, Bertin, Minard, Du Bois) aplicables a conectar etiquetas con puntos

### Takeaway
El consenso clásico es: palabra y dato juntos (anotación directa > leyenda), y cuando hace falta una línea, que sea liviana, corta y subordinada a la figura; la figura (acá, la curva) es lo principal y la conexión debe ser lo más discreta posible.

### Cited Findings
- Tufte propone "poner mucha más anotación alrededor del mapa, con líneas indicadoras livianas (light pointer lines) que cruzan hacia la zona relevante": el texto vive afuera de la figura, en el vacío, y solo la línea fina entra. — [Tufte, "Mapped pictures: image annotation"](https://www.edwardtufte.com/notebook/mapped-pictures-image-annotation/)
- En el mismo hilo: "Se necesita poco contraste entre figura y fondo para indicar una línea. Si la línea se vuelve clara/brillante, encandila (glare and flare)". Es decir: la línea de anotación debe ser tenue, no brillante. — [Tufte, Mapped pictures](https://www.edwardtufte.com/notebook/mapped-pictures-image-annotation/)
- Tufte critica cajas blancas con contorno negro en mapas anotados: "las líneas negras alrededor de las cajas deberían omitirse". Contribuyentes señalan como mala práctica "texto negro en negrita en cajitas blancas y muchas flechas". — [Tufte, Mapped pictures](https://www.edwardtufte.com/notebook/mapped-pictures-image-annotation/)
- Craig Zacker (en el foro de Tufte) observa que en la Anatomía de Gray "se evitan las callouts con líneas largas siempre que se puede", y que muchos diagramas usan callouts con líneas finas sin punta de flecha. — [Tufte, Mapped pictures](https://www.edwardtufte.com/notebook/mapped-pictures-image-annotation/)
- Data-ink: el "núcleo no borrable" de un gráfico es la tinta que cambia con los datos; lo demás se minimiza. Sparklines: sin ejes ni decoración, con extremos marcados (inicio/fin, min/max). — resumen secundario en [Sparkline, Wikipedia](https://en.wikipedia.org/wiki/Sparkline) y [Lessons from Edward Tufte](https://www.antoinebuteau.com/lessons-from-edward-tufte/) (fuentes secundarias; el original es *The Visual Display…* y *Beautiful Evidence*).
- Bertin: dos clases de variables — planares (posición X,Y) y retinianas (forma, orientación, tono, textura, valor, tamaño). Forma, orientación y tono son "asociativas"; valor y tamaño son "disociativas" (separan/jerarquizan). — [Information Visuals, Bertin's Semiology](https://www.informationvisuals.com/information-design-theory/jacques-bertins-semiology-of-graphics); [ICA, CO-054](https://icaci.org/files/documents/ICC_proceedings/ICC2011/Oral%20Presentations%20PDF/A4-Jacques%20Bertin%20and%20graphic%20semiology%202/CO-054.pdf)

### Inferences
- Traducción a Layer: la curva es la "figura" (data-ink); las 8 conexiones son tinta no-dato y deben ser lo más tenues de la escena. Una rama Bézier ondulada celeste del mismo valor que la curva viola dos cosas: compite en valor (Bertin: el valor es disociativo, debería usarse para BAJAR la conexión, no igualarla) y compite en forma (es otra curva sobre una curva).
- "Texto afuera, línea fina hacia adentro" (Tufte) calza exacto con "títulos en el cielo vacío": el modelo es correcto; lo que falla es la línea, no la ubicación.
- La "regla" vertical junto al nombre suma una segunda marca por título (rama + regla); por data-ink, sobra una de las dos.
- Minard y Du Bois: no encontré en esta tanda fuentes primarias citables sobre cómo conectan rótulos (Minard escribe los números a lo largo de la banda, Du Bois rotula espirales/barras directamente) — ver Gaps.

### Gaps
- No verifiqué con fuente primaria los pasajes exactos de *Envisioning Information*/*Beautiful Evidence* sobre leader lines (Tufte habla de "words and pictures together"); solo el hilo del foro.
- Minard y W.E.B. Du Bois: sin fuente citable recuperada sobre su técnica de rotulado; no lo afirmo.

## 2. Estilos de anotación de redacciones y practicantes (NYT, FT, Economist, Datawrapper, Pudding, Cox, Muth, Knaflic, Cairo)

### Takeaway
Las redacciones priorizan rotular pegado al dato; cuando necesitan conector, lo hacen corto, fino, con ángulos disciplinados (0°/45°/90°) o una curva suave puesta a mano; el texto va alineado a izquierda/derecha (nunca centrado) y en dos niveles de jerarquía (oscuro grande + gris chico).

### Cited Findings
- Amanda Cox (NYT): "La capa de anotación es lo más importante que hacemos… si no, es un caso de 'acá está, arreglatelas'". Las palabras deben señalar el patrón relevante, no decir "acá hay datos". — [Simply Statistics, entrevista a Amanda Cox](https://simplystatistics.org/posts/2012-06-01-interview-with-amanda-cox-graphics-editor-at-the-new/)
- Datawrapper (Muth): "Mostrá la información donde el lector la necesita. Poné las palabras que explican los elementos tan cerca de ellos como sea posible"; sacar la leyenda y rotular directo. — [Datawrapper, Text in data visualizations](https://www.datawrapper.de/blog/text-in-data-visualizations)
- Datawrapper: usar "solo dos niveles de jerarquía claramente distintos, p. ej. 12px gris y 14px negro"; texto chico/fino/gris para lo secundario. — [Datawrapper, Text in data visualizations](https://www.datawrapper.de/blog/text-in-data-visualizations)
- Datawrapper: "Texto alineado a izquierda o derecha se ve más prolijo que centrado", porque arma bordes limpios que se alinean con otros elementos. — [Datawrapper, Text in data visualizations](https://www.datawrapper.de/blog/text-in-data-visualizations)
- Datawrapper en líneas: "considerá apagar el rotulado automático y ubicar los rótulos vos"; usar el mismo color del texto que la línea; verificar que los rótulos manuales sigan legibles en mobile. — [Datawrapper, Line charts](https://www.datawrapper.de/blog/line-charts)
- Datawrapper callout lines (mapas): tienen "tendencia incorporada a ir en 90° o 45°", citando el principio de Harry Beck (subte de Londres: solo 45° y 90°) para que muchas callouts se vean ordenadas. Usos: mapa abarrotado, poner el texto en una zona más calma, conectar texto con área/línea. — [Datawrapper, callout lines & swoopy arrows](https://www.datawrapper.de/blog/locator-maps-callout-lines-swoopy-arrows)
- Datawrapper mobile: "En pantallas chicas, las anotaciones se numeran y se mueven debajo del gráfico"; también ofrece contorno de texto (halo) para leer sobre datos o grillas. — [Datawrapper, responsive annotations](https://www.datawrapper.de/blog/better-more-responsive-annotations-in-datawrapper-data-visualizations)
- NYT/Adam Pearce: swoopyDrag ("Artisanal label placement for d3") — anotaciones colocadas a mano; soporta rectas, Béziers y arcos circulares. Bloomberg Graphics publicó "swoopyarrows". — [swoopy-drag](https://github.com/1wheel/swoopy-drag); [bizweekgraphics/swoopyarrows](https://github.com/bizweekgraphics/swoopyarrows)
- Susie Lu, d3-annotation: anatomía = sujeto (lo anotado) + conector + nota. Conectores: "line", "elbow", "curve"; terminaciones: "none", "arrow", "dot"; nota orientada "topBottom" o "leftRight" con alineación dinámica/izq/der/arriba/abajo. — [d3-annotation](https://d3-annotation.susielu.com/)
- The Economist: rótulo de serie al lado de cada línea (en el borde derecho), sin leyenda, eje Y a la derecha, grillas horizontales suaves. — resumen secundario en [AECharts](https://aecharts.com/blog/posts/how-to-create-charts-like-the-economist/); guía oficial en [Economist chart style guide v1.2 (PDF)](https://sa.ipaa.org.au/wp-content/uploads/2026/02/Economist-CHARTstyleguide_20170505.pdf) (no la leí entera).
- Knaflic (*Storytelling with Data*): en gráficos de línea pone los rótulos cerca de su línea (proximidad) y del mismo color (similitud); usa los principios proximidad, similitud, cerramiento, cierre, continuidad y conexión. — [Analytics Vidhya, resumen de SWD](https://medium.com/analytics-vidhya/six-important-lessons-from-storytelling-with-data-by-nussbaumer-knaflic-part-2-737d8478bc0b) (secundaria)
- Estudio con 10 practicantes y 7 docentes (2026): jerarquía = 1) adyacencia directa, 2) conectores cortos si hay solapamiento, 3) leyenda como último recurso. Conectores mínimos, cortos y sin cruces; "visualmente distintos de las marcas de datos" (E3); estilo consistente; cuando los conectores "dominan la vista", cambian de enfoque o sacan rótulos. — [Designing Annotations in Visualization, arXiv 2604.07691](https://arxiv.org/html/2604.07691v1)
- FT: usa flechas para ligar texto a partes de líneas; el FT tiene guía gráfica pública en GitHub. — [GIJN sobre John Burn-Murdoch](https://gijn.org/stories/data-visualization-storytelling-tips-john-burn-murdoch/) (no pude leerlo, 403; dato del snippet) — [FT graphics-style-guide](https://github.com/Financial-Times/graphics-style-guide) (index.md dio 404).

### Inferences
- El patrón "nombre + dato gris mono" ya es el de dos niveles de Datawrapper; bien. El texto debería alinearse a izquierda (o derecha) contra el punto de llegada del conector, no centrado, para que el borde del texto "continúe" la línea.
- La disciplina 90°/45° (Beck/Datawrapper) es la antítesis de la rama ondulada: 8 conectores con el mismo ángulo se leen como sistema y no tiemblan. Para Layer: conector = tramo vertical recto desde el punto hacia el cielo (90°) y el título apoyado arriba, todos iguales.
- "Distintos de las marcas de datos": si la curva es celeste sólido, el conector debería ser otro tratamiento (más tenue: celeste a ~25–35% de opacidad, 1px, o punteado fino) — es diferenciación por valor, no por color, así respeta "un solo color".
- La opción mobile de Datawrapper (numerar y bajar) está descartada por la regla del cliente (franja índice), pero confirma que en angosto las redacciones abandonan el leader largo.

### Gaps
- No pude acceder a la guía de estilo del FT (404) ni al artículo de GIJN (403): no puedo afirmar con fuente el estilo de "callout en codo" del FT (el brief lo menciona; queda sin verificar).
- No recuperé guías explícitas de Reuters Graphics, Bloomberg, The Pudding ni Alberto Cairo sobre leader lines.

## 3. Tipos de leader lines: forma, largo, grosor, ángulo, terminación y reglas

### Takeaway
La única evidencia experimental sólida (Barth et al.) recomienda leaders con un tramo perpendicular + uno paralelo (tipo "po"/codo) como mejor equilibrio entre rapidez y preferencia; los diagonales con codo ("do") son los preferidos estéticamente; los S/curvos rinden pero desagradan "por desestructurados"; las rectas son las más rápidas de seguir. Reglas transversales: cortas, sin cruces, sin correr paralelas cerca de otras líneas, ángulos consistentes.

### Cited Findings
- Barth, Gemsa, Niedermann, Nöllenburg — primer estudio formal de legibilidad de leaders (31 sujetos + 8 entrevistas). Tipos: s (recta), po (perpendicular-paralelo, en "L"), do (diagonal-ortogonal: diagonal y luego tramo recto al rótulo), opo (ortogonal-paralelo-ortogonal, en "track"). Resultados: opo queda atrás en todo; do, po y s tienen tasas de error similares, pero **po es significativamente más rápido** que do y s; preferencia: do > po > s > opo. "Recomendamos po como el mejor compromiso… por razones estéticas puede convenir do, con legibilidad apenas menor y considerado el más atractivo." Los s "rinden bien pero no gustan por su apariencia desestructurada". — [Barth et al., On the Readability of Boundary Labeling (arXiv 1509.00379)](https://arxiv.org/pdf/1509.00379); versión de revista: [Information Visualization 2019](https://journals.sagepub.com/doi/abs/10.1177/1473871618799500)
- Hipótesis de ese estudio: el tiempo y el error de asignación dependen de **otros leaders que corren cerca y paralelos** al leader en cuestión. — [Barth et al.](https://arxiv.org/pdf/1509.00379)
- Barth et al. advierten que su experimento fue sobre fondo vacío; "en la realidad la figura es el elemento principal y los leaders deberían ser lo más discretos posible y no interferir con la figura". — [Barth et al.](https://arxiv.org/pdf/1509.00379)
- Estudio de rotulado orbital (54 participantes): rectas vs. arco+radial — precisión similar (>0,95), **rectas más rápidas** (0,05–0,42 s según configuración); los curvos parecieron "más lindos" pero los participantes se sentían "más seguros con rectas"; "los curvos se vuelven más difíciles en cuanto los ponés uno al lado del otro". Condición dura: leaders sin cruces; objetivo: minimizar largo total ("tinta"). — [Clarity and Computational Efficiency of Orbital Boundary Labeling, arXiv 2603.08657](https://arxiv.org/html/2603.08657)
- Survey/taxonomía: external labeling = conectar rasgos con su rótulo por **leaders finos**, con el rótulo en el espacio vacío alrededor de la imagen; "boundary labeling" (Bekos et al.) = rótulos sobre el borde de un rectángulo. — [Bekos, Niedermann, Nöllenburg, External Labeling Techniques: A Taxonomy and Survey (CGF 2019)](https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.13729)
- Convenciones de dibujo técnico: los leaders no deben ser innecesariamente largos ni cruzarse; deben ir en un ángulo distinto al de las líneas del objeto que los rodea; terminan con un "codo" horizontal corto en la nota. — [Rules for Leader Lines](https://engineeringtechnology.org/engineering-graphics/dimensioning/fundamental-rules/rules-for-leader-lines-leaders/)
- Cartografía: alinear el texto de las callouts horizontalmente o curvar prolijamente los leaders; usarlos con moderación, abusar confunde. — [Digital Cartography, Label Placement](https://wustl.pressbooks.pub/digitalcartography/chapter/label-placement/)
- Terminaciones: d3-annotation ofrece none/arrow/dot. Tufte/foro: muchos diagramas usan líneas finas **sin punta de flecha**. — [d3-annotation](https://d3-annotation.susielu.com/); [Tufte, Mapped pictures](https://www.edwardtufte.com/notebook/mapped-pictures-image-annotation/)

### Inferences
- Diagnóstico de la rama actual a la luz de la evidencia: es un leader tipo "S/curvo" (el que menos gusta y el más lento junto a otros), largo (contra "minimizar tinta"), con ángulo que se parece al de la curva (contra "ángulo distinto al del objeto") y a veces cruza (viola la condición dura). Todo lo que Pablo percibe ("tiembla, compite, cruza, obliga a seguirla") coincide con lo que la literatura predice.
- Opciones con respaldo, traducidas a Layer:
  - **Recta vertical (tipo s puro a 90°)**: del punto sube derecho hasta el título. Más rápida de leer según ambos estudios; ángulo claramente distinto de la curva (que es mayormente diagonal ascendente). Riesgo: si los títulos quedan a alturas distintas, los largos varían mucho; solución: títulos en una misma línea base del cielo, o largo fijo.
  - **Codo po (vertical + tramo horizontal corto)**: la recomendada por Barth. Sube a 90° y dobla a 0° hacia el texto alineado a izquierda; el tramo horizontal hace de "subrayado" mínimo/apoyo de la línea base. Riesgo: subrayado ya fue descartado por el cliente — el tramo horizontal debe ser muy corto (≈4–8px) o directamente que la vertical toque el inicio del texto.
  - **do (diagonal a 45° + vertical/horizontal)**: la preferida estéticamente; útil si el título no puede estar justo arriba del punto. Riesgo: la diagonal a 45° puede parecerse a la pendiente de la curva en tramos alcistas.
  - **Sin línea, por proximidad**: preferido por practicantes cuando cabe (arXiv 2604.07691). Riesgo: en el cielo vacío la distancia al punto es grande; ya se descartó "punto suelto".
- Grosor/valor: 1px (o 0,75px en retina), mismo celeste a baja opacidad, sin flecha; terminación en el punto de la curva = el punto/nodo mismo (la "dot" de d3-annotation), en el extremo del texto = nada.
- Evitar la "regla" vertical paralela al nombre: es una línea que corre paralela y cerca de otra (el conector), justo el factor que Barth hipotetiza que empeora la lectura.

### Gaps
- No hallé estudios de leaders sobre series temporales (todos son imágenes/mapas o círculos); la extrapolación a una curva es inferencia.
- Sin datos numéricos de grosor/opacidad óptimos; solo la regla cualitativa "fino y tenue" (Tufte, Barth).

## 4. Gestalt y evidencia perceptual: qué hace que una etiqueta se lea "ligada" a un punto

### Takeaway
La conexión uniforme (una línea continua que une dos cosas) es un principio de agrupamiento más primitivo y fuerte que la proximidad o la similitud: por eso basta una línea tenue para ligar un título lejano a su punto; la línea no necesita ser visible ni ondulada, necesita ser continua y no ambigua.

### Cited Findings
- Palmer & Rock (1994): uniform connectedness = regiones conectadas de propiedades homogéneas se perciben inicialmente como una unidad; ocurre antes que los factores gestálticos clásicos y define las unidades primitivas de percepción. — [Rethinking perceptual organization: The role of uniform connectedness](https://www.researchgate.net/publication/225549639_Rethinking_perceptual_organization_The_role_of_uniform_connectedness); [Palmer, Perceptual Grouping](https://palmerlab.berkeley.edu/pdf/Palmer.pdf)
- Estudios posteriores sobre la relación UC–proximidad en agrupamiento perceptual. — [PubMed 18758702](https://pubmed.ncbi.nlm.nih.gov/18758702/) (solo título/abstract visto; el detalle de "UC vence a proximidad" lo da el snippet del buscador, no lo leí en el paper).
- Knaflic aplica la "conexión" en gráficos de línea para ver orden, y proximidad + similitud para ligar rótulo con línea. — [Analytics Vidhya, resumen SWD](https://medium.com/analytics-vidhya/six-important-lessons-from-storytelling-with-data-by-nussbaumer-knaflic-part-2-737d8478bc0b)
- Practicantes: alternativa a muchos conectores = cerramientos livianos (región común). — [arXiv 2604.07691](https://arxiv.org/html/2604.07691v1)

### Inferences
- Como la conexión es tan potente, la línea puede bajar MUCHO su contraste sin perder el ligado (coincide con Tufte "poco contraste alcanza"). Lo que hoy "se lee pegado" probablemente es exceso de presencia, no falta.
- Continuidad: una vertical recta que termina exactamente en el borde izquierdo del texto (o en su eje) hace que el ojo "continúe" hacia el nombre; una Bézier que llega de costado rompe esa continuidad y obliga a recorrerla.
- Región común queda prohibida (cajas/cards), pero se puede lograr una "región" implícita alineando nombre y dato mono sobre el mismo eje que la vertical (la línea + el borde del texto forman una sola columna).
- Similitud por color: Datawrapper/Knaflic sugieren rótulo del color de la línea; en Layer con un solo celeste, el nombre podría tomar el celeste solo en hover/foco, manteniendo reposo neutral.

### Gaps
- No encontré mediciones de "a qué distancia máxima" una línea tenue sigue ligando bien; tampoco estudios de agrupamiento con fondos oscuros.

## 5. Ejemplos concretos y gráficos usados como navegación; traducción a desktop y mobile

### Takeaway
Hay buenos ejemplos de herramientas y patrones de anotación editorial (swoopyDrag NYT, d3-annotation, Datawrapper callouts), pero casi no encontré casos documentados de un gráfico de línea usado como menú principal; el patrón de Layer es poco común, lo que refuerza usar conexiones de manual (rectas/codo) en vez de inventar formas.

### Cited Findings
- swoopyDrag (Adam Pearce, NYT): demo de anotaciones hechas a mano sobre gráficos d3. — [Swoopy Drag demo](https://1wheel.github.io/swoopy-drag/)
- Ejemplo de swoopyDrag en scatter con anotaciones. — [Harry Stevens gist](https://gist.github.com/HarryStevens/f6e9003562bfe454a8f267f62cb2cf4a)
- Tutorial de anotar precio de Bitcoin con d3 (Enigma). — [Annotating Bitcoin Data with D3.js](https://medium.com/enigma-engineering/annotating-bitcoin-data-with-d3-js-and-enigma-public-d4e64bc0b0cc)
- Bloomberg (contenido patrocinado) "Bitcoin Goes Pro": línea de precio BTC con hitos anotados por eras. — [Bloomberg, Bitcoin Goes Pro](https://sponsored.bloomberg.com/immersive/ny-dig/bitcoin-goes-pro)
- Patrón scrollytelling "revelado por etapas": se dibuja la base, luego la línea, luego la anotación. — [Scrollytelling design patterns](https://scrollytelling.ai/scrollytelling-design-patterns/); [Flourish, scrollytelling examples](https://flourish.studio/blog/scrollytelling-examples/)
- Datawrapper en mobile mueve y numera anotaciones; en angosto el leader largo se abandona. — [Datawrapper responsive annotations](https://www.datawrapper.de/blog/better-more-responsive-annotations-in-datawrapper-data-visualizations)

### Inferences — traducción a la curva de Layer (todas son propuestas, no verificadas en pantalla)
- **Desktop (curva horizontal, títulos en el cielo):**
  1. *Plomada*: vertical recta de 1px, celeste ~25–30% opacidad, del nodo al pie del título; títulos con la misma línea base (o dos alturas fijas como máximo), alineados a izquierda contra la plomada. Ángulo único 90° = sistema; nunca cruza la curva porque la curva es función de x (cada vertical la toca una sola vez, en su propio punto). Es la opción más defendida por la evidencia (recta = más rápida; ángulo distinto de la curva; mínimo largo si la base del cielo está cerca).
  2. *Codo po corto*: igual que la plomada pero con un quiebre de 4–8px a 0° hacia el texto; usar solo si el título necesita desplazarse lateralmente (puntos muy juntos en x).
  3. *do a 45°*: solo si dos títulos chocan; ángulo fijo 45° para todos los desplazados.
  - Largo: con escala log y precio subiendo, los puntos tempranos (2012–2015) quedan bajos y sus plomadas largas; mitigación: que la línea base de títulos siga suavemente la curva a distancia fija (offset constante), así todas las plomadas miden lo mismo. Riesgo: si el offset es constante, los títulos dibujan una "segunda curva" — con offset suficiente (≥40–60px) y solo 8 títulos, se lee como columna de texto y no como línea.
- **Mobile (curva vertical, nombres alternados a ambos lados):**
  - Equivalente rotado: conector horizontal recto a 0° desde el nodo hacia el lado del texto, texto alineado contra el extremo (izquierda si está a la derecha de la curva, derecha si está a la izquierda). Como la curva vertical también es función de y, una horizontal la toca una sola vez → sin cruces.
  - Riesgo: "alternado" ya fue descartado por el cliente como solución; si la curva vertical obliga a alternar, la conexión horizontal recta y corta es la que menos ruido agrega. Alternativa: todos del mismo lado del cielo libre, con horizontales de largo variable (aceptable porque la recta se sigue rápido).
- **Reposo y hover:** en reposo, conectores casi invisibles (la conexión gestáltica alcanza); en hover/foco, ese conector sube de opacidad y el nombre toma el celeste — señal clara sin agregar elementos.
- **Qué evitar según la evidencia:** curvas S/Bézier (desestructuradas, peores en grupo), diagonales largas paralelas a la pendiente de la curva, dos líneas por título (rama + regla), flechas, cualquier conector más brillante que la curva.

### Gaps
- No encontré ejemplos documentados (con URL) de un gráfico de líneas usado como menú/índice principal de un sitio; tampoco piezas de Reuters/Bloomberg/FT con anotación de BTC log analizadas en detalle.
- Las recomendaciones de opacidad/largos son inferencia de diseño, no datos medidos; deberían probarse en el comparador (preview.html) mobile + desktop.

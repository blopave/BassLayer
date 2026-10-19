# Tradiciones gráficas analógicas: cómo se conecta un nombre con un punto de una forma

Contexto del problema (para el redactor): curva log de BTC 2012→hoy, una línea celeste sobre fondo casi negro, 8 secciones como puntos repartidos parejo sobre la curva, cada una conectada a su título (nombre + dato vivo gris mono) en el cielo vacío de arriba. Hoy: rama Bézier ondulada + "regla" vertical al costado del nombre. Problemas reportados: se lee pegada, tiembla, compite con la curva. Mobile: curva vertical al centro, nombres alternados a los dos lados.

---

## 1. Láminas botánicas y anatómicas (Haeckel, Curtis's, Gray's, Vesalius, Netter)

### Takeaway
Las dos grandes tradiciones son (a) la **clave numerada/letrada** (un caracter mínimo junto a la parte y el nombre en otra zona —leyenda o texto aparte—) y (b) el **rótulo con línea guía** hacia columnas alineadas fuera del dibujo. La innovación de Gray's (1858) fue poner el nombre en el lugar; los manuales editoriales de ilustración médica codifican después reglas muy precisas: el texto fuera del dibujo, columnas con bandera hacia el dibujo, filete del mismo peso que el texto, centrado en la altura de x.

### Cited Findings
- Henry Vandyke Carter (ilustrador de Gray's Anatomy, 1858) innovó al poner los nombres de las estructuras directamente sobre las imágenes, en vez de números diminutos que obligaban a ir a una clave en otra página, como era costumbre — [Proto Magazine](https://protomag.com/medical-history/anatomy-of-grays/); [Royal College of Surgeons](https://www.rcseng.ac.uk/library-and-publications/library/blog/grays-anatomy-1858/); [Wikipedia: Henry Vandyke Carter](https://en.wikipedia.org/wiki/Henry_Vandyke_Carter)
- Guía de preimpresión de Elsevier Health Sciences (estándar editorial de ilustración médica):
  - "Avoid placing type directly over illustrations. Instead, position type outside of art with a leader line." — [Elsevier, Prepress Guidelines](https://www3.us.elsevierhealth.com/HHS/artspecs/prepress2.html)
  - "Labels to left of figure are flush right. Labels to right of figure are flush left. Labels top and bottom are centered." — [Elsevier](https://www3.us.elsevierhealth.com/HHS/artspecs/prepress2.html)
  - "Leader lines should match the weight of accompanying type. Use a 0.75 pt. rule for 8 pt. type" — [Elsevier](https://www3.us.elsevierhealth.com/HHS/artspecs/prepress2.html)
  - "Rules start from the end of the left-hand labels, and from the start of the right-hand labels" y "Center the rule vertically within the 'x' height of the letter" — [Elsevier](https://www3.us.elsevierhealth.com/HHS/artspecs/prepress2.html)
  - Los guías deben "run in an even, organized manner", pero "Do not FORCE this contrary to readability"; además "No leader may change its color more than once" al cruzar fondos de distinto valor — [Elsevier](https://www3.us.elsevierhealth.com/HHS/artspecs/prepress2.html)
  - Tipografía estándar: 8/9 pt Helvetica — [Elsevier](https://www3.us.elsevierhealth.com/HHS/artspecs/prepress2.html)
- En ilustración médica hay dos estrategias típicas: rótulos en columnas verticales a izquierda y derecha del dibujo, o rótulos cerca del contorno de la estructura — [ScienceDirect, Anatomical Label overview](https://www.sciencedirect.com/topics/computer-science/anatomical-label); [ResearchGate, Label Layout for Interactive 3D Illustrations](https://www.researchgate.net/publication/259323227_Label_Layout_for_Interactive_3D_Illustrations)
- Curtis's Botanical Magazine (desde 1787): láminas numeradas en secuencia, coloreadas a mano, con texto descriptivo aparte; los "detalles despiezados" alrededor del dibujo principal le daban valor práctico para botánicos — [NYAM Center for History](https://nyamcenterforhistory.org/2015/01/29/a-finer-sight-can-scarcely-be-imagined-curtis-botanical-magazine/); [Wikipedia](https://en.wikipedia.org/wiki/Curtis%27s_Botanical_Magazine). Imágenes: [Plate 1487 (Commons)](https://commons.wikimedia.org/wiki/File:Curtis's_botanical_magazine_(Plate_1487)_(8248027168).jpg), [Plate 1462 (Commons)](https://commons.wikimedia.org/wiki/File:Curtis's_botanical_magazine_(Plate_1462)_(8246940493).jpg)
- Haeckel, Kunstformen der Natur (1899–1904): 100 láminas cromolitográficas "aptas para enmarcar", cada una con un folleto explicativo aparte; o sea, la lámina queda limpia y la identificación va por números/leyenda separada — [Wikipedia](https://en.wikipedia.org/wiki/Kunstformen_der_Natur). Escaneos 300 dpi: [Internet Archive](https://archive.org/details/KunstformenDerNaturErnstHaeckel); catálogo de las 100 láminas: [rarebooksberlin.de (PDF)](http://www.rarebooksberlin.de/fileadmin/haeckel_artforms.pdf); [Smithsonian Ocean](https://ocean.si.edu/ocean-life/invertebrates/art-forms-nature-marine-species-ernst-haeckel)
- Vesalius, Fabrica (1543): lo más conocido tipográficamente son las capitulares historiadas (4 grandes: I, O, Q, T; 17 chicas) — [vesaliusfabrica.com](https://www.vesaliusfabrica.com/en/original-fabrica/the-art-of-the-fabrica/historiated-capitals.html)

### Inferences
- La regla Elsevier "rótulos a la izquierda alineados a la derecha, a la derecha alineados a la izquierda, arriba y abajo centrados" resuelve directamente la pregunta de alineación: en desktop, con los títulos ARRIBA de la curva, la convención dice **centrados sobre su guía** (o, si se agrupan en columnas a los costados, con la bandera mirando hacia el dibujo). En mobile (tronco vertical, nombres alternados) la convención es literal: los de la izquierda en bandera derecha, los de la derecha en bandera izquierda, y el filete nace del borde del texto más cercano al tronco.
- "El filete pesa lo mismo que el texto" es una pista concreta contra el problema de "compite con la curva": si la guía tiene el peso del texto gris (no el de la curva celeste), queda jerárquicamente subordinada. Traducción: guía de ~0,75–1 px, en el gris del dato, no en el celeste de la curva.
- "Centrar el filete en la altura de x" sugiere que la guía no debería terminar al costado del bloque (regla vertical, lo actual) sino tocar el texto a la altura de x de la primera línea, o terminar en el borde inferior del bloque centrado.
- Haeckel/Curtis muestran el extremo opuesto: clave mínima (numeral) en el dibujo y el texto lejos. Para un índice de navegación el nombre tiene que estar a la vista, así que la clave separada no aplica tal cual, pero sí la idea de que **el punto de la curva lleve solo una marca mínima** y todo lo tipográfico viva afuera.
- Riesgo del modelo Gray's (nombre sobre la estructura): está descartado por Pablo ("rótulos sobre la curva").

### Gaps
- No encontré una fuente primaria con las convenciones de rótulo de Redouté ni de Netter (probablemente Netter usa columnas laterales con guías rectas, pero no lo verifiqué).
- No verifiqué en una lámina concreta de Curtis's el sistema de numerales de los despieces (las búsquedas no lo describen; habría que mirar las láminas en BHL/Commons).

---

## 2. Ilustración técnica, despieces y dibujos de patente

### Takeaway
La norma técnica es la fuente más precisa y más útil: guía **recta, fina, inclinada (ni horizontal ni vertical), con un tramo corto horizontal ("hombro") que llega al texto**, terminación en **punto** si cae dentro de una forma, lo más corta posible y sin cruzarse. ASME además admite **una línea vertical al final de la guía para agrupar información** (lo más parecido a la "regla" actual).

### Cited Findings
- ASME Y14.2 (convenciones de línea): la guía no debe ser vertical ni horizontal; es una línea recta inclinada, salvo un tramo corto horizontal que llega al centro de la altura de la primera o última letra/dígito de la nota — [ASME Y14.2-2014 (preview PDF)](https://www.asme.org/getmedia/002844d1-56a7-4b23-8a05-3653dced0b3a/35656.pdf); [ASME, ficha de la norma](https://www.asme.org/codes-standards/find-codes-standards/y14-2-line-conventions-lettering). (Nota: el texto lo tomé del extracto del buscador sobre ese PDF; el PDF no se pudo parsear.)
- ASME Y14.2: punto de 1,5 mm mínimo cuando la guía termina dentro del contorno de un objeto; flecha cuando termina sobre el contorno; nada cuando termina en una línea de cota — [ASME Y14.2-2014](https://www.asme.org/getmedia/002844d1-56a7-4b23-8a05-3653dced0b3a/35656.pdf); también [toolnotes.com](http://toolnotes.com/home/engineering-graphics/lettering-and-line-conventions/leader-lines/)
- ASME Y14.2: "A vertical line may be used at the end of the leader to group information", y en ese caso la guía puede terminar en cualquier punto de esa línea vertical — [ASME Y14.2-2014](https://www.asme.org/getmedia/002844d1-56a7-4b23-8a05-3653dced0b3a/35656.pdf)
- Las guías deben ser rectas, no curvas; no innecesariamente largas; y no deben cruzarse entre sí — [Loughborough, Leader line in engineering drawing](https://lbas.lboro.ac.uk/drawing/leader-line-in-engineering-drawing.html); [engineeringtechnology.org](https://engineeringtechnology.org/engineering-graphics/line-conventions-and-lettering/dimension-extension-and-leader-lines/)
- Patentes, 37 CFR 1.84(q): "Lead lines are those lines between the reference characters and the details referred to. Such lines may be straight or curved and should be as short as possible. They must originate in the immediate proximity of the reference character and extend to the feature indicated." — [37 CFR 1.84, Cornell LII](https://www.law.cornell.edu/cfr/text/37/1.84)
- Patentes, 37 CFR 1.84(p): caracteres de referencia (preferiblemente numerales) "plain and legible", **sin** paréntesis ni comillas ni encerrados en contornos (p. ej. círculos); al menos 1/8" (0,32 cm) de alto; "should not be placed in the drawing so as to interfere with its comprehension" — [37 CFR 1.84](https://www.law.cornell.edu/cfr/text/37/1.84)
- Estudio empírico de etiquetado de borde (labels fuera de la imagen conectados por guías): de cuatro tipos de guía, las **po-leaders** (en L: un tramo ortogonal y otro paralelo al borde donde están los rótulos) fueron recomendadas por rendimiento (asignar punto↔rótulo rápido y sin error) y preferencia subjetiva; las s-leaders (curvas) aparecen sobre todo en geofilogenias — [Barth, Gemsa, Niedermann, Nöllenburg, "On the readability of leaders in boundary labeling", Information Visualization 2019](https://www.researchgate.net/publication/327846592_On_the_readability_of_leaders_in_boundary_labeling); [slides GD2015](http://www.csun.edu/gd2015/slides/Sept26-16-20-Benjamin_Niedermann.pdf)

### Inferences
- La rama Bézier ondulada contradice tres convenciones a la vez: recta, corta, y que no compita con el dibujo. Una curva ondulada además se confunde perceptivamente con la curva de precio (misma "familia" de forma = similitud), lo que explica "compite con la curva".
- Lo que las normas proponen es exactamente lo opuesto en carácter a la curva de precio: la curva es orgánica y ruidosa; la guía debe ser geométrica (recta) para leerse como **otra capa** (anotación), no como dato.
- Traducción concreta desktop: desde cada punto, un segmento **vertical recto** hacia arriba hasta la línea base común de los títulos (en L o I, tipo po-leader: el tramo ortogonal a la "franja" de títulos). Como los 8 puntos están repartidos parejo en x, y los títulos van arriba, un segmento vertical puro desde cada punto llega debajo de su título sin cruzarse con ningún otro: es el caso ideal de boundary labeling (sin conflicto de orden). La norma ASME dice "no vertical" porque en planos el vertical se confunde con aristas del objeto; acá no hay aristas verticales en la curva, así que el vertical es la lectura más quieta (pero ver riesgo: si el sitio ya rechazó "riel parejo/estaciones", vale probarlo como hilo finísimo, no como poste).
- Terminación: punto chico en la curva (ASME: "termina dentro de la forma → punto") y **nada** en el lado del texto, o el hombro corto centrado en la altura de x. La regla vertical al costado del nombre actual es la variante ASME de "línea vertical para agrupar": legítima cuando hay varias líneas de nota (nombre + dato), pero duplica trazos; si se mantiene, la guía debería morir en ella sin curvas.
- 37 CFR prohíbe encerrar el numeral: coincide con la regla de Pablo de "nada de cajas/cápsulas".
- Mobile: con tronco vertical y rótulos alternados a los lados, el po-leader es un tramo **horizontal** corto desde el punto del tronco hasta el borde interno del texto (alineado en bandera hacia el tronco, regla Elsevier). Recto, corto, sin curva.

### Gaps
- No pude leer el texto completo de ISO 128 (guías en normas ISO); sé por la literatura secundaria que es similar, pero no lo cito.
- El estudio de boundary labeling testeó tareas de asignación, no estética "premium" ni temblor/animación.

---

## 3. Partituras: dinámicas, marcas de ensayo y letra bajo la melodía

### Takeaway
La partitura vincula texto con línea **sin ninguna línea de conexión**: por posición vertical fija (encima o debajo del pentagrama, en una "franja" estable) y por alineación horizontal exacta con la nota (centrado en la cabeza de nota). Las marcas de ensayo son letras/números en negrita arriba del sistema, colocadas en momentos estructurales, no a intervalos arbitrarios.

### Cited Findings
- Marcas de ensayo: típicamente en negrita y encerradas en un recuadro (o menos comúnmente un círculo); en partitura orquestal, sobre el pentagrama de flautas y duplicadas sobre violines primeros — [Wikipedia, Rehearsal letter](https://en.wikipedia.org/wiki/Rehearsal_letter)
- Las marcas de ensayo deben ir a intervalos frecuentes (cada ~10–15 compases) pero **siempre en momentos estructurales o musicalmente relevantes**, no en incrementos arbitrarios — [IU Jacobs, Music Notation Style Guide](https://blogs.iu.edu/jsomcomposition/music-notation-style-guide/)
- La letra va siempre debajo de la marca más baja del pentagrama; las dinámicas se centran respecto de la cabeza de nota, directamente debajo del pentagrama; en partituras vocales van arriba para no chocar con la letra — [Gradus GE-327](https://gradusmusic.com/engraving/rule/lyric-collision-with-staff-below-or-dynamics); [Wikipedia, Dynamics](https://en.wikipedia.org/wiki/Dynamics_(music))
- Los reguladores (hairpins) comparten la línea base de las dinámicas que conectan (Gould, Behind Bars) — [Gradus GE-413](https://gradusmusic.com/engraving/rule/vs-hairpin-dynamic-alignment)
- Referencia general: Elaine Gould, Behind Bars (Faber, 2011) — [Wikipedia](https://en.wikipedia.org/wiki/Behind_Bars_(book)); [índice](https://www.behindbarsnotation.co.uk/contents/toc.pdf)

### Inferences
- La lección de la partitura es **la franja**: todos los textos de un tipo viven en una misma línea base (dinámicas debajo, ensayos arriba), y la conexión con el evento es solo la **alineación vertical** (mismo x). Para la curva: los 8 títulos sobre una misma línea base en el cielo, cada uno centrado exactamente en el x de su punto; la vinculación la hace la columna x compartida (Gestalt de alineación), y la guía puede ser mínima o nula. Ojo: "franja índice" y "riel parejo" ya fueron descartados; la diferencia acá es que no hay riel dibujado, solo línea base tipográfica común y un hilo vertical.
- La marca de ensayo enseña que el **marcador en la línea va en lugares con sentido** (estructurales). Las secciones están "repartidas parejo" (no en eventos de precio), así que el punto en la curva es convencional, no semántico: conviene que la marca en la curva sea neutra (tick o punto mínimo) y no sugiera un dato.
- La letra bajo la melodía (silaba centrada bajo su nota, siguiendo el contorno) es el antecedente de "nombres que siguen la forma"; está descartado ("rótulos sobre la curva").

### Gaps
- No accedí al texto de Behind Bars directamente; las reglas vienen de guías secundarias que lo citan.

---

## 4. Cartelas de museo y señalética expositiva

### Takeaway
La cartela no se conecta con la obra con ninguna línea: se conecta por **constancia** (misma relación espacial con cada obra en toda la sala, misma altura, mismo lado). El vínculo es un sistema aprendido, no un trazo.

### Cited Findings
- Smithsonian: las cartelas deben ubicarse de forma consistente cerca del objeto, con la misma relación espacial con cada obra en toda la exposición; centro óptimo de la cartela a 54" (1370 mm) del piso, rango 48–67" — [Smithsonian Guidelines for Accessible Exhibition Design (PDF)](https://affiliations.si.edu/wp-content/uploads/PDFs/Accessible-Exhibition-Design.pdf)
- Smithsonian: rango de cuerpo de texto de cartela 16–20 pt, escalado si la distancia de lectura supera un metro — [Smithsonian Guidelines (PDF)](https://affiliations.si.edu/wp-content/uploads/PDFs/Accessible-Exhibition-Design.pdf)
- V&A: los paneles llevan las grandes ideas y las cartelas las desarrollan vinculándolas a objetos concretos; el texto de sala es "an element within a 3-D matrix of design, objects and graphics"; cada texto debe tener sentido fuera de contexto porque el visitante lee en un orden que no se puede dirigir — [V&A, Gallery Text: A Ten Point Guide (PDF)](https://www.vam.ac.uk/blog/wp-content/uploads/VA_Gallery-Text-Writing-Guidelines_online_Web.pdf)

### Inferences
- La "regla" vertical actual intenta citar la cartela, pero la cartela real **no tiene regla ni línea**: lo que la vincula es la repetición idéntica de la relación (misma distancia, mismo lado, misma altura). Traducción: los 8 títulos con exactamente la misma relación geométrica con su punto (misma distancia vertical a una línea base común, mismo centrado), de modo que el ojo aprenda la regla con el primero y la aplique a los otros 7.
- "Cada texto se lee solo y en cualquier orden" (V&A) refuerza el formato nombre + dato vivo: cada título debe ser autosuficiente, sin depender de leer la curva.

### Gaps
- No encontré guías de museo que hablen de filetes/reglas como vínculo cartela-obra; la "regla de cartela" parece ser una interpretación del proyecto, no una convención documentada.

---

## 5. Instrumentos de medición (relojes, reglas de cálculo, escalas)

### Takeaway
Los instrumentos vinculan número y posición con **ticks cortos jerarquizados** (largo y peso según importancia) y numerales al lado del tick mayor, nunca con líneas largas. La jerarquía es: aguja > índices > pista de minutos. Y las escalas log (regla de cálculo) son el antecedente directo de una curva log rotulada.

### Cited Findings
- Reglas de cálculo: graduaciones primarias con numerales grandes impresos debajo; secundarias (más cortas) sin numeral porque "would crowd the numerals too much"; terciarias de paso variable según la zona de la escala (0,01 entre 1–2; 0,02 entre 2–4; 0,05 entre 4–10) — [sliderules.info, Teach Yourself the Slide Rule §3](http://www.sliderules.info/a-to-z/tys/tys03.htm); [Wikipedia, Slide rule scale](https://en.wikipedia.org/wiki/Slide_rule_scale)
- En escala logarítmica, la razón entre números es una distancia constante (1→2 = 2→4 = 4→8) — [sliderules.info, Background](http://www.sliderules.info/a-to-z/background.htm)
- Esferas de reloj: marcas de minuto cortas, índices de cinco minutos más largos o prominentes para orientar rápido; jerarquía visual: agujas > índices > pista de minutos; la aguja de minutos debe llegar a la pista y la de horas acercarse a los índices — [watchscanning.com, Anatomy of a Watch Dial](https://www.watchscanning.com/journal/anatomy-of-a-watch-dial/); [Barrington, Minute Track](https://barringtonwatchwinders.com/en-us/pages/minute-track)
- Catálogo visual de escalas de reglas de cálculo (imágenes de referencia) — [Slide Rule Museum](https://www.sliderulemuseum.com/SR_Scales.htm)

### Inferences
- El tick es el vínculo más quieto que existe: un trazo corto, perpendicular a la escala, que no viaja. En la curva, un **tick corto perpendicular a la curva** (o vertical) en cada punto de sección reemplaza al "punto suelto" (descartado) con algo que se lee como "marca de escala", y el título arriba se alinea a ese tick por columna x. La guía larga desaparece o queda como hilo opcional.
- La regla "aguja llega a la pista" sugiere que si hay hilo vertical, debe tocar exactamente la línea base del texto (llegar), ni quedar corto ni atravesarlo.
- La jerarquía de reloj aplicada: curva (aguja) > ticks de sección (índices) > hilos/datos grises (pista). Hoy la rama compite porque está en el mismo nivel que la curva.
- La regla de cálculo enseña que en log se numeran solo los primarios para no amontonar: refuerza que en mobile no todo necesita hilo.

### Gaps
- No encontré fuentes específicas y citables sobre sextantes, termómetros o sismógrafos (rotulación de escala); quedan sin documentar.

---

## 6. Tipografía editorial y suiza (Müller-Brockmann, Bringhurst, marginalia, filetes)

### Takeaway
El estilo suizo vincula por **grilla y alineación** (bandera a la izquierda, pocos tamaños, saltos grandes de escala), no por trazos. La tradición de notas al margen (Bringhurst) pone la nota "donde se necesita", a la altura de lo que anota, y la vincula por vecindad y línea base. Los filetes en editorial separan o agrupan, rara vez conectan en diagonal.

### Cited Findings
- Müller-Brockmann: grotescas en bandera izquierda, pocos tamaños con saltos grandes para la jerarquía; composiciones asimétricas sostenidas por la grilla; "subjectivity is suppressed in favour of a geometric grid that determines the arrangement of the type and images" — [neugraphic.com, Grid and Design Philosophy](https://www.neugraphic.com/muller-brockmann/muller-brockmann-text2.html); [Grid Systems in Graphic Design (Goodreads)](https://www.goodreads.com/book/show/63209013-grid-systems-in-graphic-design)
- Bringhurst defiende las notas al margen (sidenotes) como el mejor método de notas, que pueden moverse por los márgenes como en los libros del Renacimiento, "presentes donde se necesitan" — [Wikipedia, The Elements of Typographic Style](https://en.wikipedia.org/wiki/The_Elements_of_Typographic_Style)
- Puntuación colgante / alineación óptica de margen: se sacan al margen los signos con poca masa (comillas, guiones) y los bordes de letras como T, Y, A para que el borde óptico sea parejo — [Wikipedia, Hanging punctuation](https://en.wikipedia.org/wiki/Hanging_punctuation); [Wikipedia, Optical margin alignment](https://en.wikipedia.org/wiki/Optical_margin_alignment); [Fonts.com](https://www.myfonts.com/pages/fontscom-learning-fontology-level-4-fine-typography-hanging-punctuation)
- Tufte: rotular directo junto a la línea en vez de leyenda, porque la leyenda obliga al ojo a ir y volver; cuando no se puede rotular directo, filetes finos que unen cada barra con su rótulo — [GitHub caylent/tufte-data-viz (resumen)](https://github.com/caylent/tufte-data-viz/blob/main/SKILL.md); [U. Michigan, The Gospel According to Tufte (PDF)](https://websites.umich.edu/~jpboyd/eng403_chap2_tuftegospel.pdf). (Fuentes secundarias.)

### Inferences
- Alineación óptica aplicada al título: si el hilo vertical llega al centro del nombre (centrado) o a su borde (bandera), el punto de llegada debe medirse sobre el borde **óptico** de la primera letra, no la caja del texto; si no, el hilo "parece" desviado aunque esté exacto. Esto puede ser parte del "se lee pegada".
- La lección suiza para el cielo: una sola línea base común para los 8 nombres (o dos, si hay nombre + dato), una sola escala tipográfica, y la conexión implícita por columna x. Menos trazos, más grilla — coherente con "less is more".
- La nota al margen se ubica a la altura de su referencia y nada más: equivalente a que el título esté **exactamente** sobre su punto (mismo x), no desplazado con una rama que viaja en diagonal.

### Gaps
- No encontré fuente directa de Josef Albers sobre vínculo etiqueta-forma (su obra es de color/interacción; no parece pertinente).
- No accedí al texto original de Müller-Brockmann sobre filetes.

---

## 7. Arte generativo y plotter (Hobbs, Lieberman, Gamboa Naón)

### Takeaway
La referencia generativa más útil no es sobre rotular sino sobre **cómo conviven muchas líneas sin chocarse**: los flow fields de Hobbs producen curvas que corren paralelas sin colisionar. No encontré prácticas documentadas de "líneas de conexión etiqueta↔punto" en estos artistas.

### Cited Findings
- Tyler Hobbs: los flow fields producen curvas orgánicas que no se superponen, corren junto a sus vecinas sin colisionar; fueron centrales en Fidenza — [Tyler Hobbs, Flow Fields](https://www.tylerxhobbs.com/words/flow-fields); [Fidenza](https://www.tylerxhobbs.com/words/fidenza)
- Manolo Gamboa Naón (Manoloide), artista argentino de código: trabaja con formas geométricas básicas, líneas y color; su obra incluye dibujos de plotter — [Kate Vass Galerie](https://www.katevassgalerie.com/manoloide); [Artnome](https://www.artnome.com/news/2018/8/8/generative-art-finds-its-prodigy)
- Zach Lieberman: co-creador de openFrameworks y cofundador de la School for Poetic Computation (dato que en el buscador apareció mezclado con la ficha de Manolo; es de Lieberman, no de Gamboa Naón) — [Kate Vass Galerie, blog](https://www.katevassgalerie.com/blog/manolo-a-creative-coder-from-argentina)

### Inferences
- Si se conservara alguna curvatura en las guías, la lección de Hobbs es que las líneas secundarias deben seguir un campo común (todas con la misma "dirección" y sin cruzarse), no curvas independientes; 8 ramas onduladas distintas rompen eso y producen el "temblor".
- El plotter (pluma de un solo grosor) refuerza el ideal de un solo peso de línea, fino y continuo.

### Gaps
- Sin fuentes sobre rotulación en la obra de Lieberman/Hobbs/Gamboa Naón; esta sección es más de inspiración que de convención.

---

## 8. Percepción (Gestalt) y síntesis por técnica para la curva

### Takeaway
La conexión por línea (uniform connectedness) es el principio de agrupamiento más fuerte, más que proximidad o similitud: por eso una guía siempre "gana" atención, y por eso tiene que ser la marca más tenue del sistema. Cuando la proximidad y la alineación ya hacen el trabajo, la línea puede ser mínima.

### Cited Findings
- Palmer & Rock (1994): las regiones conectadas homogéneas se perciben como unidad; el efecto se da aun contra proximidad y similitud; la conexión puede ser más fuerte que proximidad, color, tamaño o forma — [Palmer & Rock, "Rethinking perceptual organization: The role of uniform connectedness", Psychonomic Bulletin & Review 1994](https://link.springer.com/article/10.3758/BF03200760); [Palmer, Perceptual Grouping (PDF)](https://palmerlab.berkeley.edu/pdf/Palmer.pdf)
- Relación entre conectividad y proximidad en agrupamiento perceptual — [PubMed 18758702](https://pubmed.ncbi.nlm.nih.gov/18758702/)

### Inferences — tabla de técnicas traducidas a la curva (8 títulos)

| Técnica (tradición) | Por qué funciona (Gestalt) | Riesgo | Desktop | Mobile |
|---|---|---|---|---|
| Hilo vertical recto punto→línea base (po-leader, ASME, Tufte) | Conexión + alineación x | Si es grueso/celeste, "poste" o riel (descartado) | 8 hilos verticales de ~0,75 px en gris del dato, del punto a la línea base común; título centrado en el x del punto; nada en la punta superior | Tramo horizontal corto desde el tronco al borde interno del nombre (bandera hacia el tronco) |
| Tick + columna x, sin hilo (instrumentos, partitura) | Alineación + proximidad, sin trazo | Vínculo débil si la distancia vertical es grande | Tick corto perpendicular a la curva en cada punto; título exactamente encima, misma línea base | Tick horizontal corto al lado del tronco; nombre en la altura del tick |
| Guía con hombro horizontal (ASME) | Conexión, y el hombro "presenta" el texto | Diagonal = movimiento, puede "temblar" | Diagonal recta + hombro corto a la altura de x | Hombro hacia afuera del tronco |
| Línea vertical de agrupación (ASME; la "regla" actual) | Agrupa nombre+dato como unidad | Duplica trazos; si la guía es curva, compite | Solo si la guía es recta y muere en la regla | Igual, del lado del tronco |
| Constancia de cartela (museo) | Aprendizaje de regla; similitud de relación | Ninguno fuerte; requiere repartición pareja (ya la hay) | Misma distancia y centrado para los 8 | Misma separación del tronco a ambos lados |
| Clave numérica (Haeckel/Curtis) | Similitud de símbolo | Obliga a ir y volver (Tufte) | No apto para índice | No apto |

- Diagnóstico del estado actual a la luz de esto: la rama Bézier ondulada (1) es curva como la curva de precio → similitud de forma → compite; (2) es larga y diagonal → el ojo la sigue como movimiento → "tiembla"; (3) termina al costado del texto en una regla → doble trazo junto al nombre → "se lee pegada". Las tres tradiciones técnicas coinciden en la corrección: recta, corta, más tenue que el texto, terminación mínima.

### Gaps
- No hay estudios que comparen hilo vertical vs. tick sin hilo para índices de navegación sobre curvas; habría que probarlo en el comparador (preview) con Pablo.

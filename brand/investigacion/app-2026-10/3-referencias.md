# BassLayer: de la escena viva al ícono fijo. Investigación de referencias

Fecha: 2026-10-12. Esto es solo investigación: todavía no hay diseño.

Cómo leer el nivel de verificación:
- **[2+]** significa que el dato está confirmado en dos o más fuentes independientes.
- **[1]** significa que hay una sola fuente.
- **[obs]** es una observación del ícono actual sin una fuente de diseño que la respalde. Conviene mirarlo en el store antes de citarlo.

Contexto de la marca, tomado de la memoria del proyecto: la escena de la ronda 19 es hoy el home. El camino del "símbolo fijo" (rondas 21 a 27, con la versión B · Ficha: medio vinilo + 3 velas + horizonte en un disco) quedó archivado. El "boleto" se descartó porque rompía con la estética. Los territorios de abajo tienen en cuenta esas dos experiencias.

---

## 1. Principios accionables

1. **Una sola forma focal.** Apple pide "a single focus point" y que el ícono sea simple, porque el detalle "can make an icon appear muddy" en tamaños chicos. Flarup pide "clarity of concept and a unique silhouette". [2+] → En BassLayer, la escena entera (vinilo + velas + horizonte + reflejos) no puede ser el ícono. Hay que elegir **un** gesto que contenga a los dos mundos.
2. **Prueba de la silueta.** Rellenar el glifo de negro sobre blanco y preguntar si se reconoce. Flarup evalúa con cuatro lentes: escalabilidad, reconocibilidad, consistencia y unicidad. [2+]
3. **Prueba del desenfoque o de la retina.** Mirarlo desenfocado o a 16 px y preguntar si queda una mancha con forma propia. Es la misma prueba que Pablo ya usa: "entrecerrar los ojos" o "el calco en la luneta".
4. **Escala real desde el día uno.** Marc Edwards (Bjango) recomienda bajar a 32×32 enseguida y trabajar sobre una grilla de 32, porque 1024 es múltiplo exacto. Un ícono de 1024 px se ve a 16 px, el 1,563 % del original. [1, Bjango] Hay que probar todos los tamaños: 16 (favicon), 29 (ajustes), 48 (Android y notificación), 60 (home de iOS a 1×) y 180 (iPhone a 3×).
5. **Capas simplificadas por tamaño.** Bjango arma componentes alternativos en el mismo documento y prende o apaga capas según el tamaño. → Por debajo de unos 32 px, el ícono de BassLayer puede perder detalle (los reflejos, la tercera vela) sin perder la forma. Ya hay un antecedente propio: en la ronda 27, "debajo de 24 px va limpio".
6. **Corrección óptica medida.** Un círculo tiene que medir **112,84 %** del lado de un cuadrado para pesar igual. Un triángulo se centra por el centroide, no por la caja. Las formas con huecos se miden por su envolvente convexa. [1, Bjango "Formulas for optical adjustments"] → El equilibrio 50/50 entre un disco (vinilo) y barras (velas) **no se logra con áreas iguales**. Hay que compensar ópticamente y medirlo, como ya se hizo con las áreas 49/51.
7. **Grilla y zona segura.** Material trabaja a 192 dp con formas guía: círculo de 176, cuadrado de 152, rectángulos de 176×128. En Android adaptativo, el lienzo es de 108 dp y la zona segura un círculo de 66 dp que ninguna máscara recorta. El ícono monocromo temático va entre 48 y 72 dp. [2+] → El glifo tiene que entrar en un círculo de aproximadamente el 61 % del lienzo y sobrevivir al recorte en círculo, squircle y gota.
8. **El glifo no llena el lienzo.** Apple: "you don't need to fill the entire icon with content", con un fondo simple que ponga el énfasis en la forma. [2+]
9. **Tiene que andar en un solo color.** En iOS 18 y 26, el modo "tinted" pasa el ícono a escala de grises y aplica el color del usuario por luminancia. El sujeto tiene que ser lo más claro y el fondo lo más oscuro. [2+] Android 13+ hace lo mismo con el ícono monocromo. → **Cobre y celeste no pueden ser lo único que separe a Bass de Layer.** La dualidad tiene que leerse por la forma, no por el color.
10. **Contraste en fondos claros y oscuros.** iOS 26 tiene modos default, dark, clear y tinted. Un ícono oscuro sobre fondo oscuro con brillos de borde genera la ilusión de "ícono torcido" que reportó MacRumors (sept 2025). Flarup advierte que los brillos especulares uniformes en todas las capas "muddy detail" y bajan el contraste en fondos claros. [2+]
11. **Liquid Glass: capas sí, efectos con mesura.** Icon Composer arma el ícono en hasta 4 grupos de capas (fondo / medio / frente) y agrega profundidad, translucidez y brillo. Flarup: "making good Liquid Glass icons is all about layering and figuring out **when not to apply the effects**". [2+] → El horizonte separa naturalmente dos capas: arriba lo que emerge y abajo el reflejo. Encaja con el sistema sin depender del vidrio.
12. **Qué envejece rápido (2025–26).** Lo que envejece: el vidrio como protagonista, los degradés "aurora", los brillos especulares por todos lados, los glifos 3D tipo juguete y las formas que solo se entienden con el efecto puesto. Hay críticas extendidas a la "sameness" de Liquid Glass, y Mantia sostiene que el squircle obligatorio "makes bad icons mediocre but pushes great icons toward mediocrity too". [2+] Lo que dura: **una forma plana fuerte que el sistema puede "vidriar" sin volverse otra cosa**. Si el ícono funciona como sticker plano, el vidrio es un acabado de la plataforma y no el concepto.
13. **Nada de texto ni de detalle fino.** Flarup: "avoid thin line work, low contrast and complex metaphors". [2+] → El nombre "Bass LAYER" no va en el ícono. A lo sumo, en la versión de sticker o pin.
14. **El ícono es el activo más visto de la marca.** Flarup: un ícono mal resuelto es "a missed opportunity with your strongest visual asset". Tiene que poder ser, sin cambios, el favicon, el avatar, el pin y el sticker.
15. **Favicon SVG con tema.** Un solo SVG con `@media (prefers-color-scheme: dark)` dentro se recolorea solo en Safari y Firefox. [2+] → Esto permite que el favicon sea neutral, coherente con el "reposo neutral" de la marca.

---

## 2. Tabla de casos: de identidad viva a símbolo fijo

| Marca | Estudio | Qué hizo | Lección para BassLayer | Link |
|---|---|---|---|---|
| MIT Media Lab (2011) | Richard The y E Roon Kang (TheGreenEyl) | Logo generativo de 3 haces de luz en 40.000 variantes y 12 colores; cada persona tenía el suyo. Se reemplazó a los 3 años. [2+] | Lo vivo sin un ancla fija no se fija en la memoria. El sistema vivo necesita una forma constante debajo. | https://thenextweb.com/news/mit-media-labs-new-logo-has-40000-variations · https://gizmodo.com/why-mit-media-lab-scrapped-its-old-logo-after-just-thre-1651927638 |
| MIT Media Lab (2014) | Pentagram (Michael Bierut, Aron Fay) | Grilla de 7×7. Los glifos de cada grupo varían, pero un **monograma "ML" fijo** los ata a todos. Recupera la simplicidad del logo de Muriel Cooper de 1962. [2+] | Modelo directo: **la escena es el sistema y el ícono es el monograma**. Las dos cosas comparten la grilla. | https://www.dezeen.com/2014/10/29/pentagram-mit-media-lab-rebrand-visual-identity/ · https://www.itsnicethat.com/articles/pentagram-mit |
| Visit Nordkyn | Neue (Noruega) | El logo cambia cada 5 minutos con el viento y la temperatura reales. Es un copo de nieve hexagonal: la forma base es fija y solo se deforma un vértice. [2+] | Es el antecedente más cercano a "velas BTC reales": **dato vivo, forma madre fija**. El ícono puede ser la forma madre "en reposo". | https://neue.no/work/visit-nordkyn/ · https://www.dandad.org/work/d-ad-awards-archive/where-nature-rules |
| Casa da Música | Sagmeister Inc. | El edificio de Koolhaas visto desde 6 ángulos, con 17 caras que se colorean a partir de una imagen. La silueta del edificio no cambia. [2+] | Lo variable es el relleno y lo fijo es la silueta. En BassLayer: los colores y los datos varían, la silueta no. | https://sagmeister.com/work/casa-da-musica/ · https://underconsideration.com/brandnew_v1/archives/the_17_sides_of_a_cultural_ide.php |
| Spotify (2015) | Collins | El sistema explotó: 31 colores, duotonos, formas "burst" y "The Colorizer". **El logo de las tres ondas quedó intacto.** [2+] | La expresión vive en el sistema y el signo no se toca. | https://www.fastcompany.com/3043547/spotifys-new-look-signals-its-identity-shift · https://www.designweek.co.uk/issues/9-15-march-2015/spotify-undergoes-colourful-brand-refresh/ |
| Instagram (2016 / 2022) | Equipo interno (Ian Spalter) · 2022 con Rose Pilkington | La Polaroid se redujo a un squircle, un círculo y un punto. Le pidieron a la gente que lo dibujara de memoria en 5 segundos y casi todos dibujaron arcoíris, lente y visor. Ese fue el criterio. En 2022, el degradé "lit from within" se genera distinto en cada uso y el glifo no cambia. [2+] | **La prueba de dibujarlo de memoria en 5 segundos.** Lo vivo (la luz) va por dentro de un glifo fijo. | https://www.creativebloq.com/design/branding/rebrand-revisited-instagrams-controversial-2016-redesign · https://www.itsnicethat.com/news/instagram-rebrand-graphic-design-230522 |
| Mastercard (2016 → 2019) | Pentagram (Bierut, Hayman) | Dos círculos que se superponen. En 2019 sacaron el nombre porque el 80 % reconocía la marca solo por los círculos. [2+] | Es el signo dual más exitoso del mundo: **dos partes iguales y un tercer elemento (la intersección) que es la marca**. | https://www.dezeen.com/2019/01/10/mastercard-rebrand-pentagram-design/ · https://www.thedrum.com/news/mastercard-removes-name-circles-logo-act-digital-simplicity |
| Google Photos (2020) | Google | El molinete se simplificó a cuatro pétalos redondeados con los mismos colores. Hubo críticas por "pérdida de carácter". [2+] | Simplificar de más borra la personalidad. Hay que quitar detalle sin quitar la idea. | https://9to5google.com/2020/06/25/google-photos-logo-2020/ · https://www.androidpolice.com/2020/06/30/big-google-photos-update-adds-a-fresh-three-tab-design-mapping-feature-and-even-a-new-icon/ |
| Dropbox (2017) | Collins | La caja literal pasó a ser una caja abierta de 5 rombos, con un sistema expresivo muy amplio (ilustración, Sharp Grotesk). [2+] | El glifo se vuelve más abstracto para dejarle la expresión al sistema. | https://www.creativereview.co.uk/dropbox-rebrand-collins/ · https://www.itsnicethat.com/news/dropbox-rebrand-collins-graphic-design-041017 |
| Airbnb (2014) | DesignStudio | El Bélo se diseñó para que "cualquiera lo pueda dibujar" y tenía 4 lecturas (persona, lugar, amor, A). Era una "community mark" personalizable. [2+] | Lo dibujable a mano es un requisito de merch: tiene que poder hacerse en stencil, bordado o tatuaje. | https://www.dezeen.com/2014/07/16/airbnb-rebrand-designstudio-logo-belo/ · https://www.designboom.com/design/airbnb-rebrand-gives-its-community-a-sense-of-belonging-07-16-2014/ |
| Mozilla (2017) | Johnson Banks | moz://a convierte el gesto del medio (`://`) en el logo y se puede tipear. Los 4 finalistas se eligieron en un proceso abierto. [2+] | El signo puede salir del lenguaje del propio medio: en Layer, el código de una vela; en Bass, el surco. | https://www.dezeen.com/2017/01/18/mozilla-logo-open-design-process-graphics-johnson-banks-news/ · https://www.itsnicethat.com/news/johnson-banks-mozilla-rebrand-final-route-180117 |
| Wise (2021) | Ragged Edge | Conservaron la "fast flag" porque tenía equity, la hicieron más gruesa y la redibujaron para que se lea mejor. [2+] | Evolucionar en vez de reemplazar: el ícono puede salir de un rasgo que ya existe en la escena. | https://www.creativereview.co.uk/wise-rebrand-ragged-edge/ · https://the-brandidentity.com/interview/how-the-ragged-edge-and-wise-teams-came-together-to-craft-a-pivotal-rebrand-for-the-worlds-money |
| Monzo (2022) | Ragged Edge | La tarjeta "hot coral" (brilla bajo UV) se volvió el objeto de marca. La M del ícono no cambió de forma, solo se subió el color. [2+] | **El objeto físico ES la marca.** Un ícono que pueda ser objeto (pin, ficha) tiene ventaja. | https://www.itsnicethat.com/news/ragged-edge-monzo-graphic-design-021122 · https://www.creativereview.co.uk/monzo-branding-ragged-edge/ |
| Halide | Sebastiaan de With | "App-Erture": un diafragma cuya abertura tiene la forma del propio squircle. [2+] | El juego visual con el lienzo: la forma del ícono puede ser parte del concepto (el horizonte que corta el squircle). | https://dribbble.com/shots/5066013-Halide-Icon · https://spaces.is/loversmagazine/interviews/sebastiaan-de-with |
| Linear (2024) | Equipo interno (Gavin Nelson para el ícono) | Se refrescó la interfaz y el ícono se re-renderizó para acompañarla, sin cambiar el glifo. [2+] | El render cambia con la época y la forma queda. Hay que separar "forma" de "acabado". | https://linear.app/now/how-we-redesigned-the-linear-ui · https://x.com/Gavmn/status/1775199974017712233 |
| Arc | The Browser Company | Un arco en degradé y el archivo fuente del ícono publicado en Figma. [1] | Un gesto mínimo con un solo trazo se lleva bien con stickers y fan art. | https://www.figma.com/community/file/1124408666561142028/arc-icon-by-the-browser-company |
| Nothing | Equipo interno | Toda la marca es monocromo y matriz de puntos (Ndot): el sistema ES una textura. [2+] | Una textura propia (los surcos, la matriz de velas) puede ser la marca, incluso sin color. | https://crewtangle.com/nothings-carefully-crafted-brand/ · https://fontsinuse.com/uses/59510/nothing-phone |
| Teenage Engineering | Equipo interno | Su merch y sus stickers son extensiones de los objetos (OP-1, Pocket Operators). [1] | El ícono como pieza de un objeto real: el vinilo y la ficha ya lo son. | https://www.redbubble.com/shop/teenage+engineering+stickers |
| Ghostty (2025) | Michael Flarup | Ícono Liquid Glass de capas, con textura más translucidez y efectos aplicados de forma selectiva. Funciona en todos los modos. [2+] | La referencia técnica de cómo hacer bien Liquid Glass. | https://x.com/flarup/status/1950579195131924677 · https://www.flarup.email/p/through-the-liquid-glass |

---

## 3. Rubro música y noche

| Marca | Recurso del ícono | Nota |
|---|---|---|
| Resident Advisor | "RA" ligado a 45°, un monograma tipográfico. Pensado para mobile y merch (rediseño 2014). [2+] | Es la referencia directa del público de Bass. **No usa vinilo ni onda.** https://www.designweek.co.uk/issues/january-2014/resident-advisor-launches-new-branding-and-site-design/ |
| DICE | "The fan": el rombo anterior con patitas y ojos, trazo de stick-and-poke (2022). [2+] | Le dio personaje a una forma geométrica. https://www.itsnicethat.com/news/patrick-duffy-dice-rebrand-graphic-design-040422 |
| Boiler Room | Un círculo con el nombre; Adam Tickle lo describe como "un cruce entre un slipmat de Technics y el logo de Pure Garage". [2+] | **El slipmat / disco ya está tomado en la escena electrónica.** https://daily.redbullmusicacademy.com/2016/01/london-music-logos-explained/ |
| Shazam | Una "S" de dos trazos curvos, como un eslabón abierto (1999 → 2013). [2+] | Una forma de dos mitades que forman un todo: es relevante para la dualidad. |
| SoundCloud | Una nube de 7 barras: **ecualizador más nube**. [2+] | Ejemplo canónico del ecualizador. https://community.soundcloud.com/company/media-kit |
| Spotify | Tres ondas en un círculo verde. [2+] | Ejemplo canónico de la onda o señal. |
| Tidal | Cuatro rombos que forman una "T" y una flecha en el negativo. [2+] | Lectura doble por figura y fondo. |
| Mixcloud | La "i" del nombre que ondula como sonido (Studio Output 2020). [1] | Lo vivo va en el wordmark, no en el ícono. https://www.itsnicethat.com/news/studio-output-mixcloud-rebrand-graphic-design-180220 |
| Apple Music | Corchea sobre degradé rojo o rosa. En 2026 se rediseñó el wordmark (iOS 27.2 beta). [1 + obs] | La nota musical es el cliché del sistema operativo. |
| Discogs | Disco de vinilo. [obs] | El vinilo literal ya tiene dueño en "base de datos de discos". |
| Bandcamp | Paralelogramo celeste. [obs] | Abstracto, sin ningún recurso musical. |
| Rekordbox | Marca de Pioneer DJ, glifo abstracto. [obs] | |
| Fever | Ícono tipográfico o abstracto. [obs] | |

**Clichés de música que hay que evitar:**
- vinilo literal con etiqueta y agujero centrado (Discogs, cientos de sellos);
- barras de ecualizador (SoundCloud y miles de apps);
- onda senoidal u ondas concéntricas de señal (Spotify, podcasts);
- corchea (Apple Music);
- auriculares;
- botón de play;
- slipmat circular con texto (Boiler Room);
- neón o glitch "rave".

Las marcas fuertes del rubro (RA, DICE, Tidal, Bandcamp) **no usan ninguno**: van por monograma o forma abstracta con un rasgo propio.

---

## 4. Rubro finanzas y cripto

| Marca | Recurso del ícono | Nota |
|---|---|---|
| Robinhood (2024) | Pluma simplificada para revelar una **flecha hacia arriba a la derecha** escondida (Porto Rocha). [2+] | El gráfico alcista está *escondido*, no dibujado. https://www.portorocha.com/robinhood · https://www.logolounge.com/news/robinhood-goes-minimal |
| TradingView (2021) | Pentagram: un monograma "TV" hecho de ángulo (marco del chart), punto (ojo) y barra en diagonal ascendente (ganancia). [2+] | **Hasta la app de gráficos evitó dibujar velas**: abstrajo los componentes. https://www.pentagram.com/work/tradingview · https://www.tradingview.com/blog/en/why-we-changed-our-logo-25638 |
| Coinbase (2021) | Moniker: una "C" gruesa como anillo. Se alejaron a propósito de la "meme aesthetic" cripto. [2+] | https://www.itsnicethat.com/news/moniker-coinbase-rebrand-graphic-design-250322 |
| Phantom (2023) | Fantasma amable en violeta (Bakken & Baeck + F37). [2+] | Mascota en vez de gráfico. https://phantom.com/learn/blog/introducing-phantom-s-new-brand-identity |
| Kraken | Criatura marina o monograma en violeta; en 2019 abandonó el azul por "aburrido, todo el sector financiero lo usa". [2+] | El color como diferenciación de rubro. |
| Binance | Rombos en cruz, amarillo dorado. [2+] | Simbología de moneda y oro. |
| Rainbow | Arcoíris o degradé, lúdico. [1] | Anti-utilitario. |
| Revolut | "R" monograma. [obs] | |
| Bloomberg | Wordmark o "B" sobre fondo oscuro. [obs] | |
| Ualá (2023) | **Infinito** de trazo continuo, azul más magenta. [2+] | Caso local: un signo de dos lazos que se unen. https://brandemia.org/uala-renueva-logo-identidad-despues-cinco-anos · https://www.uala.com.ar/prensa/uala-renueva-su-imagen-de-marca |
| Lemon (2022) | The Brand Side Studio: "crypto sexy, pop y friendly"; el limón como personaje. [1] | https://www.behance.net/gallery/160460557/Lemon-Cash-Visual-Identity-(2022) |
| Belo | Wordmark "belo" en minúsculas. [obs] | |

**¿Las velas y el gráfico son cliché?** **Como ícono, sí.** Hay más de 6.000 logos stock de "candlestick" (Dreamstime) y más de 2.200 en Shutterstock, siempre combinados con toro, flecha y neón. Ninguna marca líder del rubro (Robinhood, TradingView, Coinbase, Kraken, Binance) usa velas literales. Las que aluden a la suba lo hacen escondiéndola (la flecha de Robinhood) o abstrayéndola (la barra de TradingView).

**Lo que tiene BassLayer y no es cliché:** las velas **reales** de 7 días, que se mueven. Ese valor vive en la escena, no en un ícono fijo. Un ícono fijo con velas "dibujadas" pierde lo único que las salvaba (que son datos reales) y queda en el cliché.

**Clichés de finanzas y cripto que hay que evitar:**
- velas o gráfico de barras literal;
- flecha alcista;
- toro u oso;
- moneda con símbolo (₿);
- hexágonos o cadenas de "blockchain";
- degradé violeta-azul neón;
- escudo o candado de seguridad;
- el azul "banco".

---

## 5. Marcas duales: dos mundos en un signo

| Caso | Cómo resolvió el equilibrio | Fuente |
|---|---|---|
| **Mastercard** | Dos formas **idénticas** de distinto color; la superposición crea un tercer color que es "la marca". Hay simetría perfecta y ninguna domina. | https://www.dezeen.com/2019/01/10/mastercard-rebrand-pentagram-design/ [2+] |
| **Dolby** | Dos "D" en espejo: entrada y salida de la señal (embudo y embudo invertido). Simetría por reflejo. | https://logos-world.net/dolby-logo/ · https://1000logos.net/dolby-digital-logo/ [2+] |
| **Shazam** | Dos mitades de un eslabón que se completan. | https://logos-world.net/shazam-logo/ [2+] |
| **Ualá** | Infinito: dos lazos iguales de un solo trazo continuo. | ver arriba [2+] |
| **Tidal** | La figura (una T) y el fondo (una flecha) son dos lecturas en un mismo signo. | https://fabrikbrands.com/tidal-music-logo-symbol-and-history/ [2+] |
| Yin-yang / Pepsi | Un círculo dividido por una curva con dos mitades complementarias. Es el arquetipo, y por lo mismo **ya está gastado**. | [obs] |

**Lecciones:**
1. El equilibrio verdadero se logra con **la misma forma repetida o reflejada**, no con dos formas distintas de igual área. Esa fue la dificultad de "medio vinilo + 3 velas": dos formas distintas obligan a compensar siempre.
2. Si las dos partes son distintas, tiene que haber un **tercer elemento compartido** que sea el protagonista: la intersección de Mastercard, el trazo único de Ualá. En BassLayer ese elemento ya existe y es el **horizonte**.
3. El espejo es natural en esta marca. La escena ya tiene reflejos (ondas y ciudad), y Dolby demuestra que el espejo puede significar "entra señal, sale señal".

---

## 6. El ícono como objeto de marca (sticker, pin, favicon)

- **Siluetas para troquel:** un sticker die-cut sigue el contorno. Si el ícono es solo un "cuadrado con algo adentro", el sticker es un cuadrado. Hay que pensar el glifo **sin el squircle**: los stickers de Apollo y Raycast funcionan porque el glifo tiene contorno propio. https://shop.apolloapp.io/products/apollo-stickers-2 · https://merch.raycast.com/product/sticker-pack
- **Pin esmaltado:** cada color necesita una celda cerrada por una línea de metal de unos 0,3 a 0,5 mm como mínimo. Los degradés y las transparencias no existen en esmalte duro. Con 2 colores planos más el metal, el pin queda impecable; el vidrio no se puede hacer.
- **Dibujable de memoria:** es el criterio de Airbnb ("anyone can draw") y de Instagram (5 segundos). Si se puede hacer con stencil o aerosol, sirve para merch de la noche (flyers, sellos de entrada, bordado).
- **Objeto con lectura física:** la tarjeta de Monzo (brilla con UV) y los objetos de Teenage Engineering muestran que el merch más deseado es el que **es** algo, no el que muestra algo. En BassLayer el vinilo y la ficha ya son objetos. Una acuñación tipo ficha, moneda o slipmat pequeño se puede plantear.
- **Favicon:** a 16 px sobrevive solo la silueta de 1 o 2 formas. El SVG con `prefers-color-scheme` permite que la versión neutral (hueso / negro) respete el "reposo neutral". Ver los links de css-tricks: https://css-tricks.com/dark-mode-favicons/
- **Monocromo obligatorio:** sirve para el sello, el grabado láser, el bordado de un color, el tinted de iOS y el themed de Android. Si funciona en negro plano, funciona en todo.

---

## 7. Territorios posibles para el ícono (solo conceptos, sin dibujo)

Hay un criterio común a todos: la forma tiene que leerse en negro plano, a 16 px y sin color. El cobre y el celeste refuerzan, pero no explican.

### T1 · El horizonte como protagonista
El tercer elemento de Mastercard aplicado a BassLayer: el signo es **la línea compartida**, y los dos mundos aparecen solo como lo mínimo que la toca de un lado y del otro (arriba y abajo, o izquierda y derecha).
- **Fundamento:** el horizonte es lo único que la escena tiene en común y, por lo tanto, lo único neutral. Resuelve el 50/50 por construcción.
- **Riesgo:** la línea sola es "muy básica". Es lo que Pablo dijo del Horizonte del 2026-10-05. Necesita un rasgo propio que la haga dueña.

### T2 · Espejo: un mundo es el reflejo del otro
Una sola forma y su reflejo en el horizonte. Arriba lee Bass y abajo lee Layer (o al revés) gracias a un mínimo cambio de ritmo: el surco continuo frente al escalón discreto.
- **Fundamento:** Dolby (espejo = señal entra y sale) y Mastercard (formas idénticas). La escena ya trabaja con reflejos. El equilibrio es exacto porque es la misma forma.
- **Riesgo:** puede leerse como yin-yang o como un logo de audio genérico si el rasgo diferencial es débil.

### T3 · El surco que se vuelve vela (una forma, dos lecturas)
Un único gesto continuo que de un lado se lee como surco o arco de vinilo y del otro como cuerpo y mecha de una vela, con la transición sobre el horizonte. Lo mismo que hace Tidal con figura y fondo, o Ualá con un solo trazo.
- **Fundamento:** evita sumar dos íconos ("vinilo + velas" archivado) y convierte la dualidad en metamorfosis. Es coherente con el "WorldLine" (transición onda↔curva de elemento compartido) que ya está en el sitio.
- **Riesgo:** es el más difícil de dibujar y puede no pasar los 16 px. Necesita una versión reducida.

### T4 · La ficha / el objeto
El ícono como **objeto físico**: un disco plano, mitad surcos y mitad matriz o escalones, como una ficha de casino, un slipmat chico o una moneda. Pensado primero para el pin y el sticker, y después para la pantalla.
- **Fundamento:** Monzo y Teenage Engineering (el objeto es la marca) y el pedido explícito de merch. El disco pasa bien el recorte circular de Android y del favicon. Recupera lo bueno de "B · Ficha" sin las velas literales.
- **Riesgo:** el disco con texto lo tiene Boiler Room y el vinilo lo tiene Discogs. Para diferenciarse depende de la partición interna, y está cerca del yin-yang.

### T5 · Monograma "BL" de grilla compartida
Lo que hizo Pentagram con el Media Lab: una grilla (por ejemplo 7×7 o en múltiplos de 32) que en la escena viva genera surcos y velas, y en el ícono fija un "BL" o una "b/l" con las letras construidas por las mismas unidades.
- **Fundamento:** RA (monograma) es la referencia del público de Bass. TradingView y Coinbase muestran que las mejores marcas financieras se van al monograma. El vínculo entre lo vivo y lo fijo lo da la grilla.
- **Riesgo:** puede caer en lo genérico tecnológico. Pablo rechazó "letras" en las portadas, aunque eso fue en la portada y no en el ícono: hay que confirmarlo con él.

### T6 · El instante de la escena (un fotograma canónico)
No se abstrae: se elige **un fotograma de la escena viva** en reposo 50/50 (por ejemplo, el horizonte con un único elemento por lado, sin reflejos) y se fija como sello. Es la lógica de Nordkyn y de Instagram 2022: la forma madre fija y el dato vivo encima.
- **Fundamento:** es la conexión más directa con lo que la gente ve en el home. El ícono es "la escena dormida". Permite un ícono alternativo o animado en contextos que lo soportan (PWA splash, Watch, widget).
- **Riesgo:** es el que más tienta a meter detalle. Exige sacar con disciplina, y puede terminar en el mismo lugar que la versión B · Ficha.

**Para la próxima fase:** elegir 3 de estos 6 y llevarlos a un comparador (actual + opciones, desktop + mobile, como pide `feedback-show-options-side-by-side`). Cada uno se prueba con:
- (a) silueta negra;
- (b) desenfoque;
- (c) 16, 29, 48, 60 y 180 px;
- (d) iOS default, dark y tinted, y Android themed;
- (e) sticker troquelado y pin de 2 colores;
- (f) medición del 50/50 con la corrección óptica de Bjango.

---

## Fuentes principales sobre el oficio

- Apple HIG, App icons: https://developer.apple.com/design/human-interface-guidelines/app-icons (copia legible: https://developers.apple.com/design/human-interface-guidelines/foundations/app-icons)
- Michael Flarup, "Designing better app icons": https://medium.com/@flarup/designing-better-app-icons-bac276f89ead · App Icon Book: https://appiconbook.com/ · reseña: https://9to5mac.com/2022/05/10/the-ios-app-icon-book-review/ · "Through the Liquid Glass": https://www.flarup.email/p/through-the-liquid-glass
- Bjango (Marc Edwards): https://bjango.com/articles/opticaladjustments/ · https://bjango.com/articles/macappiconworkflow/ · plantillas: https://github.com/bjango/Bjango-Templates
- Louie Mantia, "The Shape of Apps": https://parakeet.co/blog/the-shape-of-apps/ (comentado en https://daringfireball.net/linked/2026/07/16/mantia-shape-of-apps)
- Material, product icons: https://m2.material.io/guidelines/style/icons.html · Android adaptativo: https://developer.android.com/develop/ui/views/launch/icon_design_adaptive
- Modo tinted: https://www.sketch.com/blog/tinted-app-icons/ · https://applypixels.com/blog/ios18appicons
- Liquid Glass, críticas: https://www.macrumors.com/2025/09/17/ios-26-liquid-glass-makes-app-icons-look-crooked/ · https://www.macrumors.com/2025/09/17/ios-26-liquid-glass-critiques/
- Favicon SVG con tema: https://css-tricks.com/dark-mode-favicons/ · https://blog.tomayac.com/2019/09/21/prefers-color-scheme-in-svg-favicons-for-dark-mode-icons/

**Qué no se pudo verificar:**
- El HIG oficial no renderizó por WebFetch: las citas salen de copias y de varias guías que lo citan.
- Flarup en Medium devolvió 403: las citas salen de resúmenes y de la reseña.
- Los íconos marcados [obs] (Discogs, Bandcamp, Rekordbox, Fever, Revolut, Bloomberg, Belo) no tienen fuente de diseño. Antes de citarlos ante Pablo, hay que mirarlos en el store.

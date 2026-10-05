# Marca BassLayer

Todo el material de imagen de marca vive acá: la investigación, las decisiones, los archivos fuente del logo, el color, la tipografía, las aplicaciones y los exportados para imprenta. El sitio (`public/`) toma sus íconos de estos archivos; nunca al revés.

Las láminas `.html` se ven con el dev server corriendo (`npm run dev`), en `http://localhost:3000/brand/…`.

## Estructura

| Carpeta | Qué guarda |
|---|---|
| `investigacion/` | Informes de investigación (`.md`) y las láminas de cada ronda de exploración (`.html`). |
| `logo/` | Archivos fuente definitivos del logotipo, el isotipo y sus variantes (SVG vectorizados). |
| `color/` | Paleta definitiva: noche, día e impresión (Pantone/CMYK), con contrastes medidos. |
| `tipografia/` | Roles de Geist y Geist Mono, licencia y reglas de uso. |
| `aplicaciones/` | Plantillas listas: sticker, imán, tote, pin, credencial, flyer, newsletter, firma de mail, app instalable. |
| `exportados/` | Archivos finales generados: PNG, PDF vectorial para imprenta, favicon, íconos de app, imagen para compartir. |
| `manual/` | El manual de marca: todo junto, para pasarle a una imprenta o a otro diseñador. |

## Decisiones tomadas

| Fecha | Decisión |
|---|---|
| 2026-10-04 | **Una sola marca: BassLayer.** Bass y Layer no tienen logo propio: son secciones y se distinguen solo por el color (cobre / celeste). |
| 2026-10-04 | **Sistema:** el logotipo es el nombre en una sola pieza; el isotipo sale del mismo dibujo; el isologo es la suma, para usos formales. |
| 2026-10-05 | **Logotipo elegido: Horizonte** (ronda 3). *BassLayer* entero atravesado por una línea: arriba cobre (la noche), abajo celeste (el mercado). Los dos mundos son dos capas de la misma palabra ("layer" = capa) y el horizonte de una ciudad plana frente al río. Isotipo: la **B** con el mismo corte. |
| 2026-10-05 | **Dirección final: el pase de la semana** (ronda 5, A + C). Cada semana BassLayer emite un pase numerado con la *línea de la semana*: el BTC de los últimos 7 días → HOY → las fiestas de los próximos 7 en el AMBA. El corte del boleto cae en HOY y la línea lo cruza entera. Isotipo: el boleto de papel con sus muescas y la *línea madre* (síntesis fija). Reemplaza al Horizonte como sistema; el logotipo queda simple (Geist 750). Sistema en `sistema/` (generador `pase.mjs`, exportador `exportar.mjs`, lámina `pase.html`). |
| 2026-10-05 | **El ".io" no va dentro del logo.** Existe una *versión de promoción* con `basslayer.io` en Geist Mono debajo, para piezas que se regalan (sticker, imán, tote). |

## Descartado (y por qué)

- **Ronda 1** (barras + curva, ligadura B·L, disco + bloque): signos de dos partes; se leen como dos cosas pegadas.
- **Ronda 2** (ocho territorios: los dos puntos, Lissajous, crossfader, octava, sidechain, horizonte, diagonal, cue): signos sueltos que no unifican; faltaba partir del nombre.
- **Ronda 3:** La línea, Peso y Etiqueta quedaron como alternativas; se eligió Horizonte.
- **Ronda 4** (`investigacion/ronda-4/`, 2026-10-05): investigación de estudios de branding y 8 mejoras del Horizonte (bajo, perspectiva, L puente, una sola línea, sube, eco, reflejo, ranura que respira) + propuesta **Horizonte 2** (horizonte bajo + L entera en hueso + ranura que respira) + opciones nuevas (ventanas encendidas, marea de puntos, patrón). Pablo: "muy básico, más que el nombre con dos colores y una línea".
- **Ronda 5** (`investigacion/ronda-5/mundos.html`, 2026-10-05): cambio de enfoque, de logo a **mundo de marca** (idea + comportamiento + objetos), con datos reales del sitio: A · La línea de la semana (mercado de los últimos 7 días → hoy → noches de los próximos 7, generada con datos), B · Las 24 horas (anillo con la noche 22–7 y el mercado 11–17, a verificar), C · El pase (todo es un boleto numerado con la línea de corte cruzada por el nombre), D · La cinta (el ticker del sitio llevado a cinta de embalar, lanyard, banner). Esperando la decisión de Pablo.

## Logo (`logo/`)

Los SVG se generan con `logo/construir.py` (Geist pasada a trazados con fontTools + harfbuzz para el kerning; el corte es una operación booleana con skia-pathops: vector puro, sin máscaras ni fuentes). Para regenerar: `pip install fonttools brotli uharfbuzz skia-pathops` y `python brand/logo/construir.py`. La lámina `logo/horizonte.html` muestra la construcción, las escalas y las variantes.

Medidas (unidades de la fuente, 1000 = 1 em): peso 750, espaciado −18, horizonte a 265 (mitad de la x), ranura de 64. Versión chica (menos de ~200 px de ancho): peso 820, espaciado +6, ranura de 100. Isotipo: B peso 800 y ranura 72; chico (32 px o menos) peso 880 y ranura 110.

| Archivo | Uso |
|---|---|
| `logotipo.svg` · `-claro` · `-un-color` | Logotipo sobre oscuro, sobre claro, y en un color (`currentColor`: sello, grabado, vinilo). |
| `logotipo-chico*.svg` | Debajo de ~200 px de ancho (header, firma de mail, sticker diminuto). |
| `logotipo-promo.svg` | Con la firma basslayer.io: lo que se regala o se pega en la calle. |
| `isotipo.svg` · `-claro` · `-un-color` | La B partida, sin fondo. |
| `isotipo-app.svg` | Sobre negro a sangre: base de los íconos de app y favicon. |
| `isotipo-chico*.svg` | 32 px o menos (favicon, pestaña). |

## Sistema (`sistema/`)

- `pase.mjs`: funciones puras (`datosDeSemana`, `linea`, `pase`, `lineaMadre`, `isotipo`) que devuelven SVG. La usan la lámina y el exportador: una sola regla.
- `exportar.mjs`: `node brand/sistema/exportar.mjs [https://basslayer.io]` emite el pase de la semana en `exportados/pases/` (papel noche y día) y el isotipo.
- `pase.html`: la lámina (pase en vivo, anatomía, isotipo en escalas, usos, cómo se emite).
- El texto de los SVG usa Geist: para imprenta hay que pasarlo a curvas (paso de exportados).

## Pendiente (en orden)

1. ~~Dibujo fino del logotipo Horizonte~~ ✓ 2026-10-05 (falta la aprobación de Pablo).
2. ~~Isotipo B partida: completo y reducido~~ ✓ 2026-10-05.
3. Variantes: ~~claro, un color, promo~~ ✓ · faltan la firma de mail y el negativo sobre foto.
4. Reglas: zona de respeto, tamaño mínimo, usos incorrectos.
5. Color definitivo: par de noche, par de día con contraste de lectura (el actual no llega sobre hueso: 2,5 y 2,1), Pantone y CMYK.
6. Tipografía: roles y verificación de la licencia (OFL).
7. Exportados: SVG, PNG, PDF para imprenta, favicon, íconos de app, imagen para compartir.
8. Aplicaciones: plantillas de sticker (con troquel), imán, tote, pin, credencial, flyer, newsletter.
9. Movimiento: el corte del horizonte que se abre (2 s). Opcional: un sonido de 1 s.
10. Manual de marca.
11. Registro: buscar "BassLayer" en el INPI antes de imprimir en cantidad.
12. Después: la app instalable con el isotipo como ícono (borrador en `aplicaciones/`).

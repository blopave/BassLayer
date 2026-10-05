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
| 2026-10-05 | **El ".io" no va dentro del logo.** Existe una *versión de promoción* con `basslayer.io` en Geist Mono debajo, para piezas que se regalan (sticker, imán, tote). |

## Descartado (y por qué)

- **Ronda 1** (barras + curva, ligadura B·L, disco + bloque): signos de dos partes; se leen como dos cosas pegadas.
- **Ronda 2** (ocho territorios: los dos puntos, Lissajous, crossfader, octava, sidechain, horizonte, diagonal, cue): signos sueltos que no unifican; faltaba partir del nombre.
- **Ronda 3:** La línea, Peso y Etiqueta quedaron como alternativas; se eligió Horizonte.

## Pendiente (en orden)

1. Dibujo fino del logotipo Horizonte: corte ajustado letra por letra, espaciado óptico, versión para tamaños chicos, vectorizado (sin depender de la fuente).
2. Isotipo B partida: completo y reducido para 16 px.
3. Variantes: horizontal, con dirección (promo), un color, negativo, firma de mail.
4. Reglas: zona de respeto, tamaño mínimo, usos incorrectos.
5. Color definitivo: par de noche, par de día con contraste de lectura (el actual no llega sobre hueso: 2,5 y 2,1), Pantone y CMYK.
6. Tipografía: roles y verificación de la licencia (OFL).
7. Exportados: SVG, PNG, PDF para imprenta, favicon, íconos de app, imagen para compartir.
8. Aplicaciones: plantillas de sticker (con troquel), imán, tote, pin, credencial, flyer, newsletter.
9. Movimiento: el corte del horizonte que se abre (2 s). Opcional: un sonido de 1 s.
10. Manual de marca.
11. Registro: buscar "BassLayer" en el INPI antes de imprimir en cantidad.
12. Después: la app instalable con el isotipo como ícono (borrador en `aplicaciones/`).

"""Construye el logotipo Horizonte y el isotipo de BassLayer en vectores.

BassLayer entero, compuesto en Geist (OFL 1.1, sin nombre reservado), cortado
por una línea horizontal a media altura de la x: arriba cobre (la noche),
abajo celeste (el mercado), con una ranura entre las dos capas. Las letras
salen de la fuente como trazados y el corte se hace con operaciones booleanas
(skia-pathops): el SVG resultante es vector puro, no depende de la fuente ni
usa recortes, y va directo a imprenta.

    pip install fonttools brotli uharfbuzz skia-pathops
    python brand/logo/construir.py

Escribe en brand/logo/*.svg. Los colores son provisorios hasta cerrar la
paleta (brand/README.md, paso 5).
"""
from io import BytesIO
from pathlib import Path

import pathops
import uharfbuzz as hb
from fontTools.pens.basePen import BasePen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SANS = ROOT / "public/fonts/geist-latin-wght-normal.woff2"
MONO = ROOT / "public/fonts/geist-mono-latin-wght-normal.woff2"

# Colores (provisorios): noche sobre negro y día sobre hueso.
NOCHE = {"a": "#C49070", "b": "#6CB8C8"}
DIA = {"a": "#8E5B3A", "b": "#2A6E7C"}

# Construcción, en unidades de la fuente (1000 = 1 em).
WEIGHT = 750          # entre Bold y ExtraBold: la ranura necesita cuerpo
TRACK = -18           # espaciado óptico: Geist abre de más en tamaño display
CUT = 265             # altura del horizonte: la mitad de la x (530 / 2)
GAP = 64              # la ranura: ~0,4 del asta; se lee desde ~200 px de ancho y no se cierra al imprimir
# Versión chica (debajo de ~120 px de ancho): más peso, ranura más ancha y aire.
SMALL = {"weight": 820, "track": 6, "gap": 100}
PAD = 60


def load(path, weight):
    f = TTFont(path)
    f.flavor = None
    buf = BytesIO()
    f.save(buf)
    raw = buf.getvalue()
    inst = instancer.instantiateVariableFont(TTFont(BytesIO(raw)), {"wght": weight})
    return raw, inst


class SkiaPen(BasePen):
    """Dibuja los contornos de un glifo en un pathops.Path."""

    def __init__(self, glyphset, path):
        super().__init__(glyphset)
        self.p = path

    def _moveTo(self, pt):
        self.p.moveTo(*pt)

    def _lineTo(self, pt):
        self.p.lineTo(*pt)

    def _qCurveToOne(self, p1, p2):
        self.p.quadTo(*p1, *p2)

    def _curveToOne(self, p1, p2, p3):
        self.p.cubicTo(*p1, *p2, *p3)

    def _closePath(self):
        self.p.close()


def shape(path, text, weight, track):
    """Compone el texto con el kerning de la fuente y devuelve (Path, ancho)."""
    raw, inst = load(path, weight)
    face = hb.Face(raw)
    font = hb.Font(face)
    font.set_variations({"wght": weight})
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    gs = inst.getGlyphSet()
    order = inst.getGlyphOrder()
    out = pathops.Path()
    x = 0
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        g = pathops.Path()
        # Coordenadas SVG: y hacia abajo, la línea de base en 0.
        gs[order[info.codepoint]].draw(TransformPen(SkiaPen(gs, g), (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
        out = pathops.op(out, g, pathops.PathOp.UNION)
        x += pos.x_advance + (track if i < len(buf.glyph_infos) - 1 else 0)
    return out, x


def xform(p, f):
    """Aplica f(x, y) → (x, y) a cada punto del trazado."""
    q = pathops.Path()
    for verb, pts in p:
        tp = [f(x, y) for x, y in pts]
        if verb == pathops.PathVerb.MOVE: q.moveTo(*tp[0])
        elif verb == pathops.PathVerb.LINE: q.lineTo(*tp[0])
        elif verb == pathops.PathVerb.QUAD: q.quadTo(*tp[0], *tp[1])
        elif verb == pathops.PathVerb.CUBIC: q.cubicTo(*tp[0], *tp[1], *tp[2])
        elif verb == pathops.PathVerb.CLOSE: q.close()
    return q


def rect(x0, y0, x1, y1):
    r = pathops.Path()
    r.moveTo(x0, y0); r.lineTo(x1, y0); r.lineTo(x1, y1); r.lineTo(x0, y1); r.close()
    return r


def split(word, x0, x1, gap):
    """Corta en el horizonte: capa de arriba y capa de abajo, con la ranura."""
    top = pathops.op(word, rect(x0 - 50, -2000, x1 + 50, -CUT - gap / 2), pathops.PathOp.INTERSECTION)
    bot = pathops.op(word, rect(x0 - 50, -CUT + gap / 2, x1 + 50, 2000), pathops.PathOp.INTERSECTION)
    return top, bot


def d(p):
    """Path → atributo d de SVG, redondeado a 0,1 unidad."""
    out = []
    for verb, pts in p:
        k = {pathops.PathVerb.MOVE: "M", pathops.PathVerb.LINE: "L", pathops.PathVerb.QUAD: "Q", pathops.PathVerb.CUBIC: "C", pathops.PathVerb.CLOSE: "Z"}[verb]
        out.append(k + " ".join(f"{v:.1f}".rstrip("0").rstrip(".") for pt in pts for v in pt))
    return "".join(out)


def svg(w, top_y, h, layers, title):
    body = "".join(f'<path fill="{c}" d="{d(p)}"/>' for p, c in layers)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-PAD} {top_y} {w + 2 * PAD:.0f} {h:.0f}" role="img" aria-label="{title}">'
            f"<title>{title}</title>{body}</svg>\n")


def logotipo(small=False):
    wt, tr, gap = (SMALL["weight"], SMALL["track"], SMALL["gap"]) if small else (WEIGHT, TRACK, GAP)
    word, w = shape(SANS, "BassLayer", wt, tr)
    top, bot = split(word, 0, w, gap)
    return top, bot, w


def isotipo(small=False):
    wt, gap = (880, 110) if small else (800, 72)
    b, w = shape(SANS, "B", wt, 0)
    top, bot = split(b, 0, w, gap)
    return top, bot, w


def write(name, content):
    (OUT / name).write_text(content, encoding="utf-8")
    print("✓", name)


def main():
    for small, suf in ((False, ""), (True, "-chico")):
        top, bot, w = logotipo(small)
        y0, h = -710 - PAD, 710 + 210 + 2 * PAD
        write(f"logotipo{suf}.svg", svg(w, y0, h, [(top, NOCHE["a"]), (bot, NOCHE["b"])], "BassLayer"))
        write(f"logotipo{suf}-claro.svg", svg(w, y0, h, [(top, DIA["a"]), (bot, DIA["b"])], "BassLayer"))
        write(f"logotipo{suf}-un-color.svg", svg(w, y0, h, [(top, "currentColor"), (bot, "currentColor")], "BassLayer"))

    # Versión de promoción: el logotipo y la dirección en Geist Mono debajo,
    # alineada a los dos extremos del nombre (no es parte del logo: es su firma).
    top, bot, w = logotipo()
    url, uw = shape(MONO, "basslayer.io", 400, 0)
    s = (w * 0.62) / uw
    url_t = xform(url, lambda x, y: (x * s + (w - uw * s) / 2, y * s + 420))
    y0, h = -710 - PAD, 710 + 420 + 2 * PAD
    write("logotipo-promo.svg", svg(w, y0, h, [(top, NOCHE["a"]), (bot, NOCHE["b"]), (url_t, "#8A8A8A")], "BassLayer — basslayer.io"))

    for small, suf in ((False, ""), (True, "-chico")):
        top, bot, w = isotipo(small)
        # Cuadrado de 1000 con la B centrada por su forma (no por su espacio
        # tipográfico) y ópticamente: la panza de abajo pesa, sube 10.
        bx0, _, bx1, _ = pathops.op(top, bot, pathops.PathOp.UNION).bounds
        side, cx = 1000, (bx0 + bx1) / 2
        scale = 560 / 710
        place = lambda p: xform(p, lambda x, y: ((x - cx) * scale + side / 2, (y + 355) * scale + side / 2 - 10))
        t, b = place(top), place(bot)
        frame = lambda layers, bg=None: (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}" role="img" aria-label="BassLayer"><title>BassLayer</title>'
                                         + (f'<rect width="{side}" height="{side}" fill="{bg}"/>' if bg else "")
                                         + "".join(f'<path fill="{c}" d="{d(p)}"/>' for p, c in layers) + "</svg>\n")
        write(f"isotipo{suf}.svg", frame([(t, NOCHE["a"]), (b, NOCHE["b"])]))
        write(f"isotipo{suf}-claro.svg", frame([(t, DIA["a"]), (b, DIA["b"])]))
        write(f"isotipo{suf}-un-color.svg", frame([(t, "currentColor"), (b, "currentColor")]))
        write(f"isotipo{suf}-app.svg", frame([(t, NOCHE["a"]), (b, NOCHE["b"])], "#000"))


if __name__ == "__main__":
    main()

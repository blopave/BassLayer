"""Ronda 4: variantes del Horizonte con cortes que no son una recta.

Reusa la composición de brand/logo/construir.py (Geist en trazados + kerning)
y corta la palabra con una región arbitraria: una curva y = f(x) y una ranura
de ancho g(x). Escribe variantes.json para la lámina de la ronda.
"""
import json
import math
import sys
from pathlib import Path

import pathops

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "logo"))
import construir as C  # noqa: E402

OUT = Path(__file__).resolve().parent


def region(xs, ys, above):
    """Polígono por encima (o por debajo) de la polilínea (xs, ys)."""
    p = pathops.Path()
    edge = -3000 if above else 3000
    p.moveTo(xs[0], edge)
    for x, y in zip(xs, ys):
        p.lineTo(x, y)
    p.lineTo(xs[-1], edge)
    p.close()
    return p


def cut(word, w, f, g, shift_bottom=0.0, squash=1.0):
    """Corta con el horizonte y = -f(x) y una ranura de ancho g(x)."""
    xs = [-80 + i * (w + 160) / 1600 for i in range(1601)]
    top = pathops.op(word, region(xs, [-f(x) - g(x) / 2 for x in xs], True), pathops.PathOp.INTERSECTION)
    bot = pathops.op(word, region(xs, [-f(x) + g(x) / 2 for x in xs], False), pathops.PathOp.INTERSECTION)
    if shift_bottom or squash != 1:
        c = -f(w / 2)
        bot = C.xform(bot, lambda x, y: (x + shift_bottom, c + (y - c) * squash))
    return top, bot


def contours(p):
    """Separa un trazado en sus contornos."""
    out, cur = [], None
    for verb, pts in p:
        if verb == pathops.PathVerb.MOVE:
            cur = pathops.Path(); out.append(cur); cur.moveTo(*pts[0])
        elif verb == pathops.PathVerb.LINE: cur.lineTo(*pts[0])
        elif verb == pathops.PathVerb.QUAD: cur.quadTo(*pts[0], *pts[1])
        elif verb == pathops.PathVerb.CUBIC: cur.cubicTo(*pts[0], *pts[1], *pts[2])
        elif verb == pathops.PathVerb.CLOSE: cur.close()
    return out


def area(p):
    pts = [pt for _, ps in p for pt in ps]
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])) / 2


def counters(word):
    """Las contraformas (los huecos de B, a, e…): lo relleno menos la letra."""
    cs = contours(word)
    outer_sign = 1 if area(max(cs, key=lambda c: abs(area(c)))) > 0 else -1
    filled = pathops.Path()
    for c in cs:
        if area(c) * outer_sign > 0:
            filled = pathops.op(filled, c, pathops.PathOp.UNION)
    return pathops.op(filled, word, pathops.PathOp.DIFFERENCE)


def halftone(layer, y0, y1, w, step=30):
    """Puntos en grilla cuyo diámetro baja de y0 (lleno) a y1 (30 %), dentro de la capa."""
    dots = pathops.Path()
    y = y0 + step / 2
    row = 0
    while y < y1:
        t = (y - y0) / (y1 - y0)
        r = step * 0.5 * (1 - 0.7 * t)
        x = -40 + (step / 2 if row % 2 else 0)
        while x < w + 40:
            k = 0.5523 * r
            dots.moveTo(x + r, y)
            dots.cubicTo(x + r, y + k, x + k, y + r, x, y + r)
            dots.cubicTo(x - k, y + r, x - r, y + k, x - r, y)
            dots.cubicTo(x - r, y - k, x - k, y - r, x, y - r)
            dots.cubicTo(x + k, y - r, x + r, y - k, x + r, y)
            dots.close()
            x += step
        y += step * 0.866
        row += 1
    return pathops.op(layer, dots, pathops.PathOp.INTERSECTION)


def main():
    word, w = C.shape(C.SANS, "BassLayer", C.WEIGHT, C.TRACK)
    # Dónde empieza la L (para que la onda se calme justo ahí).
    _, wb = C.shape(C.SANS, "Bass", C.WEIGHT, C.TRACK)
    xL = wb + C.TRACK
    G = C.GAP
    def onda(x):
        if x < xL:
            env = max(0.0, 1 - x / xL) ** 0.7
            return C.CUT + 34 * env * math.sin(2 * math.pi * x / (xL / 1.5))
        t = (x - xL) / (w - xL)
        return C.CUT + 150 * (min(1.0, t) ** 1.6)
    V = {
        "base": cut(word, w, lambda x: C.CUT, lambda x: G),
        "onda": cut(word, w, onda, lambda x: G),
        "eco": cut(word, w, lambda x: C.CUT, lambda x: G, shift_bottom=34),
        "sube": cut(word, w, lambda x: 200 + 130 * x / w, lambda x: G),
        "abre": cut(word, w, lambda x: C.CUT, lambda x: 30 + 56 * (max(0.0, x) / w) ** 1.3),
        "marea": cut(word, w, lambda x: C.CUT, lambda x: G, squash=0.86),
    }
    # L puente: la ranura no atraviesa el asta de la L (el puente entre mundos).
    Lp, _ = C.shape(C.SANS, "L", C.WEIGHT, 0)
    lx0, _, _, _ = Lp.bounds
    stem = (xL + lx0 - 4, xL + lx0 + 128)
    in_stem = lambda x: stem[0] <= x <= stem[1]
    _, wBL = C.shape(C.SANS, "BassL", C.WEIGHT, C.TRACK)
    Lbox = C.rect(xL - 2, -2000, wBL + C.TRACK + 2, 2000)
    L_only = pathops.op(word, Lbox, pathops.PathOp.INTERSECTION)
    rest = pathops.op(word, Lbox, pathops.PathOp.DIFFERENCE)
    low = 223  # horizonte bajo: 42 % de la x
    V["bajo"] = cut(word, w, lambda x: low, lambda x: G)
    V["perspectiva"] = cut(word, w, lambda x: C.CUT, lambda x: 84 - 54 * max(0.0, min(1.0, x / w)))
    V["puente"] = cut(word, w, lambda x: C.CUT, lambda x: 0 if in_stem(x) else G)
    V["puente-l"] = cut(rest, w, lambda x: C.CUT, lambda x: G)
    # Reflejo: la capa de abajo comprimida al 94 % y con dos filetes de agua.
    t_r, b_r = cut(word, w, lambda x: C.CUT, lambda x: G, squash=0.94)
    for yy in (-120, -40):
        b_r = pathops.op(b_r, C.rect(-100, yy - 6, w + 100, yy + 6), pathops.PathOp.DIFFERENCE)
    V["reflejo"] = (t_r, b_r)
    # Propuesta combinada: horizonte bajo + L puente (la ranura respira en motion).
    V["final"] = cut(word, w, lambda x: low, lambda x: 0 if in_stem(x) else G)
    V["final-l"] = cut(rest, w, lambda x: low, lambda x: G)
    # La ranura que respira (Horizonte 2): 16 cuadros de 48 a 88.
    frames = [cut(rest, w, lambda x: low, (lambda gg: (lambda x: gg))(48 + 40 * (0.5 - 0.5 * math.cos(2 * math.pi * i / 16)))) for i in range(16)]
    # Opciones nuevas
    cnt = counters(word)
    win_b = pathops.op(cnt, C.rect(-100, -2000, xL, 2000), pathops.PathOp.INTERSECTION)
    win_l = pathops.op(cnt, C.rect(xL, -2000, w + 100, 2000), pathops.PathOp.INTERSECTION)
    ht_top, ht_bot = cut(word, w, lambda x: C.CUT, lambda x: 0)
    ht = halftone(ht_bot, -C.CUT, 220, w)
    data = {"w": w, "pad": C.PAD, "variants": {k: {"top": C.d(t), "bot": C.d(b)} for k, (t, b) in V.items()},
            "frames": [{"top": C.d(t), "bot": C.d(b)} for t, b in frames],
            "ventanas": {"word": C.d(word), "bass": C.d(win_b), "layer": C.d(win_l)},
            "L": C.d(L_only),
            "puntos": {"top": C.d(ht_top), "bot": C.d(ht)}}
    (OUT / "variantes.json").write_text(json.dumps(data), encoding="utf-8")
    print("✓ variantes.json", list(V))


if __name__ == "__main__":
    main()

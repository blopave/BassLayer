"""El boleto: la marca de BassLayer (oct 2026, Pablo eligió la opción B de la ronda 6).

Una sola forma: un boleto con dos muescas y el nombre adentro. Las muescas
caen exactamente en el encuentro de "Bass" y "Layer": la línea de corte del
boleto separa los dos mundos, pero el nombre la cruza entero. El color del
boleto dice el mundo (hueso: la general; cobre: Bass; celeste: Layer), como
las pulseras de un festival.

Toda la construcción sale de la altura de la mayúscula de Geist (C = 710):
    alto del boleto       H = 2,5 C   (proporción de entrada, ~3,4 : 1)
    margen lateral        = margen vertical
    radio de las esquinas 0,09 H
    radio de las muescas  0,11 H
Las letras salen de la fuente como trazados (construir.py) y el boleto se
calada con operaciones booleanas: vector puro, sin fuentes, listo para corte
de vinilo e imprenta.

    python brand/logo/boleto.py     (mismos requisitos que construir.py)
"""
from pathlib import Path

import pathops

import construir as C

OUT = Path(__file__).resolve().parent
CAP = 710
W8 = 800            # ExtraBold: el nombre tiene que leerse de lejos (luneta, remera)
TR = -26            # espaciado óptico cerrado: una sola pieza

# Colores (noche) y los tres boletos. Tinta = el color del nombre sobre cada boleto.
BOLETOS = {
    "general": {"fondo": "#EDEAE4", "tinta": "#0B0B0B"},   # hueso: la marca madre
    "bass": {"fondo": "#C49070", "tinta": "#0B0B0B"},
    "layer": {"fondo": "#6CB8C8", "tinta": "#0B0B0B"},
    "negro": {"fondo": "#0B0B0B", "tinta": "#EDEAE4"},
}


def circle(cx, cy, r):
    k = 0.5523 * r
    p = pathops.Path()
    p.moveTo(cx + r, cy)
    p.cubicTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
    p.cubicTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
    p.cubicTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
    p.cubicTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
    p.close()
    return p


def rrect(x0, y0, x1, y1, r):
    k = 0.5523 * r
    p = pathops.Path()
    p.moveTo(x0 + r, y0)
    p.lineTo(x1 - r, y0); p.cubicTo(x1 - r + k, y0, x1, y0 + r - k, x1, y0 + r)
    p.lineTo(x1, y1 - r); p.cubicTo(x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1)
    p.lineTo(x0 + r, y1); p.cubicTo(x0 + r - k, y1, x0, y1 - r + k, x0, y1 - r)
    p.lineTo(x0, y0 + r); p.cubicTo(x0, y0 + r - k, x0 + r - k, y0, x0 + r, y0)
    p.close()
    return p


def word(text):
    path, adv = C.shape(C.SANS, text, W8, TR)
    return path, adv


def junction():
    """x del encuentro entre la última s de "Bass" y la L de "Layer"."""
    bass, _ = word("Bass")
    bassL, _ = word("BassL")
    L = pathops.op(bassL, bass, pathops.PathOp.DIFFERENCE)
    s_right = bass.bounds[2]
    l_left = L.bounds[0]
    return (s_right + l_left) / 2


def ticket(text="BassLayer", notch_at=None, cap=CAP):
    """Devuelve (boleto calado, nombre, ancho, alto). Coordenadas: y hacia abajo, origen arriba a la izquierda."""
    name, _ = word(text)
    x0, y0, x1, y1 = name.bounds              # y0 ≈ −710 (mayúscula), y1 ≈ +200 (la y)
    H = 2.5 * cap
    pv = (H - cap) / 2                        # margen vertical: centra la altura de mayúscula
    ph = pv
    W = (x1 - x0) + 2 * ph
    # Ubicar el nombre: su mayúscula centrada en el alto; la descendente de la y cuelga dentro del margen.
    dx, dy = ph - x0, pv + cap
    name = C.xform(name, lambda x, y: (x + dx, y + dy))
    r, nr = 0.09 * H, 0.11 * H
    nx = (notch_at if notch_at is not None else junction()) + dx
    body = rrect(0, 0, W, H, r)
    for cy in (0, H):
        body = pathops.op(body, circle(nx, cy, nr), pathops.PathOp.DIFFERENCE)
    return body, name, W, H, nx


def stacked():
    """Versión apilada (formatos cuadrados): Bass arriba, Layer abajo, muescas a los costados entre las dos líneas."""
    b, _ = word("Bass")
    l, _ = word("Layer")
    bx0, _, bx1, _ = b.bounds
    lx0, _, lx1, _ = l.bounds
    w = max(bx1 - bx0, lx1 - lx0)
    gap = 0.34 * CAP
    pv = 0.75 * CAP
    H = pv * 2 + CAP * 2 + gap + 200
    W = w + 2 * pv * 1.1
    b = C.xform(b, lambda x, y: (x - bx0 + (W - (bx1 - bx0)) / 2, y + pv + CAP))
    l = C.xform(l, lambda x, y: (x - lx0 + (W - (lx1 - lx0)) / 2, y + pv + 2 * CAP + gap))
    name = pathops.op(b, l, pathops.PathOp.UNION)
    r, nr = 0.08 * max(W, H), 0.10 * W
    ny = pv + CAP + gap / 2 + 60
    body = rrect(0, 0, W, H, r)
    for cx in (0, W):
        body = pathops.op(body, circle(cx, ny, nr), pathops.PathOp.DIFFERENCE)
    return body, name, W, H


def monogram():
    """El ícono: el mismo boleto con BL (para 64 px o menos y la app)."""
    b, _ = word("B")
    l, _ = word("L")
    bx0, _, bx1, _ = b.bounds
    lx0, _, lx1, _ = l.bounds
    gap = 120
    w = (bx1 - bx0) + gap + (lx1 - lx0)
    H = 2 * CAP
    pv = (H - CAP) / 2
    W = w + 2 * pv * 1.05
    b = C.xform(b, lambda x, y: (x - bx0 + pv * 1.05, y + pv + CAP))
    l = C.xform(l, lambda x, y: (x - lx0 + pv * 1.05 + (bx1 - bx0) + gap, y + pv + CAP))
    name = pathops.op(b, l, pathops.PathOp.UNION)
    nx = pv * 1.05 + (bx1 - bx0) + gap / 2
    r, nr = 0.10 * H, 0.13 * H
    body = rrect(0, 0, W, H, r)
    for cy in (0, H):
        body = pathops.op(body, circle(nx, cy, nr), pathops.PathOp.DIFFERENCE)
    return body, name, W, H


def svg(W, H, layers, pad=0, title="BassLayer"):
    body = "".join(f'<path fill="{c}" d="{C.d(p)}"/>' for p, c in layers)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad:.0f} {-pad:.0f} {W + 2 * pad:.0f} {H + 2 * pad:.0f}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'


def knockout(body, name):
    """Boleto de un color con el nombre calado (vinilo de corte, sello, grabado)."""
    return pathops.op(body, name, pathops.PathOp.DIFFERENCE)


def main():
    body, name, W, H, nx = ticket()
    for k, c in BOLETOS.items():
        C.write(f"boleto-{k}.svg", svg(W, H, [(body, c["fondo"]), (name, c["tinta"])]))
    C.write("boleto-un-color.svg", svg(W, H, [(knockout(body, name), "currentColor")]))
    sb, sn, sW, sH = stacked()
    for k in ("general", "negro"):
        C.write(f"boleto-apilado-{k}.svg", svg(sW, sH, [(sb, BOLETOS[k]["fondo"]), (sn, BOLETOS[k]["tinta"])]))
    mb, mn, mW, mH = monogram()
    for k in ("general", "negro"):
        C.write(f"boleto-bl-{k}.svg", svg(mW, mH, [(mb, BOLETOS[k]["fondo"]), (mn, BOLETOS[k]["tinta"])]))
    C.write("boleto-bl-un-color.svg", svg(mW, mH, [(knockout(mb, mn), "currentColor")]))
    # Ícono de app: cuadrado negro a sangre con el boleto BL dentro de la zona segura (80 %).
    S = 1000
    s = (S * 0.78) / mW
    place = lambda p: C.xform(p, lambda x, y: (x * s + (S - mW * s) / 2, y * s + (S - mH * s) / 2))
    icon = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" role="img" aria-label="BassLayer"><title>BassLayer</title><rect width="{S}" height="{S}" fill="#000"/><path fill="{BOLETOS["general"]["fondo"]}" d="{C.d(place(mb))}"/><path fill="{BOLETOS["general"]["tinta"]}" d="{C.d(place(mn))}"/></svg>\n'
    C.write("boleto-app.svg", icon)
    # Imagen para compartir (1200 × 630): el boleto general centrado y una
    # línea en Geist Mono pasada a curvas (las imágenes se rasterizan sin la fuente).
    tag, tw = C.shape(C.MONO, "LA NOCHE Y EL MERCADO DE BUENOS AIRES", 400, 120)
    OW, OH = 1200, 630
    s1 = 760 / W
    bx, by = (OW - W * s1) / 2, 268 - H * s1 / 2
    ob = C.xform(body, lambda x, y: (x * s1 + bx, y * s1 + by))
    on = C.xform(name, lambda x, y: (x * s1 + bx, y * s1 + by))
    s2 = 15 / 1000
    ot = C.xform(tag, lambda x, y: (x * s2 + (OW - tw * s2) / 2, y * s2 + 462))
    og = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {OW} {OH}" width="{OW}" height="{OH}"><rect width="{OW}" height="{OH}" fill="#000"/>'
          f'<path fill="{BOLETOS["general"]["fondo"]}" d="{C.d(ob)}"/><path fill="{BOLETOS["general"]["tinta"]}" d="{C.d(on)}"/>'
          f'<path fill="#8A8A8A" d="{C.d(ot)}"/></svg>\n')
    C.write("og.svg", og)
    # Medidas para la lámina de construcción.
    (OUT / "boleto-medidas.json").write_text(
        f'{{"W": {W:.1f}, "H": {H:.1f}, "cap": {CAP}, "notch_x": {nx:.1f}, "r": {0.09 * H:.1f}, "nr": {0.11 * H:.1f}, "pv": {(H - CAP) / 2:.1f}, "ph": {(H - CAP) / 2:.1f}}}\n', encoding="utf-8")
    print("✓ boleto-medidas.json", f"W/H = {W / H:.2f}")


if __name__ == "__main__":
    main()

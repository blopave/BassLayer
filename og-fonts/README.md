# og-fonts

Geist (y Geist Mono) en WOFF estático para las imágenes que genera `og.js` con Satori, que no lee WOFF2 ni fuentes variables. Licencia SIL OFL 1.1 (`OFL.txt`): se puede redistribuir.

Se sacan de `public/fonts/` (las mismas que usa el sitio), instanciadas en 400/700/800 (Geist) y 400 (Geist Mono), **sin las tablas GPOS/GSUB/GDEF**: Satori las interpreta mal y abre espacios de más entre algunas palabras.

```python
# pip install fonttools brotli
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from io import BytesIO
for src, name, ws in [("public/fonts/geist-latin-wght-normal.woff2", "geist", (400, 700, 800)),
                      ("public/fonts/geist-mono-latin-wght-normal.woff2", "geist-mono", (400,))]:
    for w in ws:
        f = TTFont(src); f.flavor = None; b = BytesIO(); f.save(b)
        t = instancer.instantiateVariableFont(TTFont(BytesIO(b.getvalue())), {"wght": w})
        for tag in ("GPOS", "GSUB", "GDEF"):
            if tag in t: del t[tag]
        t.flavor = "woff"; t.save(f"og-fonts/{name}-{w}.woff")
```

// Ícono de la app · territorios I–IV (2026-10-12).
// Todo en un viewBox de 100. El glifo vive dentro del círculo seguro (r 32, el 64 % del lado);
// el horizonte cruza de borde a borde y la máscara del sistema hace de ficha.
// Variantes: normal (≥ 29 px) y mini (≤ 24 px, redibujada, no achicada).

export const C = { fondo: "#0E0E0F", cobre: "#C49070", celeste: "#6CB8C8", papel: "#EDEAE4" };

const f = (n) => +n.toFixed(2);

// Medio anillo sobre el horizonte (de R a r). r = 0 → medio disco.
function medioAnillo(cx, hz, R, r) {
  const a = `M${f(cx - R)} ${hz} A${R} ${R} 0 0 1 ${f(cx + R)} ${hz}`;
  return r > 0 ? `${a} L${f(cx + r)} ${hz} A${r} ${r} 0 0 0 ${f(cx - r)} ${hz} Z` : `${a} Z`;
}

// Vinilo: medio disco con un surco y el agujero. En mini queda el agujero solo.
function vinilo(cx, hz, R, mini) {
  if (mini) return medioAnillo(cx, hz, R, R * 0.16);
  return medioAnillo(cx, hz, R, R * 0.6) + " " + medioAnillo(cx, hz, R * 0.44, R * 0.11);
}

// Vinilo asomado: el disco entero con el centro sobre el horizonte (se recorta en el horizonte).
const circulo = (cx, cy, r) => `M${f(cx - r)} ${f(cy)} a${r} ${r} 0 1 0 ${f(2 * r)} 0 a${r} ${r} 0 1 0 ${f(-2 * r)} 0 Z`;
function disco(cx, cy, R, mini) {
  if (mini) return circulo(cx, cy, R) + " " + circulo(cx, cy, R * 0.15);
  return circulo(cx, cy, R) + " " + circulo(cx, cy, R * 0.6) + " " + circulo(cx, cy, R * 0.44) + " " + circulo(cx, cy, R * 0.11);
}

// Vela: cuerpo + mecha arriba y abajo. hueca = vela bajista (solo el borde).
function vela(x, top, bot, alto, bajo, w, { hueca = false, mecha = 1.6 } = {}) {
  const l = x - w / 2, m = mecha / 2;
  let d = `M${f(x - m)} ${f(alto)} h${mecha} V${f(top)} h${-mecha} Z M${f(x - m)} ${f(bot)} h${mecha} V${f(bajo)} h${-mecha} Z `;
  d += `M${f(l)} ${f(top)} h${w} V${f(bot)} h${-w} Z`;
  if (hueca) { const b = 1.9; d += ` M${f(l + b)} ${f(top + b)} V${f(bot - b)} h${f(w - 2 * b)} V${f(top + b)} Z`; }
  return d;
}

function horizonte(hz, grueso, ancho) {
  const x0 = ancho ? 50 - ancho / 2 : -2, w = ancho || 104;
  return `<rect x="${x0}" y="${f(hz - grueso / 2)}" width="${w}" height="${grueso}" fill="${C.papel}"/>`;
}

const capa = (d, fill) => `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`;

// Cada territorio devuelve { bass, layer, linea } en piezas SVG, para poder pintarlo en color o en un tono.
const TERRITORIOS = {
  // I · Fotograma destilado: la ficha reducida a tres formas, a plena luz y pareja.
  I({ mini }) {
    const hz = 68, R = 16;
    const bass = disco(34, hz - R * 0.32, R, mini);
    const w = mini ? 8.8 : 8.2, me = mini ? 2.6 : 1.9;
    const v = (x, t, b, at, ab, o) => vela(x, hz - t, hz - b, hz - at, hz - ab, w, { mecha: me, ...o });
    const layer = [v(60, 22, 11, 26, 7), v(69.5, 31, 20, 35, 16, { hueca: !mini }), v(79, 41, 24, 45, 20)].join(" ");
    return { bass, layer, hz, grueso: mini ? 3.4 : 2.4, recorte: true };
  },

  // II · El reflejo traduce: el vinilo arriba; en el agua, su reflejo vuelto bloques (las velas).
  II({ mini }) {
    const hz = 50, R = mini ? 25 : 24;
    const bass = vinilo(50, hz - 1.4, R, mini);
    const n = mini ? 5 : 7, paso = (2 * R) / n, w = paso * (mini ? 0.72 : 0.68), gap = mini ? 3.4 : 2.8, k = 0.9;
    let layer = "";
    for (let i = 0; i < n; i++) {
      const xc = 50 - R + paso * (i + 0.5);
      const h = Math.sqrt(R * R - (xc - 50) ** 2) * k;
      layer += `M${f(xc - w / 2)} ${hz + gap} h${f(w)} V${f(hz + gap + h)} h${f(-w)} Z `;
    }
    return { bass, layer, hz, grueso: mini ? 3.2 : 2.2 };
  },

  // III · Una línea, dos lecturas: el surco sube del horizonte y, pasada la cima, sigue en velas.
  III({ mini }) {
    const hz = 70, R = 28.6, cx = 45, sw = mini ? 8.5 : 6.6;
    const ro = R + sw / 2, ri = R - sw / 2;
    const bass = `M${f(cx - ro)} ${hz} A${f(ro)} ${f(ro)} 0 0 1 ${cx} ${f(hz - ro)} V${f(hz - ri)} A${f(ri)} ${f(ri)} 0 0 0 ${f(cx - ri)} ${hz} Z`;
    const pts = mini ? [[56, 29], [67, 32], [78, 37]] : [[55, 28.5], [63.5, 30.5], [72, 33.5], [80.5, 37.5]];
    const largo = mini ? 9 : 8, me = mini ? 2.4 : 1.7;
    const layer = pts.map(([x, a], i) =>
      vela(x, hz - a - largo / 2, hz - a + largo / 2, hz - a - largo / 2 - 3.4, hz - a + largo / 2 + 3.4, sw, { hueca: !mini && i === 2, mecha: me })
    ).join(" ");
    return { bass, layer, hz: hz + (mini ? 5.6 : 4.4), grueso: mini ? 3.2 : 2.2 };
  },

  // IV · El horizonte con dueño (control): la línea compartida es el signo; cada mundo, lo mínimo que la toca.
  IV({ mini }) {
    const hz = 66;
    const bass = disco(35, hz - 4, 14, true);
    const w = mini ? 12.4 : 12, me = mini ? 3 : 2.3;
    const layer = vela(65, hz - 29, hz - 9, hz - 36, hz - 2, w, { mecha: me });
    return { bass, layer, hz, grueso: mini ? 4.6 : 3.8, recorte: true };
  },
};

// Encuadre del dibujo mini (≤ 24 px): se acerca al glifo para que llene el cuadrado.
const CAJA = { I: [14, 9, 72], II: [21, 21, 58], III: [13, 12, 72], IV: [19, 20, 58] };

export const NOMBRES = {
  I: "Fotograma destilado",
  II: "El reflejo traduce",
  III: "Una línea, dos lecturas",
  IV: "El horizonte con dueño",
};

/**
 * Devuelve el SVG del ícono.
 * t: "I" | "II" | "III" | "IV"
 * opts.mini: dibujo para ≤ 24 px · opts.fondo: color o null (glifo solo)
 * opts.tono: pinta todo de un color (silueta, tintado) · opts.ancho: horizonte acotado (sticker, pin)
 * opts.contorno: [color, grosor] para el pin (línea de metal)
 */
export function icono(t, { mini = false, fondo = C.fondo, tono = null, ancho = null, contorno = null, extra = "" } = {}) {
  const g = TERRITORIOS[t]({ mini });
  const cB = tono || C.cobre, cL = tono || C.celeste, cH = tono || C.papel;
  const id = "r" + t + (mini ? "m" : "") + Math.random().toString(36).slice(2, 6);
  const corte = g.recorte ? `<clipPath id="${id}"><rect x="-5" y="-5" width="110" height="${f(g.hz - g.grueso / 2 + 5)}"/></clipPath>` : "";
  const pB = capa(g.bass, cB);
  let piezas = corte + (g.recorte ? `<g clip-path="url(#${id})">${pB}</g>` : pB) + capa(g.layer, cL) + horizonte(g.hz, g.grueso, ancho).replace(C.papel, cH);
  if (contorno) piezas = piezas.replace(/<(path|rect) /g, `<$1 stroke="${contorno[0]}" stroke-width="${contorno[1]}" stroke-linejoin="round" `);
  const bg = fondo ? `<rect x="-5" y="-5" width="110" height="110" fill="${fondo}"/>` : "";
  const vb = mini && fondo ? CAJA[t].concat(CAJA[t][2]).join(" ") : "0 0 100 100";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${bg}${extra}<g>${piezas}</g></svg>`;
}

// Sticker troquelado / pin: el contorno sigue al glifo (dilatación del alfa), no al cuadrado.
export function objeto(t, { borde = "#fff", base = C.fondo, r1 = 4.5, r2 = 7, contorno = null } = {}) {
  const g = icono(t, { fondo: null, ancho: 70, contorno }).replace(/^<svg[^>]*>|<\/svg>$/g, "");
  const sil = icono(t, { fondo: null, ancho: 70, tono: "#000" }).replace(/^<svg[^>]*>|<\/svg>$/g, "");
  const id = "o" + Math.random().toString(36).slice(2, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 120 120">
  <defs>
    <filter id="${id}a" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="${r2}"/><feGaussianBlur stdDeviation="1.2"/><feComponentTransfer result="m"><feFuncA type="linear" slope="6" intercept="-2.5"/></feComponentTransfer><feFlood flood-color="${borde}"/><feComposite operator="in" in2="m"/></filter>
    <filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="${r1}"/><feGaussianBlur stdDeviation="1"/><feComponentTransfer result="m"><feFuncA type="linear" slope="6" intercept="-2.5"/></feComponentTransfer><feFlood flood-color="${base}"/><feComposite operator="in" in2="m"/></filter>
  </defs>
  <g filter="url(#${id}a)">${sil}</g><g filter="url(#${id}b)">${sil}</g>${g}</svg>`;
}

// Equilibrio medido: luz de cada mundo (área × luminancia relativa) en un render de 512 px.
export async function medir(svg, lado = 512) {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const cv = Object.assign(document.createElement("canvas"), { width: lado, height: lado });
  const cx = cv.getContext("2d");
  cx.drawImage(img, 0, 0, lado, lado);
  const px = cx.getImageData(0, 0, lado, lado).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const ref = { b: [196, 144, 112], l: [108, 184, 200] };
  let B = 0, L = 0;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    const d = (c) => (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    const db = d(ref.b), dl = d(ref.l);
    if (Math.min(db, dl) > 2500) continue;
    const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    if (db < dl) B += Y; else L += Y;
  }
  return Math.round((B / (B + L)) * 100);
}

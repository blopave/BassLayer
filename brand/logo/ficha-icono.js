// El ícono de BassLayer: la ficha del home hecha ícono (elegido el 2026-10-12, opción A).
// Fuente única: brand/logo/web.mjs lo exporta a public/. Investigación en brand/investigacion/app-2026-10/.
// Misma geometría que src/brand/ficha.js (viewBox 400, horizonte 228, vinilo en 124 de radio 100,
// velas entre 226 y 368, ondas cobre en el reflejo del vinilo y luces en bloques bajo las velas),
// redibujada para cada tamaño: lo que se afina es el grosor y la cantidad, nunca la composición.
// Escalera: completo (≥ 120 px) · medio (48–96 px) · mini (≤ 32 px).

import { FICHA } from "../../src/brand/ficha.js";

// Colores y geometría de la ficha del home (src/brand/ficha.js): el ícono es el mismo dibujo.
export const C = { ...FICHA.colores, afuera: "#000000", cuerpo: "#1B1917" };

const { H, R, VX, VR } = FICHA;
const f = (n) => +n.toFixed(1);
let uid = 0;

// Una semana de BTC fija (subida con dos velas bajistas): el ícono no depende de datos vivos.
const SEMANA = [
  { o: 52, c: 58, h: 61, l: 49 }, { o: 58, c: 55, h: 62, l: 52 }, { o: 55, c: 66, h: 69, l: 54 },
  { o: 66, c: 72, h: 76, l: 63 }, { o: 72, c: 67, h: 75, l: 64 }, { o: 67, c: 80, h: 84, l: 66 }, { o: 80, c: 88, h: 92, l: 78 },
];
const ESCALON = {
  completo: { velas: [0, 1, 2, 3, 4, 5, 6], cw: 15, mecha: 4, alto: 112, surcos: 5, surcoW: 3.2, ondas: 5, ondaW: 6.5, ondaA: 5.5, hz: 4, luz: 8, mar: true },
  medio: { velas: [0, 2, 4, 5, 6], cw: 21, mecha: 5.5, alto: 112, surcos: 3, surcoW: 5, ondas: 4, ondaW: 9, ondaA: 7, hz: 6, luz: 10, mar: false },
  mini: { velas: [2, 4, 6], cw: 30, mecha: 8, alto: 108, surcos: 0, surcoW: 9, ondas: 2, ondaW: 16, ondaA: 9, hz: 10, luz: 14, mar: false },
};

/**
 * La ficha como ícono.
 * opts.escalon: "completo" | "medio" | "mini" (si no, sale del tamaño px)
 * opts.disco: true = la ficha redonda dentro del cuadrado (como en el home); false = la escena a sangre
 * opts.rise: cuánto asoma el vinilo (0,65 = reposo del home; 1 = Bass elegido)
 * opts.tono: todo en un color (silueta) · opts.fondo: null = sin fondo cuadrado (sticker, pin)
 * opts.margen: < 1 achica el dibujo dentro del cuadrado (maskable de Android: la ficha entra en el círculo seguro)
 * opts.esquina: redondeo del cuadrado en fracción del lado (favicon)
 */
export function fichaIcono({ escalon = "medio", disco = true, rise = 0.8, tono = null, fondo = C.afuera, pareja = false, margen = 1, esquina = 0 } = {}) {
  const id = "fi" + uid++;
  // pareja: Layer con el mismo peso de luz que Bass (velas más anchas, luces más largas, una onda menos)
  const e = pareja ? { ...ESCALON[escalon], cw: ESCALON[escalon].cw * 1.3, mecha: ESCALON[escalon].mecha * 1.3, ondas: ESCALON[escalon].ondas - 1, ondaW: ESCALON[escalon].ondaW * 0.85, luzK: 0.85 } : ESCALON[escalon];
  const cu = tono || C.cobre, cy = tono || C.celeste, pa = tono || C.papel;
  const vy = H + 106 - rise * (VR + 42), ry = 2 * H - vy;

  // Velas: entre 226 y 368, bajo el techo del disco, como en el home.
  const N = e.velas.length, xa = 238, xb = 332;
  const xs = e.velas.map((_, i) => xa + i * ((xb - xa) / Math.max(1, N - 1)));
  const sel = e.velas.map((k) => SEMANA[k]);
  const mn = Math.min(...sel.map((v) => v.l)), mx = Math.max(...sel.map((v) => v.h));
  const Y = (p) => H - 16 - ((p - mn) / (mx - mn)) * e.alto;
  let velas = "", luces = "";
  sel.forEach((v, i) => {
    const x = xs[i], up = v.c >= v.o, yt = Y(Math.max(v.o, v.c)), yb = Math.max(Y(Math.min(v.o, v.c)), yt + e.cw * 0.5);
    velas += `<rect x="${f(x - e.mecha / 2)}" y="${f(Y(v.h))}" width="${e.mecha}" height="${f(Y(v.l) - Y(v.h))}" fill="${cy}"/>`;
    velas += up || tono
      ? `<rect x="${f(x - e.cw / 2)}" y="${f(yt)}" width="${e.cw}" height="${f(yb - yt)}" fill="${cy}"/>`
      : `<rect x="${f(x - e.cw / 2 + e.mecha / 2)}" y="${f(yt + e.mecha / 2)}" width="${f(e.cw - e.mecha)}" height="${f(yb - yt - e.mecha)}" fill="${C.fondo}" stroke="${cy}" stroke-width="${e.mecha}"/>`;
    // el reflejo: luces en bloques, más cortas y debajo del horizonte
    const k = e.luzK || 0.62, top = H + e.hz, alto = (H - yt) * k;
    for (let y = top + 4, j = 0; y < top + alto; y += e.luz * 1.9, j++) {
      const h = Math.min(e.luz, top + alto - y);
      luces += `<rect x="${f(x - e.cw / 2)}" y="${f(y)}" width="${e.cw}" height="${f(h)}" fill="${cy}" opacity="${f(e.luzK ? 1 - j * 0.08 : 0.85 - j * 0.12)}"/>`;
    }
  });

  // El vinilo: cuerpo, surcos (pocos y gruesos), brillo, etiqueta cobre y agujero.
  let surcos = "";
  for (let s = 0; s < e.surcos; s++) {
    const r = e.surcos === 1 ? 66 : 46 + (s * (VR - 56)) / (e.surcos - 1);
    surcos += `<circle cx="${VX}" cy="${f(vy)}" r="${f(r)}" fill="none" stroke="${cu}" stroke-opacity="${tono ? 1 : 0.55}" stroke-width="${e.surcoW}"/>`;
  }
  const cuerpo = tono ? "none" : C.cuerpo;
  const vinilo = `<circle cx="${VX}" cy="${f(vy)}" r="${VR}" fill="${cuerpo}" ${tono ? `stroke="${tono}" stroke-width="${e.surcoW}"` : ""}/>${surcos}
    ${tono ? "" : `<path d="M${VX} ${f(vy)} L${VX + VR} ${f(vy - 22)} A${VR} ${VR} 0 0 1 ${VX + VR} ${f(vy + 22)} Z" fill="rgba(237,234,228,.07)" transform="rotate(-38 ${VX} ${f(vy)})"/>`}
    <circle cx="${VX}" cy="${f(vy)}" r="34" fill="${cu}"/><circle cx="${VX}" cy="${f(vy)}" r="${escalon === "mini" ? 6 : 4.5}" fill="${tono ? "#fff" : C.fondo}"/>`;

  // Las ondas: dentro del reflejo del vinilo (el sonido en el agua).
  let ondas = "";
  const paso = (VR - 10) / e.ondas;
  for (let j = 0; j < e.ondas; j++) {
    const y = H + e.hz + 10 + j * paso, pts = [];
    for (let x = VX - VR; x <= VX + VR; x += 4) pts.push(`${x} ${f(y + e.ondaA * Math.sin(x * 0.11 + j * 1.3))}`);
    ondas += `<path d="M${pts.join(" L")}" fill="none" stroke="${cu}" stroke-width="${e.ondaW}" stroke-linecap="round"/>`;
  }

  // El mar: bloques tenues de punta a punta (solo en el escalón completo).
  let mar = "";
  if (e.mar && !tono) for (let y = H + 18, j = 0; y < 392; y += 19, j++) mar += `<line x1="0" x2="400" y1="${y}" y2="${y}" stroke="${C.celeste}" stroke-width="4" stroke-dasharray="${26 + (j % 3) * 18} 14" stroke-dashoffset="${j * 23}" opacity=".16"/>`;

  const marco = disco ? `<clipPath id="${id}f"><circle cx="200" cy="200" r="${R}"/></clipPath>` : `<clipPath id="${id}f"><rect x="-50" y="-50" width="500" height="500"/></clipPath>`;
  const defs = `<defs>${marco}
    <clipPath id="${id}a"><rect x="-50" y="-50" width="500" height="${H + 50 - e.hz / 2}"/></clipPath>
    <clipPath id="${id}v"><circle cx="${VX}" cy="${f(ry)}" r="${VR}"/></clipPath>
    <clipPath id="${id}b"><rect x="-50" y="${H + e.hz / 2}" width="500" height="300"/></clipPath>
    <radialGradient id="${id}g" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#121214"/><stop offset="1" stop-color="#050505"/></radialGradient></defs>`;
  // en el mini el marco redondo no se distingue: se saca y se acerca la escena
  if (escalon === "mini") disco = false;
  let [vx0, vy0, vw] = escalon === "mini" ? [24, 46, 326] : disco ? [0, 0, 400] : [36, 30, 336];
  if (margen !== 1) { const w2 = vw / margen; vx0 -= (w2 - vw) / 2; vy0 -= (w2 - vw) / 2; vw = w2; }
  const vb = [vx0, vy0, vw, vw].map(f).join(" ");
  const redondeo = esquina ? `<clipPath id="${id}q"><rect x="${f(vx0)}" y="${f(vy0)}" width="${f(vw)}" height="${f(vw)}" rx="${f(vw * esquina)}"/></clipPath>` : "";
  const lienzo = fondo ? `<rect x="-100" y="-100" width="600" height="600" fill="${tono ? fondo : `url(#${id}g)`}"/>` : "";
  const ficha = disco && !tono ? `<circle cx="200" cy="200" r="${R + 6}" fill="${C.fondo}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${defs.replace("</defs>", redondeo + "</defs>")}<g${esquina ? ` clip-path="url(#${id}q)"` : ""}>${lienzo}${ficha}
    <g clip-path="url(#${id}f)">
      ${mar}
      <g clip-path="url(#${id}a)">${vinilo}</g>
      ${velas}
      <g clip-path="url(#${id}b)"><g clip-path="url(#${id}v)">${ondas}</g>${luces}</g>
      <rect x="-50" y="${H - e.hz / 2}" width="500" height="${e.hz}" fill="${pa}" opacity="${tono ? 1 : 0.62}"/>
    </g></g></svg>`;
}

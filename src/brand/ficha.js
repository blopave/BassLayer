/* ══════════════════════════════════════════════════════════════
   La ficha (marca, ronda 19) — generador del SVG.
   Port fiel de brand/investigacion/ronda-19/ficha.html (rama marca-escena):
   el vinilo (Bass) sale como un sol sobre un horizonte neutral; las velas
   (Layer) son el BTC real de 7 días; cada uno se refleja en el agua en su
   idioma (ondas / luces en bloques). Los valores IDLE/IL/KL son los que
   midió la página de la ronda 19 (equilibrio 50/50 en reposo).
   ══════════════════════════════════════════════════════════════ */

const CU = "#C49070", CY = "#6CB8C8", PAPEL = "#EDEAE4", FONDO = "#0E0E0F";
const R = 176;
export const IDLE = 0.65;   // altura del vinilo en reposo que deja cobre y celeste al 50 %
const IL = 3;               // intensidad de Layer elegido, calibrada contra Bass
export const KL = 0.8;      // energía de movimiento de Layer, calibrada contra Bass

let uid = 0;
const seg = (pts) => "M" + pts.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" L");

// Serie de precio: muestra estable hasta que llega el BTC real.
let PRECIO = (() => { let p = 100, s = 7; const a = []; for (let i = 0; i < 600; i++) { s = (s * 9301 + 49297) % 233280; p += (s / 233280 - 0.46) * 5; a.push(p); } return a; })();
let SALTO = 1, BTC7 = null;
const calcSalto = () => { let t = 0; for (let i = 1; i < PRECIO.length; i++) t += Math.abs(PRECIO[i] - PRECIO[i - 1]); SALTO = t / (PRECIO.length - 1) || 1; };
calcSalto();
export function setPrecio(serie) {
  if (!Array.isArray(serie) || serie.length <= 24) return;
  PRECIO = serie; calcSalto(); BTC7 = (serie[serie.length - 1] / serie[0] - 1) * 100;
}

// Bloques de datos: el largo sale de los saltos de la serie de precio.
function dash(i, k0) { const a = []; for (let k = 0; k < 14; k++) { const d = Math.abs(PRECIO[(k0 + i * 5 + k) % PRECIO.length] - PRECIO[(k0 + i * 5 + k + 1) % PRECIO.length]) / SALTO; a.push(Math.min(110, 14 + d * 22), 5); } return a.join(" "); }

// ── El nombre: proporción exacta del home (Bass 700 / LAYER 300 al 80,5 %).
let NM = null, lienzo = null;
function ancho(txt, w, s, ls) {
  lienzo = lienzo || document.createElement("canvas").getContext("2d");
  lienzo.font = `${w} ${s}px 'Geist Variable'`; lienzo.letterSpacing = `${ls}px`;
  return lienzo.measureText(txt).width - ls;
}
export const resetMetricas = () => { NM = null; };
function metricas(S) { const lS = S * 0.805; return { S, lS, bl: -0.03 * S, ll: lS * 0.1, wb: ancho("Bass", 700, S, -0.03 * S), wl: ancho("LAYER", 300, lS, lS * 0.1), gap: S * 0.28 }; }
function nombre(y, S, e, en) {
  if (!NM || NM.S !== S) NM = metricas(S);
  const M = NM, x0 = 200 - (M.wb + M.gap + M.wl) / 2, xl = x0 + M.wb + M.gap;
  // El nombre es el selector: la palabra elegida queda plena y muestra su línea; la otra se apaga.
  const sub = (x, anc, txt, c, v) => { const o = Math.max(0, Math.min(1, (v - 0.55) / 0.35)); return o > 0.02 ? `<text x="${x}" y="${y + 17}" text-anchor="${anc}" font-family="'Geist Mono Variable', GeistMono, monospace" font-size="8.6" letter-spacing="1.7" fill="${c}" opacity="${o}">${txt}</text>` : ""; };
  const cambio = BTC7 == null ? "" : `BTC ${BTC7 >= 0 ? "+" : "−"}${Math.abs(BTC7).toFixed(1).replace(".", en ? "." : ",")}% · 7 D · `;
  const entrar = en ? "ENTER →" : "ENTRAR →";
  return `<text x="${x0}" y="${y}" font-family="'Geist Variable', Geist, sans-serif" font-weight="700" font-size="${M.S}" letter-spacing="${M.bl}" fill="${CU}" opacity="${1 - 0.75 * e.L}">Bass</text>
    <text x="${xl}" y="${y}" font-family="'Geist Variable', Geist, sans-serif" font-weight="300" font-size="${M.lS}" letter-spacing="${M.ll}" fill="${CY}" opacity="${1 - 0.75 * e.B}">LAYER</text>
    ${sub(x0, "start", (en ? "THE NIGHT · " : "LA NOCHE · ") + entrar, CU, e.B) + sub(xl + M.wl, "end", cambio + entrar, CY, e.L)}`;
}

// ── La ficha. El agua deja una franja para el nombre; `conNombre: false` la deja vacía
//    (el nombre va encima, en HTML, como selector).
export function ficha(st, { en = false, conNombre = true, franja = true } = {}) {
  const id = "bf" + uid++, H = 228;
  const vx = 124, VR = 100;
  const vy = H + 106 - st.rise * (VR + 42), ry = 2 * H - vy;
  const band = franja ? [296, 346] : null;   // sin franja: el agua llega entera y el nombre corta el borde de abajo
  const cL = CY, cB = CU;
  const N = 12, por = Math.floor(PRECIO.length / N), V = [];
  for (let i = 0; i < N; i++) { const s2 = PRECIO.slice(i * por, (i + 1) * por + 1); V.push({ o: s2[0], c: s2[s2.length - 1], h: Math.max(...s2), l: Math.min(...s2) }); }
  const mn = Math.min(...V.map((v) => v.l)), mx = Math.max(...V.map((v) => v.h)) || mn + 1;
  const il = 1 + (IL - 1) * (st.L ?? 0);
  const xa = 226, xb = 368, cw = Math.min(9.4, 8.4 + 1.2 * (il - 1));
  const xs = V.map((_, i) => xa + i * ((xb - xa) / Math.max(1, N - 1)));
  const techo = (x) => 200 - Math.sqrt(Math.max(0, R * R - (x - 200) ** 2)) + 18;
  let span = 150; V.forEach((v, i) => { const f = (v.h - mn) / (mx - mn || 1); if (f > 0) span = Math.min(span, (H - 10 - techo(xs[i])) / f); });
  const Y0 = (p) => H - 10 - ((p - mn) / (mx - mn || 1)) * span;
  const gr = st.grow ?? 1;
  const g = (i) => Math.max(0.04, Math.min(1, gr * 1.4 - (i / Math.max(1, N - 1)) * 0.4));
  let gi = 1; const Y = (p) => H - 10 - (H - 10 - Y0(p)) * gi;
  const pulso = 0.55 + 0.45 * Math.abs(Math.sin(st.time * 1.1));
  const cur = Math.floor(st.sweep ?? 0) % N, frac = (st.sweep ?? 0) % 1;
  let velas = "", luces = "";
  V.forEach((v, i) => {
    gi = g(i);
    const x = xs[i], up = v.c >= v.o, yt = Y(Math.max(v.o, v.c)), yb = Math.max(Y(Math.min(v.o, v.c)), yt + 2.5);
    const op = (i === N - 1 ? pulso : 1) * (i === cur ? 1 : 1 - 0.32 * (st.L ?? 0));
    velas += `<line x1="${x}" x2="${x}" y1="${Y(v.h)}" y2="${Y(v.l)}" stroke="${cL}" stroke-width="2" opacity="${op}"/>`;
    velas += `<rect x="${x - cw / 2}" y="${yt}" width="${cw}" height="${yb - yt}" fill="${up ? cL : `rgba(108,184,200,${Math.min(0.6, 0.18 * il)})`}" stroke="${cL}" stroke-width="${up ? 0 : 2}" opacity="${op}"/>`;
    const k = 56 / Math.max(1, H - Y0(mx));
    const ryt = H + 4 + (H - yb) * k, ryb = H + 4 + (H - yt) * k, ryh = H + 4 + (H - Y(v.l)) * k, ryl = H + 4 + (H - Y(v.h)) * k;
    luces += `<line x1="${x}" x2="${x}" y1="${ryh}" y2="${ryl}" stroke="${cL}" stroke-width="2" stroke-dasharray="2.4 2.6" stroke-dashoffset="${-(st.shim ?? 0)}" opacity="${0.5 * op}"/>`;
    luces += `<line x1="${x}" x2="${x}" y1="${ryt}" y2="${Math.max(ryb, ryt + 2)}" stroke="${cL}" stroke-width="${cw}" stroke-dasharray="2.4 2.6" stroke-dashoffset="${-(st.shim ?? 0) * (1 + (i % 3) * 0.3)}" opacity="${Math.min(1, (up ? 0.8 : 0.45) * il) * op}"/>`;
  });
  if ((st.L ?? 0) > 0.02) { gi = g(cur); const xc = xs[cur], vc = V[cur]; velas += `<line x1="${xc}" x2="${xc}" y1="${techo(xc) - 6}" y2="${H}" stroke="${cL}" stroke-width="1" stroke-dasharray="2 3" opacity="${0.55 * st.L * (1 - Math.abs(frac - 0.5))}"/><circle cx="${xc}" cy="${Y(vc.c)}" r="3.4" fill="${cL}" opacity="${st.L}"/>`; }
  // ── El agua: capas tenues en bloques; dentro del reflejo del vinilo, ondas (el sonido).
  const p = 9.5, sw = 3.4;
  let mar = "", eco = "", cielo = "", i = 0;
  for (let y = H + 8; y < 392; y += p, i++) {
    if (band && y > band[0] && y < band[1]) continue;
    const ps = [], pb = [];
    for (let x = 10; x <= 390; x += 2) {
      const d = Math.hypot(x - vx, y - ry), ins = Math.max(0, Math.min(1, (VR - d) / 14));
      const a = ins * (2.2 + 1.8 * st.gain) * Math.sin(x * 0.17 + st.time * 1.1 * st.speed + y * 0.02);
      ps.push([x, y]); pb.push([x, y + a]);
    }
    mar += `<path d="${seg(ps)}" stroke-dasharray="${dash(i, 0)}" stroke-dashoffset="${-(st.flow * 16 * (1 + (i % 3) * 0.25))}"/>`; eco += `<path d="${seg(pb)}"/>`;
  }
  for (let y = 22; y < H - 6; y += p * 1.6) cielo += `<line x1="0" x2="400" y1="${y}" y2="${y}" stroke-dasharray="${dash(i, 0)}" stroke-dashoffset="${-(st.flow * 22 * (1 + (i++ % 4) * 0.2))}"/>`;
  // ── El vinilo: surco en espiral, brillo que gira, etiqueta cobre.
  const P = []; for (let a = 0; a < Math.PI * 2 * 22; a += 0.07) { const r = 38 + (a / (Math.PI * 2)) * ((VR - 42) / 22); P.push([vx + r * Math.cos(a), vy + r * Math.sin(a)]); }
  const surco = `<path d="${seg(P)}" fill="none" stroke="rgba(196,144,112,${0.5 + 0.25 * (st.B ?? 0)})" stroke-width=".8"/>`;
  const ang = st.spin % 360;
  const vinilo = `<circle cx="${vx}" cy="${vy}" r="${VR}" fill="#151515"/>${surco}
    <g transform="rotate(${ang} ${vx} ${vy})"><path d="M${vx} ${vy} L${vx + VR} ${vy - 20} A${VR} ${VR} 0 0 1 ${vx + VR} ${vy + 20} Z" fill="rgba(237,234,228,.07)"/><path d="M${vx} ${vy} L${vx - VR} ${vy + 20} A${VR} ${VR} 0 0 1 ${vx - VR} ${vy - 20} Z" fill="rgba(237,234,228,.05)"/></g>
    <circle cx="${vx}" cy="${vy}" r="34" fill="${CU}"/><circle cx="${vx}" cy="${vy}" r="3" fill="${FONDO}"/>`;
  // ── Qué hay en cada mundo, dicho en su idioma: al elegir Bass, impreso alrededor del vinilo
  //    como el borde de un disco; al elegir Layer, una línea de cotización en el cielo del mercado.
  const mono = "'Geist Mono Variable', GeistMono, monospace";
  const oB = Math.max(0, Math.min(1, ((st.B ?? 0) - 0.55) / 0.35)), oL = Math.max(0, Math.min(1, ((st.L ?? 0) - 0.55) / 0.35));
  let leyenda = "";
  if (oB > 0.02) {
    const r = 113, a0 = -116 * Math.PI / 180, a1 = -6 * Math.PI / 180;   // el arco entra entero en la ficha
    leyenda += `<path id="${id}r" d="M${vx + r * Math.cos(a0)} ${vy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${vx + r * Math.cos(a1)} ${vy + r * Math.sin(a1)}" fill="none"/>
      <text font-family="${mono}" font-size="8.6" letter-spacing="1.8" fill="${CU}" opacity="${oB}"><textPath href="#${id}r" startOffset="50%" text-anchor="middle">${en ? "MUSIC · FESTIVALS · LISTINGS" : "MÚSICA · FESTIVALES · AGENDA"}</textPath></text>`;
  }
  if (oL > 0.02) {
    // entra deslizándose como una cotización que llega, y queda quieta: las tres palabras enteras
    const txt = en ? "CRYPTO · FINANCE · NEWS" : "CRYPTO · FINANZAS · NOTICIAS";
    // a la altura y = 155 la ficha es ancha: entra entera entre el borde (x 40) y la columna de las velas (x 214)
    leyenda += `<clipPath id="${id}t"><rect x="40" y="140" width="174" height="20"/></clipPath><g clip-path="url(#${id}t)" opacity="${oL}"><text x="${42 - (1 - oL) * 40}" y="155" font-family="${mono}" font-size="9" fill="${CY}" textLength="170" lengthAdjust="spacing">${txt}</text></g>`;
  }
  const bandMask = band ? `<rect x="0" y="${band[0]}" width="400" height="${band[1] - band[0]}" fill="#000"/>` : "";
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${id}f"><circle cx="200" cy="200" r="${R}"/></clipPath>
      <clipPath id="${id}a"><rect x="0" y="-10" width="400" height="${H + 10}"/></clipPath><clipPath id="${id}v"><circle cx="${vx}" cy="${ry}" r="${VR}"/></clipPath>
      <mask id="${id}b" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400"><rect width="400" height="400" fill="#fff"/><rect x="0" y="0" width="400" height="${H + 6}" fill="#000"/><circle cx="${vx}" cy="${ry}" r="${VR}" fill="#000"/><rect x="${xa - 10}" y="${H}" width="${xb - xa + 20}" height="66" fill="#000"/>${bandMask}</mask>
      <mask id="${id}e" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400"><rect width="400" height="400" fill="#fff"/><rect x="0" y="0" width="400" height="${H + 6}" fill="#000"/>${bandMask}</mask>
      <mask id="${id}c" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400"><rect width="400" height="400" fill="#fff"/><circle cx="${vx}" cy="${vy}" r="${VR + 6 + 16 * oB}" fill="#000"/><rect x="36" y="145" width="182" height="13" fill="#000" fill-opacity="${oL}"/><rect x="${xa - 12}" y="0" width="${xb - xa + 24}" height="${H}" fill="#000"/><rect x="0" y="${H}" width="400" height="200" fill="#000"/></mask></defs>
    ${band ? "" : `<mask id="${id}n" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400"><rect width="400" height="400" fill="#fff"/><rect x="84" y="357" width="232" height="52" rx="6" fill="#000"/></mask>`}
    <g${band ? "" : ` mask="url(#${id}n)"`}><circle cx="200" cy="200" r="${R + 6}" fill="${FONDO}"/>
    <g clip-path="url(#${id}f)">
      <g fill="none" stroke="${cL}" stroke-width="${sw * 0.8}" opacity="${Math.min(1, (0.07 + 0.33 * st.L) * il) * (1 - 0.6 * st.B)}" mask="url(#${id}c)">${cielo}</g>
      <g clip-path="url(#${id}a)" opacity="${st.dimB}">${vinilo}</g>
      ${leyenda}
      <g opacity="${st.dimL}">${velas}</g>
      <g fill="none" stroke="${cL}" stroke-width="${sw}" stroke-linecap="butt" mask="url(#${id}b)" opacity="${Math.min(1, (0.28 + 0.3 * st.L) * il) * (1 - 0.5 * st.B)}">${mar}</g>
      <g mask="url(#${id}e)" opacity="${st.dimL}">${luces}</g>
      <g mask="url(#${id}e)"><g fill="none" stroke="${cB}" stroke-width="${sw}" stroke-linecap="round" clip-path="url(#${id}v)" opacity="${st.dimB}">${eco}</g></g>
      <line x1="0" x2="400" y1="${H}" y2="${H}" stroke="${PAPEL}" stroke-width="1.6" opacity=".42"/>
    </g></g>
    ${conNombre ? nombre(322, 32, st, en) : ""}</svg>`;
}

export const btc7 = () => BTC7;

// Estados objetivo: reposo (los dos mundos insinuados y parejos, quietos), Bass o Layer elegido.
export function objetivo(w) {
  if (w === "bass") return { rise: 1, speed: 1.6, gain: 1.4, dimL: 0.16, dimB: 1, spinV: 48, L: 0, B: 1, grow: 0.35 };
  if (w === "layer") return { rise: 0, speed: 0.5, gain: 0.4, dimL: 1, dimB: 0.16, spinV: 4, L: 1, B: 0, grow: 1 };
  return { rise: IDLE, speed: 0.25, gain: 0.7, dimL: 0.32, dimB: 0.32, spinV: 0, L: 0, B: 0, grow: 0.6 };
}
export const ESTADO_INICIAL = { rise: IDLE, time: 0, flow: 0, speed: 1, gain: 1, dimL: 0.32, dimB: 0.32, spin: 0, L: 0, B: 0, grow: 0.6, sweep: 0, shim: 0 };

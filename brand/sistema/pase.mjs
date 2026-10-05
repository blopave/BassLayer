// El pase de la semana (oct 2026, Pablo eligió "la línea de la semana" + "el pase").
//
// Cada semana BassLayer emite un pase numerado. Lleva impresa la línea de esa
// semana: la curva del Bitcoin de los últimos 7 días (el mercado, celeste)
// que pasa por HOY y se vuelve la onda de las fiestas de los próximos 7 días
// en el AMBA (la noche, cobre). La línea de corte del boleto cae en HOY: el
// talón que se arranca es lo que ya pasó; lo que te quedás, lo que viene. La
// línea cruza el corte entera: los dos mundos no se separan.
//
// Funciones puras (sin DOM ni red): las usan la lámina (brand/sistema/pase.html)
// y el exportador (brand/sistema/exportar.mjs). Devuelven SVG como texto.

export const COLOR = { cobre: "#C49070", celeste: "#6CB8C8", hueso: "#EDEAE4", papel: "#F2EDE4", tinta: "#141414", negro: "#000000", gris: "#8A8A8A" };
// Paleta de los dos mundos: par de noche (sobre negro) y par de día (sobre papel).
export const PALETA = { noche: { bass: "#C49070", layer: "#6CB8C8" }, dia: { bass: "#8E5B3A", layer: "#2A6E7C" } };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const pad = (n) => String(n).padStart(2, "0");
export const fecha = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
const usd = (n) => Math.round(n).toLocaleString("es-AR");
const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`;

// Semana ISO (lunes a domingo): el número del pase.
export function semanaISO(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { anio: t.getUTCFullYear(), semana: Math.ceil(((t - y0) / 864e5 + 1) / 7) };
}

// Los datos de una semana a partir de la agenda y los precios del sitio.
// events: /api/events (se usan los del AMBA) · btcSerie: 168 valores horarios (7 días).
export function datosDeSemana(events, btcSerie, ahora = new Date()) {
  const desde = new Date(ahora); desde.setHours(12, 0, 0, 0);
  const noches = Array(168).fill(0);
  let n = 0;
  for (const e of events) {
    if (e.area !== "amba") continue;
    const mi = MESES.indexOf(String(e.month).toLowerCase().slice(0, 3));
    if (mi < 0) continue;
    const [h, m] = String(e.time || "23:00").split(":").map(Number);
    const t = new Date(ahora.getFullYear(), mi, +e.day, h || 23, m || 0);
    if (t < ahora - 30 * 864e5) t.setFullYear(t.getFullYear() + 1);
    const k = Math.floor((t - desde) / 36e5);
    if (k < 0 || k >= 168) continue;
    n++;
    for (let j = 0; j < 6 && k + j < 168; j++) noches[k + j] += 1 - j / 6;   // una fiesta suena ~6 h
  }
  const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 6);
  const antes = new Date(desde); antes.setDate(antes.getDate() - 7);
  const ult = btcSerie[btcSerie.length - 1];
  return { mercado: btcSerie, noches, fiestas: n, btc: { ultimo: ult, cambio: ((ult - btcSerie[0]) / btcSerie[0]) * 100 }, antes, desde, hasta, ahora, numero: semanaISO(ahora) };
}

// La línea: el mercado de 0 a `corte`, la noche de `corte` a W. Devuelve el
// trazado y el x del corte (HOY). `grueso` reduce el detalle para tamaños chicos.
export function linea(D, W = 1000, H = 300, { corte = 0.42, grueso = false } = {}) {
  const mid = H / 2, xc = W * corte, M = D.mercado, lo = Math.min(...M), hi = Math.max(...M), last = M[M.length - 1];
  const paso = grueso ? 6 : 1;
  let d = "";
  for (let i = 0; i < M.length; i += paso) d += `${d ? "L" : "M"}${((i / (M.length - 1)) * xc).toFixed(1)} ${(mid - ((M[i] - last) / ((hi - lo) || 1)) * H * 0.62).toFixed(1)}`;
  d += `L${xc.toFixed(1)} ${mid}`;
  const max = Math.max(1, ...D.noches), N = grueso ? 140 : 900, freq = grueso ? 2.2 : 0.9;
  for (let i = 1; i <= N; i++) {
    const x = xc + (i / N) * (W - xc), t = (i / N) * 167, k = Math.floor(t), f = t - k;
    const a = D.noches[k] * (1 - f) + D.noches[Math.min(167, k + 1)] * f;
    const env = Math.pow(a / max, 0.8) * H * 0.44 * Math.min(1, (W - x) / 20, (x - xc) / 40);
    d += `L${x.toFixed(1)} ${(mid - env * Math.sin(i * freq)).toFixed(1)}`;
  }
  return { d, xc, mid };
}

let uid = 0;
const grad = (id, x0, x1, a, b, at = 0.5) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x0}" x2="${x1}" y1="0" y2="0"><stop offset="${at - 0.06}" stop-color="${a}"/><stop offset="${at + 0.06}" stop-color="${b}"/></linearGradient>`;
const mono = (x, y, s, t, fill, anchor = "start", ls = 0.16) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Geist Mono, GeistMono, ui-monospace, monospace" font-size="${s}" letter-spacing="${(s * ls).toFixed(2)}" fill="${fill}">${t}</text>`;
const marca = (x, y, s, fill) => `<text x="${x}" y="${y}" font-family="Geist, system-ui, sans-serif" font-weight="750" font-size="${s}" letter-spacing="${(-s * 0.035).toFixed(2)}" fill="${fill}">BassLayer</text>`;

// El pase. tema: "noche" (papel negro) | "dia" (papel hueso).
export function pase(D, { tema = "noche", W = 1000, H = 440, animar = false, paleta = PALETA } = {}) {
  const id = `p${++uid}`, noche = tema === "noche";
  const papel = noche ? "#0B0B0B" : COLOR.papel, tinta = noche ? COLOR.hueso : COLOR.tinta, suave = noche ? "#7A7A7A" : "#8A857C";
  const cu = noche ? paleta.noche.bass : paleta.dia.bass, ce = noche ? paleta.noche.layer : paleta.dia.layer;
  const r = 26, mx = 52, lw = W - 2 * mx, L = linea(D, lw, 210), xc = mx + L.xc, nr = 22;
  const cuerpo = `M${r} 0H${xc - nr}a${nr} ${nr} 0 0 0 ${2 * nr} 0H${W - r}a${r} ${r} 0 0 1 ${r} ${r}V${H - r}a${r} ${r} 0 0 1 ${-r} ${r}H${xc + nr}a${nr} ${nr} 0 0 0 ${-2 * nr} 0H${r}a${r} ${r} 0 0 1 ${-r} ${-r}V${r}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
  let puntos = "";
  for (let y = nr + 14; y < H - nr - 8; y += 15) puntos += `<circle cx="${xc}" cy="${y}" r="2.4" fill="${tinta}" opacity="${noche ? 0.35 : 0.4}"/>`;
  const num = `Nº ${String(D.numero.anio).slice(2)}·${pad(D.numero.semana)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="BassLayer · pase de la semana ${num}">
<defs>${grad(`${id}g`, mx, mx + lw, ce, cu, L.xc / lw)}<clipPath id="${id}c"><path d="${cuerpo}"/></clipPath></defs>
<path d="${cuerpo}" fill="${papel}"/>
<g clip-path="url(#${id}c)"><rect x="0" y="0" width="${xc}" height="8" fill="${ce}"/><rect x="${xc}" y="0" width="${W - xc}" height="8" fill="${cu}"/></g>
${puntos}
${marca(mx, 92, 54, tinta)}
${mono(W - mx, 62, 13, "PASE DE LA SEMANA", suave, "end")}${mono(W - mx, 92, 22, num, tinta, "end", 0.08)}
<g transform="translate(${mx} ${H * 0.5 - 105 + 18})"><path d="${L.d}" fill="none" stroke="url(#${id}g)" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"${animar ? ' pathLength="1" class="bl-pase-traza"' : ""}/></g>
<rect x="${xc - 62}" y="121" width="124" height="22" fill="${papel}"/>${mono(xc, 136, 11, "HOY · " + fecha(D.ahora), suave, "middle")}
${mono(mx, H - 70, 12, "EL MERCADO", ce)}${mono(mx, H - 46, 12, `BTC ${usd(D.btc.ultimo)} · ${pct(D.btc.cambio)}`, tinta, "start", 0.1)}${mono(mx, H - 26, 10, `${fecha(D.antes)} → ${fecha(D.ahora)}`, suave)}
${mono(xc + 40, H - 70, 12, "LA NOCHE", cu)}${mono(xc + 40, H - 46, 12, `${D.fiestas} FIESTAS · AMBA`, tinta, "start", 0.1)}${mono(xc + 40, H - 26, 10, `${fecha(D.desde)} → ${fecha(D.hasta)}`, suave)}
${mono(W - mx, H - 26, 10, "BUENOS AIRES · BASSLAYER.IO", suave, "end")}
</svg>`;
}

// La línea madre: la síntesis fija de la línea de la semana para las piezas
// chicas (ícono, favicon, pin, sello), que no cambian. La curva del mercado
// sube con un respiro hasta HOY y la noche suena en tres pulsos que crecen
// hacia el finde. En un cuadro de 1000; `chico` = menos picos, más grueso.
export function lineaMadre({ chico = false } = {}) {
  const xc = 470, y = 520;
  let d = `M150 640C220 640 250 572 300 584C350 596 372 520 420 528C446 532 458 520 ${xc} ${y}`;
  const pulsos = chico ? [[610, 80], [770, 190]] : [[590, 70], [700, 120], [820, 200]];
  let x = xc;
  for (const [cx, amp] of pulsos) {
    const n = chico ? 1 : 2, w = chico ? 40 : 26;
    d += `L${cx - n * w} ${y}`;
    for (let k = 0; k < n * 2; k++) { const t = 1 - Math.abs(k - n + 0.5) / n; d += `L${cx - n * w + (k + 1) * w} ${y + (k % 2 ? 1 : -1) * amp * t}`; }
    d += `L${cx + n * w} ${y}`;
    x = cx + n * w;
  }
  d += `L860 ${y}`;
  return { d, xc };
}

// El isotipo: el pase reducido a su gesto — un boleto de papel hueso con sus
// dos muescas en HOY y la línea madre cruzándolas. Fondo negro a sangre
// (ícono de app); el arte vive dentro de la zona segura de Android (80 %).
export function isotipo(_D, { chico = false, fondo = true, paleta = PALETA } = {}) {
  const id = `i${++uid}`, S = 1000, cw = 820, ch = chico ? 600 : 560, x0 = (S - cw) / 2, y0 = (S - ch) / 2, r = 70, nr = chico ? 64 : 52;
  const L = lineaMadre({ chico }), xc = L.xc;
  const cuerpo = `M${x0 + r} ${y0}H${xc - nr}a${nr} ${nr} 0 0 0 ${2 * nr} 0H${x0 + cw - r}a${r} ${r} 0 0 1 ${r} ${r}V${y0 + ch - r}a${r} ${r} 0 0 1 ${-r} ${r}H${xc + nr}a${nr} ${nr} 0 0 0 ${-2 * nr} 0H${x0 + r}a${r} ${r} 0 0 1 ${-r} ${-r}V${y0 + r}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
  const ty = (S - 1040) / 2 + (chico ? 0 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" role="img" aria-label="BassLayer"><defs>${grad(`${id}g`, 150, 860, paleta.dia.layer, paleta.dia.bass, (xc - 150) / 710)}</defs>
${fondo ? `<rect width="${S}" height="${S}" fill="#000"/>` : ""}<path d="${cuerpo}" fill="${COLOR.papel}"/>
${chico ? "" : Array.from({ length: 6 }, (_, k) => `<circle cx="${xc}" cy="${y0 + nr + 26 + k * ((ch - 2 * nr - 52) / 5)}" r="7" fill="${COLOR.tinta}" opacity=".22"/>`).join("")}
<g transform="translate(0 ${-20 + ty * 0})"><path d="${L.d}" fill="none" stroke="url(#${id}g)" stroke-width="${chico ? 58 : 36}" stroke-linejoin="round" stroke-linecap="round"/></g></svg>`;
}

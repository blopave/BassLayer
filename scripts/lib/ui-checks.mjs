// Chequeos que corren DENTRO de la página (page.evaluate). Cada uno devuelve
// una lista de problemas legibles; vacía = bien. Los usa smoke.mjs, que falla
// si alguno devuelve algo.

// Texto visible con contraste < 3:1 contra su fondo. Ignora texto sobre
// imágenes (no hay un color de fondo que medir) y elementos inert/ocultos.
// Sept 2026: los títulos de la agenda quedaban blancos en modo día.
export function lowContrast(min = 3) {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none" && !/gradient/.test(cs.backgroundImage)) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const out = [];
  for (const e of document.querySelectorAll("body *")) {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || +cs.opacity < 0.5 || e.closest("[inert],[aria-hidden=true],.bl-sr-only")) continue;
    const fg = parse(cs.color), bg = bgOf(e);
    if (!fg || !bg || fg.a < 0.3) continue;
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < min) out.push(`contraste ${ratio.toFixed(2)} en .${String(e.className).split(" ")[0]} "${e.textContent.trim().slice(0, 30)}"`);
  }
  return [...new Set(out)].slice(0, 10);
}

// Home dual: el wordmark central no pisa flyers/chart/stats, y las bajadas
// de cada mundo no se pisan entre sí (sept 2026: en 1000px el 4º flyer
// quedaba debajo de "Bass LAYER" y las esquinas viejas encima de las bajadas).
export function homeCollisions() {
  const box = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" ? r : null;
  };
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  // La ficha (oct 2026): el reloj y los controles no se meten en el disco, y el nombre no pisa el reloj.
  const disco = document.querySelector(".bhf-hit");
  const chrome = [...document.querySelectorAll(".bl-info")].map((e) => [e.className.split(" ").pop(), box(e)]).filter((x) => x[1]);
  const out = [];
  const d = disco && box(disco);
  if (d) for (const [c, b] of chrome) {
    // el disco es un círculo: choca si la caja toca el círculo, no su cuadrado
    const cx = (d.left + d.right) / 2, cy = (d.top + d.bottom) / 2, r = d.width / 2;
    const nx = Math.max(b.left, Math.min(cx, b.right)), ny = Math.max(b.top, Math.min(cy, b.bottom));
    if ((nx - cx) ** 2 + (ny - cy) ** 2 < (r - 1) ** 2) out.push(`${c} pisa la ficha`);
  }
  const nombre = document.querySelector(".bhf-nm"), nb = nombre && box(nombre);
  if (nb) for (const [c, b] of chrome) if (hit(nb, b)) out.push(`el nombre pisa ${c}`);
  return [...new Set(out)];
}

// Pósters tipográficos: ninguna palabra más ancha que su caja
// (sept 2026: "HOBELA|R" cortado en los thumbs chicos).
export function posterOverflow() {
  const out = [];
  for (const po of document.querySelectorAll(".bl-poster")) {
    const pr = po.getBoundingClientRect();
    if (pr.width < 1) continue;
    for (const w of po.querySelectorAll(".bl-poster-word")) {
      if (w.scrollWidth > pr.width - 8) out.push(`póster cortado: "${w.textContent}" (${w.scrollWidth}px en ${Math.round(pr.width)}px)`);
      if (getComputedStyle(w).color === "rgba(0, 0, 0, 0)" && getComputedStyle(w).webkitTextStrokeWidth === "0px") out.push(`póster invisible: "${w.textContent}"`);
    }
  }
  return [...new Set(out)].slice(0, 10);
}

// Los controles flotantes no pueden tapar el buscador de la agenda
// (sept 2026: la barra de utilidades de desktop lo cubría en 1000px).
export function floatingOverlaps() {
  const bar = document.querySelector(".bl-util-bar");
  if (!bar || bar.classList.contains("is-hidden")) return [];
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const out = [];
  const targets = [...bar.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0 && getComputedStyle(b).visibility !== "hidden");
  for (const sel of [".bl-ctrl-search", ".bl-ctrl-bar input", "input[type=search]"]) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width && targets.some((t) => hit(t.getBoundingClientRect(), r))) out.push(`la barra flotante tapa ${sel}`);
    }
  }
  return [...new Set(out)];
}

// Nombres accesibles rotos: un aria-label o title con "[object Object]" (oct
// 2026: t() devolvía Fragments cuando una variable era número y los lectores
// de pantalla leían "Noticias: [object Object]").
export function brokenLabels() {
  return [...document.querySelectorAll("[aria-label], [title]")]
    .map((el) => el.getAttribute("aria-label") || el.getAttribute("title") || "")
    .filter((s) => s.includes("[object"))
    .slice(0, 3)
    .map((s) => `nombre accesible roto: "${s.slice(0, 80)}"`);
}

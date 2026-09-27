// Chequeos que corren DENTRO de la página (page.evaluate). Cada uno devuelve
// una lista de problemas legibles; vacía = bien. Los usan smoke.mjs (falla)
// y audit-ux.mjs (reporta).

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
  const wm = [...document.querySelectorAll(".blf-wd")].map(box).filter(Boolean);
  const others = [...document.querySelectorAll(".blf-fcard, .blf-chartwrap, .blf-lstats, .blf-halv, .blf-kick, .blf-big, .blf-genres, .blf-marq, .bl-info")]
    .map((e) => [e.className.split(" ")[0], box(e)]).filter((x) => x[1]);
  const out = [];
  for (const a of wm) for (const [c, b] of others) if (hit(a, b)) out.push(`el wordmark pisa ${c}`);
  const chrome = [...document.querySelectorAll(".blf-kick, .bl-info")].map((e) => [e.className.split(" ")[0], box(e)]).filter((x) => x[1]);
  for (let i = 0; i < chrome.length; i++) for (let j = i + 1; j < chrome.length; j++)
    if (hit(chrome[i][1], chrome[j][1])) out.push(`${chrome[i][0]} pisa ${chrome[j][0]}`);
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

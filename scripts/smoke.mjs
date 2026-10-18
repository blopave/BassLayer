#!/usr/bin/env node
// Smoke test en navegador real: recorre los flujos que más usa la gente en
// mobile Y desktop y falla si algo se ve roto.
//
// Nace del bug de sept 2026: el CDN de Deezer cortó las fotos de artista y el
// modal de evento quedó con cajas vacías. Ningún chequeo de datos lo veía —
// la data estaba bien, lo roto era cómo se pintaba. Esto mira la pantalla.
//
//   npm run smoke                          # contra localhost:3000 (npm run dev)
//   npm run smoke -- https://basslayer.io  # contra prod
//
// Deja screenshots en .pw-shots/smoke-*.png para mirarlos a ojo.

import { computeTours } from "../lib/tours.js";
import { getEventDate } from "../src/i18n/strings.js";
import { cleanArtists } from "../src/utils/artists.js";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { lowContrast, homeCollisions, posterOverflow, floatingOverlaps, brokenLabels } from "./lib/ui-checks.mjs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3000";
// /api/events una sola vez por corrida (lo usan el conteo de la home y De gira).
let eventsCache;
const eventsData = async () => (eventsCache ??= await fetch(BASE + "/api/events").then((r) => r.json()).catch(() => []));
const SHOTS = ".pw-shots";
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  // Tablet vertical: usa el home de celular escalado (sept 2026: vacíos o choques).
  { name: "tablet", viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  // Laptop chica con dock: el alto es lo que rompe los modales.
  { name: "laptop-bajo", viewport: { width: 1000, height: 647 } },
  // Deezer banea el proxy cada tanto: el modal tiene que seguir viéndose bien
  // sin fotos de artista (inicial en vez de caja vacía / ícono roto).
  { name: "mobile-sin-fotos", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, blockArtistImages: true },
];

// Ruido externo que no depende de nosotros.
const IGNORED_CONSOLE = /cloudflareinsights|beacon\.min\.js|Failed to load resource/i;

const problems = [];
const fail = (vp, step, detail) => problems.push(`[${vp}] ${step}: ${detail}`);

// Costuras de color: mayor salto de luminancia (Rec. 709) entre píxeles vecinos
// a lo largo de una fila o columna de la pantalla, muestreando cada `stride`.
async function seamJump(page, clip, stride = 1) {
  const { data, info } = await sharp(await page.screenshot({ clip })).raw().toBuffer({ resolveWithObject: true });
  const n = Math.max(info.width, info.height), lum = [];
  for (let t = 0; t < n; t += stride) { const i = (info.width > 1 ? t : t * info.width) * info.channels; lum.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]); }
  return Math.max(0, ...lum.slice(1).map((v, i) => Math.abs(v - lum[i])));
}

// Imágenes visibles dentro de `root` que terminaron de cargar sin píxeles.
// Una imagen rota con fallback (onError) ya no está en el DOM, así que esto
// solo agarra las que el usuario ve como ícono roto / caja vacía.
const brokenImages = (root) => root.evaluate((el) =>
  [...el.querySelectorAll("img")]
    .filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0)
    .map((i) => i.getAttribute("src")?.slice(0, 100)));

// El modal entero tiene que entrar en pantalla: CTA dentro del viewport y el
// flyer visible dentro del modal (sept 2026: con line-ups largos la grilla
// crecía, el flyer se iba fuera de vista y la botonera quedaba recortada).
// Portada de Bass: tocar una sección de la onda (el <g> del SVG; el click real
// lo intercepta el propio SVG que la contiene).
const clickCue = (page, re) => page.locator(".btk-cue", { hasText: re }).first().dispatchEvent("click");

async function checkModalFits(page, vpName) {
  const r = await page.evaluate(() => {
    const box = (s) => document.querySelector(s)?.getBoundingClientRect();
    const modal = box(".bl-event-modal"), cta = box(".bl-em-cta"), fly = box(".bl-em-fly");
    return { vh: innerHeight, modal: modal && [modal.top, modal.bottom], cta: cta && [cta.top, cta.bottom], fly: fly && [fly.top, fly.bottom] };
  });
  if (!r.cta) return fail(vpName, "modal", "no hay botón de entradas");
  if (r.cta[1] > r.vh || r.cta[1] > r.modal[1] + 1) fail(vpName, "modal", `el botón de entradas queda fuera de pantalla (bottom ${Math.round(r.cta[1])} > ${r.vh})`);
  if (r.fly && r.fly[1] > r.modal[1] + 1) fail(vpName, "modal", "la columna del flyer es más alta que el modal (queda recortado)");
}

async function run(vp) {
  const browser = await chromium.launch();
  const { name, blockArtistImages, ...ctxOpts } = vp;
  const ctx = await browser.newContext({ ...ctxOpts, locale: "es-AR" });
  const page = await ctx.newPage();
  if (blockArtistImages) await page.route("**/api/artist-image**", (r) => r.fulfill({ status: 502, body: "{}" }));
  page.on("pageerror", (e) => fail(vp.name, "js", e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) fail(vp.name, "console", m.text().slice(0, 200));
  });

  // Corre un chequeo de ui-checks en la página y registra cada problema.
  const expectNone = async (step, check) => {
    for (const issue of await page.evaluate(check)) fail(vp.name, step, issue);
  };

  try {
    // 1. Home → bienvenida de primera visita → Bass
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    // Los paneles ocultos (mundo inactivo) son inert a propósito: lo que se
    // chequea es que abrir+cerrar un diálogo deje la cuenta igual que antes.
    const inertCount = () => page.locator("[inert]").count();
    // Bienvenida (oct 2026): una línea sobre la home que no tapa nada ni bloquea
    // el scroll, y se va sola con el primer gesto. No es un cartel.
    const welcome = page.locator(".bl-welcome-line");
    await welcome.waitFor({ state: "visible", timeout: 15_000 }).catch(() => fail(vp.name, "bienvenida", "no aparece la línea de bienvenida en la primera visita"));
    if (await page.locator('.bl-onboarding, [role="dialog"][aria-modal="true"]').count()) fail(vp.name, "bienvenida", "la bienvenida volvió a ser un cartel que tapa la home");
    if ((await page.evaluate(() => document.body.style.overflow)) === "hidden") fail(vp.name, "bienvenida", "la bienvenida bloquea el scroll");
    await page.waitForTimeout(900);
    await page.mouse.wheel(0, 40);
    await welcome.waitFor({ state: "detached", timeout: 5_000 }).catch(() => fail(vp.name, "bienvenida", "la línea no se va con el primer gesto"));
    await page.waitForTimeout(1200); // entrada del home (fade de los mundos)
    await expectNone("home", homeCollisions);
    await expectNone("home", lowContrast);
    await expectNone("home", brokenLabels);
    const amba = (await eventsData()).filter((e) => e.area === "amba").length;
    // El home es la ficha (oct 2026): el vinilo, las velas y "Bass LAYER" encima, como selector.
    const fichaSvg = page.locator(".bhf-mk svg");
    if (!(await fichaSvg.count())) fail(vp.name, "home", "el home no muestra la ficha");
    if (!/Bass\s*LAYER/.test(((await page.locator(".bhf-nm").textContent().catch(() => "")) || "").replace(/Entrar →|Enter →/g, " ").replace(/\s+/g, " "))) fail(vp.name, "home", "la ficha no muestra \"Bass LAYER\"");
    // En reposo ningún mundo está elegido; pasar (o tocar una vez en el celular) elige sin entrar.
    if (await page.locator('.bhf[data-w="bass"], .bhf[data-w="layer"]').count()) fail(vp.name, "home", "la ficha arranca con un mundo elegido: el reposo es neutral");
    const bassHalf = page.getByRole("button", { name: /^Bass —/ }).first();
    if (vp.isMobile) {
      await bassHalf.click();
      await page.waitForTimeout(300);
      if ((await page.locator(".bhf").getAttribute("data-w").catch(() => "")) !== "bass") fail(vp.name, "home", "en el celular el primer toque no elige Bass");
      if (await page.locator(".bl-btrack").isVisible().catch(() => false)) fail(vp.name, "home", "en el celular el primer toque entra directo: tiene que mostrar el mundo primero");
    } else {
      await bassHalf.hover();
      await page.waitForTimeout(300);
      if ((await page.locator(".bhf").getAttribute("data-w").catch(() => "")) !== "bass") fail(vp.name, "home", "pasar por el vinilo no elige Bass");
    }
    // Al elegir, la ficha dice qué hay en ese mundo, y "Entrar →" se lee (11 px como mínimo, también en el celular).
    await page.waitForTimeout(1500);
    if (!/M[ÚU]SICA|MUSIC/.test((await fichaSvg.textContent().catch(() => "")) || "")) fail(vp.name, "home", "al elegir Bass la ficha no dice qué hay (Música · Festivales · Agenda)");
    // "AGENDA" cae sobre las velas: debajo de la leyenda las velas se apagan (oct 2026, Pablo: "no se lee claramente").
    const limpia = await page.evaluate(() => [...document.querySelectorAll(".bhf-mk svg g[mask]")].some((g) => g.querySelector("rect[width]") && g.querySelector("line") && document.querySelector(g.getAttribute("mask").slice(4, -1))?.querySelector("path[stroke]")));
    if (!limpia) fail(vp.name, "home", "al elegir Bass la leyenda pisa las velas (\"AGENDA\" no se lee limpio)");
    const goPx = await page.locator(".bhf-w.b .go").evaluate((e) => parseFloat(getComputedStyle(e).fontSize)).catch(() => 0);
    if (goPx < 11) fail(vp.name, "home", `"Entrar →" mide ${goPx}px: no se lee`);
    if (!vp.isMobile) {
      // Fuera de la ficha, reposo neutral: ningún mundo queda elegido.
      await page.mouse.move(8, Math.round(vp.viewport.height / 2));
      await page.waitForTimeout(300);
      if (await page.locator('.bhf[data-w="bass"], .bhf[data-w="layer"]').count()) fail(vp.name, "home", "al salir de la ficha queda un mundo elegido: tiene que volver a neutral");
      await bassHalf.hover();
      await page.waitForTimeout(300);
    }
    await bassHalf.click();

    // Índice de Bass (sept 2026): la portada es solo la forma de onda con tres
    // hot cues — Noticias, Agenda, Festivales —; Hoy, el finde, De gira y la
    // búsqueda viven dentro de la Agenda.
    await page.locator(".bl-btrack svg").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    // En táctil, el toque que entra a Bass no deja un hover pegado que apague los otros nombres (oct 2026).
    if (vp.isMobile) { await page.waitForTimeout(300); if (await page.locator(".btk-cue.is-off").count()) fail(vp.name, "índice", "en táctil quedó un hover pegado: los otros nombres se apagan"); }
    await page.waitForTimeout(600);   // los datos de cada parte llegan después de pintar
    await expectNone("índice", brokenLabels);
    // Ticker: "artistas @ lugar", nunca "… @ fiesta @ lugar" (Buenos Aliens escribe "2GTHR @ Morocco").
    const dobleArroba = await page.locator(".bl-lineup-venue").evaluateAll((els) => els.map((e) => e.textContent).filter((t) => t.includes("@")));
    if (dobleArroba.length) fail(vp.name, "ticker", `venue con @ en el ticker: ${dobleArroba[0]}`);
    // Un solo número (oct 2026): la Agenda de la onda cuenta lo mismo que la home.
    const porVenir = Number(((await page.locator(".btk-cue", { hasText: /Agenda|Listings/ }).first().locator(".btk-sub").textContent().catch(() => "")).match(/(\d+)\D*$/) || [])[1]);
    // Los ciclos fijos suman encima de los eventos (como en la Agenda; la igualdad exacta la mide el paso "conteos").
    if (amba > 0 && (porVenir < amba || porVenir > amba + 25)) fail(vp.name, "índice", `la onda dice ${porVenir} por venir y en Buenos Aires hay ${amba} eventos`);
    const cueNames = await page.locator(".bl-btrack .btk-cue .btk-name").allTextContents();
    if (!cueNames.some((x) => /Agenda|Listings/.test(x)) || cueNames.length < 2 || cueNames.length > 3) fail(vp.name, "índice", `cues del índice: ${cueNames.join(" · ") || "ninguno"} (esperaba Noticias · Agenda · Festivales)`);
    if (await page.locator(".bl-bass-sections").count()) fail(vp.name, "índice", "la portada de Bass muestra pestañas: el track es el único índice");
    if (await page.locator(".bl-ev-open").count()) fail(vp.name, "índice", "la portada de Bass muestra la lista: la agenda es una sección");
    // La portada es solo la onda (oct 2026): entra en la pantalla, sin pie ni nada debajo.
    const portadaFits = (i) => page.evaluate((i) => { const el = document.querySelectorAll(".bl-swipe-panel")[i]; return el ? el.scrollHeight - el.clientHeight : 0; }, i);
    if (vp.viewport.height >= 800) { await page.waitForTimeout(400); const extra = await portadaFits(0); if (extra > 2) fail(vp.name, "portada", `la portada de Bass tiene ${extra}px de más debajo de la onda`); }
    const cues = cueNames.length;
    // Los cues se reparten parejo a lo largo de la onda (tres partes iguales del tema).
    const pads = await page.locator(".bl-btrack .btk-name").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
    if (pads.length === 3) {
      const axis = vp.isMobile ? 1 : 0, g1 = pads[1][axis] - pads[0][axis], g2 = pads[2][axis] - pads[1][axis];
      if (Math.abs(g1 - g2) > 3 || g1 < 60) fail(vp.name, "índice", `los cues no están repartidos parejo en la onda (${Math.round(g1)} vs ${Math.round(g2)} px)`);
    }
    // Suena: la onda late (animaciones vivas en las barras) y un cue con foco hace solo de su tramo.
    if (cues) {
      await page.locator(".bl-btrack").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      // La onda se dibuja en canvas cuadro a cuadro: dos cuadros separados tienen que diferir.
      // Una franja alrededor del eje de cada pista (una franja fija podía caer entre dos pistas de mobile, sin barras).
      const strip = () => page.locator(".bl-btrack").evaluate((el) => {
        const c = el.querySelector(".btk-canvas"), k = c.width / c.getBoundingClientRect().width, cx = c.getContext("2d");
        let h = 0, n = 0;
        for (const g of el.querySelectorAll(".btk-cue")) { const d = cx.getImageData(0, Math.max(0, Math.round((Number(g.dataset.axis) - 60) * k)), c.width, Math.round(120 * k)).data; for (let i = 3; i < d.length; i += 64) { h = (h * 31 + d[i]) | 0; n += d[i] > 0; } }
        return n ? String(h) : "";
      }).catch(() => "");
      const frameA = await strip();
      await page.waitForTimeout(250);
      const frameB = await strip();
      if (!frameA || frameA === frameB) fail(vp.name, "índice", "la onda no suena (el canvas no se mueve)");
      // Un solo color (oct 2026, Pablo): sobre el eje de cada parte, todas las
      // barras tienen la misma intensidad — en reposo y en solo ("mute de
      // canal": el resto baja de altura, no de color). Fuera de las palabras.
      const evenInk = () => page.locator(".bl-btrack").evaluate((el) => {
        const cv = el.querySelector(".btk-canvas"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, cx = cv.getContext("2d");
        const words = [...el.querySelectorAll(".btk-name")].map((n) => n.getBoundingClientRect());
        const peaks = [];
        // Mobile (oct 2026, "T"): la onda es vertical y sus barras horizontales;
        // la intensidad se mide sobre el eje, de arriba hacia abajo.
        if (el.dataset.orient === "v") {
          const x = Math.round(cv.width / 2), col = cx.getImageData(x, 0, 1, cv.height).data, win = Math.round(6 * k);
          for (let y0 = Math.round(8 * k); y0 + win < cv.height - 8 * k; y0 += win) { let m = 0; for (let y = y0; y < y0 + win; y++) m = Math.max(m, col[y * 4 + 3]); peaks.push(m); }
          return peaks.length ? [Math.min(...peaks), Math.max(...peaks)] : null;
        }
        for (const g of el.querySelectorAll(".btk-cue")) {
          const y = Math.round(Number(g.dataset.axis) * k), row = cx.getImageData(0, y, cv.width, 1).data, win = Math.round(6 * k);
          for (let x0 = Math.round(8 * k); x0 + win < cv.width - 8 * k; x0 += win) {
            const vx = cr.left + x0 / k;
            if (words.some((w) => vx > w.left - 4 && vx < w.right + 4 && Math.abs(cr.top + y / k - (w.top + w.height / 2)) < w.height)) continue;
            let m = 0; for (let x = x0; x < x0 + win; x++) m = Math.max(m, row[x * 4 + 3]);
            peaks.push(m);
          }
        }
        return peaks.length ? [Math.min(...peaks), Math.max(...peaks)] : null;
      });
      const isEven = (r) => r && r[1] - r[0] <= 14;
      if (!vp.isMobile) { await page.mouse.move(2, vp.viewport.height - 2); await page.waitForTimeout(900); const r = await evenInk(); if (!isEven(r)) fail(vp.name, "diseño", `la onda en reposo no es de un solo color (alfa de barras ${r?.join("–")})`); }
      // La palabra elegida sigue hecha de los rectangulitos de la onda (oct 2026, Pablo: que no
      // quede plana): nunca se rellena. Una línea que cruza la palabra por el medio tiene que
      // seguir cortando barra / aire / barra, y la palabra no puede quedar más apagada que en reposo.
      const inkOf = (i) => page.locator(".bl-btrack").evaluate((el, i) => {
        const cv = el.querySelector(".btk-canvas"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, r = el.querySelectorAll(".btk-name")[i].getBoundingClientRect();
        const d = cv.getContext("2d").getImageData(Math.round((r.left - cr.left) * k), Math.round((r.top - cr.top) * k), Math.round(r.width * k), Math.round(r.height * k));
        const blanco = (q) => d.data[q] > 200 && d.data[q + 1] > 190 && d.data[q + 2] > 180;
        let total = 0; for (let q = 0; q < d.data.length; q += 4) if (blanco(q)) total++;
        let cortes = 0, prev = false; const y = Math.round(d.height / 2);
        for (let x = 0; x < d.width; x++) { const on = blanco((y * d.width + x) * 4); if (on !== prev) cortes++; prev = on; }
        return { total, cortes };
      }, i);
      const lastIdx = (await page.locator(".btk-cue").count()) - 1;
      const inkRest = vp.isMobile ? null : await inkOf(lastIdx);
      await page.locator(".btk-cue").last().focus();
      await page.waitForTimeout(150);
      if (!(await page.locator(".bl-btrack").getAttribute("data-solo"))) fail(vp.name, "índice", "el foco en un cue no hace solo de su parte de la onda");
      await page.waitForTimeout(1200);
      { const r = await evenInk(); if (!isEven(r)) fail(vp.name, "diseño", `en solo la onda cambia de color (alfa de barras ${r?.join("–")})`); }
      if (inkRest != null) { const inkOn = await inkOf(lastIdx); if (inkOn.cortes < inkRest.cortes * 0.6 || inkOn.total < inkRest.total * 0.98) fail(vp.name, "índice", `la palabra elegida deja de ser de barras (cortes ${inkRest.cortes} → ${inkOn.cortes}; tinta ${inkRest.total} → ${inkOn.total})`); }
      const vert = (await page.locator(".bl-btrack").getAttribute("data-orient")) === "v";
      if (vp.viewport.width <= 768 && !vert) fail(vp.name, "índice", "mobile: la onda de Bass no es una sola frecuencia vertical (como el tronco de Layer)");
      if (vert) {
        // Mobile (oct 2026, Pablo: "T"): una sola frecuencia vertical y angosta —
        // la forma la dan los datos, no las palabras—, con los nombres a los
        // costados, alternados como las ramas de Layer, sin pisar la onda.
        const side = await page.locator(".bl-btrack").evaluate((el) => {
          const cv = el.querySelector(".btk-canvas"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, cx = cv.getContext("2d");
          let wMax = 0;
          const c0 = Math.round(cv.width / 2), on = (row, x) => row[x * 4 + 3] > 40;
          // Solo la onda: el tramo continuo que pasa por el centro (los nombres van al costado, separados por aire).
          for (let y = 0; y < cv.height; y += 4) { const row = cx.getImageData(0, y, cv.width, 1).data; if (!on(row, c0)) continue; let a = c0, b = c0; while (a > 0 && (on(row, a - 1) || on(row, a - 2))) a--; while (b < cv.width - 1 && (on(row, b + 1) || on(row, b + 2))) b++; wMax = Math.max(wMax, (b - a) / k); }
          const mid = cr.left + cr.width / 2;
          const names = [...el.querySelectorAll(".btk-name")].map((n) => n.getBoundingClientRect());
          return { wMax, width: cr.width, sides: names.map((r) => (r.right <= mid ? "i" : r.left >= mid ? "d" : "x")) };
        });
        if (side.wMax > side.width * 0.45) fail(vp.name, "índice", `mobile: la onda es demasiado ancha (${Math.round(side.wMax)} px de ${Math.round(side.width)})`);
        if (side.sides.includes("x") || side.sides.some((s, i) => i && s === side.sides[i - 1])) fail(vp.name, "índice", `mobile: los nombres no van alternados a los costados de la onda (${side.sides.join("")})`);
      }
      // La portada es solo la onda y sus links, sin cajas: cada link vive sobre el
      // eje de la onda (en el break de su parte) y no pisa la onda ni el cabezal.
      const offAxis = vert ? 0 : await page.locator(".bl-btrack .btk-cue").evaluateAll((gs) => gs.filter((g) => {
        const svg = g.ownerSVGElement.getBoundingClientRect(), n = g.querySelector(".btk-name").getBoundingClientRect();
        return !g.dataset.axis || !(Math.abs(n.top + n.height / 2 - (svg.top + Number(g.dataset.axis))) <= 40);
      }).length);
      if (offAxis) fail(vp.name, "índice", `${offAxis} link(s) fuera del eje de la onda`);
      // La onda nunca se corta: debajo de cada palabra el canvas tiene barras (la palabra es de onda).
      const gaps = vert ? 0 : await page.locator(".bl-btrack").evaluate((el) => {
        const cv = el.querySelector(".btk-canvas"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, cx = cv.getContext("2d");
        return [...el.querySelectorAll(".btk-name")].filter((n) => {
          const r = n.getBoundingClientRect(), x = Math.round((r.left + r.width * 0.37 - cr.left) * k), y0 = Math.round((r.top - cr.top) * k), hgt = Math.max(1, Math.round(r.height * k));
          const px = cx.getImageData(Math.max(0, x - 6), Math.max(0, y0), 12, hgt).data;
          for (let i = 3; i < px.length; i += 4) if (px[i] > 20) return false;
          return true;
        }).length;
      });
      if (gaps) fail(vp.name, "índice", `la onda se corta en ${gaps} link(s): la palabra tiene que estar hecha de onda`);
      // La palabra cómoda ADENTRO de la onda (oct 2026, Pablo): a los dos costados
      // de cada nombre la onda tiene que ser al menos 1,8 veces más alta que la
      // mitad de la letra (aire arriba y abajo), nunca más baja ni pareja con ella.
      const tight = vert ? [] : await page.locator(".bl-btrack").evaluate((el) => {
        const cv = el.querySelector(".btk-canvas"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, cx = cv.getContext("2d");
        const meas = document.createElement("canvas").getContext("2d");
        return [...el.querySelectorAll(".btk-cue")].flatMap((g) => {
          const t = g.querySelector(".btk-name"), r = t.getBoundingClientRect(), mid = Number(g.dataset.axis);
          meas.font = getComputedStyle(t).font;
          const m = meas.measureText(t.textContent), inkHalf = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 2;
          const half = (vx) => {
            const x = Math.round(vx * k), y0 = Math.max(0, Math.round((mid - 4 * inkHalf) * k)), y1 = Math.round(mid * k), col = cx.getImageData(x - 3, y0, 7, y1 - y0).data;
            for (let y = 0; y < y1 - y0; y++) for (let q = 0; q < 7; q++) if (col[(y * 7 + q) * 4 + 3] > 40) return mid - (y0 + y) / k;
            return 0;
          };
          const sides = [half(r.left - cr.left - 8), half(r.right - cr.left + 8)];
          return sides.some((h) => h < inkHalf * 1.8) ? [`${t.textContent} (onda ±${Math.round(Math.min(...sides))} px, letra ±${Math.round(inkHalf)} px)`] : [];
        });
      });
      if (tight.length) fail(vp.name, "diseño", `la palabra no entra cómoda en la onda: ${tight.join(", ")}`);
      const overlap = await page.locator(".bl-btrack").evaluate((el) => {
        const box = (e) => e.getBoundingClientRect(), hit = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
        const names = [...el.querySelectorAll(".btk-name")].map(box), subs = [...el.querySelectorAll(".btk-sub, .btk-span")].map(box);
        return subs.some((s) => names.some((n) => hit(s, n))) || names.some((a, i) => names.some((b, j) => i !== j && hit(a, b)));
      });
      if (overlap) fail(vp.name, "índice", "un nombre pisa a otro o a su dato");
      await page.locator(".btk-cue").last().blur();
      // Puente "Una sola línea" (oct 2026): el botón Layer del encabezado cruza
      // con la línea —la onda se vuelve la curva— y aterriza en Layer; de vuelta, igual.
      {
        await page.locator(".bl-header-half-layer").dispatchEvent("click");
        await page.waitForTimeout(350);
        const mid = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".bl-worldline") || document.body).opacity));
        if (!(await page.locator(".bl-worldline").count()) || !(mid > 0.5)) fail(vp.name, "puente", "el cambio a Layer no cruza con la línea (la onda que se vuelve curva)");
        await page.waitForTimeout(1900);
        const landed = await page.evaluate(() => ({ layer: !!document.querySelector(".bl-header-half-layer.is-active"), line: Number(getComputedStyle(document.querySelector(".bl-worldline") || document.body).opacity), curve: !!document.querySelector(".bl-swipe-wrap.morph-landed") }));
        if (!landed.layer || landed.line > 0.05 || !landed.curve) fail(vp.name, "puente", `la línea no aterriza en Layer (${JSON.stringify(landed)})`);
        await page.locator(".bl-header-half-bass").dispatchEvent("click");
        await page.waitForTimeout(2200);
        if (!(await page.locator(".bl-header-half-bass.is-active").count())) fail(vp.name, "puente", "de vuelta, la línea no aterriza en Bass");
        await page.locator(".bl-btrack svg").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      }
      // Mobile (sin hover): el solo recorre los cues solo, uno cada 16 golpes (≈7,7 s: fluye).
      if (vp.isMobile) {
        const first = await page.locator(".btk-cue.is-hot .btk-name").textContent().catch(() => null);
        await page.waitForFunction((f) => document.querySelector(".btk-cue.is-hot .btk-name")?.textContent !== f, first, { timeout: 10000 }).catch(() => {});
        const next = await page.locator(".btk-cue.is-hot .btk-name").textContent().catch(() => null);
        if (!first || !next || first === next) fail(vp.name, "índice", `en mobile el loop de cues no avanza (${first} → ${next})`);
      }
      if (await page.locator(".btk-cue", { hasText: /Noticias|News/ }).count()) {
        await page.locator(".btk-cue", { hasText: /Noticias|News/ }).first().dispatchEvent("click");
        if (!(await page.locator(".bl-bass-section-btn.active", { hasText: /Noticias|News/ }).count())) fail(vp.name, "índice", "el cue Noticias no abre Noticias");
        if (await page.locator(".bl-btrack").count()) fail(vp.name, "índice", "dentro de Noticias sigue visible el track");
        // Siempre se vuelve al track: acá con el atrás del navegador (o el gesto del celular).
        await page.evaluate(() => history.back());
        await page.waitForTimeout(400);
        if (!(await page.locator(".bl-btrack").count())) fail(vp.name, "índice", "el atrás del navegador desde Noticias no vuelve al track");
        if (await page.locator(".bl-bass-sections").count()) fail(vp.name, "índice", "la portada de Bass volvió a mostrar las pestañas");
        await page.locator(".bl-btrack svg").waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      }
      // Agenda (oct 2026): "Cuándo" es la línea de días. Tocar un día salta a
      // ese día (su encabezado queda justo debajo de la línea) y lo marca.
      await clickCue(page, /Agenda|Listings/);
      await page.waitForTimeout(800);
      if (!(await page.locator(".bl-bass-section-btn.active", { hasText: /Agenda|Listings/ }).count())) fail(vp.name, "índice", "el cue Agenda no abre la Agenda");
      if (await page.locator(".bass-when, .bl-ctrl-bar select[aria-label='Cuándo']").count()) fail(vp.name, "agenda", "volvió el filtro Cuándo: lo resuelve la línea de días");
      const railDays = page.locator(".bl-day-rail button.bl-day-rail-day");
      if ((await railDays.count()) < 3) fail(vp.name, "agenda", "falta la línea de días");
      else {
        const target = railDays.nth(2), label = await target.getAttribute("aria-label");
        await target.click();
        await page.waitForTimeout(1600);
        const jump = await page.evaluate(() => { const rb = document.querySelector(".bl-day-rail").getBoundingClientRect().bottom; const on = document.querySelector(".bl-day-rail .is-on")?.getAttribute("aria-label"); const near = Math.min(...[...document.querySelectorAll(".bl-day-header[data-day]")].map((h) => Math.abs(h.getBoundingClientRect().top - rb))); return { on, near }; });
        if (jump.on !== label) fail(vp.name, "agenda", `la línea marca ${jump.on} y se tocó ${label}`);
        if (!(jump.near < 24)) fail(vp.name, "agenda", `el día elegido no queda debajo de la línea (${Math.round(jump.near)}px)`);
      }
      // Agenda como pared de afiches (oct 2026, Pablo: "B+"): varias columnas en
      // desktop y dos en mobile; los eventos sin flyer llevan afiche de la casa
      // con el nombre; la hora va sobre el flyer.
      const wall = await page.evaluate(() => {
        const w = document.querySelector(".bl-ev-wall"); if (!w) return null;
        const cols = getComputedStyle(w).gridTemplateColumns.split(" ").length;
        const posters = [...w.querySelectorAll(".bl-ev-item .bl-thumb-poster")];
        const emptyPoster = posters.filter((p) => !p.querySelector(".bl-poster-word")?.textContent.trim()).length;
        // La onda del evento (oct 2026, "B"): cada afiche lleva su onda, y dos eventos distintos no la comparten.
        const ondas = posters.map((p) => [...p.querySelectorAll(".bl-onda rect")].slice(0, 12).map((r) => r.getAttribute("height")).join(","));
        const sinOnda = ondas.filter((o) => !o).length;
        // Nitidez (oct 2026): la foto descargada alcanza para el tamaño en pantalla × la densidad.
        const borrosas = [...w.querySelectorAll(".bl-ev-item .bl-thumb-img")].filter((im) => im.complete && im.naturalWidth && /\/img\?/.test(im.currentSrc)).slice(0, 8)
          .filter((im) => +(im.currentSrc.match(/[?&]w=(\d+)/) || [])[1] < Math.min(im.clientWidth * devicePixelRatio * 0.9, 1000)).length;   // el ancho pedido, no el del original (puede ser chico)
        const repetidas = ondas.length - new Set(ondas).size;
        const badge = [...w.querySelectorAll('.bl-ev-item:not([data-time=""])')].slice(0, 6).every((it) => getComputedStyle(it, "::before").content.replace(/"/g, "").trim().length > 0);
        return { cols, emptyPoster, badge, sinOnda, repetidas, n: posters.length, borrosas };
      });
      if (!wall) fail(vp.name, "agenda", "la agenda no es la pared de afiches");
      else {
        if (vp.isMobile ? wall.cols !== 2 : wall.cols < 3) fail(vp.name, "agenda", `la pared tiene ${wall.cols} columnas`);
        if (wall.emptyPoster) fail(vp.name, "agenda", `${wall.emptyPoster} eventos sin flyer sin nombre en su afiche`);
        if (wall.sinOnda) fail(vp.name, "agenda", `${wall.sinOnda} afiches sin la onda del evento`);
        if (wall.borrosas) fail(vp.name, "agenda", `${wall.borrosas} flyers se descargan más chicos de lo que se muestran (se ven borrosos)`);
        if (wall.n > 2 && wall.repetidas > wall.n / 3) fail(vp.name, "agenda", `la onda se repite entre eventos (${wall.repetidas} de ${wall.n}): no sale del nombre`);
        if (!wall.badge) fail(vp.name, "agenda", "la hora no aparece sobre el flyer");
      }
      // Dentro de cada día, por hora como se vive la noche (la madrugada al final).
      const badOrder = await page.evaluate(() => {
        const mins = (t) => { const [h, m] = (t || "23:00").split(":").map(Number); return ((h < 7 ? h + 24 : h) * 60) + (m || 0); };
        let bad = 0, prev = -1;
        for (const el of document.querySelectorAll(".bl-ev-list > *")) {
          if (el.classList.contains("bl-day-header")) { prev = -1; continue; }
          const t = el.querySelector(".bl-ev-time-inline")?.textContent.trim(); if (!t) continue;
          const v = mins(t); if (v < prev) bad++; prev = v;
        }
        return bad;
      });
      if (badOrder) fail(vp.name, "agenda", `${badOrder} eventos fuera de orden horario dentro de su día`);
      // La flecha devuelve al track, a la vista.
      await page.locator(".bl-bass-back").click();
      await page.waitForTimeout(500);
      if (!(await page.locator(".bl-btrack").count())) fail(vp.name, "índice", "la flecha desde la Agenda no vuelve al track");
      else if (!(await page.locator(".bl-btrack").evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight / 2; }))) fail(vp.name, "índice", "volver al track deja la pantalla en otro lado (el track queda fuera de vista)");
      await clickCue(page, /Agenda|Listings/);
      await page.waitForTimeout(500);
    }

    // 2. Feed con eventos (dentro de la Agenda)
    const firstEvent = page.locator(".bl-ev-open").first();
    await firstEvent.waitFor({ state: "attached", timeout: 30_000 });
    const where = await page.locator(".bl-ctrl-where .bl-ctrl-select").first().inputValue({ timeout: 3000 }).catch(() => null);
    // De gira (sept 2026): si hay giras, cada tarjeta marca la parada en BA y
    // tocarla abre la ficha del show porteño.
    const tourCards = await page.locator(".bl-tour-card").count();
    // ¿Los datos traen giras? La misma función que usa el front (lib/tours.js).
    const toursInData = computeTours(await eventsData(), { dateOf: getEventDate, clean: cleanArtists }).length > 0;
    if (toursInData && !tourCards) fail(vp.name, "de gira", "hay artistas de gira en los datos y el bloque no aparece");
    // Fila con desplazamiento que se nota (ScrollRow, oct 2026): si las tarjetas
    // no entran, el borde se desvanece y en desktop está la flecha para avanzar.
    if (tourCards) {
      const sr = await page.locator(".bl-tour .bl-srow").first().evaluate((r) => { const tr = r.querySelector(".bl-srow-track"); return { over: tr.scrollWidth > tr.clientWidth + 4, fade: r.classList.contains("fade-r"), arrow: !!r.querySelector(".bl-srow-arrow.is-next") }; }).catch(() => null);
      if (sr && sr.over && !sr.fade) fail(vp.name, "de gira", "la fila sigue y no se desvanece el borde");
      if (sr && sr.over && !vp.isMobile && !sr.arrow) fail(vp.name, "de gira", "la fila sigue y no hay flecha para avanzar");
    }
    if (tourCards) {
      if (!(await page.locator(".bl-tour-card").first().locator(".bl-tour-stop.is-here").count())) fail(vp.name, "de gira", "la tarjeta no marca la parada en Buenos Aires");
      await page.locator(".bl-tour-card").first().click();
      const tourModal = await page.locator('.bl-modal-overlay[role="dialog"]').waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false);
      if (!tourModal) fail(vp.name, "de gira", "tocar una gira no abre la ficha del show");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
    if (where !== null && where !== "amba") fail(vp.name, "agenda", `la agenda arranca en "${where}" y no en Buenos Aires`);
    const count = await page.locator(".bl-ev-open").count();
    if (count < 10) fail(vp.name, "feed", `solo ${count} eventos en la agenda`);
    await page.waitForTimeout(800);
    await expectNone("feed", lowContrast);
    await expectNone("feed", posterOverflow);
    await expectNone("feed", floatingOverlaps);

    // 3. Abrir un evento con line-up (el caso que se rompió) o el primero
    const withLineup = page.locator(".bl-ev-item:has(.bl-ev-lineup) > .bl-ev-open").first();
    const target = (await withLineup.count()) ? withLineup : firstEvent;
    const inertBefore = await inertCount();
    await target.click();

    const dialog = page.locator('.bl-modal-overlay[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    if (!page.url().includes("/eventos/")) fail(vp.name, "modal", `la URL no pasó a /eventos/… (${page.url()})`);

    // Dar tiempo a que llegue la info de artistas y carguen las fotos.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const title = (await dialog.locator("h2, h1").first().textContent().catch(() => ""))?.trim();
    if (!title) fail(vp.name, "modal", "sin título");

    const box = await dialog.locator(".bl-modal, [class*=bl-em]").first().boundingBox();
    if (box && box.width > vp.viewport.width + 1) fail(vp.name, "modal", `más ancho que la pantalla (${Math.round(box.width)}px)`);

    // Ficha sin scroll (oct 2026, Pablo): tarjeta del headliner y el resto como
    // afiche; nada scrollea ni se corta, y las acciones van en una sola fila.
    if ((await dialog.locator(".bl-em-head").count()) !== 1) fail(vp.name, "line-up", "falta la tarjeta del headliner");
    await page.waitForTimeout(600);
    const fitInfo = await dialog.evaluate((d) => {
      const sc = d.querySelector(".bl-em-scroll"), c = d.querySelector(".bl-em-cartel");
      const scrollers = [...d.querySelectorAll(".bl-event-modal, .bl-event-modal *")].filter((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)).length;
      const cut = (sc && sc.scrollHeight > sc.clientHeight + 1) || (c && c.scrollHeight > c.clientHeight + 1);
      const row = [...d.querySelectorAll(".bl-em-act2 .bl-em-cta, .bl-em-act2 .bl-em-ic")].map((e) => Math.round(e.getBoundingClientRect().top));
      return { scrollers, cut: !!cut, oneRow: row.length === 4 && Math.max(...row) - Math.min(...row) <= 2 };
    });
    if (fitInfo.scrollers) fail(vp.name, "modal", "la ficha tiene scroll: el contenido tiene que adaptarse");
    if (fitInfo.cut) fail(vp.name, "modal", "contenido cortado dentro de la ficha");
    if (!fitInfo.oneRow) fail(vp.name, "modal", "las acciones (Entradas, Guardar, Calendario, Compartir) no van en una sola fila");
    // Botón base (oct 2026, Pablo: "B · Píldora"): Entradas es una píldora de
    // un solo renglón y los íconos, círculos de su misma altura.
    const btn = await dialog.evaluate((d) => {
      const c = d.querySelector(".bl-em-act2 .bl-em-cta"), t = c?.querySelector(".bl-em-cta-t");
      const ics = [...d.querySelectorAll(".bl-em-act2 .bl-em-ic")].map((e) => e.getBoundingClientRect());
      if (!c || !t) return null;
      const r = c.getBoundingClientRect(), rad = parseFloat(getComputedStyle(c).borderTopLeftRadius);
      const lines = Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight || "11"));
      return { pill: rad >= r.height / 2 - 1, oneLine: t.getClientRects().length === 1 && lines <= 1, round: ics.every((b) => Math.abs(b.width - b.height) < 1 && Math.abs(b.height - r.height) < 1) };
    });
    if (!btn) fail(vp.name, "modal", "falta el botón de entradas");
    else {
      if (!btn.pill) fail(vp.name, "modal", "el botón de entradas no es una píldora (botón base)");
      if (!btn.oneLine) fail(vp.name, "modal", "el texto del botón de entradas se parte en dos renglones");
      if (!btn.round) fail(vp.name, "modal", "los íconos de la ficha no son círculos de la altura del botón");
    }

    const broken = await brokenImages(dialog);
    if (broken.length) fail(vp.name, "imágenes", `${broken.length} rotas en el modal: ${broken.join(" | ")}`);

    await checkModalFits(page, vp.name);
    await expectNone("modal", lowContrast);
    await expectNone("modal", posterOverflow);

    // ▶ del line-up: pide un preview fresco (302 al CDN) y queda sonando.
    const playBtn = dialog.locator(".bl-em-play").first();
    if (await playBtn.count()) {
      const previewReq = page.waitForResponse((r) => r.url().includes("/api/preview/"), { timeout: 10_000 }).catch(() => null);
      await playBtn.click();
      const resp = await previewReq;
      if (!resp || ![200, 206, 302].includes(resp.status())) fail(vp.name, "preview", `el ▶ no consigue audio (${resp ? resp.status() : "sin respuesta"})`);
      if (!(await playBtn.evaluate((b) => b.classList.contains("is-on")))) fail(vp.name, "preview", "el ▶ no queda en reproducción");
      await playBtn.click();
    }

    // 3b. El link del modal abre el mismo evento al recargarlo (slugs de front
    // y server iguales; sept 2026: "Geøvhän" generaba un slug que no volvía).
    const modalTitle = (await dialog.locator("h1").first().textContent())?.trim();
    const modalUrl = page.url();
    await page.goto(modalUrl, { waitUntil: "domcontentloaded" });
    await dialog.waitFor({ state: "visible", timeout: 30_000 }).catch(() => fail(vp.name, "deep-link", `recargar ${new URL(modalUrl).pathname} no abre el evento`));
    const reloadedTitle = (await dialog.locator("h1").first().textContent().catch(() => ""))?.trim();
    if (reloadedTitle && reloadedTitle !== modalTitle) fail(vp.name, "deep-link", `recargar abre "${reloadedTitle}" en vez de "${modalTitle}"`);
    await page.waitForTimeout(500);

    await expectNone("modal", brokenLabels);
    // Line-up honesto (oct 2026): nunca "1 artista" (la fuente a veces trae solo
    // el headliner y contradecía al flyer) y la foto del artista nunca es una caja
    // vacía: la inicial se ve también mientras carga.
    const lineupLabel = await page.locator(".bl-em-sec .bl-em-label").first().textContent().catch(() => "");
    if (/·\s*1\s/.test(lineupLabel)) fail(vp.name, "modal", `el line-up dice "${lineupLabel.trim()}"`);
    const hiddenInitial = await page.locator(".bl-em-av-ph").evaluateAll((els) => els.some((e) => { const c = getComputedStyle(e).color; return c === "transparent" || /rgba\([^)]*,\s*0\)/.test(c); }));
    if (hiddenInitial) fail(vp.name, "modal", "la foto del artista es una caja vacía (inicial invisible)");
    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-modal.png` });

    // 4. Cerrar con Escape → vuelve el feed y se libera el scroll
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5_000 }).catch(() => fail(vp.name, "modal", "Escape no lo cierra"));
    const overflow = await page.evaluate(() => document.body.style.overflow);
    if (overflow === "hidden") fail(vp.name, "modal", "al cerrar, el body sigue con scroll bloqueado");
    const inertAfter = await inertCount();
    if (inertAfter !== inertBefore) fail(vp.name, "modal", `al cerrar quedan elementos inert (${inertBefore} → ${inertAfter})`);

    // 4b. Mobile: el FAB se esconde al bajar leyendo (en desktop vive en el header)
    if (vp.isMobile) {
      // Cerrar un evento abierto por link deja la portada (el track): a leer, a la Agenda.
      if (await page.locator(".btk-cue", { hasText: /Agenda|Listings/ }).count()) { await clickCue(page, /Agenda|Listings/); await page.waitForTimeout(500); }
      const scrollPanel = (y) => page.evaluate((y) => [...document.querySelectorAll(".bl-swipe-panel")].find((e) => e.scrollHeight > e.clientHeight + 10)?.scrollTo(0, y), y);
      await scrollPanel(900);
      await page.waitForTimeout(600);
      if (!(await page.evaluate(() => document.querySelector(".bl-util-bar")?.classList.contains("is-hidden"))))
        fail(vp.name, "feed", "la barra flotante no se esconde al scrollear hacia abajo");
      await scrollPanel(0);
    }

    // 5. Feed sin imágenes rotas visibles
    const feedBroken = await brokenImages(page.locator("body"));
    if (feedBroken.length) fail(vp.name, "feed", `${feedBroken.length} imágenes rotas visibles`);

    // 5b. Line-up más largo de la agenda en la pantalla del viewport
    const longest = await page.evaluate(() => fetch("/api/events").then((r) => r.json()).then((d) => {
      const evs = Array.isArray(d) ? d : d.events || [];
      return evs.filter((e) => e.image).sort((a, b) => (b.artists?.length || 0) - (a.artists?.length || 0))[0];
    }));
    if (longest) {
      const idx = await page.locator(".bl-ev-name").evaluateAll((els, name) => els.findIndex((e) => e.textContent.replace(/\u00A0/g, " ") === name), longest.name);
      if (idx >= 0) {
        await page.locator(".bl-ev-open").nth(idx).click();
        await dialog.waitFor({ state: "visible", timeout: 10_000 });
        await page.waitForTimeout(800);
        await checkModalFits(page, `${vp.name} line-up ${longest.artists?.length}`);
        await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-modal-largo.png` });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
      }
    }

    // 5b'. Un evento con un solo nombre en el line-up: no dice "1 artista" (oct 2026).
    const single = await page.evaluate(() => fetch("/api/events").then((r) => r.json()).then((d) => (Array.isArray(d) ? d : d.events || []).find((e) => e.area === "amba" && e.artists?.length === 1)));
    if (single) {
      const idx1 = await page.locator(".bl-ev-name").evaluateAll((els, name) => els.findIndex((e) => e.textContent.replace(/\u00A0/g, " ") === name), single.name);
      if (idx1 >= 0) {
        await page.locator(".bl-ev-open").nth(idx1).click();
        await dialog.waitFor({ state: "visible", timeout: 10_000 });
        const label1 = await page.locator(".bl-em-sec .bl-em-label").first().textContent().catch(() => "");
        if (/·\s*1\s/.test(label1)) fail(vp.name, "modal", `el line-up dice "${label1.trim()}"`);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
      }
    }

    // 5c. Link a un evento que ya no existe: aviso y vuelta a la agenda
    await page.goto(BASE + "/eventos/evento-que-no-existe-1-ene", { waitUntil: "domcontentloaded" });
    const toastOk = await page.locator(".bl-toast.show").waitFor({ state: "visible", timeout: 30_000 }).then(() => true).catch(() => false);
    if (!toastOk) fail(vp.name, "deep-link", "un evento inexistente no muestra aviso");
    if (new URL(page.url()).pathname !== "/") fail(vp.name, "deep-link", `la URL rota queda en la barra (${new URL(page.url()).pathname})`);

    // 5d. Interiores unificados (oct 2026, Pablo): Noticias y Festivales
    // hablan el idioma de la Agenda — número de apertura, filtros de
    // texto, pared de afiches y afiche de la casa cuando no hay imagen.
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    // En el celular la ficha pide dos toques: el primero elige, el segundo entra.
    for (let n = vp.isMobile ? 2 : 1; n > 0; n--) await page.getByRole("button", { name: /^Bass —/ }).first().click().catch(() => {});
    await page.locator(".btk-cue", { hasText: /Noticias|News/ }).first().dispatchEvent("click").catch(() => {});
    await page.locator(".bl-bass-news-item").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    if (await page.locator(".bl-bass-news-item").count()) {
      if (!(await page.locator(".bl-feed-head").count())) fail(vp.name, "noticias", "falta el número de apertura (como en la Agenda)");
      // Una nota sin foto no puede quedar como caja oscura con un rótulo chiquito.
      const tiny = await page.evaluate(() => [...document.querySelectorAll(".bl-bass-news-item .bl-poster")].filter((p) => parseFloat(getComputedStyle(p).fontSize) < 15).length);
      if (tiny) fail(vp.name, "noticias", `${tiny} notas sin foto se ven como cajas vacías (sin afiche de la casa)`);
      // Sin foto: la onda de la nota y su tema (el titular va abajo, como en la Agenda).
      const malas = await page.evaluate(() => [...document.querySelectorAll(".bl-bass-news-item .bl-poster")].filter((p) => !p.querySelector(".bl-onda rect") || !p.textContent.trim()).length);
      if (malas) fail(vp.name, "noticias", `${malas} notas sin foto sin la onda o sin texto en su afiche`);
      // La pared de la Agenda (oct 2026, "A · Pared"): rótulo por día, el medio en la etiqueta de la foto y "tema · cuándo".
      const pared = await page.evaluate(() => {
        const w = document.querySelector(".bl-news-wall"); if (!w) return null;
        const items = [...w.querySelectorAll(".bl-ev-item")];
        return {
          dias: w.querySelectorAll(".bl-day-header").length,
          sinMedio: items.filter((it) => !getComputedStyle(it, "::before").content.replace(/"/g, "").trim()).length,
          sinCuando: items.filter((it) => !/·/.test(it.querySelector(".bl-ev-venue-line")?.textContent || "")).length,
          ingles: [...document.querySelectorAll(".bl-filters .bl-filter-chip")].map((b) => b.textContent).filter((x) => /Scene|Music\b|Tour\b/.test(x)).length,
        };
      });
      if (!pared) fail(vp.name, "noticias", "Noticias no es la pared de la Agenda");
      else {
        if (!pared.dias) fail(vp.name, "noticias", "faltan los rótulos por día");
        if (pared.sinMedio) fail(vp.name, "noticias", `${pared.sinMedio} notas sin el medio en la etiqueta`);
        if (pared.sinCuando) fail(vp.name, "noticias", `${pared.sinCuando} notas sin "tema · cuándo"`);
        if (pared.ingles) fail(vp.name, "noticias", "los temas siguen en inglés");
      }
    }
    await page.locator(".bl-bass-section-btn", { hasText: /^Festivales$|^Festivals$/ }).first().click().catch(() => {});
    await page.locator(".bl-fest-wall").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    {
      const fest = await page.evaluate(() => ({
        heads: [...document.querySelectorAll(".bl-fest-wall .bl-day-header")].map((h) => h.textContent),
        posters: [...document.querySelectorAll(".bl-fest-wall .bl-ev-item .bl-thumb")].filter((t) => t.getBoundingClientRect().height > t.getBoundingClientRect().width).length,
        chips: document.querySelectorAll(".bl-filters.bass-filters .bl-filter-chip").length,
        head: !!document.querySelector(".bl-feed-head"),
      }));
      if (!fest.heads.length) fail(vp.name, "festivales", "sin pared de afiches ni bloques Buenos Aires / mundo");
      else if (fest.heads.length > 1 && !/buenos aires/i.test(fest.heads[0])) fail(vp.name, "festivales", `el primer bloque es "${fest.heads[0]}", no Buenos Aires`);
      if (fest.heads.length && !fest.posters) fail(vp.name, "festivales", "los festivales no van como afiches");
      if (fest.heads.length && (!fest.chips || !fest.head)) fail(vp.name, "festivales", "faltan los filtros de texto o el número de apertura de la Agenda");
      // Ningún nombre cortado en un afiche (oct 2026: "TOMORROWLAND" no entraba).
      const cortados = await page.evaluate(() => [...document.querySelectorAll(".bl-ev-wall .bl-poster-word")].filter((w) => {
        const p = w.closest(".bl-poster"), lim = p.getBoundingClientRect().right - parseFloat(getComputedStyle(p).paddingRight);
        const r = document.createRange(); r.selectNodeContents(w);
        return r.getBoundingClientRect().right > lim + 1;
      }).map((w) => w.textContent));
      if (cortados.length) fail(vp.name, "festivales", `nombres cortados en el afiche: ${cortados.join(", ")}`);
    }

    // 5e. Bass es Agenda · Noticias · Festivales (oct 2026, Pablo sacó Salas:
    // "con la agenda es más que suficiente"). Las pestañas entran en el ancho.
    {
      const tabs = (await page.locator(".bl-bass-section-btn").allTextContents()).map((x) => x.trim());
      if (tabs.some((x) => /^(Salas|Venues)$/.test(x))) fail(vp.name, "secciones", "volvió la pestaña Salas");
      if (tabs.length !== 3) fail(vp.name, "secciones", `Bass tiene ${tabs.length} pestañas (${tabs.join(" · ")}); esperaba Agenda · Noticias · Festivales`);
      const bar = await page.locator(".bl-bass-sections").first().evaluate((b) => b.scrollWidth - b.clientWidth).catch(() => 0);
      if (bar > 1) fail(vp.name, "secciones", `las pestañas no entran: se pasan ${bar}px del ancho`);
      // los pasos que siguen miran la Agenda
      await page.locator(".bl-bass-section-btn", { hasText: /Agenda|Listings/ }).first().click();
    }

    // 5e2. Ciclos fijos de la semana (oct 2026, Pablo: "clásicos de la noche
    // durante la semana"): si hay ciclos curados, la Agenda los muestra en su
    // día como fila punteada, sin fecha inventada, y nunca dos veces el mismo día.
    {
      const ciclos = await page.request.get(BASE + "/api/ciclos").then((r) => r.json()).catch(() => []);
      if (Array.isArray(ciclos) && ciclos.length) {
        await page.locator(".bl-ciclo-en-dia").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
        const filas = await page.evaluate(() => [...document.querySelectorAll(".bl-ciclo-en-dia")].map((f) => {
          let h = f.previousElementSibling; while (h && !h.matches(".bl-day-header")) h = h.previousElementSibling;
          return { dia: h?.dataset.day || "", txt: f.textContent, borde: getComputedStyle(f.querySelector(".bl-ciclo")).borderTopStyle };
        }));
        if (!filas.length) fail(vp.name, "ciclos", "hay ciclos fijos y la Agenda no muestra ninguno en su día");
        else {
          if (!filas.every((f) => /Todos los|Casi todos|Every|Most/.test(f.txt))) fail(vp.name, "ciclos", "una fila de ciclo no dice \"todos los…\" (parece una fecha confirmada)");
          if (!filas.every((f) => f.borde === "dashed")) fail(vp.name, "ciclos", "la fila de ciclo no va punteada: se confunde con un evento");
          const dobles = filas.filter((f, i) => filas.findIndex((g) => g.dia === f.dia && g.txt === f.txt) !== i);
          if (dobles.length) fail(vp.name, "ciclos", "un ciclo aparece dos veces el mismo día");
          // El número de arriba cuenta lo que se ve, ciclos incluidos ("Hoy" un martes decía 0).
          const c = await page.evaluate(() => ({ n: +(document.querySelector(".bl-feed-head-n")?.textContent || -1), visto: document.querySelectorAll(".bl-ev-wall > .bl-ev-item, .bl-ev-wall > .bl-ciclo-en-dia").length }));
          if (c.n !== c.visto) fail(vp.name, "ciclos", `el encabezado dice ${c.n} y la lista muestra ${c.visto}`);
        }
      }
    }

    // 5f. El finde en tu calendario (oct 2026): si el calendario suscribible
    // tiene elegidos, la Agenda los muestra con el botón para suscribirse.
    {
      const ics = await page.request.get(BASE + "/finde.ics").then((r) => r.text()).catch(() => "");
      if ((ics.match(/BEGIN:VEVENT/g) || []).length) {
        await page.locator(".bl-finde").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        const f = await page.evaluate(() => ({ thumbs: document.querySelectorAll(".bl-finde-thumb").length, href: document.querySelector(".bl-finde-btn")?.getAttribute("href") || "", fits: (() => { const r = document.querySelector(".bl-finde-row"); return r ? r.scrollWidth <= r.clientWidth + 1 : false; })() }));
        if (!f.thumbs) fail(vp.name, "finde", "la Agenda no muestra los elegidos del finde");
        else if (!/finde\.ics/.test(decodeURIComponent(f.href))) fail(vp.name, "finde", `el botón no suscribe al calendario (${f.href})`);
        else if (!f.fits) fail(vp.name, "finde", "la franja del finde se pasa del ancho");
      }
    }

    // 5g. La semana (oct 2026): la línea discreta de la Agenda lleva a /semana,
    // que muestra el titular, la noche día por día, el finde y el mercado sin
    // pasarse del ancho; los elegidos sin flyer caen al afiche, nunca vacíos.
    {
      const S = await page.request.get(BASE + "/api/semana").then((r) => r.json()).catch(() => null);
      if (S?.noche?.fiestas) {
        const line = page.locator(".bl-sem-line").first();
        await line.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
        if (!(await line.count())) fail(vp.name, "semana", "la Agenda no muestra la línea de la semana");
        else if ((await line.getAttribute("href")) !== "/semana") fail(vp.name, "semana", "la línea no lleva a /semana");
        await page.goto(BASE + "/semana", { waitUntil: "domcontentloaded" });
        await page.locator(".bl-sem-h1").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(800);
        const w = await page.evaluate(() => ({
          h1: document.querySelector(".bl-sem-h1")?.textContent || "",
          dias: document.querySelectorAll(".bl-sem-dia").length,
          picks: document.querySelectorAll(".bl-sem-pick").length,
          vacios: [...document.querySelectorAll(".bl-sem-flyer")].filter((f) => !f.querySelector("img, .bl-poster, .bl-artist-photo")).length,
          acts: document.querySelectorAll(".bl-sem-act").length,
          ancho: document.documentElement.scrollWidth <= window.innerWidth + 1,
        }));
        if (!new RegExp(String(S.noche.fiestas)).test(w.h1)) fail(vp.name, "semana", `el titular no cuenta las fiestas (${w.h1})`);
        else if (w.dias !== S.noche.porDia.length) fail(vp.name, "semana", `${w.dias} días en la página, ${S.noche.porDia.length} en la API`);
        else if (w.picks !== S.noche.finde.length) fail(vp.name, "semana", `${w.picks} elegidos del finde de ${S.noche.finde.length}`);
        else if (w.vacios) fail(vp.name, "semana", `${w.vacios} elegidos sin flyer ni afiche`);
        else if (!w.acts) fail(vp.name, "semana", "el mercado no muestra los activos");
        else if (!w.ancho) fail(vp.name, "semana", "la página se pasa del ancho");
        await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-semana.png`, fullPage: true });
      }
    }

    // 6. Mundo Layer carga
    await page.goto(BASE + "/?view=layer", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    if (!page.url().endsWith("/layer")) fail(vp.name, "layer", `no quedó en /layer (${page.url()})`);
    await expectNone("layer", brokenLabels);
    // El cursor de "Layer█" es un bloque a la altura de las letras, no un guión suelto (oct 2026).
    const cur = await page.evaluate(() => { const c = document.querySelector(".bl-header-half-layer.is-active .bl-tab-cursor"), n = c?.closest(".bl-header-world-name"); return c && n ? c.getBoundingClientRect().height / parseFloat(getComputedStyle(n).fontSize) : null; });
    if (cur == null || cur < 0.5) fail(vp.name, "header", `el cursor de Layer se lee como un guión (alto ${cur?.toFixed(2)} letra)`);
    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-layer.png` });
    await expectNone("layer", lowContrast);
    if (vp.viewport.height >= 800) {
      await page.locator(".blc svg").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => fail(vp.name, "portada", "la curva de Layer no se dibuja"));
      const extra = await page.evaluate(() => { const el = document.querySelectorAll(".bl-swipe-panel")[1]; return el ? el.scrollHeight - el.clientHeight : 0; });
      if (extra > 2) fail(vp.name, "portada", `la portada de Layer tiene ${extra}px de más debajo de la curva`);
    }

    // 6b. Portada de Layer = la curva (sept 2026): 8 secciones en la curva, que
    // es el único índice (sin franja ni lista debajo). Desktop: cápsulas que no
    // se pisan. Mobile: curva vertical con solo títulos y franjas tocables.
    // Entrar a Ciclos (click o toque entra directo) y volver a la curva.
    const pill = (re) => page.locator(".blc-node").filter({ hasText: re }).first().locator(".blc-rail-hit, .blc-hit");
    const nodes = await page.locator(".blc-node").count();
    const dup = await page.locator(".blc-strip, .blc-it").count();
    if (nodes !== 8 || dup) fail(vp.name, "layer", `la curva tiene ${nodes} puntos y ${dup} accesos repetidos debajo (esperaba 8 y 0)`);
    else {
      const box = await page.locator(".blc-stage").boundingBox();
      if (!box || box.x < 0 || box.x + box.width > vp.viewport.width + 1) fail(vp.name, "layer", "la curva se sale de la pantalla");
      // Un solo hover en la curva: el de las secciones. Pasar por la curva no
      // muestra cruz ni precio del mes (sept 2026).
      if (vp.viewport.width > 768) {
        const sb = await page.locator(".blc-stage").boundingBox();
        await page.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height * 0.6);
        await page.mouse.move(sb.x + sb.width * 0.32, sb.y + sb.height * 0.62);
        await page.waitForTimeout(250);
        if (await page.locator(".blc-tip, .blc-xh").count()) fail(vp.name, "layer", "pasar por la curva vuelve a mostrar el precio del mes");
        await page.mouse.move(2, 2);
      }
      // ¿Para dónde va? (sept 2026): el futuro son caminos simulados, no una línea.
      // Orden de uso (oct 2026): Noticias primero. Todas las secciones viven en
      // el pasado de la curva y hoy queda libre — late solo y de ahí se abre el
      // abanico, sin ramas ni puntos de sección encima.
      const first = await page.locator(".blc-node").first().locator(".blc-rn, .blc-ttl").textContent().catch(() => "");
      if (!/Noticias|News/.test(first)) fail(vp.name, "layer", `la primera sección es "${first}", no Noticias`);
      const nowBox = await page.locator(".blc-now .blc-dot").boundingBox().catch(() => null);
      const dots = await page.locator(".blc-node .blc-dot").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map(({ x, y, width: w, height: h }) => ({ x: x + w / 2, y: y + h / 2 })));
      const past = vp.viewport.width > 768 ? (p) => p.x < nowBox.x - 10 : (p) => p.y > nowBox.y + nowBox.height + 10;
      if (!nowBox || !dots.every(past)) fail(vp.name, "layer", "hay secciones sobre hoy o adentro del abanico");
      const walks = await page.locator(".blc-fan .blc-walk").count();
      if (walks < 20) fail(vp.name, "layer", `el futuro tiene ${walks} caminos simulados (esperaba ≥20)`);
      if (await page.locator(".blc-proj").count()) fail(vp.name, "layer", "volvió la línea punteada del futuro");
      const pills = await page.locator(".blc-rn").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map(({ x, y, width: w, height: h }) => ({ x, y, w, h })));
      const clash = pills.some((a, i) => pills.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
      if (clash) fail(vp.name, "layer", "hay títulos del riel pisados entre sí");
      if (pills.some((r) => r.x < 0 || r.x + r.w > vp.viewport.width + 1)) fail(vp.name, "layer", "un título del riel se sale de la pantalla");
      if (vp.viewport.width > 768 && (await page.locator(".blc-branch").count()) !== 8) fail(vp.name, "layer", "desktop: faltan haces entre la curva y los nombres");
      // Haz (oct 2026, Pablo): cada sección se une a su nombre con UNA línea
      // recta (vertical en desktop, horizontal en mobile) que nace en su punto,
      // llega al borde de su nombre y es luz en degradado, no un trazo plano.
      const beams = await page.locator(".blc-node").evaluateAll((gs) => gs.filter((g) => {
        const b = g.querySelector(".blc-branch"), d = g.querySelector(".blc-dot").getBoundingClientRect(), t = g.querySelector(".blc-rn, .blc-ttl").getBoundingClientRect();
        if (!b || !/^M[\d.,-]+[HV][\d.-]+$/.test(b.getAttribute("d"))) return true;
        const m = b.getScreenCTM(), a = b.getPointAtLength(0), z = b.getPointAtLength(b.getTotalLength());
        const A = new DOMPoint(a.x, a.y).matrixTransform(m), Z = new DOMPoint(z.x, z.y).matrixTransform(m);
        const fromDot = Math.hypot(A.x - (d.left + d.right) / 2, A.y - (d.top + d.bottom) / 2) < 10;
        const toTitle = Z.x >= t.left - 14 && Z.x <= t.right + 14 && Z.y >= t.top - 14 && Z.y <= t.bottom + 14;
        return !fromDot || !toTitle || !getComputedStyle(b).stroke.startsWith("url(");
      }).length);
      if (beams) fail(vp.name, "layer", `${beams} secciones sin haz recto de su punto a su nombre`);
      if (vp.viewport.width <= 768) {
        const hits = await page.locator(".blc-hit").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        const extra = await page.locator(".blc-node .blc-vl, .blc-node .blc-pill").count();
        if (hits.length !== 8 || hits.some((h) => h < 44)) fail(vp.name, "layer", `mobile: ${hits.length} franjas tocables (esperaba 8 de ≥44px)`);
        if (extra) fail(vp.name, "layer", "mobile: las secciones de la curva muestran algo más que su título");
        // Botánico (oct 2026): los nombres se alternan a los dos lados del tronco
        // y las 8 entran en la primera pantalla.
        const sides = await page.locator(".blc-v .blc-node").evaluateAll((gs) => gs.map((g) => g.querySelector(".blc-ttl").getBoundingClientRect().left < g.querySelector(".blc-dot").getBoundingClientRect().left));
        if (!sides.some(Boolean) || sides.every(Boolean) || sides.some((l, i) => i && l === sides[i - 1])) fail(vp.name, "layer", "mobile: los nombres no se alternan a los dos lados del tronco");
        // G+: el tronco no flota — bajo 2012 sigue hasta el pie de la curva.
        const foot = await page.locator(".blc-v .blc-curve").evaluate((c) => { const L = c.getTotalLength(), a = c.getPointAtLength(0), z = c.getPointAtLength(L); return Math.max(a.y, z.y) - Number(c.ownerSVGElement.viewBox.baseVal.height); });
        if (foot < -2) fail(vp.name, "layer", `mobile: el tronco termina ${Math.round(-foot)}px antes del pie (flota)`);
        const below = await page.locator(".blc-v .blc-ttl").evaluateAll((ts) => ts.filter((t) => t.getBoundingClientRect().bottom > innerHeight).length);
        if (below) fail(vp.name, "layer", `mobile: ${below} secciones fuera de la primera pantalla`);
        // Los caminos son aleatorios y se renuevan: el ancho varía de un momento
        // a otro. Se toma el mayor de hasta ocho (≈5 s; con tres frenó un push por
        // azar, oct 2026). Con el Botánico (oct 2026) la copa sale del tronco al
        // centro, de ancho fijo (no crece con la pantalla): con menos de 100 px
        // se perdió la lupa.
        let fanW = 0;
        for (let k = 0; k < 8; k++) { fanW = Math.max(fanW, await page.locator(".blc-v .blc-fan").evaluate((g) => g.getBoundingClientRect().width).catch(() => 0)); if (fanW >= 100) break; await page.waitForTimeout(700); }
        if (fanW < 100) fail(vp.name, "layer", `mobile: el abanico ocupa ${Math.round(fanW)}px (esperaba ≥100px)`);
      }
      // El futuro como lupa (30-sep): el abanico ocupa ≥17 % del ancho y la
      // curva va sin rótulos de hitos (HALVING, FONDO, PICO viven en Hitos).
      if (vp.viewport.width > 768) {
        const fanD = await page.locator(".blc-fan").first().evaluate((g) => g.getBoundingClientRect().width).catch(() => 0);
        if (fanD < vp.viewport.width * 0.17) fail(vp.name, "layer", `desktop: el abanico ocupa ${Math.round(fanD)}px (esperaba ≥17% del ancho)`);
        if (await page.locator(".blc-ms").count()) fail(vp.name, "layer", "desktop: volvieron los rótulos de hitos sobre la curva");
      }
      // Chequeo de diseño (30-sep, Pablo: estándar premium). Una fila de
      // píxeles del fondo del gráfico, cerca del eje: un salto brusco entre
      // vecinos es una costura o un borde duro (franja del futuro, relleno que
      // arranca de golpe). Y sin rótulo de escala (oct 2026, Pablo: ruido).
      if (vp.viewport.width > 768) {
        await page.mouse.move(2, 2);
        const row = await page.locator(".blc-stage svg").first().evaluate((svg) => {
          svg.scrollIntoView({ block: "end" });                 // Layer scrollea en un contenedor propio
          const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = r.width / vb.width;
          return { x0: r.left + 90 * k, x1: r.right - 90 * k, y: Math.min(innerHeight - 2, r.top + (vb.height - 66) * k) };
        });
        const jump = await seamJump(page, { x: row.x0, y: row.y, width: row.x1 - row.x0, height: 1 }, 8);
        if (jump > 2.2) fail(vp.name, "diseño", `costura en el fondo del gráfico (salto de ${jump.toFixed(1)} niveles entre vecinos)`);
      }
      if (await page.locator(".blc-stage").first().getByText(/escala ×|scale ×/).count()) fail(vp.name, "diseño", "volvió el rótulo de escala del abanico");
      // Impulsos también en desktop (más espaciados; con el mouse fuera de la curva).
      if (vp.viewport.width > 768) {
        await page.mouse.move(2, 2);
        const litD = await page.waitForSelector(".blc-node.is-lit", { timeout: 14000 }).then(() => true).catch(() => false);
        if (!litD) fail(vp.name, "layer", "desktop: la curva no enciende ningún título");
      }
      // Ficha ADENTRO de la curva (desktop, oct 2026): al pasar por una sección
      // se abre en el hueco entre la línea y el eje, sin caja, con el interior
      // de la curva iluminado — en todas las alturas de desktop (compacta o
      // mínima si el hueco es bajo), nunca flotando encima de la curva.
      if (vp.viewport.width > 768) {
        await pill(/ETFs/).hover();
        await page.waitForTimeout(400);
        const dockBox = await page.locator(".blc-pv.is-dock").boundingBox().catch(() => null);
        const dotBox = await page.locator(".blc-node").filter({ hasText: /ETFs/ }).first().locator(".blc-dot").boundingBox().catch(() => null);
        if (!dockBox || !dotBox || dockBox.y < dotBox.y + dotBox.height) fail(vp.name, "layer", "desktop: la ficha de la sección no se abre adentro de la curva");
        const boxed = await page.locator(".blc-pv.is-dock .pv-in").evaluate((el) => { const s = getComputedStyle(el); return parseFloat(s.borderTopWidth) > 0 || s.backgroundColor !== "rgba(0, 0, 0, 0)"; }).catch(() => true);
        if (boxed) fail(vp.name, "layer", "desktop: la ficha volvió a ser una caja (borde o fondo propio)");
        // El nombre ya se enciende en su bandera (oct 2026): la ficha no lo repite.
        if (await page.locator(".blc-pv.is-dock :is(h3, .big)").count()) fail(vp.name, "layer", "desktop: la ficha repite el nombre o el dato de la bandera");
        // La descripción entra entera: nada de cortes a mitad de palabra.
        if (await page.locator(".blc-pv.is-dock .desc:visible").evaluate((el) => el.scrollHeight > el.clientHeight + 1).catch(() => false)) fail(vp.name, "layer", "desktop: la descripción de la ficha queda cortada");
        if (!(await page.locator(".blc-inner").count())) fail(vp.name, "layer", "desktop: no se ilumina el interior de la curva que aloja la ficha");
        // La luz bajo la ficha se funde (oct 2026): una columna de píxeles desde
        // la ficha hasta el eje no puede tener saltos — ni bandas ni líneas de grilla.
        const pvBox = await page.locator(".blc-pv.is-dock").boundingBox().catch(() => null);
        const axisY = await page.locator(".blc-grid text").last().boundingBox().then((b) => b.y - 12).catch(() => null);
        if (pvBox && axisY && axisY - (pvBox.y + pvBox.height) > 30) {
          const colX = Math.round(pvBox.x + pvBox.width * 0.3), y0 = Math.round(pvBox.y + pvBox.height + 6);
          const jump = await seamJump(page, { x: colX, y: y0, width: 1, height: Math.round(axisY - y0) });
          // Un degradé suave en 8 bits da escalones de 1–3 niveles; una línea o un borde, 6+.
          if (jump > 4) fail(vp.name, "diseño", `la luz bajo la ficha no se funde (salto de ${jump.toFixed(1)} niveles)`);
        }
        // Lupa (oct 2026): con una sección elegida se enciende en la curva el
        // tramo que su rama amplía y todo lo demás (curva, otras ramas) se retira.
        const lupa = await page.evaluate(() => {
          const on = document.querySelector(".blc-node.is-on"), off = document.querySelector(".blc-node:not(.is-on)");
          const op = (el) => (el ? +getComputedStyle(el).opacity : 1);
          return { seg: on?.querySelector(".blc-seg") ? +getComputedStyle(on.querySelector(".blc-seg")).opacity : 0, curve: op(document.querySelector(".blc-curve")), other: op(off), fan: op(document.querySelector(".blc-fan")),
            // Un solo trazo de luz: la rama encendida usa la luz del tramo, y el tramo se funde (gradiente, no color plano).
            branch: on ? getComputedStyle(on.querySelector(".blc-branch")).stroke : "", segPaint: on?.querySelector(".blc-seg")?.getAttribute("stroke") || "" };
        }).catch((e) => ({ error: String(e) }));
        if (lupa.error || lupa.seg < 0.5 || lupa.curve > 0.6 || lupa.other > 0.6 || lupa.fan < 0.5 || lupa.branch !== "rgb(233, 251, 255)" || !lupa.segPaint.startsWith("url(")) fail(vp.name, "layer", `desktop: la lupa no enfoca la sección (${JSON.stringify(lupa)})`);
        const go = await page.locator(".blc-pv.is-dock .go").boundingBox().catch(() => null);
        if (!go || go.y + go.height > vp.viewport.height) fail(vp.name, "layer", "desktop: el botón Entrar de la ficha queda fuera de pantalla");
        await page.mouse.move(5, 5);
        await page.waitForTimeout(400);
      }
      // Impulsos (mobile, 30-sep): cada tanto una rama se enciende hasta su título.
      if (vp.viewport.width <= 768) {
        const lit = await page.waitForSelector(".blc-v .blc-node.is-lit", { timeout: 9000 }).then(() => true).catch(() => false);
        if (!lit) fail(vp.name, "layer", "mobile: la curva no enciende ningún título");
      }
      await pill(/Ciclos|Cycles/).click();   // entra directo (desktop y mobile)
      // Mobile: el toque se ve viajar por la rama antes de entrar (la lupa se enciende).
      if (vp.viewport.width <= 768 && !(await page.locator(".blc-stage.has-sel .blc-node.is-on").count())) fail(vp.name, "layer", "mobile: tocar una sección entra en seco, sin encender su rama");
      await page.waitForTimeout(700);
      const active = await page.locator(".bl-layer-tab.active").textContent().catch(() => "");
      if (!/ciclos|cycles/i.test(active || "")) fail(vp.name, "layer", `entrar a Ciclos abre "${active}"`);
      // Pestañas con presencia (30-sep): letra de los títulos, ≥15 px, y la
      // activa con el punto de la curva, visible en la fila.
      const tab = await page.locator(".bl-layer-tab.active").evaluate((el) => {
        const cs = getComputedStyle(el), nav = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect();
        return { fs: parseFloat(cs.fontSize), mono: /mono/i.test(cs.fontFamily), dot: getComputedStyle(el, "::before").content !== "none", inView: r.left >= nav.left - 1 && r.right <= nav.right + 1 };
      }).catch(() => null);
      if (!tab || tab.fs < 15 || tab.mono || !tab.dot) fail(vp.name, "layer", `pestañas: ${JSON.stringify(tab)} (esperaba sans ≥15px con el punto de la curva)`);
      else if (!tab.inView) fail(vp.name, "layer", "la pestaña activa queda fuera de la vista");
      // Dentro de una sección (sept 2026): "Volver" a la vista y sin taparse
      // con el ticker; pestañas en todas las pantallas.
      const backFree = await page.locator(".bl-layer-back").evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + 8, r.top + r.height / 2)); }).catch(() => false);
      if (!backFree) fail(vp.name, "layer", "\"Volver a la curva\" queda tapado al entrar a una sección");
      if (!(await page.locator(".bl-layer-tabs").isVisible())) fail(vp.name, "layer", "no se ven las pestañas de sección");
      const strayTop = await page.evaluate(() => { const back = document.querySelector(".bl-layer-back"); return [...document.querySelectorAll(".bl-terminal-header, .bl-dolar")].some((e) => e.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING); });
      if (strayTop) fail(vp.name, "layer", "volvió el terminal/dólar suelto arriba de la sección");
      // Interiores "B · Filas" (oct 2026): las pestañas en el orden de la curva,
      // sin la barra "Día rojo" ni el disfraz de terminal, y cada sección con el
      // idioma de la Agenda: apertura con el número, rótulos con filete, pie.
      const curva = ["Noticias", "Finanzas", "Acciones", "ETFs", "Ciclos BTC", "Predicciones", "Eventos", "Hitos"];
      const pest = (await page.locator(".bl-layer-tab").allTextContents()).map((x) => x.trim());
      if (pest.join("|") !== curva.join("|")) fail(vp.name, "layer", `pestañas fuera del orden de la curva: ${pest.join(", ")}`);
      await page.waitForTimeout(800);
      if (await page.locator(".bl-mpulse, .bl-terminal-header").count()) fail(vp.name, "layer", "volvió la barra \"Día rojo\" o el disfraz de terminal");
      for (const sec of curva) {
        await page.locator(".bl-layer-tab", { hasText: sec }).first().click();
        await page.locator(".bl-feed-head").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
        const r = await page.evaluate(() => {
          const caja = (el) => { const s = getComputedStyle(el); return parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderRadius) > 0; };
          return {
            apertura: !!document.querySelector(".bl-layer-main .bl-feed-head"),
            chips: [...document.querySelectorAll(".bl-layer-main .bl-filter-chip")].filter(caja).length,
            cajas: [...document.querySelectorAll(".bl-layer-main .bl-lnota, .bl-layer-main .bl-cot, .bl-layer-main .bl-pm, .bl-layer-main .bl-cyc")].filter(caja).length,
            chicos: [...document.querySelectorAll(".bl-layer-main *")].filter((el) => el.childElementCount === 0 && el.textContent.trim() && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 11).map((el) => el.textContent.trim().slice(0, 20)),
          };
        });
        if (!r.apertura) fail(vp.name, "layer", `${sec}: sin la apertura con el número`);
        if (r.chips || r.cajas) fail(vp.name, "layer", `${sec}: ${r.chips} filtros con caja y ${r.cajas} filas con caja (tienen que ser texto y filas)`);
        if (r.chicos.length) fail(vp.name, "layer", `${sec}: texto por debajo de 11 px (${[...new Set(r.chicos)].slice(0, 4).join(", ")})`);
      }
      // Números a la argentina (oct 2026): "US$ 1.846,20" y "+0,41%", no "$1,846.20".
      await page.locator(".bl-layer-tab", { hasText: "Acciones" }).first().click();
      await page.locator(".bl-cot-price").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      const precios = await page.locator(".bl-cot-price, .bl-cot-chg").allTextContents();
      const mal = precios.filter((x) => !/^(US\$ [\d.]+,\d{2}|[+−]\d+,\d{2}%)$/.test(x.trim()));
      if (!precios.length || mal.length) fail(vp.name, "layer", `cotizaciones fuera del formato argentino: ${mal.slice(0, 3).join(" / ") || "no hay"}`);
      await page.locator(".bl-layer-tab", { hasText: "Ciclos BTC" }).first().click();
      await page.waitForTimeout(400);
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(500);
      if ((await page.locator(".blc-node").count()) !== 8) fail(vp.name, "layer", "\"Volver a la curva\" no vuelve a la portada");
      // Historia: los hechos verificados en la curva y en la lista, sincronizados.
      await pill(/Hitos|Milestones/).click();
      await page.locator(".blh-ev").first().waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
      const evs = await page.locator(".blh-ev").count(), rows = await page.locator(".blh-list li").count();
      if (!(await page.locator(".bl-timeline-toggle, .bl-timeline").count())) fail(vp.name, "historia", "Cripto BA Timeline no está en Historia");
      if (evs < 20 || evs !== rows) fail(vp.name, "historia", `${evs} hechos en la curva y ${rows} en la lista`);
      else {
        await page.locator(".blh-list button").nth(3).click();
        if (!(await page.locator(".blh-card").isVisible().catch(() => false))) fail(vp.name, "historia", "tocar un hecho no muestra su tarjeta");
      }
      // Eventos cripto: primero lo de Buenos Aires, después las conferencias del mundo.
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(500);
      await pill(/Eventos|Events/).click();
      await page.locator(".bl-cirl-lista .bl-day-label").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      const cirlHeads = await page.locator(".bl-cirl-lista .bl-day-label").allTextContents();
      if (!cirlHeads.length && (await page.locator(".bl-cirl-fila").count())) fail(vp.name, "eventos cripto", "sin bloques Buenos Aires / mundo");
      if (cirlHeads.length > 1 && !/buenos aires/i.test(cirlHeads[0])) fail(vp.name, "eventos cripto", `el primer bloque es "${cirlHeads[0]}", no Buenos Aires`);
      // ETFs y Acciones agrupados por lo que son (sept 2026): varios grupos con
      // título y qué los junta; en Acciones está "Cripto en Wall Street".
      for (const [sec, re, must] of [["etfs", /ETFs/, null], ["acciones", /Acciones|Stocks/, /Cripto en Wall Street|Crypto on Wall Street/]]) {
        await page.locator(".bl-layer-back").click();
        await page.waitForTimeout(400);
        await pill(re).click();
        await page.locator(".bl-cot-group .bl-day-label").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        const heads = await page.locator(".bl-cot-group .bl-day-label").allTextContents();
        const subs = await page.locator(".bl-cot-group .bl-day-date").count();
        if (heads.length < 3 || subs !== heads.length) fail(vp.name, sec, `${heads.length} grupos con ${subs} descripciones (esperaba ≥3, todos descriptos)`);
        if (must && !heads.some((h) => must.test(h))) fail(vp.name, sec, `falta el grupo ${must}`);
      }
      // Predicciones por tema (sept 2026): grupos con título, cada mercado con
      // resultados; el pie avisa que los títulos son traducción automática.
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(400);
      await pill(/Predicciones|Predictions/).click();
      await page.locator(".bl-pm").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      const pHeads = await page.locator(".bl-pm-group .bl-day-label").count();
      const pCards = await page.locator(".bl-pm").count();
      const pRows = await page.locator(".bl-pm .bl-pm-out li").count();
      if (pHeads < 2 || pCards < 4 || pRows < pCards) fail(vp.name, "predicciones", `${pHeads} temas, ${pCards} mercados, ${pRows} resultados (esperaba ≥2 temas y resultados en cada mercado)`);
      // Etiquetas de resultado en castellano (oct 2026: "Decrease", "Below 4.7%", "1.9 to 2,1 %").
      const outs = await page.locator(".bl-pm-l").allTextContents();
      const ingles = outs.filter((x) => /\b(to|below|above|decrease|increase|no change)\b|\d\.\d{1,2}(?!\d)/i.test(x));
      if (ingles.length) fail(vp.name, "predicciones", `resultados sin pasar al castellano: ${ingles.slice(0, 3).join(" / ")}`);
      // Finanzas: temas por contenido, con etiquetas traducidas (no "ECONOMY").
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(400);
      await pill(/Finanzas|Finance/).click();
      await page.locator(".bl-lnota").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      const fTags = await page.locator(".bl-lnota-tag").allTextContents();
      const crudas = fTags.filter((x) => /^(markets|economy|companies|crypto|global|wallstreet|world)$/i.test(x.trim()));
      if (crudas.length) fail(vp.name, "finanzas", `etiquetas sin traducir: ${[...new Set(crudas)].join(", ")}`);
      if (!(await page.locator(".layer-filters", { hasText: /Wall Street y la Fed|Wall Street & the Fed/ }).count())) fail(vp.name, "finanzas", "falta el filtro Wall Street y la Fed");
      // Una nota de Finanzas abre la misma hoja que las de Noticias (antes se iba al medio).
      await page.locator(".bl-lnota").first().click();
      if (!(await page.locator(".bl-news-modal").isVisible().catch(() => false))) fail(vp.name, "finanzas", "la nota no abre su hoja");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(400);
    }

    // 7. Modo día: el mismo contraste con la paleta clara (Layer y agenda)
    await page.evaluate(() => document.querySelector(".bl-mode-toggle")?.click());
    await page.waitForTimeout(900);
    if (!(await page.evaluate(() => !!document.querySelector(".bl-root.day-mode")))) fail(vp.name, "día", "el toggle no activa el modo día");
    await expectNone("layer día", lowContrast);
    await page.goto(BASE + "/eventos/genero/techno", { waitUntil: "domcontentloaded" });
    await page.locator(".bl-ev-open").first().waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForTimeout(800);
    await expectNone("agenda día", lowContrast);
    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-dia.png` });
  } catch (e) {
    fail(vp.name, "flujo", e.message.split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").slice(0, 220));
    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

// App instalable (oct 2026): íconos de la ficha a sangre, manifest completo, zona
// segura de iPhone, página sin conexión y la invitación (una línea, una vez).
async function runApp() {
  const F = (step, detail) => fail("app", step, detail);
  const get = (u) => fetch(BASE + u).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null)).catch(() => null);
  const man = await fetch(BASE + "/manifest.json").then((r) => r.json()).catch(() => null);
  if (!man) return F("manifest", "no carga /manifest.json");
  if (man.orientation) F("manifest", `orientation "${man.orientation}" traba la app en desktop y tablet`);
  const icon = (size, purpose) => man.icons?.find((i) => i.sizes === `${size}x${size}` && (i.purpose || "any").split(" ").includes(purpose));
  for (const [size, purpose] of [[192, "any"], [512, "any"], [512, "maskable"]]) if (!icon(size, purpose)) F("manifest", `falta el ícono ${purpose} de ${size}`);
  // Las secciones con dirección tienen su título y canonical para Google y al
  // compartir (oct 2026). El prerender existe solo en producción: Vite no lo sirve.
  if (!/localhost|127\.0\.0\.1/.test(BASE)) {
    for (const p of ["agenda", "noticias", "festivales"]) {
      const html = await fetch(`${BASE}/${p}?v=${Date.now()}`).then((r) => r.text()).catch(() => "");
      if (!html.includes(`<link rel="canonical" href="https://basslayer.io/${p}"`)) F("secciones", `/${p} no tiene su canonical (se ve la vista previa del home)`);
    }
  }
  if (icon(512, "any")?.src === icon(512, "maskable")?.src) F("manifest", "el maskable reusa el ícono común (Android lo recorta)");
  for (const it of [...(man.icons || []), ...(man.screenshots || []), ...(man.shortcuts || []).flatMap((s) => s.icons || [])]) {
    const buf = await get(it.src);
    if (!buf) { F("manifest", `no carga ${it.src}`); continue; }
    if (it.type === "image/png") {
      const m = await sharp(buf).metadata();
      if (`${m.width}x${m.height}` !== it.sizes) F("manifest", `${it.src} mide ${m.width}x${m.height} y el manifest dice ${it.sizes}`);
    }
  }
  // iOS pinta de negro lo transparente: el ícono va a sangre y opaco.
  const apple = await get("/apple-touch-icon.png");
  if (!apple) F("ícono", "no carga /apple-touch-icon.png");
  else {
    const { data, info } = await sharp(apple).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 180) F("ícono", `apple-touch-icon mide ${info.width} px (esperaba 180)`);
    if (data[3] < 255) F("ícono", "apple-touch-icon tiene las esquinas transparentes");
  }
  const html = (await get("/"))?.toString() || "";
  if (!/viewport-fit=cover/.test(html)) F("iPhone", "sin viewport-fit=cover el contenido de la app instalada queda debajo del reloj");
  if (!(await get("/offline.html"))) F("sin conexión", "no carga /offline.html");
  // Métricas sin datos personales (oct 2026): solo valores de una lista cerrada.
  // Se prueba el rechazo, nunca un valor válido (contra prod ensuciaría los números).
  const metrica = await fetch(BASE + "/api/m", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ e: "cualquiera", p: "ios", m: "web" }) }).then((r) => r.status).catch(() => 0);
  if (metrica !== 400) F("métricas", `/api/m acepta un evento fuera de la lista o no existe (HTTP ${metrica})`);
  const sw = (await get("/sw.js"))?.toString() || "";
  if (!/offline\.html/.test(sw)) F("sin conexión", "el service worker no cae a la página sin conexión");
  if (!/no-store\|private/.test(sw)) F("sin conexión", "el service worker no guarda la API pública para usarla sin red (o guarda la privada)");
  // Una dirección que no existe es 404 con noindex (no una copia del home). Solo en producción: Vite no tiene el prerender.
  if (!/localhost|127\.0\.0\.1/.test(BASE)) {
    const r404 = await fetch(`${BASE}/esto-no-existe-${Date.now()}`).catch(() => null);
    const h404 = r404 ? await r404.text() : "";
    if (!r404 || r404.status !== 404 || !/noindex/.test(h404)) F("404", `una dirección inexistente devuelve ${r404?.status ?? "?"}${/noindex/.test(h404) ? "" : " sin noindex"}`);
  }

  const browser = await chromium.launch();
  const ctx = async (o) => { const c = await browser.newContext(o); const pg = await c.newPage(); pg.on("pageerror", (e) => F("js", e.message)); return [c, pg]; };
  const falso = "window.__bip = () => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); dispatchEvent(e); };";
  try {
    // Android, segunda visita y un rato adentro de un mundo: aparece; la ✕ la cierra para siempre.
    let [c, pg] = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await pg.clock.install();
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1'); localStorage.setItem('bl-visitas','1');" + falso);
    await pg.goto(BASE + "/eventos/este-finde", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(1500); await pg.evaluate(() => window.__bip());
    await pg.clock.fastForward(16_000); await pg.waitForTimeout(500);
    const linea = pg.locator(".bl-app-line");
    if (!(await linea.isVisible().catch(() => false))) F("invitación", "en la segunda visita no aparece la línea para instalar");
    else {
      await pg.screenshot({ path: `${SHOTS}/smoke-app-invitacion.png` });
      await pg.locator(".bl-app-x").click();
      await pg.reload({ waitUntil: "domcontentloaded" }); await pg.waitForTimeout(1500); await pg.evaluate(() => window.__bip());
      await pg.clock.fastForward(16_000); await pg.waitForTimeout(500);
      if (await linea.count()) F("invitación", "después de la ✕ la invitación vuelve a aparecer");
    }
    await c.close();
    // Primera visita: no se invita.
    [c, pg] = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await pg.clock.install();
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');" + falso);
    await pg.goto(BASE + "/eventos/este-finde", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(1500); await pg.evaluate(() => window.__bip());
    await pg.clock.fastForward(16_000); await pg.waitForTimeout(500);
    if (await pg.locator(".bl-app-line").count()) F("invitación", "aparece en la primera visita");
    await c.close();
    // Adentro de la app instalada: ni invitación, ni entrada en el menú, ni bienvenida repetida.
    [c, pg] = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await pg.addInitScript("const mm = matchMedia.bind(window); window.matchMedia = (q) => /display-mode:\\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q);" + falso);
    await pg.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(4000); await pg.evaluate(() => window.__bip());
    if (await pg.locator(".bl-welcome-line").count()) F("app instalada", "repite la bienvenida (en iPhone no comparte lo guardado en Safari)");
    if (await pg.locator(".bl-util-app").count()) F("app instalada", "ofrece instalar la app estando adentro de la app");
    await c.close();
    // Las secciones de Bass tienen dirección (oct 2026): /noticias, /festivales,
    // /agenda; se puede entrar directo, recargar y el atrás vuelve a la portada.
    [c, pg] = await ctx({ viewport: { width: 1440, height: 900 } });
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');");
    const activa = () => pg.evaluate(() => document.querySelector(".bl-bass-section-btn.active")?.textContent?.trim() || (document.querySelector(".bl-btrack") ? "portada" : ""));
    const ruta = () => new URL(pg.url()).pathname;
    await pg.goto(BASE + "/noticias", { waitUntil: "domcontentloaded" });
    await pg.locator(".bl-bass-section-btn.active").first().waitFor({ timeout: 20_000 }).catch(() => {});
    if (!/Noticias|News/.test(await activa())) F("secciones", `entrar a /noticias no abre Noticias (${await activa()})`);
    await pg.locator(".bl-bass-section-btn", { hasText: /^Agenda$|^Listings$/ }).first().click().catch(() => {});
    await pg.waitForURL("**/agenda", { timeout: 5000 }).catch(() => {});
    if (ruta() !== "/agenda") F("secciones", `la Agenda no cambia la dirección a /agenda (${ruta()})`);
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.locator(".bl-bass-section-btn.active").first().waitFor({ timeout: 20_000 }).catch(() => {});
    if (!/Agenda|Listings/.test(await activa())) F("secciones", "recargar /agenda no vuelve a la Agenda");
    await pg.goBack();
    await pg.waitForFunction(() => location.pathname === "/" && document.querySelector(".bl-btrack"), null, { timeout: 5000 }).catch(() => {});
    if (ruta() !== "/" || (await activa()) !== "portada") F("secciones", `el atrás no vuelve a la portada en "/" (${ruta()} · ${await activa()})`);
    // Abrir y cerrar un evento no le hace perder la dirección a la sección
    // (antes el cierre borraba la marca del historial y Noticias quedaba en /agenda).
    await pg.goto(BASE + "/agenda", { waitUntil: "domcontentloaded" });
    await pg.locator(".bl-ev-open").first().click({ timeout: 20_000 }).catch(() => {});
    await pg.locator("[role=dialog]").first().waitFor({ timeout: 5000 }).catch(() => {});
    await pg.waitForTimeout(400);   // el modal engancha el teclado al terminar de abrir
    await pg.keyboard.press("Escape");
    await pg.waitForURL("**/agenda", { timeout: 5000 }).catch(() => {});
    await pg.locator(".bl-bass-section-btn", { hasText: /^Noticias$|^News$/ }).first().click().catch(() => {});
    await pg.waitForURL("**/noticias", { timeout: 5000 }).catch(() => {});
    if (ruta() !== "/noticias") F("secciones", `después de abrir y cerrar un evento, Noticias no cambia la dirección (${ruta()})`);
    await c.close();
    // El salto a un día aguanta lo que llega después (oct 2026: el smoke "el día
    // elegido no queda debajo de la línea" fallaba a veces; los ciclos que llegan
    // tarde corrían la lista 540 px). Se demoran a propósito hasta después del salto.
    [c, pg] = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');");
    let soltarCiclos; const ciclosTarde = new Promise((ok) => { soltarCiclos = ok; });
    await pg.route("**/api/ciclos", async (r) => { await ciclosTarde; r.continue(); });
    await pg.goto(BASE + "/eventos/este-finde", { waitUntil: "domcontentloaded" });
    await pg.locator(".bl-when-chip").first().click({ timeout: 20_000 }).catch(() => {});
    await pg.waitForTimeout(1200);
    const dias = pg.locator(".bl-day-rail button.bl-day-rail-day");
    if ((await dias.count()) > 2) {
      await dias.nth(Math.min(5, (await dias.count()) - 1)).click();
      await pg.waitForTimeout(1300); soltarCiclos(); await pg.waitForTimeout(1500);
      const lejos = await pg.evaluate(() => { const rb = document.querySelector(".bl-day-rail").getBoundingClientRect().bottom; const key = document.querySelector(".bl-day-rail .is-on")?.dataset.rail; const h = document.querySelector(`.bl-day-header[data-day="${key}"]`); return h ? Math.abs(h.getBoundingClientRect().top - rb) : 999; });
      if (lejos > 24) F("agenda", `lo que llega después del salto corre el día elegido (${Math.round(lejos)} px de la línea)`);
    } else soltarCiclos();
    await c.close();
    // Entrar por un link directo (oct 2026, revisión): por /agenda el "atrás" no
    // cerraba el modal; el link a una nota de Bass no la abría; después de un
    // link a un festival la portada decía "0 por venir".
    [c, pg] = await ctx({ viewport: { width: 1440, height: 900 } });
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');localStorage.setItem('bl-app-no','1');");
    const dlg = () => pg.locator("[role=dialog]").count();
    await pg.goto(BASE + "/agenda", { waitUntil: "domcontentloaded" });
    await pg.locator(".bl-ev-open").first().click({ timeout: 20_000 }).catch(() => {});
    await pg.locator("[role=dialog]").first().waitFor({ timeout: 5000 }).catch(() => {});
    await pg.goBack();
    await pg.waitForFunction(() => !document.querySelector("[role=dialog]"), null, { timeout: 5000 }).catch(() => {});
    if (await dlg()) F("links directos", "entrando por /agenda, el atrás no cierra el modal del evento");
    const notas = await pg.evaluate(() => fetch("/api/bass-news").then((r) => r.json()).catch(() => []));
    if (notas.length) {
      // El slug sale de abrir la nota desde Noticias (la URL lo dice).
      await pg.goto(BASE + "/noticias", { waitUntil: "domcontentloaded" });
      await pg.locator(".bl-news-wall .bl-ev-item").first().click({ timeout: 20_000 }).catch(() => {});
      await pg.waitForURL(/\/noticias\/.+/, { timeout: 5000 }).catch(() => {});
      const linkNota = new URL(pg.url()).pathname;
      if (/^\/noticias\/.+/.test(linkNota)) {
        await pg.goto(BASE + linkNota, { waitUntil: "domcontentloaded" });
        await pg.locator("[role=dialog]").first().waitFor({ timeout: 15_000 }).catch(() => {});
        if (!(await dlg())) F("links directos", `el link a una nota de Bass (${linkNota}) no abre la nota`);
      } else F("links directos", "abrir una nota de Bass no cambia la dirección");
    }
    await pg.goto(BASE + "/festivales/creamfields-bsas-2026", { waitUntil: "domcontentloaded" });
    await pg.locator("[role=dialog]").first().waitFor({ timeout: 15_000 }).catch(() => {});
    await pg.keyboard.press("Escape");
    // La portada de Bass cuenta la agenda: "N hoy · M por venir" con M > 0.
    await pg.waitForFunction(() => /[1-9]\d* por venir/.test(document.body.innerText), null, { timeout: 20_000 }).catch(() => {});
    const porVenir = await pg.evaluate(() => (document.body.innerText.match(/(\d+) por venir/) || [])[1]);
    if (!porVenir || porVenir === "0") F("links directos", `después de un link a un festival la portada dice "${porVenir ?? "?"} por venir"`);
    await c.close();

    // La portada y la Agenda cuentan lo mismo (oct 2026: 158 contra 165, por los ciclos fijos).
    [c, pg] = await ctx({ viewport: { width: 1440, height: 900 } });
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');localStorage.setItem('bl-app-no','1');");
    await pg.goto(BASE + "/agenda", { waitUntil: "domcontentloaded" });
    await pg.locator(".bl-feed-head-n").first().waitFor({ timeout: 20_000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    const enAgenda = (await pg.locator(".bl-feed-head-n").first().textContent().catch(() => ""))?.trim();
    await pg.goBack();
    await pg.waitForFunction(() => /\d+ por venir/.test(document.body.textContent), null, { timeout: 15_000 }).catch(() => {});
    const enPortada = await pg.evaluate(() => (document.body.textContent.match(/(\d+) por venir/) || [])[1]);
    if (enAgenda && enPortada && enAgenda !== enPortada) F("conteos", `la portada dice ${enPortada} por venir y la Agenda abre con ${enAgenda}`);
    // Búsqueda sin resultados: la apertura dice 0 y hay una salida que la borra.
    await pg.goto(BASE + "/agenda", { waitUntil: "domcontentloaded" });
    const buscador = pg.locator('input[aria-label="Artista, club o fiesta"]').first();
    await buscador.fill("zzqxw-no-existe", { timeout: 20_000 }).catch(() => {});
    await pg.waitForTimeout(800);
    const cero = (await pg.locator(".bl-feed-head-n").first().textContent().catch(() => ""))?.trim();
    if (cero !== "0") F("búsqueda", `sin resultados la apertura no dice 0 (dice "${cero}")`);
    await pg.locator(".bl-empty-action").first().click({ timeout: 3000 }).catch(() => F("búsqueda", "sin resultados no hay forma de borrar la búsqueda"));
    await pg.waitForTimeout(600);
    if ((await pg.locator(".bl-ev-wall .bl-ev-item").count()) === 0) F("búsqueda", "borrar la búsqueda no vuelve a mostrar la agenda");
    // Sin colofones (Pablo los sacó): ni "end of set" ni "EOF", con la agenda entera.
    await pg.goto(BASE + "/agenda", { waitUntil: "domcontentloaded" });
    await pg.locator(".bl-ev-wall .bl-ev-item").first().waitFor({ timeout: 20_000 }).catch(() => {});
    if (/end of set|EOF/i.test(await pg.evaluate(() => document.body.textContent))) F("pies", "volvió un colofón (\"end of set\" / \"EOF\")");
    // Modal de noticia: el medio una sola vez y sin etiquetas en inglés.
    await pg.goto(BASE + "/noticias", { waitUntil: "domcontentloaded" });
    const carta = pg.locator(".bl-news-wall .bl-ev-item").first();
    const medio = await carta.getAttribute("data-time", { timeout: 20_000 }).catch(() => "");
    await carta.click({ timeout: 20_000 }).catch(() => {});
    await pg.locator(".bl-news-modal").first().waitFor({ timeout: 5000 }).catch(() => {});
    const modalNota = await pg.evaluate((medio) => { const m = document.querySelector(".bl-news-modal"); if (!m) return null; const txt = m.textContent; return { meta: m.querySelector(".bl-news-modal-meta")?.textContent || "", veces: medio ? txt.split(medio).length - 1 : 0, ingles: /(MUSIC|SCENE|INTL|CLUBS)/i.test(m.querySelector(".bl-news-modal-meta")?.textContent + [...m.querySelectorAll("span")].map((x) => x.textContent).join(" ")) }; }, medio);
    if (!modalNota) F("modal de noticia", "no abre");
    else {
      if (modalNota.ingles) F("modal de noticia", `etiquetas en inglés: "${modalNota.meta}"`);
      if (modalNota.veces > 1) F("modal de noticia", `el medio (${medio}) aparece ${modalNota.veces} veces`);
    }
    await c.close();
    // En mobile, noticia y festival abren como hoja desde abajo (como el evento).
    [c, pg] = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');localStorage.setItem('bl-app-no','1');");
    await pg.goto(BASE + "/festivales/creamfields-bsas-2026", { waitUntil: "domcontentloaded" });
    await pg.locator(".bl-modal").first().waitFor({ timeout: 20_000 }).catch(() => {});
    const hoja = await pg.evaluate(() => { const m = document.querySelector(".bl-modal"); if (!m) return null; const r = m.getBoundingClientRect(); return { abajo: Math.abs(innerHeight - r.bottom) < 2, ancho: Math.round(r.width) === innerWidth }; });
    if (!hoja || !hoja.abajo || !hoja.ancho) F("modales", `en mobile el modal de festival no es una hoja desde abajo (${JSON.stringify(hoja)})`);
    await c.close();

    // Sin red adentro de la app: una línea lo dice (oct 2026, Pablo: "no me muestra el aviso"); al volver, se va.
    [c, pg] = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');");
    await pg.goto(BASE + "/eventos/este-finde", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(1500);
    await c.setOffline(true); await pg.waitForTimeout(500);
    if (!/Sin conexión|offline/i.test((await pg.locator(".bl-offline-line").textContent().catch(() => "")) || "")) F("sin conexión", "sin red, la app no avisa");
    await c.setOffline(false); await pg.waitForTimeout(3500);
    if (await pg.locator(".bl-offline-line").count()) F("sin conexión", "al volver la red, el aviso no se va");
    await c.close();
    // iPhone: no hay instalación con un toque; el menú explica el camino.
    [c, pg] = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1" });
    await pg.addInitScript("localStorage.setItem('bl-onboarded','1');");
    await pg.goto(BASE + "/eventos/este-finde", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(1500);
    await pg.locator(".bl-util-fab").click(); await pg.waitForTimeout(300);
    if (!(await pg.locator(".bl-util-app").count())) F("iPhone", "el menú ⋯ no ofrece la app");
    else {
      await pg.locator(".bl-util-app").click();
      if (!/Agregar a inicio|Add to Home Screen/.test((await pg.locator(".bl-app-line").textContent().catch(() => "")) || "")) F("iPhone", "la app del menú no explica cómo agregarla al inicio");
    }
    await c.close();
  } catch (e) {
    F("flujo", e.message.split("\n")[0].slice(0, 200));
  } finally {
    await browser.close();
  }
}

for (const vp of VIEWPORTS) await run(vp);
await runApp();

if (problems.length) {
  console.log(`✗ smoke ${BASE}: ${problems.length} problema(s)`);
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
console.log(`✓ smoke ${BASE}: mobile + desktop OK (screenshots en ${SHOTS}/)`);

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
    // Superficie porteña (sept 2026): la home cuenta solo CABA + GBA y el
    // ticker no muestra ciudades del exterior; la agenda arranca en Buenos Aires.
    const amba = (await eventsData()).filter((e) => e.area === "amba").length;
    const homeN = Number((await page.locator(".blf-big em").first().textContent().catch(() => "")).replace(/\D/g, "")) || 0;
    if (amba > 0 && homeN !== amba) fail(vp.name, "home", `la home cuenta ${homeN} eventos y en Buenos Aires hay ${amba}`);
    // La ciudad sale del atributo, no del texto ("Café Berlín" es un venue de CABA).
    const foreign = await page.locator(".blf-tk[data-city]").evaluateAll((els) => els.map((e) => e.dataset.city).join(" | ")).then((x) => x.match(/\b(BERL[IÍ]N|IBIZA|LONDRES|BARCELONA|NUEVA YORK|SANTIAGO|CIUDAD DE M[EÉ]XICO|S[AÃ]O PAULO)\b/i)).catch(() => null);
    if (foreign) fail(vp.name, "home", `el ticker de la home muestra eventos de ${foreign[0]}`);
    await page.getByRole("button", { name: /^Bass —/ }).first().click();

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
    if (amba > 0 && porVenir !== amba) fail(vp.name, "índice", `la onda dice ${porVenir} por venir y en Buenos Aires hay ${amba}`);
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
      // "Se materializa" (oct 2026): la palabra elegida pasa de barras finas a
      // letra sólida — la tinta dentro de su caja tiene que crecer claramente.
      const inkOf = (i) => page.locator(".bl-btrack").evaluate((el, i) => {
        const cv = el.querySelector(".btk-canvas"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, r = el.querySelectorAll(".btk-name")[i].getBoundingClientRect();
        const d = cv.getContext("2d").getImageData(Math.round((r.left - cr.left) * k), Math.round((r.top - cr.top) * k), Math.round(r.width * k), Math.round(r.height * k)).data;
        let n = 0; for (let q = 0; q < d.length; q += 4) if (d[q] > 200 && d[q + 1] > 190 && d[q + 2] > 180) n++; return n;
      }, i);
      const lastIdx = (await page.locator(".btk-cue").count()) - 1;
      const inkRest = vp.isMobile ? null : await inkOf(lastIdx);
      await page.locator(".btk-cue").last().focus();
      await page.waitForTimeout(150);
      if (!(await page.locator(".bl-btrack").getAttribute("data-solo"))) fail(vp.name, "índice", "el foco en un cue no hace solo de su parte de la onda");
      await page.waitForTimeout(1200);
      { const r = await evenInk(); if (!isEven(r)) fail(vp.name, "diseño", `en solo la onda cambia de color (alfa de barras ${r?.join("–")})`); }
      if (inkRest != null) { const inkOn = await inkOf(lastIdx); if (!(inkOn > inkRest * 1.35)) fail(vp.name, "índice", `la palabra elegida no se materializa (tinta ${inkRest} → ${inkOn})`); }
      // La portada es solo la onda y sus links, sin cajas: cada link vive sobre el
      // eje de la onda (en el break de su parte) y no pisa la onda ni el cabezal.
      const offAxis = await page.locator(".bl-btrack .btk-cue").evaluateAll((gs) => gs.filter((g) => {
        const svg = g.ownerSVGElement.getBoundingClientRect(), n = g.querySelector(".btk-name").getBoundingClientRect();
        return !g.dataset.axis || !(Math.abs(n.top + n.height / 2 - (svg.top + Number(g.dataset.axis))) <= 40);
      }).length);
      if (offAxis) fail(vp.name, "índice", `${offAxis} link(s) fuera del eje de la onda`);
      // La onda nunca se corta: debajo de cada palabra el canvas tiene barras (la palabra es de onda).
      const gaps = await page.locator(".bl-btrack").evaluate((el) => {
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
      const tight = await page.locator(".bl-btrack").evaluate((el) => {
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

    // 5d. Festivales: Buenos Aires arriba, el mundo abajo (sept 2026).
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Bass —/ }).first().click().catch(() => {});
    await page.locator(".btk-cue", { hasText: /Festival/ }).first().dispatchEvent("click").catch(() => {});
    await page.locator(".bl-fest-k").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    const festHeads = await page.locator(".bl-fest-k").allTextContents();
    if (!festHeads.length) fail(vp.name, "festivales", "sin bloques Buenos Aires / mundo");
    else if (festHeads.length > 1 && !/buenos aires/i.test(festHeads[0])) fail(vp.name, "festivales", `el primer bloque es "${festHeads[0]}", no Buenos Aires`);

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
      if (vp.viewport.width > 768 && (await page.locator(".blc-branch").count()) !== 8) fail(vp.name, "layer", "desktop: faltan ramas entre la curva y el riel");
      if (vp.viewport.width <= 768) {
        const hits = await page.locator(".blc-hit").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        const extra = await page.locator(".blc-node .blc-vl, .blc-node .blc-pill").count();
        if (hits.length !== 8 || hits.some((h) => h < 44)) fail(vp.name, "layer", `mobile: ${hits.length} franjas tocables (esperaba 8 de ≥44px)`);
        if (extra) fail(vp.name, "layer", "mobile: las secciones de la curva muestran algo más que su título");
        // Ramas (30-sep): cada sección sale de su punto con una rama que
        // termina en su nombre, y las 8 entran en la primera pantalla.
        const loose = await page.locator(".blc-v .blc-node").evaluateAll((gs) => gs.filter((g) => {
          const b = g.querySelector(".blc-branch"), d = g.querySelector(".blc-dot").getBoundingClientRect(), t = g.querySelector(".blc-ttl").getBoundingClientRect();
          if (!b) return true;
          const m = b.getScreenCTM(), a = b.getPointAtLength(0), z = b.getPointAtLength(b.getTotalLength());
          const A = new DOMPoint(a.x, a.y).matrixTransform(m), Z = new DOMPoint(z.x, z.y).matrixTransform(m);
          const fromDot = Math.hypot(A.x - (d.left + d.right) / 2, A.y - (d.top + d.bottom) / 2) < 6;
          const toTitle = t.left - Z.x >= 0 && t.left - Z.x < 26 && Math.abs(Z.y - (t.top + t.bottom) / 2) < 14;
          return !fromDot || !toTitle || t.right > innerWidth;
        }).length);
        if (loose) fail(vp.name, "layer", `mobile: ${loose} secciones sin rama de su punto a su nombre`);
        const below = await page.locator(".blc-v .blc-ttl").evaluateAll((ts) => ts.filter((t) => t.getBoundingClientRect().bottom > innerHeight).length);
        if (below) fail(vp.name, "layer", `mobile: ${below} secciones fuera de la primera pantalla`);
        // Los caminos son aleatorios y se renuevan: el ancho varía de un momento
        // a otro. Se toma el mayor de hasta ocho (≈5 s; con tres frenó un push por
        // azar, oct 2026); por debajo de la mitad se perdió la lupa.
        let fanW = 0;
        for (let k = 0; k < 8; k++) { fanW = Math.max(fanW, await page.locator(".blc-v .blc-fan").evaluate((g) => g.getBoundingClientRect().width).catch(() => 0)); if (fanW >= vp.viewport.width * 0.5) break; await page.waitForTimeout(700); }
        if (fanW < vp.viewport.width * 0.5) fail(vp.name, "layer", `mobile: el abanico ocupa ${Math.round(fanW)}px (esperaba ≥50% del ancho)`);
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
      // arranca de golpe). Y el rótulo de escala fuera de la zona de caminos.
      if (vp.viewport.width > 768) {
        await page.mouse.move(2, 2);
        const row = await page.locator(".blc-stage svg").first().evaluate((svg) => {
          svg.scrollIntoView({ block: "end" });                 // Layer scrollea en un contenedor propio
          const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = r.width / vb.width;
          return { x0: r.left + 90 * k, x1: r.right - 90 * k, y: Math.min(innerHeight - 2, r.top + (vb.height - 66) * k) };
        });
        const jump = await seamJump(page, { x: row.x0, y: row.y, width: row.x1 - row.x0, height: 1 }, 8);
        if (jump > 2.2) fail(vp.name, "diseño", `costura en el fondo del gráfico (salto de ${jump.toFixed(1)} niveles entre vecinos)`);
        const lab = await page.locator(".blc-fut-l").first().boundingBox();
        const clip = await page.locator(".blc-fan clipPath rect").first().boundingBox();
        if (lab && clip && lab.y + lab.height > clip.y) fail(vp.name, "diseño", "el rótulo de escala queda sobre los caminos del abanico");
      }
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
      // con el ticker; pestañas en todas las pantallas; Pulso del mercado
      // (en mobile, tira que se despliega) en lugar de terminal + dólar.
      const backFree = await page.locator(".bl-layer-back").evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + 8, r.top + r.height / 2)); }).catch(() => false);
      if (!backFree) fail(vp.name, "layer", "\"Volver a la curva\" queda tapado al entrar a una sección");
      if (!(await page.locator(".bl-layer-tabs").isVisible())) fail(vp.name, "layer", "no se ven las pestañas de sección");
      const strayTop = await page.evaluate(() => { const back = document.querySelector(".bl-layer-back"); return [...document.querySelectorAll(".bl-terminal-header, .bl-dolar")].some((e) => e.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING); });
      if (strayTop) fail(vp.name, "layer", "volvió el terminal/dólar suelto arriba de la sección");
      await page.locator(".bl-mpulse-body").waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
      if (vp.viewport.width <= 768) await page.locator(".bl-mpulse-sum").click().catch(() => {});
      if (!(await page.locator(".bl-mpulse-body .bl-mpulse-c").first().isVisible().catch(() => false))) fail(vp.name, "pulso", "el pulso del mercado no muestra sus indicadores");
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
      await page.locator(".bl-cirl-k").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      const cirlHeads = await page.locator(".bl-cirl-k").allTextContents();
      if (!cirlHeads.length && (await page.locator(".bl-cirl-item").count())) fail(vp.name, "eventos cripto", "sin bloques Buenos Aires / mundo");
      if (cirlHeads.length > 1 && !/buenos aires/i.test(cirlHeads[0])) fail(vp.name, "eventos cripto", `el primer bloque es "${cirlHeads[0]}", no Buenos Aires`);
      // ETFs y Acciones agrupados por lo que son (sept 2026): varios grupos con
      // título y qué los junta; en Acciones está "Cripto en Wall Street".
      for (const [sec, re, must] of [["etfs", /ETFs/, null], ["acciones", /Acciones|Stocks/, /Cripto en Wall Street|Crypto on Wall Street/]]) {
        await page.locator(".bl-layer-back").click();
        await page.waitForTimeout(400);
        await pill(re).click();
        await page.locator(".bl-mkt-group-label").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
        const heads = await page.locator(".bl-mkt-group-label").allTextContents();
        const subs = await page.locator(".bl-mkt-group-sub").count();
        if (heads.length < 3 || subs !== heads.length) fail(vp.name, sec, `${heads.length} grupos con ${subs} descripciones (esperaba ≥3, todos descriptos)`);
        if (must && !heads.some((h) => must.test(h))) fail(vp.name, sec, `falta el grupo ${must}`);
      }
      // Predicciones por tema (sept 2026): grupos con título, cada tarjeta con
      // resultados; si el título está traducido, "Original" lo alterna.
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(400);
      await pill(/Predicciones|Predictions/).click();
      await page.locator(".bl-predict-card").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      const pHeads = await page.locator(".bl-predict-group .bl-mkt-group-label").count();
      const pCards = await page.locator(".bl-predict-card").count();
      const pRows = await page.locator(".bl-predict-card .bl-predict-row").count();
      if (pHeads < 2 || pCards < 4 || pRows < pCards) fail(vp.name, "predicciones", `${pHeads} temas, ${pCards} tarjetas, ${pRows} resultados (esperaba ≥2 temas y resultados en cada tarjeta)`);
      const tr = page.locator(".bl-predict-card .bl-predict-tr").first();
      if (await tr.count()) {
        const q = page.locator(".bl-predict-card").first().locator(".bl-predict-question");
        const before = await q.textContent();
        await tr.click();
        if ((await q.textContent()) === before) fail(vp.name, "predicciones", "\"Original\" no muestra el título original");
      }
      // Finanzas: temas por contenido, con etiquetas traducidas (no "ECONOMY").
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(400);
      await pill(/Finanzas|Finance/).click();
      await page.locator(".bl-layer-news-item").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
      const fTags = await page.locator(".bl-layer-news-tag-pill").allTextContents();
      const crudas = fTags.filter((x) => /^(markets|economy|companies|crypto|global|wallstreet|world)$/i.test(x.trim()));
      if (crudas.length) fail(vp.name, "finanzas", `etiquetas sin traducir: ${[...new Set(crudas)].join(", ")}`);
      if (!(await page.locator(".layer-filters", { hasText: /Wall Street y la Fed|Wall Street & the Fed/ }).count())) fail(vp.name, "finanzas", "falta el filtro Wall Street y la Fed");
      // El Pulso enganchado queda debajo de la barra de precios, no detrás.
      if (await page.locator(".bl-mpulse-head").isVisible().catch(() => false)) {
        await page.mouse.move(vp.viewport.width / 3, vp.viewport.height * 0.6);
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(600);
        const covered = await page.evaluate(() => {
          const bar = document.querySelector(".bl-price-bar")?.getBoundingClientRect();
          const head = document.querySelector(".bl-mpulse-head")?.getBoundingClientRect();
          return !!(bar && head && head.top < bar.bottom && head.bottom > bar.top);
        });
        if (covered) fail(vp.name, "finanzas", "al scrollear, la barra de precios tapa \"Pulso del mercado\"");
      }
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

for (const vp of VIEWPORTS) await run(vp);

if (problems.length) {
  console.log(`✗ smoke ${BASE}: ${problems.length} problema(s)`);
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
console.log(`✓ smoke ${BASE}: mobile + desktop OK (screenshots en ${SHOTS}/)`);

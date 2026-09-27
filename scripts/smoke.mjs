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

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { lowContrast, homeCollisions, posterOverflow, floatingOverlaps } from "./lib/ui-checks.mjs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3000";
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
    // 1. Home → onboarding de primera visita → Bass
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    // Los paneles ocultos (mundo inactivo) son inert a propósito: lo que se
    // chequea es que abrir+cerrar un diálogo deje la cuenta igual que antes.
    const inertCount = () => page.locator("[inert]").count();
    const onboardingBtn = page.locator(".bl-onboarding-btn");
    await onboardingBtn.waitFor({ state: "visible", timeout: 15_000 });
    await onboardingBtn.click();
    await page.locator(".bl-onboarding").waitFor({ state: "detached", timeout: 5_000 });
    if ((await page.evaluate(() => document.body.style.overflow)) === "hidden") fail(vp.name, "onboarding", "al cerrarlo el scroll sigue bloqueado");
    await page.waitForTimeout(1200); // entrada del home (fade de los mundos)
    await expectNone("home", homeCollisions);
    await expectNone("home", lowContrast);
    await page.getByRole("button", { name: /^Bass —/ }).first().click();

    // 2. Feed con eventos
    const firstEvent = page.locator(".bl-ev-open").first();
    await firstEvent.waitFor({ state: "attached", timeout: 30_000 });
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

    // Line-up "Cartel": tarjeta del headliner + fichas compactas. Ninguna ficha
    // se estira (el bug de sept 2026 dejaba cajas de ~230px vacías por artista).
    if ((await dialog.locator(".bl-em-head").count()) !== 1) fail(vp.name, "line-up", "falta la tarjeta del headliner");
    const chips = await dialog.locator(".bl-em-chip").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    const tall = chips.filter((h) => h > 90);
    if (tall.length) fail(vp.name, "line-up", `${tall.length} fichas miden más de 90px (${tall.join(", ")})`);

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

    // 5c. Link a un evento que ya no existe: aviso y vuelta a la agenda
    await page.goto(BASE + "/eventos/evento-que-no-existe-1-ene", { waitUntil: "domcontentloaded" });
    const toastOk = await page.locator(".bl-toast.show").waitFor({ state: "visible", timeout: 30_000 }).then(() => true).catch(() => false);
    if (!toastOk) fail(vp.name, "deep-link", "un evento inexistente no muestra aviso");
    if (new URL(page.url()).pathname !== "/") fail(vp.name, "deep-link", `la URL rota queda en la barra (${new URL(page.url()).pathname})`);

    // 6. Mundo Layer carga
    await page.goto(BASE + "/?view=layer", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    if (!page.url().endsWith("/layer")) fail(vp.name, "layer", `no quedó en /layer (${page.url()})`);
    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-layer.png` });
    await expectNone("layer", lowContrast);

    // 6b. Secciones de Layer: en mobile/tablet, grilla de 6 tarjetas en la
    // portada; en desktop, índice lateral de 7 filas que marca la sección
    // abierta. Tocar Ciclos abre Ciclos (sept 2026, elegidas por Pablo).
    const narrow = vp.viewport.width <= 768;
    const nav = page.locator(narrow ? ".bl-door" : ".bl-idx-row");
    const want = narrow ? 6 : 7;
    const got = await nav.count();
    if (got !== want) fail(vp.name, "layer", `hay ${got} accesos a secciones (esperaba ${want})`);
    else {
      const box = await page.locator(narrow ? ".bl-doors-grid" : ".bl-idx").boundingBox();
      if (!box) fail(vp.name, "layer", "los accesos a secciones no se ven");
      else if (box.x < 0 || box.x + box.width > vp.viewport.width + 1) fail(vp.name, "layer", "los accesos a secciones se salen de la pantalla");
      const ciclos = nav.filter({ hasText: /Ciclos|Cycles/ }).first();
      await ciclos.click();
      await page.waitForTimeout(700);
      const active = await page.locator(".bl-layer-tab.active").textContent();
      if (!/ciclos|cycles/i.test(active || "")) fail(vp.name, "layer", `el acceso a Ciclos abre "${active}"`);
      if (!narrow && !(await page.locator(".bl-idx-row.is-on").filter({ hasText: /Ciclos|Cycles/ }).count()))
        fail(vp.name, "layer", "el índice no marca la sección abierta");
      await page.locator(".bl-layer-tab").first().click();
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
    fail(vp.name, "flujo", e.message.split("\n")[0]);
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

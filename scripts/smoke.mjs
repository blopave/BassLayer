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

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3000";
const SHOTS = ".pw-shots";
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
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
    await page.getByRole("button", { name: /^Bass —/ }).first().click();

    // 2. Feed con eventos
    const firstEvent = page.locator(".bl-ev-open").first();
    await firstEvent.waitFor({ state: "attached", timeout: 30_000 });
    const count = await page.locator(".bl-ev-open").count();
    if (count < 10) fail(vp.name, "feed", `solo ${count} eventos en la agenda`);

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

    // Filas del line-up: compactas (el bug las dejó como cajas de ~230px vacías)
    const rows = await dialog.locator(".bl-em-row-btn").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    const tall = rows.filter((h) => h > 120);
    if (tall.length) fail(vp.name, "line-up", `${tall.length} filas miden más de 120px (${tall.join(", ")})`);

    const broken = await brokenImages(dialog);
    if (broken.length) fail(vp.name, "imágenes", `${broken.length} rotas en el modal: ${broken.join(" | ")}`);

    const cta = dialog.locator(".bl-em-cta");
    if (!(await cta.isVisible().catch(() => false))) fail(vp.name, "modal", "no se ve el botón de entradas");

    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-modal.png` });

    // 4. Cerrar con Escape → vuelve el feed y se libera el scroll
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5_000 }).catch(() => fail(vp.name, "modal", "Escape no lo cierra"));
    const overflow = await page.evaluate(() => document.body.style.overflow);
    if (overflow === "hidden") fail(vp.name, "modal", "al cerrar, el body sigue con scroll bloqueado");
    const inertAfter = await inertCount();
    if (inertAfter !== inertBefore) fail(vp.name, "modal", `al cerrar quedan elementos inert (${inertBefore} → ${inertAfter})`);

    // 5. Feed sin imágenes rotas visibles
    const feedBroken = await brokenImages(page.locator("body"));
    if (feedBroken.length) fail(vp.name, "feed", `${feedBroken.length} imágenes rotas visibles`);

    // 6. Mundo Layer carga
    await page.goto(BASE + "/?view=layer", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    if (!page.url().endsWith("/layer")) fail(vp.name, "layer", `no quedó en /layer (${page.url()})`);
    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-layer.png` });
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

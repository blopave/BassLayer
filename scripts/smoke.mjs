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
    // Superficie porteña (sept 2026): la home cuenta solo CABA + GBA y el
    // ticker no muestra ciudades del exterior; la agenda arranca en Buenos Aires.
    const amba = await page.evaluate(() => fetch("/api/events").then((r) => r.json()).then((d) => d.filter((e) => e.area === "amba").length).catch(() => -1));
    const homeN = Number((await page.locator(".blf-big em").first().textContent().catch(() => "")).replace(/\D/g, "")) || 0;
    if (amba > 0 && homeN !== amba) fail(vp.name, "home", `la home cuenta ${homeN} eventos y en Buenos Aires hay ${amba}`);
    // Solo la ciudad (lo que sigue al último " · "): "Café Berlín" es un venue de CABA.
    const foreign = await page.locator(".blf-tk i").allTextContents().then((xs) => xs.map((x) => x.split(" · ").pop()).join(" | ").match(/\b(BERL[IÍ]N|IBIZA|LONDRES|BARCELONA|NUEVA YORK|SANTIAGO|CIUDAD DE M[EÉ]XICO|S[AÃ]O PAULO)\b/i)).catch(() => null);
    if (foreign) fail(vp.name, "home", `el ticker de la home muestra eventos de ${foreign[0]}`);
    await page.getByRole("button", { name: /^Bass —/ }).first().click();

    // 2. Feed con eventos
    const firstEvent = page.locator(".bl-ev-open").first();
    await firstEvent.waitFor({ state: "attached", timeout: 30_000 });
    const where = await page.locator(".bl-ctrl-where .bl-ctrl-select").first().inputValue({ timeout: 3000 }).catch(() => null);
    // De gira (sept 2026): si hay giras, cada tarjeta marca la parada en BA y
    // tocarla abre la ficha del show porteño.
    const tourCards = await page.locator(".bl-tour-card").count();
    // ¿Los datos traen giras? (artista de un show AMBA futuro con fecha afuera)
    const toursInData = await page.evaluate(() => fetch("/api/events").then((r) => r.json()).then((d) => {
      const n = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const out = new Set(d.filter((e) => e.region !== "AR").flatMap((e) => (e.artists || []).map(n)).filter((a) => a.length > 3));
      return d.some((e) => e.area === "amba" && (e.artists || []).some((a) => out.has(n(a))));
    }).catch(() => false));
    if (toursInData && !tourCards) fail(vp.name, "de gira", "hay artistas de gira en los datos y el bloque no aparece");
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

    // 5d. Festivales: Buenos Aires arriba, el mundo abajo (sept 2026).
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Bass —/ }).first().click().catch(() => {});
    await page.locator(".bl-bass-section-btn").filter({ hasText: /Festival/ }).first().click().catch(() => {});
    await page.locator(".bl-fest-k").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    const festHeads = await page.locator(".bl-fest-k").allTextContents();
    if (!festHeads.length) fail(vp.name, "festivales", "sin bloques Buenos Aires / mundo");
    else if (festHeads.length > 1 && !/buenos aires/i.test(festHeads[0])) fail(vp.name, "festivales", `el primer bloque es "${festHeads[0]}", no Buenos Aires`);

    // 6. Mundo Layer carga
    await page.goto(BASE + "/?view=layer", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    if (!page.url().endsWith("/layer")) fail(vp.name, "layer", `no quedó en /layer (${page.url()})`);
    await page.screenshot({ path: `${SHOTS}/smoke-${vp.name}-layer.png` });
    await expectNone("layer", lowContrast);

    // 6b. Portada de Layer = la curva (sept 2026): 8 secciones en la curva, que
    // es el único índice (sin franja ni lista debajo). Desktop: cápsulas que no
    // se pisan. Mobile: curva vertical con solo títulos y franjas tocables.
    // Entrar a Ciclos (click o toque entra directo) y volver a la curva.
    const pill = (re) => page.locator(".blc-node").filter({ hasText: re }).first().locator(".blc-pill, .blc-hit");
    const nodes = await page.locator(".blc-node").count();
    const dup = await page.locator(".blc-strip, .blc-it").count();
    if (nodes !== 8 || dup) fail(vp.name, "layer", `la curva tiene ${nodes} puntos y ${dup} accesos repetidos debajo (esperaba 8 y 0)`);
    else {
      const box = await page.locator(".blc-stage").boundingBox();
      if (!box || box.x < 0 || box.x + box.width > vp.viewport.width + 1) fail(vp.name, "layer", "la curva se sale de la pantalla");
      // ¿Para dónde va? (sept 2026): el futuro son caminos simulados, no una línea.
      const walks = await page.locator(".blc-fan .blc-walk").count();
      if (walks < 20) fail(vp.name, "layer", `el futuro tiene ${walks} caminos simulados (esperaba ≥20)`);
      if (await page.locator(".blc-proj").count()) fail(vp.name, "layer", "volvió la línea punteada del futuro");
      if (!(await page.locator(".blc-ask-l, .blc-ask-m button").first().isVisible().catch(() => false))) fail(vp.name, "layer", "falta el link \"Qué dice el mercado → Predicciones\"");
      const pills = await page.locator(".blc-pill").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map(({ x, y, width: w, height: h }) => ({ x, y, w, h })));
      const clash = pills.some((a, i) => pills.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
      if (clash) fail(vp.name, "layer", "hay cápsulas de la curva pisadas entre sí");
      if (pills.some((r) => r.x < 0 || r.x + r.w > vp.viewport.width + 1)) fail(vp.name, "layer", "una cápsula se sale de la pantalla");
      if (vp.viewport.width <= 768) {
        const hits = await page.locator(".blc-hit").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        const extra = await page.locator(".blc-node .blc-vl, .blc-node .blc-pill, .blc-node .blc-when").count();
        if (hits.length !== 8 || hits.some((h) => h < 44)) fail(vp.name, "layer", `mobile: ${hits.length} franjas tocables (esperaba 8 de ≥44px)`);
        if (extra) fail(vp.name, "layer", "mobile: las secciones de la curva muestran algo más que su título");
      }
      await pill(/Ciclos|Cycles/).click();   // entra directo (desktop y mobile)
      await page.waitForTimeout(700);
      const active = await page.locator(".bl-layer-tab.active").textContent().catch(() => "");
      if (!/ciclos|cycles/i.test(active || "")) fail(vp.name, "layer", `entrar a Ciclos abre "${active}"`);
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
      await pill(/Historia|History/).click();
      await page.locator(".blh-ev").first().waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
      const evs = await page.locator(".blh-ev").count(), rows = await page.locator(".blh-list li").count();
      if (!(await page.locator(".bl-timeline-toggle, .bl-timeline").count())) fail(vp.name, "historia", "Crypto BA Timeline no está en Historia");
      if (evs < 20 || evs !== rows) fail(vp.name, "historia", `${evs} hechos en la curva y ${rows} en la lista`);
      else {
        await page.locator(".blh-list button").nth(3).click();
        if (!(await page.locator(".blh-card").isVisible().catch(() => false))) fail(vp.name, "historia", "tocar un hecho no muestra su tarjeta");
      }
      // Eventos cripto: primero lo de Buenos Aires, después las conferencias del mundo.
      await page.locator(".bl-layer-back").click();
      await page.waitForTimeout(500);
      await page.locator(".blc-node").filter({ hasText: /Eventos|Events/ }).first().locator(".blc-pill, .blc-hit").click();
      await page.locator(".bl-cirl-k").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
      const cirlHeads = await page.locator(".bl-cirl-k").allTextContents();
      if (!cirlHeads.length && (await page.locator(".bl-cirl-item").count())) fail(vp.name, "eventos cripto", "sin bloques Buenos Aires / mundo");
      if (cirlHeads.length > 1 && !/buenos aires/i.test(cirlHeads[0])) fail(vp.name, "eventos cripto", `el primer bloque es "${cirlHeads[0]}", no Buenos Aires`);
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

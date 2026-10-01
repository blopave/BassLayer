#!/usr/bin/env node
// Recorrido UX de todo el sitio: cada pantalla e interacción principal en
// varios tamaños, con capturas y chequeos genéricos de layout.
//
//   node scripts/audit-ux.mjs [base] [--vp=mobile-s,desktop]
//
// Salida: .pw-shots/audit/<vp>/<nn-estado>.png + audit.json con hallazgos.
// No es un test (no falla): es material para revisar a ojo con criterio.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3000";
const ONLY = (process.argv.find((a) => a.startsWith("--vp=")) || "").slice(5).split(",").filter(Boolean);
const OUT = ".pw-shots/audit";

const VIEWPORTS = [
  { name: "mobile-s", viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "tablet", viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "laptop-bajo", viewport: { width: 1000, height: 647 } },
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "wide", viewport: { width: 1920, height: 1080 } },
].filter((v) => !ONLY.length || ONLY.includes(v.name));

const findings = [];

// Chequeos genéricos sobre lo que se ve en pantalla.
function layoutChecks() {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollWidth > vw + 1) out.push(`scroll horizontal: ${doc.scrollWidth}px > ${vw}px`);
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh) return null;
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || cs.opacity === "0" || e.closest("[inert],[aria-hidden=true]")) return null;
    return r;
  };
  const label = (e) => (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : e.tagName.toLowerCase()) + (e.textContent ? ` "${e.textContent.trim().slice(0, 30)}"` : "");
  // Elementos que se salen del viewport a los costados
  for (const e of document.querySelectorAll("body *")) {
    const r = visible(e);
    if (!r) continue;
    if ((r.right > vw + 2 || r.left < -2) && !e.closest("[class*=ticker],[class*=marquee],[class*=track],[class*=scroll-x],[class*=carousel]")) {
      const cs = getComputedStyle(e.parentElement || e);
      if (cs.overflowX === "visible") out.push(`se sale del viewport: ${label(e)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
  }
  // Imágenes rotas
  for (const i of document.querySelectorAll("img")) {
    if (visible(i) && i.complete && i.naturalWidth === 0) out.push(`imagen rota: ${(i.getAttribute("src") || "").slice(0, 90)}`);
  }
  // Texto recortado sin ellipsis
  for (const e of document.querySelectorAll("h1,h2,h3,p,span,b,a,button,div")) {
    if (e.children.length) continue;
    const r = visible(e);
    if (!r) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis" && !cs.webkitLineClamp?.match(/\d/))
      out.push(`texto cortado: ${label(e)}`);
  }
  // Blancos táctiles chicos (mobile)
  if (matchMedia("(pointer:coarse)").matches) {
    for (const e of document.querySelectorAll("button, a[href], [role=button], select, input")) {
      const r = visible(e);
      if (!r) continue;
      if ((r.width < 32 || r.height < 32) && !e.closest("p")) out.push(`blanco táctil chico ${Math.round(r.width)}x${Math.round(r.height)}: ${label(e)}`);
    }
  }
  return [...new Set(out)].slice(0, 40);
}

async function run(vp) {
  mkdirSync(`${OUT}/${vp.name}`, { recursive: true });
  const browser = await chromium.launch();
  const { name, ...ctxOpts } = vp;
  const ctx = await browser.newContext({ ...ctxOpts, locale: "es-AR" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/cloudflareinsights|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 160)));
  let n = 0;

  const snap = async (state, { full = false } = {}) => {
    await page.waitForTimeout(700);
    const file = `${String(++n).padStart(2, "0")}-${state}.png`;
    await page.screenshot({ path: `${OUT}/${vp.name}/${file}`, fullPage: full });
    const issues = await page.evaluate(layoutChecks);
    findings.push({ vp: vp.name, state, file, issues, errors: errors.splice(0) });
  };
  const step = async (state, fn, opts) => {
    try { await fn(); await snap(state, opts); }
    catch (e) { findings.push({ vp: vp.name, state, error: e.message.split("\n")[0] }); }
  };
  const esc = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(400); };
  const dialog = page.locator('[role="dialog"]').last();

  await step("home-onboarding", async () => {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.locator(".bl-onboarding-btn").waitFor({ timeout: 15_000 });
  });
  await step("home", async () => { await page.locator(".bl-onboarding-btn").click(); await page.waitForTimeout(1500); });
  if (!vp.isMobile) await step("home-hover-layer", async () => { await page.getByRole("button", { name: /^Layer —/ }).first().hover(); });

  await step("bass-feed", async () => {
    await page.getByRole("button", { name: /^Bass —/ }).first().click();
    await page.locator(".bl-ev-open").first().waitFor({ timeout: 30_000 });
  });
  await step("bass-feed-full", async () => {}, { full: true });
  await step("bass-scroll", async () => { await page.mouse.wheel(0, 1600); await page.waitForTimeout(600); });

  // Modales de evento: flyer / sin flyer (foto) / sin nada (póster) / line-up largo
  const events = await page.evaluate(() => fetch("/api/events").then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.events || []));
  const pick = {
    flyer: events.find((e) => e.image && (e.artists?.length || 0) >= 3),
    foto: events.find((e) => !e.image && e.artistImage),
    poster: events.find((e) => !e.image && !e.artistImage),
    largo: [...events].filter((e) => e.image).sort((a, b) => (b.artists?.length || 0) - (a.artists?.length || 0))[0],
  };
  for (const [kind, ev] of Object.entries(pick)) {
    if (!ev) continue;
    await step(`modal-${kind}`, async () => {
      await page.evaluate((name) => {
        const i = [...document.querySelectorAll(".bl-ev-name")].findIndex((e) => e.textContent.replace(/\u00A0/g, " ") === name);
        if (i < 0) throw new Error("no está en el feed: " + name);
        document.querySelectorAll(".bl-ev-open")[i].click();
      }, ev.name);
      await dialog.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(1500);
    });
    if (kind === "flyer") {
      await step("modal-bio-abierta", async () => { await dialog.locator(".bl-em-chip-main").first().click(); await page.waitForTimeout(1200); });
      await step("modal-scroll-fondo", async () => { await dialog.locator(".bl-em-scroll").evaluate((e) => e.scrollTo(0, e.scrollHeight)); });
    }
    await esc();
  }

  // Filtros / búsqueda
  if (vp.isMobile && vp.viewport.width < 769) {
    await step("filtros-sheet", async () => { await page.locator("[aria-expanded]").filter({ hasText: /filtr|cuándo|dónde/i }).first().click(); });
    await esc();
  }
  await step("busqueda", async () => { await page.locator("input[type=search], .bl-search input, input[aria-label]").first().fill("techno"); await page.waitForTimeout(800); });
  await step("busqueda-vacia", async () => { await page.locator("input[type=search], .bl-search input, input[aria-label]").first().fill("zzzzqqq"); await page.waitForTimeout(800); });
  await page.locator("input[type=search], .bl-search input, input[aria-label]").first().fill("").catch(() => {});

  await step("bass-noticias", async () => { await page.locator(".bl-bass-section-btn").nth(1).click(); await page.waitForTimeout(2500); });
  await step("noticia-modal", async () => { await page.locator(".bl-bass-news-list a, .bl-bass-news-list [role=button], .bl-bass-news-list article").first().click(); await dialog.waitFor({ timeout: 8000 }); });
  await esc();
  await step("bass-festivales", async () => { await page.locator(".bl-bass-section-btn").nth(2).click(); await page.waitForTimeout(2500); });
  await step("festival-modal", async () => { await page.locator(".bl-ev-list article, .bl-ev-list [role=button], .bl-ev-list button").first().click(); await dialog.waitFor({ timeout: 8000 }); });
  await esc();

  await step("about", async () => { await page.locator(".bl-util-about").first().click(); await dialog.waitFor({ timeout: 5000 }); });
  await esc();

  // Layer
  await step("layer", async () => { await page.goto(BASE + "/?view=layer", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3500); });
  await step("layer-full", async () => {}, { full: true });
  const tabs = await page.locator(".bl-layer-tab").count();
  for (let i = 1; i < tabs; i++) {
    const label = ((await page.locator(".bl-layer-tab").nth(i).textContent()) || `tab${i}`).trim().toLowerCase().replace(/\W+/g, "-");
    await step(`layer-${label}`, async () => { await page.locator(".bl-layer-tab").nth(i).click(); await page.waitForTimeout(2500); });
  }
  await step("layer-noticia-modal", async () => {
    await page.locator(".bl-layer-tab").first().click(); await page.waitForTimeout(1200);
    await page.locator(".bl-layer-content article, .bl-layer-content [role=button], .bl-layer-content a").first().click();
    await dialog.waitFor({ timeout: 8000 });
  });
  await esc();
  await step("precio-modal", async () => { await page.locator("[class*=price] button, [class*=market] button, [class*=ticker] button, [class*=price-row], [class*=market-row]").first().click(); await dialog.waitFor({ timeout: 8000 }); });
  await esc();

  // Idioma EN y modo día
  await step("layer-en", async () => { await page.getByRole("button", { name: /^EN$/ }).first().click(); await page.waitForTimeout(1500); });
  await step("layer-dia", async () => { await page.locator("[class*=theme], [aria-label*=tema i], [aria-label*=theme i]").first().click(); await page.waitForTimeout(1500); });
  await step("bass-dia-en", async () => { await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500); await page.getByRole("button", { name: /^Bass —/ }).first().click(); await page.waitForTimeout(2500); });

  // Rutas directas
  await step("404-evento", async () => { await page.goto(BASE + "/eventos/esto-no-existe-99-xxx", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000); });
  await step("genero-techno", async () => { await page.goto(BASE + "/eventos/genero/techno", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000); });

  await browser.close();
}

for (const vp of VIEWPORTS) { console.log("→", vp.name); await run(vp); }
writeFileSync(`${OUT}/audit.json`, JSON.stringify(findings, null, 2));
const withIssues = findings.filter((f) => f.issues?.length || f.errors?.length || f.error);
console.log(`${findings.length} estados, ${withIssues.length} con hallazgos → ${OUT}/audit.json`);

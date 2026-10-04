// Carteleras de salas que venden por Passline (oct 2026): Palermo Groove y
// C Art Media. Passline tiene un anti-bot (Cloudflare) que frena las consultas
// sin navegador; con Playwright y un poco de espera se lee. Corre en GitHub
// Actions junto con el Movistar (salas-movistar.yml) y manda cada sala al
// sitio por POST /api/salas/ingest.
//
//   node scripts/scrape-passline.mjs              → imprime el JSON
//   node scripts/scrape-passline.mjs --post       → además lo envía
import { chromium } from "playwright";

const VENUES = [
  { venue: "palermo-groove", url: "https://www.passline.com/venue/palermo-groove", label: "Palermo Groove" },
  { venue: "c-art-media", url: "https://www.passline.com/venue/c-art-media", label: "C Art Media" },
];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad = (n) => String(n).padStart(2, "0");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const browser = await chromium.launch();
const out = [];
let failed = false;
for (const v of VENUES) {
  // Una sesión limpia por sala: en la misma sesión, la segunda página dispara el desafío del anti-bot.
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", locale: "es-AR", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(v.url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  // El desafío de Cloudflare ("Just a moment...") se resuelve solo en unos segundos.
  await page.waitForFunction(() => !/just a moment|un momento/i.test(document.title) && document.querySelectorAll("a[href*='/eventos/']").length > 0, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const cards = await page.evaluate(() => [...document.querySelectorAll("a[href*='/eventos/']")].map((a) => ({ href: a.href.split("?")[0], text: a.innerText.replace(/\s+/g, " ").trim(), image: a.querySelector("img")?.src || "" })));
  const shows = [];
  for (const c of cards) {
    // "Palermo Groove ABADIA 10/10 WORLD TOUR - SHOW EN VIVO 10 Octubre 2026 / 19:30 hrs"
    const m = c.text.match(/^(.*?)\s+(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s*(\d{4})\s*\/?\s*(\d{1,2})[: ](\d{2})\s*hrs?$/);
    const mi = m ? MESES.indexOf(m[3].toLowerCase()) : -1;
    if (!m || mi < 0) continue;
    // "SOLD OUT C Art Media ALTER BRIDGE" → "ALTER BRIDGE" (la etiqueta de agotado y la sala van delante).
    const title = m[1].replace(/^(?:sold out|agotado)\s+/i, "").replace(new RegExp(`^${esc(v.label)}\\s+`, "i"), "").trim();
    if (!title) continue;
    shows.push({ date: `${m[4]}-${pad(mi + 1)}-${pad(m[2])}`, time: `${pad(m[5])}:${m[6]}`, title, url: c.href, image: c.image });
  }
  await ctx.close();
  const unique = [...new Map(shows.map((x) => [`${x.date} ${x.time} ${x.title}`, x])).values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!unique.length) { console.error(`${v.label}: no se leyó ningún show (¿anti-bot o cambió la web?)`); failed = true; continue; }
  out.push({ venue: v.venue, scrapedAt: new Date().toISOString(), shows: unique });
}
await browser.close();
console.log(JSON.stringify(out, null, 1));

if (process.argv.includes("--post")) {
  const target = (process.env.SALAS_INGEST_URL || "https://basslayer.io") + "/api/salas/ingest";
  for (const payload of out) {
    const r = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SALAS_INGEST_TOKEN || ""}` }, body: JSON.stringify(payload) });
    console.error(`POST ${payload.venue} → ${r.status} ${await r.text()}`);
    if (!r.ok) failed = true;
  }
}
if (failed) process.exit(1);

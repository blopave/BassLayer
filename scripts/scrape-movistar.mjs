// Cartelera del Movistar Arena (oct 2026). Su web es Blazor Server: no hay
// HTML ni API legibles sin un navegador. Este script la abre con Playwright,
// toma cada show (nombre, imagen, link) y entra a su página para leer cada
// función con su hora. Corre en GitHub Actions cada 6 h (salas-movistar.yml)
// y le manda el resultado al sitio por POST /api/salas/ingest.
//
//   node scripts/scrape-movistar.mjs              → imprime el JSON
//   node scripts/scrape-movistar.mjs --post       → además lo envía
//     (SALAS_INGEST_URL, por defecto https://basslayer.io; SALAS_INGEST_TOKEN)
import { chromium } from "playwright";

const BASE = "https://www.movistararena.com.ar";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad = (n) => String(n).padStart(2, "0");
// Las funciones de la página no traen año; la tarjeta del show sí ("04 octubre
// 2026", su primera fecha). Movistar vende con un año de anticipación: una
// función con día y mes anteriores a esa primera fecha es del año siguiente.
const first = (when) => { const m = when.match(/(\d{1,2}) (\w+) (\d{4})/); const mi = m ? MESES.indexOf(m[2].toLowerCase()) : -1; return mi < 0 ? null : { y: +m[3], m: mi, d: +m[1] }; };

const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36" });
await page.goto(`${BASE}/shows`, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
await page.waitForSelector(".evento h3", { timeout: 30000 });
const cards = await page.evaluate(() => [...document.querySelectorAll(".evento")].map((c) => ({
  title: c.querySelector("h3")?.innerText.trim() || "",
  href: c.querySelector("a[href*='/show/']")?.getAttribute("href") || "",
  image: c.querySelector("img")?.src || "",
  when: c.querySelector(".fecha")?.innerText.trim() || "",
})).filter((c) => c.title && c.href));

const shows = [];
for (const c of [...new Map(cards.map((c) => [c.href, c])).values()]) {
  const url = BASE + c.href;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  // "18 Octubre HORARIOS 19:00 hs Puertas 21:00 hs Show"
  const fns = [...body.matchAll(/(\d{1,2}) (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) HORARIOS(?:(?!HORARIOS).)*?(\d{1,2}):(\d{2}) hs Show/gi)];
  const f = first(c.when);
  if (!f) continue;   // sin la fecha de la tarjeta no hay año confiable
  const dates = fns.length
    ? fns.map((m) => { const mi = MESES.indexOf(m[2].toLowerCase()), d = +m[1], y = mi < f.m || (mi === f.m && d < f.d) ? f.y + 1 : f.y; return { date: `${y}-${pad(mi + 1)}-${pad(d)}`, time: `${pad(m[3])}:${m[4]}` }; })
    : [{ date: `${f.y}-${pad(f.m + 1)}-${pad(f.d)}`, time: "" }];
  for (const d of dates) shows.push({ ...d, title: c.title, url, image: c.image });
}
await browser.close();

// La página repite las funciones por sector: una por fecha, hora y show.
const unique = [...new Map(shows.map((x) => [`${x.date} ${x.time} ${x.title}`, x])).values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const payload = { venue: "movistar-arena", scrapedAt: new Date().toISOString(), shows: unique };
console.log(JSON.stringify(payload, null, 1));
if (!unique.length) { console.error("Movistar Arena: no se leyó ningún show (¿cambió la web?)"); process.exit(1); }

if (process.argv.includes("--post")) {
  const target = (process.env.SALAS_INGEST_URL || "https://basslayer.io") + "/api/salas/ingest";
  const r = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SALAS_INGEST_TOKEN || ""}` }, body: JSON.stringify(payload) });
  console.error(`POST ${target} → ${r.status} ${await r.text()}`);
  if (!r.ok) process.exit(1);
}

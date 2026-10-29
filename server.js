// ═══════════════════════════════════════════════════════
//  BassLayer API — versión en package.json
//  Bass: agenda electrónica de Buenos Aires (RA, QuéHacemos, Venti, Buenos
//        Aliens), noticias y festivales.
//  Layer: cripto y mercados (precios con respaldo, noticias, ETFs, acciones,
//         ciclos, predicciones). Los módulos están en server/.
// ═══════════════════════════════════════════════════════

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { montarPrerender } from "./server/prerender.js";
import { montarAgendaFuentes } from "./server/agenda-fuentes.js";
import { montarFestivales } from "./server/festivales.js";
import { montarArtistas } from "./server/artistas.js";
import { montarBassNoticias } from "./server/bass-noticias.js";
import { montarLayerFuentes } from "./server/layer-fuentes.js";
import { decodeHtmlEntities, normalizeArtistName } from "./server/texto.js";
import { crearTraductor, eachLimit } from "./server/traducir.js";
import { COIN_IDS } from "./server/monedas.js";
import { montarCriptoEventos } from "./server/cripto-eventos.js";
import { montarLayer } from "./server/layer.js";
import { montarFeeds } from "./server/feeds.js";
import { cleanLineup, NOT_A_SHOW_TITLE, notPast, esDeLaEscena, FUENTES_CON_EVIDENCIA } from "./lib/content-rules.js";
import { detectCity, isAmbaCity, namesOtherCity } from "./lib/places.js";
import { slugify, eventSlug, newsSlug, festivalSlug, GENRE_LIST, genreSlug, genreFromSlug } from "./lib/slug.js";
import { findePicks, eventEpoch } from "./lib/finde.js";
import { ciclosVigentes } from "./lib/ciclos.js";
import { armarSemana } from "./lib/semana.js";
import { marked } from "marked";
import matter from "gray-matter";

const PKG_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")).version; }
  catch { return "unknown"; }
})();


const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === "production";
const PROD_ORIGIN = process.env.ORIGIN || "https://basslayer.io";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Cloudflare inyecta su beacon de Web Analytics en el HTML que pasa por
      // el proxy; sin estas dos entradas la CSP lo bloquea y no mide nada.
      scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
      // Las fuentes ahora se sirven desde el mismo origen (Geist Variable,
      // empaquetada por Vite): ya no hace falta habilitar Google Fonts.
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      // imgSrc abierto a cualquier HTTPS — los festivales y feeds se hostean en
      // dominios variados e impredecibles (CDNs, WP, S3, etc.). Las URLs vienen
      // de fuentes que controlamos curatorialmente, no de input de usuario.
      imgSrc: ["'self'", "data:", "https:"],
      // Previews de 30 s del line-up: /api/preview redirige al CDN de Deezer.
      mediaSrc: ["'self'", "https://*.dzcdn.net"],
      connectSrc: ["'self'", "https://cloudflareinsights.com"],
    },
  },
}));
app.use(compression());
app.use(cors({
  origin: IS_PROD
    ? [PROD_ORIGIN]
    : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
}));

// JSON de 10 kB para todo.
app.use(express.json({ limit: "10kb" }));

// Rate limiter — sliding window, per IP, bounded map size
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_API_MAX = 300; // la SPA sola hace ~9 req por carga + /api/prices cada 30 s
const RATE_LIMIT_OG_MAX = 60;   // satori+resvg: CPU-intensivo, slugs enumerables
const RATE_LIMIT_MAP_MAX = 10_000; // Max tracked IPs to prevent memory exhaustion

// Prod va usuario → Cloudflare → edge de Railway → app: con trust proxy 1,
// req.ip es el nodo de Cloudflare y toda una ciudad compartiría el cupo.
// Cloudflare manda la IP real en CF-Connecting-IP (spoofeable solo pegándole
// directo a Railway, y ahí lo único que se gana es otro bucket de rate limit).
function clientIp(req) {
  return req.get("cf-connecting-ip") || req.ip || req.socket?.remoteAddress || "unknown";
}

function makeRateLimit(max) {
  const rateLimitMap = new Map();
  // Sweep expired entries every 2 minutes; unref → no retiene el proceso al apagar.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now - entry.start > RATE_LIMIT_WINDOW) rateLimitMap.delete(ip);
    }
  }, 120_000).unref();
  return (req, res, next) => {
  const now = Date.now();
  const ip = clientIp(req);
  const entry = rateLimitMap.get(ip);

  if (entry) {
    // Slide the window: reset if window has passed
    if (now - entry.start > RATE_LIMIT_WINDOW) {
      entry.count = 1;
      entry.start = now;
    } else {
      entry.count++;
    }
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.start + RATE_LIMIT_WINDOW - now) / 1000)));
      return res.status(429).json({ error: "Too many requests" });
    }
  } else {
    // Evict oldest entries if map is too large
    if (rateLimitMap.size >= RATE_LIMIT_MAP_MAX) {
      const firstKey = rateLimitMap.keys().next().value;
      rateLimitMap.delete(firstKey);
    }
    rateLimitMap.set(ip, { count: 1, start: now });
  }
  next();
  };
}
app.use("/api", makeRateLimit(RATE_LIMIT_API_MAX));
// /og en bucket aparte: los endpoints de OG image son CPU-intensivos (satori+resvg)
// y sus slugs son enumerables desde el sitemap → sin límite, un loop puede saturar
// el event loop. Un crawler de previews no debe consumir la cuota de la SPA.
app.use("/og", makeRateLimit(RATE_LIMIT_OG_MAX));
app.use("/img", makeRateLimit(600)); // una agenda carga ~90 miniaturas

// Cache-Control para los JSON públicos de /api: sin esto ni el browser ni el
// borde (Cloudflare) reutilizan un dato que el server considera fresco por
// minutos u horas. max-age = mitad del TTL con que la ruta cachea en memoria
// (clave de `cache`, o ms para las rutas con cache propio); SWR cubre el hueco.
// Solo GET con 2xx. Lo que no figura acá ni pone su propio header (health,
// errores) sale "private, no-store": la cache rule de Cloudflare
// para /api respeta el header del origen, así que nada privado queda en el borde.
const API_PUBLIC_TTL = {
  "/api/prices": "prices", "/api/news": "news", "/api/finance-news": "financeNews",
  "/api/markets": "markets", "/api/events": "events", "/api/bass-news": "bassNews",
  "/api/dashboard": "dashboard", "/api/prediction-markets": "predictions",
  "/api/btc-cycles": "btcCycles", "/api/dolar": "dolar",
  "/api/btc-network": "btcNetwork", "/api/crypto-events": "cryptoEvents",
  "/api/festivals": 60 * 60_000, "/api/artist": 24 * 60 * 60_000,
  "/api/crypto-irl": 10 * 60_000,
  "/api/ciclos": 30 * 60_000,
};
app.use("/api", (req, res, next) => {
  if (req.method !== "GET") return next();
  const ttl = API_PUBLIC_TTL[req.baseUrl + req.path]; // req.path es relativo al mount
  const ttlMs = typeof ttl === "string" ? cache[ttl].ttl : ttl;
  const header = ttlMs ? `public, max-age=${Math.max(5, Math.round(ttlMs / 2000))}, stale-while-revalidate=60` : "private, no-store";
  const json = res.json.bind(res);
  res.json = (body) => {
    if (!res.get("Cache-Control")) res.set("Cache-Control", ttlMs && res.statusCode < 300 ? header : "private, no-store");
    return json(body);
  };
  next();
});

// Express 4 no captura rechazos de handlers async: sin esto, un throw dentro de
// una ruta async deja la request colgada hasta el timeout del proxy.
for (const method of ["get", "post", "put", "delete"]) {
  const orig = app[method].bind(app);
  app[method] = (path, ...handlers) => {
    if (handlers.length === 0) return orig(path); // app.get("setting")
    return orig(path, ...handlers.map((h) =>
      typeof h === "function"
        ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
        : h
    ));
  };
}

if (IS_PROD) {
  // /assets/ lleva hash en el nombre (cada build cambia la URL): se cachea un
  // año. El resto (sw.js, manifest, íconos) se revalida siempre.
  app.use(express.static(join(__dirname, "dist"), {
    index: false,
    setHeaders: (res, path) => res.set("Cache-Control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate"),
  }));
}

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

const cache = {
  prices:      { data: null, ts: 0, ttl: 30_000 },
  news:        { data: null, ts: 0, ttl: 5 * 60_000 },
  financeNews: { data: null, ts: 0, ttl: 10 * 60_000 },  // 10min — noticias financieras generales (RSS macro/mercados)
  markets:     { data: null, ts: 0, ttl: 15 * 60_000 },  // 15min — cotizaciones de ETFs y acciones (CNBC)
  events:      { data: null, ts: 0, ttl: 60 * 60_000 },
  bassNews:    { data: null, ts: 0, ttl: 30 * 60_000 },
  dashboard:   { data: null, ts: 0, ttl: 5 * 60_000 },   // 5min — crypto dashboard
  cryptoEvents:{ data: null, ts: 0, ttl: 60 * 60_000 },  // 1h — crypto events
  predictions: { data: null, ts: 0, ttl: 5 * 60_000 },   // 5min — Polymarket trending
  btcCycles:   { data: null, ts: 0, ttl: 60 * 60_000 },  // 1h — ciclos halving (precio+200W en vivo, resto curado)
  dolar:       { data: null, ts: 0, ttl: 5 * 60_000 },   // 5min — USDT/ARS por exchange + dólares AR
  onchain:     { data: null, ts: 0, ttl: 6 * 60 * 60_000 }, // 6h — métricas on-chain diarias (bitcoin-data)
  btcNetwork:  { data: null, ts: 0, ttl: 10 * 60_000 },  // 10min — fees + ajuste de dificultad (mempool.space)
};

function cached(key) {
  const c = cache[key];
  return c.data && (Date.now() - c.ts < c.ttl) ? c.data : null;
}
function setCache(key, data) {
  cache[key] = { ...cache[key], data, ts: Date.now() };
  if (SNAPSHOT_KEYS.has(key)) saveSnapshot(key, data);
}

// ── Stale-while-revalidate + snapshot en disco ──
// Las fuentes lentas (events: 16 áreas de RA + BA + QH ≈ 25 s en frío;
// bassNews ≈ 7 s) no deben hacer esperar a nadie: si hay un dato vencido se
// sirve ya y se refresca en background, con una sola build en vuelo. El
// último dato bueno se persiste en data/cache/<key>.json para que un
// reinicio arranque servido y no en frío.
const SNAPSHOT_KEYS = new Set(["events", "bassNews", "prices", "dashboard"]);
const SNAPSHOT_DIR = join(__dirname, "data", "cache");
const swrInflight = new Map();

function saveSnapshot(key, data) {
  try {
    if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(join(SNAPSHOT_DIR, `${key}.json`), JSON.stringify({ ts: Date.now(), data }));
  } catch (e) { console.warn(`[cache] snapshot ${key}:`, e.message); }
}
// ── Imágenes que el server publicó (flyers, fotos de noticias) ──
// Es la única lista que acepta el proxy /img: sin allowlist de hosts que
// mantener y sin riesgo de proxy abierto. Se llena en cada build y desde los
// snapshots al arrancar.
const knownImages = new Set();
const KNOWN_IMAGES_MAX = 6000;
function registerImages(list, field = "image") {
  for (const it of list || []) {
    const u = it && it[field];
    if (typeof u !== "string" || !/^https?:\/\//.test(u)) continue;
    if (knownImages.size >= KNOWN_IMAGES_MAX) knownImages.delete(knownImages.values().next().value);
    knownImages.add(u);
  }
}

// Limpieza final de cada evento. Corre en cada build y también sobre el
// snapshot en disco: después de un deploy se sirve el snapshot hasta que la
// build nueva termina, y tiene que salir igual de limpio.
function tidyEvents(events) {
  // Actividades que no son shows, de cualquier fuente (QuéHacemos las filtra
  // antes; RA listó "Techno Yoga", una clase con DJ — Pablo decidió afuera).
  for (let i = events.length - 1; i >= 0; i--) if (NOT_A_SHOW_TITLE.test(events[i].name || "")) events.splice(i, 1);
  for (const ev of events) {
    // Los artistas también pasan por el decodificador (oct 2026: Buenos Aliens
    // mandaba "John O&acute;Callaghan" en el line-up aunque el título salía bien).
    ev.artists = cleanLineup((ev.artists || []).map((x) => (typeof x === "string" ? decodeHtmlEntities(x) : x)));
    // Ciudad asignada con texto parcial (sept 2026: "Belgrano esquina Peredo"
    // → CABA, antes de completarse "Córdoba Capital"): si venue o dirección
    // nombran otra ciudad del país, se vuelve a derivar con el texto final.
    // Misma regla que check-content (lib/places.js).
    if (ev.region === "AR" && ev.city === "CABA" && namesOtherCity(`${ev.venue || ""} ${ev.address || ""}`)) {
      ev.city = detectCity(ev.venue, ev.address, ev.name) || ev.city;
    }
    // Superficie de Bass: CABA + GBA (AMBA). Acá y no solo en la build: el
    // snapshot en disco también tiene que salir con la marca (sept 2026).
    if (isAmba(ev)) ev.area = "amba"; else delete ev.area;
  }
  return events;
}

// Bass es la agenda de la ESCENA ELECTRÓNICA (oct 2026, Pablo). RA, Buenos
// Aliens y los festivales curados son fuentes de escena; QuéHacemos es una
// cartelera general (rock, folklore, jazz, tango, reggaetón, stand-up y
// "festivales" como Burgerpalusa): de ahí entra solo lo que clasifica como
// club. Se filtra al armar la agenda (y al cargar un snapshot viejo) para que
// home, onda, agenda y SEO cuenten lo mismo.
const TITLE_TR_V = 8;   // sube cuando cambia cómo se traducen los titulares: el snapshot viejo se rearma
// Buenos Aliens: meses como los escribe ("SAB 11 ABR").
const BA_MONTHS = "ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC";
const BA_WEEKDAYS = { DOM: 0, LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6 };
// Mes de una fecha sin mes ("SAB 03"): este mes o el próximo, el primero en el
// que ese día cae en ese día de la semana y no ya pasó. Null si no coincide.
function inferBaMonth(weekday, day, now = new Date()) {
  const want = BA_WEEKDAYS[weekday.toUpperCase()];
  for (let k = 0; k < 2; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, day);
    if (d.getDate() !== day) continue;                                   // 31 en un mes de 30
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue; // ya pasó
    if (d.getDay() === want) { const m = BA_MONTHS.split("|")[d.getMonth()]; return m.charAt(0) + m.slice(1).toLowerCase(); }
  }
  return null;
}

// De QuéHacemos solo la escena: lo que la fuente clasifica como club Y que
// lo dice con sus palabras (ver hasElectronicEvidence).
function sceneOnly(events) {
  return events.filter((ev) => !FUENTES_CON_EVIDENCIA.has(ev.source) || (ev.family === "club" && esDeLaEscena(ev)));
}

function loadSnapshots() {
  for (const key of SNAPSHOT_KEYS) {
    try {
      const file = join(SNAPSHOT_DIR, `${key}.json`);
      if (!existsSync(file)) continue;
      const { ts, data: raw } = JSON.parse(readFileSync(file, "utf-8"));
      // Un snapshot viejo sale igual que una build nueva: solo escena y con fecha válida.
      // QuéHacemos se reclasifica con las reglas actuales (la familia guardada
      // puede ser de antes de un arreglo).
      if (key === "events" && Array.isArray(raw)) for (const ev of raw) if (ev.source === "quehacemos") { ev.genre = ""; ev.family = classifyFamily(ev); ev.genre = FAMILY_GENRE_LABEL[ev.family] || "En vivo"; }
      const data = key === "events" && Array.isArray(raw) ? sceneOnly(raw).filter((ev) => new RegExp(`^(${BA_MONTHS})$`, "i").test(ev.month || "")) : raw;
      const hayDatos = Array.isArray(data) ? data.length > 0 : !!data && typeof data === "object";
      if (hayDatos) {
        if (key === "events") tidyEvents(data);
        if (Array.isArray(data)) registerImages(data);
        // Noticias de Bass guardadas antes de que tuvieran idioma: se sirven igual
        // pero se rearman en el primer pedido (así llegan traducidas).
        const stale = key === "bassNews" && data.some((n) => !n.lang || (n.titleEs && n.trV !== TITLE_TR_V));
        cache[key] = { ...cache[key], data, ts: stale ? 0 : ts || 0 };
        const age = Math.round((Date.now() - (ts || 0)) / 60000);
        console.log(`[cache] ${key}: snapshot cargado (${Array.isArray(data) ? `${data.length} items` : "objeto"}, ${age} min)`);
      }
    } catch (e) { console.warn(`[cache] snapshot ${key} ilegible:`, e.message); }
  }
}
// Se llama recién antes de escuchar (abajo de todo): la reclasificación de
// QuéHacemos usa reglas definidas más adelante en el archivo (mbNorm…), y
// llamarla acá las encontraba sin inicializar y descartaba la agenda guardada.

// Devuelve el dato de `key`: fresco → directo; vencido → el viejo ya, refresh
// atrás; sin nada → espera la build. `build` debe devolver el dato final (o
// lanzar / devolver vacío, en cuyo caso se conserva el último bueno).
function swr(key, build) {
  const c = cache[key];
  const fresh = c.data && Date.now() - c.ts < c.ttl;
  if (fresh) return Promise.resolve(c.data);
  let p = swrInflight.get(key);
  if (!p) {
    p = build()
      .then((data) => {
        // Colapso = las fuentes cayeron juntas (sept 2026: todas abortaron y
        // la agenda quedó en 4 festivales, pisando el snapshot de ~580). Con
        // menos de un tercio del último bueno se conserva el bueno y se
        // reintenta en 5 min en vez de esperar el TTL entero.
        const prev = Array.isArray(c.data) ? c.data.length : 0;
        const collapsed = Array.isArray(data) && prev >= 30 && data.length < prev / 3;
        if (collapsed) console.warn(`[${key}] build colapsada (${data.length} vs ${prev}): se conserva la anterior`);
        const ok = !collapsed && (Array.isArray(data) ? data.length > 0 : data != null);
        if (ok) setCache(key, data);
        else if (c.data) cache[key].ts = Date.now() - Math.max(0, c.ttl - 5 * 60_000); // estirá el último bueno, reintento en 5 min
        return ok ? data : (c.data || data);
      })
      .catch((e) => {
        console.error(`[${key}] refresh:`, e.message);
        if (c.data) return c.data;
        throw e;
      })
      .finally(() => swrInflight.delete(key));
    swrInflight.set(key, p);
  }
  return c.data ? Promise.resolve(c.data) : p;
}

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB max response

async function fetchSafe(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Check Content-Length if available
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_RESPONSE_SIZE) {
      controller.abort();
      throw new Error(`Response too large: ${contentLength} bytes`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// Safe text reader with size limit
async function safeText(response, maxBytes = MAX_RESPONSE_SIZE) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    // node-fetch: consume body via async iteration with size limit
    const chunks = [];
    let totalSize = 0;
    for await (const chunk of response.body) {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        response.body.destroy?.();
        throw new Error(`Response exceeded ${maxBytes} byte limit`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
  const chunks = [];
  let totalSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.length;
    if (totalSize > maxBytes) {
      reader.cancel();
      throw new Error(`Response exceeded ${maxBytes} byte limit`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// Traducción (MyMemory, sin cuenta): titulares, bios y textos sueltos.
const { translateTitle, translateText } = crearTraductor({ SNAPSHOT_DIR, saveSnapshot, fetchSafe, safeText });

// Sanitize URLs from external sources — only allow http/https
// Las URLs se extraen de atributos HTML y de XML, donde "&" viaja escapado como
// "&amp;". Sin decodificar, los query strings quedaban rotos ("?a=1&amp;b=2").
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTH_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

// ─── Buscar por dirección (los slugs viven en lib/slug.js) ───
function findEventBySlug(slug) {
  const events = cached("events") || [];
  for (const ev of events) {
    if (eventSlug(ev) === slug) return ev;
  }
  return null;
}
function findNewsBySlug(slug) {
  // Los tres pools que abren el modal de nota: cripto, finanzas y música.
  const pools = [cached("news") || [], cached("financeNews") || [], cached("bassNews") || []];
  for (const pool of pools) {
    for (const n of pool) {
      if (newsSlug(n) === slug) return n;
    }
  }
  return null;
}
function findFestivalBySlug(slug) {
  const list = loadFestivals();
  for (const f of list) {
    if (festivalSlug(f) === slug) return f;
  }
  return null;
}

// ─── Guías long-form (Markdown driven) ──────
// Las guías son contenido editorial sustantivo (1500-2500 palabras) con
// keyword targeting de queries informacionales de alto volumen. Tipo de
// contenido que atrae backlinks de prensa y fortalece autoridad temática.
const GUIAS_DIR = join(__dirname, "data", "guias");
let guiasCache = null;
let guiasCacheTs = 0;
const GUIAS_CACHE_TTL = 5 * 60_000; // 5min — releva edits sin reinicio

function loadGuias() {
  const now = Date.now();
  if (guiasCache && (now - guiasCacheTs) < GUIAS_CACHE_TTL) return guiasCache;
  try {
    if (!existsSync(GUIAS_DIR)) { guiasCache = []; guiasCacheTs = now; return guiasCache; }
    const files = readdirSync(GUIAS_DIR).filter(f => f.endsWith(".md"));
    const all = files.map(file => {
      const raw = readFileSync(join(GUIAS_DIR, file), "utf-8");
      const parsed = matter(raw);
      const slug = parsed.data.slug || file.replace(/\.md$/, "");
      return {
        slug,
        title: parsed.data.title || slug,
        description: parsed.data.description || "",
        keywords: parsed.data.keywords || [],
        publishedAt: parsed.data.publishedAt,
        updatedAt: parsed.data.updatedAt,
        category: parsed.data.category || "general",
        author: parsed.data.author || "BassLayer Editorial",
        heroEmoji: parsed.data.heroEmoji || "",
        tldr: parsed.data.tldr || "",
        faqs: Array.isArray(parsed.data.faqs) ? parsed.data.faqs : [],
        body: parsed.content,
        bodyHtml: marked.parse(parsed.content, { mangle: false, headerIds: true }),
      };
    });
    // Sort: más reciente primero
    all.sort((a, b) => String(b.updatedAt || b.publishedAt || "").localeCompare(String(a.updatedAt || a.publishedAt || "")));
    guiasCache = all;
    guiasCacheTs = now;
    return all;
  } catch (e) {
    console.error("[guias] load error:", e.message);
    return [];
  }
}
function findGuiaBySlug(slug) {
  return loadGuias().find(g => g.slug === slug) || null;
}

// ─── Familias (las listas y slugs viven en lib/slug.js) ──
// Label legible por familia para los hubs de género (prerender ES para SEO).
const FAMILY_LABEL_ES = { club: "Club", live: "Música en vivo", festival: "Festivales", urbano: "Urbano", raiz: "Raíz" };
function genreLabel(family) { return FAMILY_LABEL_ES[family] || family; }
// ─── City detection ──────────────────────────
// La regla vive en lib/places.js (compartida con el front y los chequeos).
// Sin ciudad explícita: CABA por defecto, marcado `cityGuessed` para cruzarlo
// con otras fuentes (reconcileGuessedCities) antes del dedup.
function withCity(venue, address, title) {
  const city = detectCity(venue, address, title);
  return city ? { city } : { city: "CABA", cityGuessed: true };
}
function isAmba(ev) { return ev.region === "AR" && isAmbaCity(ev.city); }
// Venue sin confirmar de RA: "TBA - Palermo", "TBC: …".
const VENUE_TBA = /^(tba|tbd|tbc)\s*[-:|–—]\s*/i;

// Un show que una fuente ubica sin decir la ciudad (CABA supuesto) y otra
// fuente ubica explícitamente en otra ciudad el mismo día, con algún artista
// en común o el mismo venue, es ese show: gana la ciudad explícita.
function reconcileGuessedCities(events) {
  const firstWord = (v) => normalizeArtistName(String(v || "").replace(VENUE_TBA, "").split(/[ ,@]/)[0]);
  // Índice por día de los shows con otra ciudad explícita (artistas y primera
  // palabra del venue ya normalizados).
  const byDay = new Map();
  for (const o of events) {
    if (o.region !== "AR" || o.cityGuessed || !o.city || o.city === "CABA") continue;
    const k = `${o.day}|${o.month}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push({ city: o.city, arts: new Set((o.artists || []).map(normalizeArtistName)), venue: firstWord(o.venue) });
  }
  let fixed = 0;
  for (const ev of events) {
    if (!ev.cityGuessed) continue;
    delete ev.cityGuessed;
    const arts = (ev.artists || []).map(normalizeArtistName).filter((a) => a.length > 2);
    const venue = firstWord(ev.venue);
    const hit = (byDay.get(`${ev.day}|${ev.month}`) || []).find((o) => arts.some((a) => o.arts.has(a)) || (venue && venue === o.venue));
    if (hit) { ev.city = hit.city; fixed++; }
  }
  if (fixed) console.log(`[events] ${fixed} eventos reubicados por cruce de fuentes (no eran de CABA)`);
}

montarLayerFuentes(app, { cache, cached, eachLimit, fetchSafe, registerImages, safeText, setCache, translateTitle });

const { buildBassNews } = montarBassNoticias(app, { BROWSER_HEADERS, MONTH_MAP, TITLE_TR_V, eachLimit, fetchSafe, registerImages, safeText, swr, translateTitle });

// ─────────────────────────────────────────────
//  GET /api/events — Buenos Aliens + RA + fallback
//  Query: ?genre=Techno
// ─────────────────────────────────────────────

function detectGenre(text) {
  const t = text.toLowerCase();
  if (t.includes("melodic") && t.includes("techno")) return "Melodic";
  if (t.includes("techno") || t.includes("industrial")) return "Techno";
  if (t.includes("deep house")) return "Deep House";
  if (t.includes("tech house")) return "Tech House";
  if (t.includes("house")) return "House";
  if (t.includes("progressive")) return "Progressive";
  if (t.includes("minimal")) return "Minimal";
  if (t.includes("dnb") || t.includes("jungle") || t.includes("drum")) return "DnB";
  if (t.includes("trance")) return "Trance";
  if (t.includes("ambient") || t.includes("downtempo")) return "Ambient";
  if (t.includes("disco")) return "Disco";
  if (t.includes("festival") || t.includes("ultra") || t.includes("lolla")) return "Festival";
  return "Electronic";
}

// ─────────────────────────────────────────────
//  Taxonomía de familias (rediseño Bass multi-género)
//  Familias: club · live · festival · urbano · raiz · exp
//  Unifica electrónica (RA/BA) con multi-género (QuéHacemos).
// ─────────────────────────────────────────────

const FAMILY_GENRE_LABEL = { club:"Electronic", live:"En vivo", festival:"Festival", urbano:"Urbano", raiz:"Raíz", exp:"Experimental" };

// event_type de QuéHacemos → familia (primer indicio, luego refina MusicBrainz)
const QH_TYPE_FAMILY = { electronica:"club", fiesta:"club", festival:"festival", cuarteto:"raiz", recital:"live" };

const ELECTRONIC_GENRES = new Set(["Melodic","Techno","Deep House","Tech House","House","Progressive","Minimal","DnB","Trance","Disco","Electronic"]);
function familyFromGenreLabel(genre) {
  if (!genre) return null;
  if (genre === "Festival") return "festival";
  if (genre === "Ambient") return "exp";              // ambient se lee como experimental
  if (ELECTRONIC_GENRES.has(genre)) return "club";
  return null;
}

// Keywords en título/descripción — específicas antes que genéricas.
const FAMILY_KEYWORDS = [
  ["urbano", /\b(trap|reggaet[oó]n|reggaeton|hip[\s-]?hop|\brap\b|rkt|freestyle|urbano|drill|perreo|dembow)\b/i],
  ["raiz",   /\b(jazz|blues|folclor|folklor|cumbia|tango|milonga|salsa|bolero|chamam[eé]|bossa|reggae|ska|candombe|chacarera|zamba|flamenco|cuarteto|bailanta|murga|son cubano)\b/i],
  ["exp",    /\b(experimental|ambient|drone|noise|contempor[aá]nea|improvisaci[oó]n|electroac[uú]stica|sound art|free jazz)\b/i],
  ["club",   /\b(techno|deep house|tech house|house|trance|electr[oó]nica|\brave\b|\bafter\b|dj set|b2b|minimal|acid|\bdnb\b|drum\s*&?\s*bass|dubstep)\b/i],
  ["live",   /\b(rock|indie|\bpop\b|punk|metal|hardcore|shoegaze|post[\s-]?punk|grunge|stoner|cantautor|power pop|new wave)\b/i],
];
// Salas de tango y jazz (verificadas): Club Atlético Fernández Fierro (CAFF),
// Jazz Voyeur, Prez Jazz Club.
const NOT_CLUB_VENUES = /(?<!\p{L})(CAFF|Fern[aá]ndez Fierro|Jazz Voyeur|Prez Jazz)(?!\p{L})/iu;   // "CAFF" entero: no "Caffè"
function familyFromKeywords(text) {
  const t = " " + (text || "").toLowerCase() + " ";
  for (const [fam, re] of FAMILY_KEYWORDS) if (re.test(t)) return fam;
  return null;
}

function mbQueryName(ev) { return (ev.artists && ev.artists[0]) || ev.name || ""; }

// Clasificador de familia. Orden de confianza:
// festival → fuente/genero electrónico → MusicBrainz (artista) → keywords → event_type → default.
function classifyFamily(ev) {
  const name = ev.name || "";
  if (ev.event_type === "festival" || ev.genre === "Festival" || /\bfestival\b/i.test(name)) return "festival";
  // Fuentes intrínsecamente electrónicas (Resident Advisor, Buenos Aliens) → club.
  // Venti entra solo con evidencia de escena (ver mapVenti): también club.
  if (ev.source === "ra" || ev.source === "buenosaliens" || ev.source === "venti") return "club";
  const elFam = familyFromGenreLabel(ev.genre);
  if (elFam === "club") return "club";
  // MusicBrainz (cache) — señal autoritativa sobre el artista; refina "recital".
  const mb = mbCacheGet(mbQueryName(ev));
  if (mb && mb.family) return mb.family;
  const kw = familyFromKeywords(`${name} ${(ev.artists || []).join(" ")} ${ev.description || ""}`);
  if (kw) return kw;
  // QuéHacemos a veces tipea "electronica" un concierto de una sala de tango o
  // jazz, sin descripción (oct 2026: Yamile Burich + Quena Taborda en el CAFF,
  // jazz/tango verificado en Planout, Selmer y Konex). En esas salas el tipo de
  // QH solo no alcanza para ser club.
  if (ev.source === "quehacemos" && NOT_CLUB_VENUES.test(ev.venue || "")) return "raiz";
  if (ev.event_type && QH_TYPE_FAMILY[ev.event_type]) return QH_TYPE_FAMILY[ev.event_type];
  if (elFam) return elFam;                  // Ambient → exp
  if (ev.source === "venue") return "club"; // venue-submitted históricamente electrónico
  return "live";
}

// ─────────────────────────────────────────────
//  MusicBrainz — clasificación de género por artista (sin API key)
//  Rate limit real: 1 req/s + User-Agent descriptivo. Cache en disco
//  ("horneado" como la curva BTC): la metadata de un artista casi no cambia.
//  Nunca bloquea /api/events — lee cache y calienta en background.
// ─────────────────────────────────────────────

const MB_CACHE_FILE = join(__dirname, "data", "mb-family-cache.json");
let mbCache = {};
try { if (existsSync(MB_CACHE_FILE)) mbCache = JSON.parse(readFileSync(MB_CACHE_FILE, "utf8")) || {}; } catch { mbCache = {}; }
const MB_HEADERS = { "User-Agent": "BassLayer/1.0 ( https://basslayer.io )" };
const mbSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mbNorm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function mbCacheGet(name) { const k = mbNorm(name); return k ? (mbCache[k] || null) : null; }

// Nombres que no son un artista puntual → no vale consultar MB (fiestas, ciclos…).
const MB_GENERIC_RE = /\b(fiesta|noche|milonga|tributo|homenaje|open air|after|closing|opening|showcase|pre[\s-]?party|ciclo|festival|sunset|rooftop|day party|b2b|vs\.?|edici[oó]n|aniversario|tour|presenta)\b/i;

function mbGenreToFamily(g) {
  if (!g) return null;
  g = g.toLowerCase();
  if (/(techno|house|trance|electro|\bedm\b|drum and bass|\bdnb\b|dubstep|minimal|acid|rave|hardstyle|gabber|breakbeat|\bidm\b|downtempo|big room|trip hop|electronica|electronic\b)/.test(g)) return "club";
  if (/(hip hop|hip-hop|\brap\b|trap|reggaeton|reggaetón|r&b|\brnb\b|grime|drill|dembow)/.test(g)) return "urbano";
  if (/(jazz|blues|folk|folklore|cumbia|tango|salsa|bolero|bossa|reggae|\bska\b|\bdub\b|soul|funk|world|latin|chamame|candombe|flamenco|bluegrass|country)/.test(g)) return "raiz";
  if (/(ambient|drone|noise|experimental|musique concrete|avant|field recording|contemporary classical)/.test(g)) return "exp";
  if (/(rock|indie|\bpop\b|punk|metal|hardcore|shoegaze|grunge|\bemo\b|new wave|post-punk|britpop|alternative)/.test(g)) return "live";
  return null;
}

const mbQueued = new Set();
const mbQueue = [];
let mbBusy = false, mbDirty = false, mbLastPersist = 0;

function mbEnqueue(name) {
  const k = mbNorm(name);
  if (!k || k.length < 3) return;
  if (k in mbCache) return;                 // ya resuelto (familia o null)
  if (mbQueued.has(k)) return;
  if (MB_GENERIC_RE.test(name) || k.split(" ").length > 5) { mbCache[k] = null; mbDirty = true; return; }
  if (mbQueue.length > 200) return;         // backstop anti-runaway
  mbQueued.add(k);
  mbQueue.push({ k, name });
  mbDrain();
}
async function mbDrain() {
  if (mbBusy) return;
  mbBusy = true;
  try {
    while (mbQueue.length) {
      const { k, name } = mbQueue.shift();
      mbQueued.delete(k);
      try { mbCache[k] = await mbClassify(name); } catch { mbCache[k] = null; }
      mbDirty = true;
      if (Date.now() - mbLastPersist > 15000) mbPersist();
      await mbSleep(1100);                   // rate limit MusicBrainz: 1 req/s
    }
  } finally {
    mbBusy = false;
    if (mbDirty) mbPersist();
  }
}
function mbPersist() {
  try { writeFileSync(MB_CACHE_FILE, JSON.stringify(mbCache)); mbDirty = false; mbLastPersist = Date.now(); } catch {}
}
async function mbClassify(name) {
  const q = encodeURIComponent(`artist:"${name}"`);
  const sr = await fetchSafe(`https://musicbrainz.org/ws/2/artist/?query=${q}&fmt=json&limit=1`, { headers: MB_HEADERS }, 8000);
  if (!sr.ok) return null;
  const sj = JSON.parse(await safeText(sr, 512 * 1024));
  const a = sj.artists && sj.artists[0];
  if (!a || (a.score || 0) < 90) return null;
  if (mbNorm(a.name) !== mbNorm(name)) return null;   // exige match de nombre (precisión > cobertura)
  await mbSleep(1100);                                 // 1 req/s también entre las 2 llamadas
  const lr = await fetchSafe(`https://musicbrainz.org/ws/2/artist/${a.id}?inc=genres+tags&fmt=json`, { headers: MB_HEADERS }, 8000);
  if (!lr.ok) return null;
  const lj = JSON.parse(await safeText(lr, 512 * 1024));
  const byCount = (arr) => (arr || []).slice().sort((x, y) => (y.count || 0) - (x.count || 0));
  // MB tiene poca cobertura de `genres` para artistas locales; los `tags`
  // folksonómicos son el respaldo. Género primero, luego tags.
  const labels = [...byCount(lj.genres), ...byCount(lj.tags)];
  for (const g of labels) { const fam = mbGenreToFamily(g.name); if (fam) return { family: fam, genre: g.name, mbid: a.id }; }
  return null;
}

const { qhNormTitle, fetchQueHacemos, fetchBuenosAliens, fetchRAGraphQL, fetchRAHtml, RA_AREAS, ventiEvents, refrescarVentiSiViejo } = montarAgendaFuentes(app, { BA_MONTHS, BROWSER_HEADERS, MONTHS_ES, SNAPSHOT_DIR, VENUE_TBA, cache, detectGenre, fetchSafe, inferBaMonth, safeText, saveSnapshot, withCity });

// ── Featured detection ──

const FEATURED_NAMES = ["lollapalooza","ultra","creamfields","sasha","cattáneo","cattaneo","digweed"];

function markFeatured(ev) {
  const n = ev.name.toLowerCase();
  ev.featured = ev.genre === "Festival"
    || (ev.artists && ev.artists.length >= 4)
    || FEATURED_NAMES.some(f => n.includes(f));
  return ev;
}

// ── Merge & dedup ──

function deduplicateEvents(events) {
  // Pass 1: dedup by normalized venue. Catches accent diffs ("Moscú" vs
  // "Moscu"), TBA- prefix when RA hasn't confirmed the venue, and trailing
  // city/zone suffixes (", Costanera"). Falls short on aliases between
  // sources (e.g. BA "Amerika" vs RA "TBA - AMK Club") — pass 2 covers that.
  const STOP_WORDS = new Set(["club","the","el","la","los","las","bar","centro","casa"]);
  const normVenue = (v) => {
    if (!v) return "";
    const cleaned = v
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(VENUE_TBA, "")
      .replace(/[@,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = cleaned.split(" ").filter(Boolean);
    if (words.length <= 1) return words[0] || "";
    return STOP_WORDS.has(words[0]) ? `${words[0]} ${words[1]}` : words[0];
  };
  const mergeFields = (target, src) => {
    if (!target.image && src.image) target.image = src.image;
    if (!target.url && src.url) target.url = src.url;
    // Keep the longer artist list — more info wins, and the venue source
    // (BA) typically has the full local lineup vs RA's shorter abstract.
    if ((src.artists?.length || 0) > (target.artists?.length || 0)) {
      target.artists = src.artists;
    }
  };

  // La ciudad entra en la key: dos venues homónimos en ciudades distintas
  // (multi-área RA) no son el mismo evento. Gana la primera que llega, salvo
  // que su venue esté sin confirmar ("TBA - …") y la otra no (oct 2026: se
  // veía "TBA - Area Costanera, Quilmes" en vez de "Área Costanera").
  const tba = (ev) => VENUE_TBA.test(ev.venue || "");
  const byVenue = new Map();
  for (const ev of events) {
    const key = `${ev.day}-${ev.month}-${ev.city || ""}-${normVenue(ev.venue)}`;
    const existing = byVenue.get(key);
    if (!existing) byVenue.set(key, ev);
    else if (tba(existing) && !tba(ev)) { mergeFields(ev, existing); byVenue.set(key, ev); }
    else mergeFields(existing, ev);
  }

  // Pass 2: dedup by line-up overlap on same date. Catches venue aliases
  // that pass 1 misses (e.g. "Amerika" vs "AMK Club"). Two events on the
  // same day sharing ≥1 non-trivial artist are treated as the same event.
  // Risk: a DJ playing two real gigs the same night collapses into one —
  // rare in BA, accepted trade for the much more common alias case.
  const TRIVIAL_ARTISTS = new Set(["tba","b2b","más a confirmar","mas a confirmar",""]);
  const normArtist = (a) => (a || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim();
  // Una vez por evento (los pases 2 y 2b comparan pares del mismo día).
  const sets = new Map();
  const artistSet = (ev) => {
    if (!sets.has(ev)) sets.set(ev, new Set((ev.artists || []).map(normArtist).filter(a => a && !TRIVIAL_ARTISTS.has(a))));
    return sets.get(ev);
  };
  // Score: prefer entries with a clean venue/name (BA-style local naming)
  // over RA's noisy placeholders ("TBA - X Club, Zone", "X & MORE ARTISTS").
  // Image and url are still rewarded but only as tie-breakers — they're
  // merged into the keeper anyway via mergeFields, so it's better to pick
  // the human-friendly entry as the visible one.
  const score = (ev) => {
    let s = 0;
    if (ev.image) s += 0.5;
    if (ev.url) s += 0.3;
    s += (ev.artists?.length || 0) / 100;
    if (VENUE_TBA.test(ev.venue || "")) s -= 3;
    if (/\bMORE ARTISTS\b/.test(ev.name || "")) s -= 2;
    return s;
  };

  const list = [...byVenue.values()];
  const byDay = new Map();
  for (const ev of list) {
    // La ciudad entra en la key: el pass de solape de line-up solo compara
    // eventos de la misma ciudad (un DJ en Berlín y otro set en Londres la
    // misma noche no deben colapsar en uno).
    const dKey = `${ev.day}-${ev.month}-${ev.city || ""}`;
    if (!byDay.has(dKey)) byDay.set(dKey, []);
    byDay.get(dKey).push(ev);
  }
  const dropped = new Set();
  for (const evs of byDay.values()) {
    if (evs.length < 2) continue;
    for (let i = 0; i < evs.length; i++) {
      if (dropped.has(evs[i])) continue;
      const aSet = artistSet(evs[i]);
      if (aSet.size === 0) continue;
      for (let j = i + 1; j < evs.length; j++) {
        if (dropped.has(evs[j])) continue;
        const bSet = artistSet(evs[j]);
        let overlap = false;
        for (const a of aSet) { if (bSet.has(a)) { overlap = true; break; } }
        if (!overlap) continue;
        // Merge into the higher-scored entry, drop the other.
        const [keep, drop] = score(evs[i]) >= score(evs[j])
          ? [evs[i], evs[j]] : [evs[j], evs[i]];
        mergeFields(keep, drop);
        dropped.add(drop);
        if (drop === evs[i]) break; // i was dropped, advance outer loop
      }
    }
  }
  // Pass 2b (oct 2026): RA publica algunos eventos sin line-up y con los
  // artistas solo en el título ("Nick Warren + Kevin Di Serna" en "TBA - AMK
  // Club", que Buenos Aliens tiene como "Fragment @ Amerika"). Mismo día,
  // ciudad y HORA EXACTA, uno sin line-up y un artista del line-up del otro
  // (de 4 letras o más, palabra entera) en su título: es la misma fiesta.
  const enTitulo = (nombre, artistas) => {
    const n = ` ${mbNorm(nombre)} `;
    for (const a of artistas) if (a.length >= 4 && n.includes(` ${mbNorm(a)} `)) return true;
    return false;
  };
  const unidos2b = [];
  for (const evs of byDay.values()) {
    for (let i = 0; i < evs.length; i++) {
      if (dropped.has(evs[i]) || !evs[i].time) continue;
      for (let j = i + 1; j < evs.length; j++) {
        if (dropped.has(evs[j]) || evs[j].time !== evs[i].time) continue;
        const [a, b] = [evs[i], evs[j]];
        // Solo cuando uno de los dos no trae line-up (el caso de RA): dos fiestas con line-up ya las compara el pass 2.
        const sinA = !artistSet(a).size, sinB = !artistSet(b).size;
        if (!((sinB && enTitulo(b.name, artistSet(a))) || (sinA && enTitulo(a.name, artistSet(b))))) continue;
        const [keep, drop] = score(a) >= score(b) ? [a, b] : [b, a];
        mergeFields(keep, drop);
        dropped.add(drop);
        unidos2b.push(`${keep.day} ${keep.month} ${keep.name} = ${drop.name}`);
        if (drop === a) break;
      }
    }
  }
  if (unidos2b.length) console.log(`[events] ${unidos2b.length} unidos por artista en el título: ${unidos2b.slice(0, 8).join(" | ")}`);
  // Pass 3: el mismo evento publicado por dos ticketeras, sin line-up y con la
  // sala escrita distinto (sept 2026: "Espresso Club Session 11 @ Llama Café"
  // en "Puerto Madero" y "ESPRESSO SESSION 011 — PRIMAVERA BRUTAL" en "LLAMA
  // COFFEE ROASTERS"). Mismo día, ciudad y HORA EXACTA, y el mismo núcleo de
  // nombre: la parte antes de "@", "—", "-", "|", " en ", sin palabras
  // genéricas ni meses ("espresso 11" en los dos). Medido sobre la agenda: une
  // solo ese par; compartir palabras sueltas (productora, barrio) unía 25
  // pares falsos.
  const GENERIC = new Set(["club","session","sessions","fiesta","party","presenta","presents","pres","live","night","noche","edicion","vol","the","and","con","del","los","las","una","por","para","enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","setiembre","octubre","noviembre","diciembre"]);
  const nameCore = (name) => {
    const head = String(name || "").split(/\s+(?:@|—|–|-|\||·|en|at)\s+|:/i)[0];
    const toks = qhNormTitle(head).split(" ").map(w => w.replace(/^0+(?=\d)/, ""))
      .filter(w => w && (/^\d+$/.test(w) || w.length >= 3) && !GENERIC.has(w));
    if (!toks.some(w => !/^\d+$/.test(w) && w.length >= 4)) return "";
    return [...new Set(toks)].sort().join(" ");
  };
  const byCore = new Map();
  for (const ev of list) {
    if (dropped.has(ev) || !ev.time) continue;
    const core = nameCore(ev.name);
    if (!core) continue;
    const k = `${ev.day}-${ev.month}-${ev.city || ""}-${ev.time}-${core}`;
    const prev = byCore.get(k);
    if (!prev) { byCore.set(k, ev); continue; }
    const [keep, drop] = score(prev) >= score(ev) ? [prev, ev] : [ev, prev];
    mergeFields(keep, drop);
    dropped.add(drop);
    byCore.set(k, keep);
  }
  return list.filter(ev => !dropped.has(ev));
}

// ── Title cleanup ──
// Limpia ruido de scrapers (RA + Buenos Aliens): brackets, "- by VENUE",
// "& MORE ARTISTS", sufijo "y más", coma entre artistas → ·, y title-case
// cuando el scraper devuelve todo en mayúsculas.
function titleCaseEs(s) {
  return s.toLowerCase().split(/(\s+|[·:\-–—])/).map(w => {
    if (!w || /^\s+$/.test(w) || /^[·:\-–—]$/.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join("");
}

function cleanEventName(raw, source) {
  if (!raw) return "";
  let n = String(raw);
  // Strip "- by VENUE, CITY" (patrón RA)
  n = n.replace(/\s*[-–—]\s*by\s+.+$/i, "");
  // Strip "[ANNIVERSARY]", "[DIA DEL AMIGO]" y similares
  n = n.replace(/\s*\[[^\]]*\]/g, "");
  // Strip "& MORE ARTISTS" / "and MORE ARTISTS"
  n = n.replace(/\s*(?:&|and)\s+MORE\s+ARTISTS\b/gi, "");
  // Strip sufijo " y más"
  n = n.replace(/\s+y\s+más\s*$/i, "");
  // Trim conectores colgando al final
  n = n.replace(/[\s,+&·\-–—]+$/g, "");
  // Title-case si vino todo en mayúsculas desde un scraper
  if (source === "ra" || source === "buenosaliens") {
    const letters = n.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
    if (letters.length >= 6 && letters === letters.toUpperCase()) {
      n = titleCaseEs(n);
    }
  }
  // Coma entre artistas → middot
  n = n.replace(/,\s+/g, " · ");
  // Colapsar espacios
  n = n.replace(/\s{2,}/g, " ").trim();
  return n;
}

const { loadFestivals, festivalStatus, arFestivalsAsEvents } = montarFestivales(app, { BROWSER_HEADERS, MONTHS_ES, rootDir: __dirname, fetchSafe, registerImages });
// el último dato bueno mientras tanto.
let lastEventsBuild = null;
async function buildEvents() {
  const buildStart = Date.now();
  let allEvents = [];

  // Fuentes independientes EN PARALELO (antes secuenciales → suma de latencias).
  // QuéHacemos pagina y es la más lenta; ya no bloquea a Buenos Aliens ni RA.
  const [baEvents, raResults, qhEvents] = await Promise.all([
    fetchBuenosAliens().catch((e) => { console.error("[events] Buenos Aliens error:", e.message); return []; }),
    Promise.allSettled(RA_AREAS.map(fetchRAGraphQL)),   // todas las áreas; nunca rechaza
    fetchQueHacemos().catch((e) => { console.error("[events] QuéHacemos fetch error:", e.message); return []; }),
  ]);

  // Buenos Aliens (fuente primaria local)
  if (baEvents.length > 0) {
    console.log(`[events] Buenos Aliens: ${baEvents.length} events loaded`);
    allEvents.push(...baEvents);
  }

  // Resident Advisor GraphQL — agregamos TODAS las áreas (el dedup maneja solapes)
  let raCount = 0;
  for (const r of raResults) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      allEvents.push(...r.value);
      raCount += r.value.length;
    }
  }
  if (raCount > 0) console.log(`[events] RA GraphQL: ${raCount} events loaded (${RA_AREAS.length} áreas)`);

  // RA HTML como fallback sólo si el GraphQL no trajo nada (depende del resultado RA)
  if (!allEvents.some(e => e.source === "ra")) {
    const raHtml = await fetchRAHtml();
    if (raHtml.length > 0) {
      console.log(`[events] RA HTML: ${raHtml.length} events loaded`);
      allEvents.push(...raHtml);
    }
  }

  // Venti — fiestas con evidencia de escena (último lote leído en segundo plano).
  const ventiEvs = ventiEvents();
  if (ventiEvs.length > 0) {
    console.log(`[events] Venti: ${ventiEvs.length} events loaded`);
    allEvents.push(...ventiEvs);
  }

  // QuéHacemos — agenda multi-género AR (rock, pop, urbano, jazz, cuarteto…),
  // lo que las fuentes electrónicas (RA/BA) no ven.
  if (qhEvents.length > 0) {
    console.log(`[events] QuéHacemos: ${qhEvents.length} events loaded`);
    allEvents.push(...qhEvents);
  }

  // Festivales de Argentina en la agenda (curados) — Primavera BA, Creamfields,
  // DGTL, Movement, etc. Aparecen bajo la familia "Festival" de la región AR.
  const arFests = arFestivalsAsEvents();
  if (arFests.length > 0) {
    console.log(`[events] Festivales AR: ${arFests.length} en agenda`);
    allEvents.push(...arFests);
  }

  // If nothing worked, use curated fallback
  if (allEvents.length === 0) {
    console.log("[events] All sources failed, using curated fallback");
    allEvents = []; // sin fuentes no inventamos eventos: el front muestra el estado vacío
  }

  // Toda fuente local (Buenos Aliens, RA HTML, fallback) es Argentina por
  // definición; solo RA GraphQL multi-área trae otras regiones.
  allEvents.forEach(ev => {
    if (!ev.region) ev.region = "AR";
    // Una sola etiqueta para la ciudad: "Buenos Aires" (RA, QH) y "CABA" (BA)
    // eran dos ciudades para el filtro y para el dedup (auditoría 2026-09).
    if (/^(buenos aires|ciudad de buenos aires|capital federal)$/i.test((ev.city || "").trim())) ev.city = "CABA";
  });

  // Antes del dedup: sin la ciudad correcta, el mismo show de dos fuentes
  // (RA "La Fabrica" + BA "La Fabrica Arena, Córdoba") no colapsa.
  reconcileGuessedCities(allEvents);

  // Deduplicate (same day+city+venue = same event)
  const deduped = deduplicateEvents(allEvents);

  // Limpiar nombres ruidosos de scrapers
  deduped.forEach(ev => { ev.name = cleanEventName(ev.name, ev.source); });

  // Filter out past events and sort by actual date (handles year boundaries)
  const now = new Date();
  const year = now.getFullYear();

  function getEventFullDate(ev) {
    const m = MONTH_MAP[ev.month.toLowerCase()] ?? -1;
    if (m === -1) return null;
    const d = new Date(year, m, parseInt(ev.day));
    // If the date is more than 30 days in the past, assume it's next year
    if (d < now - 30 * 86400000) d.setFullYear(year + 1);
    return d;
  }

  let events = notPast(deduped);

  // Mark featured events
  events.forEach(markFeatured);

  // Sort by actual date
  events.sort((a, b) => {
    const da = getEventFullDate(a);
    const db = getEventFullDate(b);
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

  // Line-ups: las fuentes (sobre todo RA) mezclan nombres de escenario y
  // placeholders con los artistas ("Main Stage", "Terraza", "TBA"). Se limpian
  // acá, una vez, para que ticker, cards, pósters, modal y share los vean igual.
  tidyEvents(events);

  // Clasificación multi-género: cada evento recibe `family` (taxonomía Bass:
  // club/live/festival/urbano/raiz/exp). Los de QuéHacemos toman su label de
  // género desde la familia. MusicBrainz se calienta en background (no bloquea).
  for (const ev of events) {
    ev.family = classifyFamily(ev);
    if (ev.source === "quehacemos") ev.genre = FAMILY_GENRE_LABEL[ev.family] || "En vivo";
    // MB solo aporta donde hay ambigüedad de artista (live/recital); club y
    // festival ya están resueltos por fuente/tipo. Se calienta en background.
    if (ev.family !== "club" && ev.family !== "festival") mbEnqueue(mbQueryName(ev));
  }
  events = sceneOnly(events);

  // Fallback de flyer: foto del headliner (Deezer) para eventos sin imagen.
  // Esperamos hasta ARTIST_IMAGE_BUDGET_MS para que el primer response ya
  // traiga la mayoría; el resto sigue en background mutando los objetos
  // cacheados (los requests siguientes las ven completas).
  const enriching = enrichArtistImages(events).catch(e => console.error("[events] artist images:", e.message));
  let budgetTimer;
  await Promise.race([enriching, new Promise(r => { budgetTimer = setTimeout(r, ARTIST_IMAGE_BUDGET_MS); })]);
  clearTimeout(budgetTimer);

  // Estado de la última build para /api/health: cuántos eventos aportó cada
  // fuente. Con RA en 0 el sitio "funciona" pero está degradado, y antes el
  // health decía ok igual.
  const bySource = {};
  for (const ev of events) bySource[ev.source] = (bySource[ev.source] || 0) + 1;
  lastEventsBuild = { ts: Date.now(), ms: Date.now() - buildStart, total: events.length, sources: bySource };
  registerImages(events);
  return events;
}

// ─────────────────────────────────────────────
//  GET /api/ciclos — los ciclos fijos de la semana (data/recurrentes.json,
//  lib/ciclos.js): "todos los martes" + los días en que la fecha real ya
//  está publicada. Sin fechas inventadas.
// ─────────────────────────────────────────────
// El archivo es curado y llega con el deploy: se lee una vez. El resultado se
// rearma solo cuando cambia la agenda.
let recurrentes = { ciclos: [] };
try { recurrentes = JSON.parse(readFileSync(join(__dirname, "data", "recurrentes.json"), "utf8")); }
catch (e) { console.error("[ciclos] data/recurrentes.json:", e.message); }
let ciclosMemo = { ts: -1, data: [] };
app.get("/api/ciclos", async (req, res) => {
  let events = [];
  try { events = await swr("events", buildEvents); } catch {}
  if (ciclosMemo.ts !== cache.events.ts) ciclosMemo = { ts: cache.events.ts, data: ciclosVigentes(recurrentes, notPast(events).filter((e) => e.area === "amba")) };
  res.json(ciclosMemo.data);
});

app.get("/api/events", async (req, res) => {
  const genreFilter = Array.isArray(req.query.genre) ? req.query.genre[0] : req.query.genre;
  const regionFilter = Array.isArray(req.query.region) ? req.query.region[0] : req.query.region;
  const applyFilter = (arr) => {
    let out = arr;
    if (genreFilter && genreFilter.toLowerCase() !== "all")
      out = out.filter(e => e.genre.toLowerCase() === genreFilter.toLowerCase());
    if (regionFilter && regionFilter.toLowerCase() !== "all")
      out = out.filter(e => e.region.toLowerCase() === regionFilter.toLowerCase());
    return out;
  };

  let events;
  try { events = await swr("events", buildEvents); }
  catch { return res.status(502).json({ error: "Events unavailable" }); }
  // Al servir también: la caché puede venir de antes del corte de la noche.
  res.json(applyFilter(notPast(events)));
});

// ─────────────────────────────────────────────
//  GET /finde.ics — "El finde en tu calendario" (oct 2026): un calendario
//  suscribible (webcal) con los elegidos de viernes a domingo (lib/finde.js).
//  La persona se suscribe una vez y su calendario lo vuelve a pedir solo: la
//  vuelta semanal a BassLayer sin cuentas. Horas en UTC (Z) para no depender
//  de VTIMEZONE; UID estable por evento para que las apps no dupliquen.
// ─────────────────────────────────────────────
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsUtc = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545: líneas de hasta 75 octetos, la continuación empieza con espacio.
const icsFold = (line) => { const out = []; let cur = ""; for (const ch of line) { if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = " "; } cur += ch; } out.push(cur); return out.join("\r\n"); };

app.get("/finde.ics", async (req, res) => {
  let events;
  try { events = await swr("events", buildEvents); }
  catch { return res.status(502).type("text/plain").send("Eventos no disponibles"); }
  const now = Date.now();
  const picks = findePicks(notPast(events), now);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BassLayer//El finde//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:BassLayer · El finde", "X-WR-CALDESC:Los elegidos de viernes a domingo en Buenos Aires. Se renueva solo cada semana.",
    "X-WR-TIMEZONE:America/Argentina/Buenos_Aires", "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H",
  ];
  for (const ev of picks) {
    const start = eventEpoch(ev, now);
    const slug = eventSlug(ev);
    const url = `https://basslayer.io/eventos/${slug}`;
    const lineup = (ev.artists || []).slice(0, 8).join(", ");
    lines.push(
      "BEGIN:VEVENT", `UID:${slug}@basslayer.io`, `DTSTAMP:${icsUtc(now)}`, `DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(start + 5 * 36e5)}`,
      `SUMMARY:${icsText(ev.name)}`, `LOCATION:${icsText(ev.address && ev.venue && ev.address.includes(ev.venue) ? ev.address : [ev.venue, ev.address].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${icsText([lineup && `Line-up: ${lineup}`, url].filter(Boolean).join("\n"))}`, `URL:${url}`, "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  res.set("Cache-Control", "public, max-age=1800");
  res.type("text/calendar; charset=utf-8").send(lines.map(icsFold).join("\r\n") + "\r\n");
});

// ─────────────────────────────────────────────
//  GET /api/semana — el resumen de la semana (lib/semana.js): lo que viene en
//  la noche y lo que hizo el mercado. Arma con lo que el server ya tiene
//  cacheado (agenda, precios, festivales, eventos cripto).
// ─────────────────────────────────────────────
async function semanaData() {
  const events = notPast(await swr("events", buildEvents));
  const prices = cache.prices.data || [];
  const festivals = loadFestivals().map((f) => ({ ...f, status: festivalStatus(f) })).filter((f) => f.status !== "past");
  const manual = (loadCryptoIrl().events || []).filter((e) => e.status === "approved");
  const cryptoEvents = [...manual, ...loadCuratedEvents()];
  return armarSemana({ events, prices, festivals, cryptoEvents });
}

app.get("/api/semana", async (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=600");
    res.json(await semanaData());
  } catch (e) {
    console.error("[semana]", e.message);
    res.status(502).json({ error: "Semana no disponible" });
  }
});

// ─────────────────────────────────────────────
//  GET /img?u=<url>&w=<160|320|640|1000> — proxy + resize de imágenes
//  Los flyers de RA (1080 px, 2 MB) y las fotos de las noticias (hasta 4,6 MB)
//  se mostraban a 60–400 px: Lighthouse medía 25 MB por carga de Layer mobile.
//  Acá se sirven a 2× del ancho mostrado, en WebP, cacheadas 7 días. Solo se
//  aceptan URLs que el propio server publicó (knownImages).
// ─────────────────────────────────────────────

const IMG_WIDTHS = new Set([160, 320, 640, 1000]);
const IMG_MAX_INPUT = 6 * 1024 * 1024;
const IMG_TTL = 7 * 24 * 60 * 60_000;
// Un fallo de resize suele ser transitorio (timeout del CDN de origen): con el
// TTL de 7 días un solo timeout dejaba ese flyer como póster una semana.
const IMG_MISS_TTL = 10 * 60_000;
const IMG_CACHE_MAX = 800;               // ~12 KB c/u a 160–320 px → ≈10 MB
const imgCache = new Map();              // `${w}:${url}` → { buf, ts } | { miss:true, ts }
const imgInflight = new Map();

async function resizeRemoteImage(u, w) {
  const r = await fetchSafe(u, { headers: { ...BROWSER_HEADERS, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" } }, 8000);
  if (!r.ok) return null;
  const input = Buffer.from(await r.arrayBuffer());
  if (!input.length || input.length > IMG_MAX_INPUT) return null;
  return sharp(input, { failOn: "none", limitInputPixels: 30_000_000 })
    .rotate()
    .resize({ width: w, withoutEnlargement: true, fit: "inside" })
    .webp({ quality: 78, effort: 3 })
    .toBuffer();
}

app.get("/img", async (req, res) => {
  const u = String(req.query.u || "");
  const w = Number(req.query.w);
  if (!IMG_WIDTHS.has(w)) return res.status(400).json({ error: "Invalid width" });
  if (!knownImages.has(u)) return res.status(404).json({ error: "Unknown image" });
  const key = `${w}:${u}`;
  const hit = imgCache.get(key);
  if (hit && Date.now() - hit.ts < (hit.miss ? IMG_MISS_TTL : IMG_TTL)) {
    if (hit.miss) return res.status(404).json({ error: "Unavailable" });
    imgCache.delete(key); imgCache.set(key, hit); // bump LRU
    res.set("Content-Type", "image/webp");
    res.set("Cache-Control", "public, max-age=604800, immutable");
    return res.send(hit.buf);
  }
  let p = imgInflight.get(key);
  if (!p) {
    p = resizeRemoteImage(u, w).catch((e) => { console.error("[img]", e.message); return null; })
      .finally(() => imgInflight.delete(key));
    imgInflight.set(key, p);
  }
  const buf = await p;
  if (imgCache.size >= IMG_CACHE_MAX) imgCache.delete(imgCache.keys().next().value);
  imgCache.set(key, buf ? { buf, ts: Date.now() } : { miss: true, ts: Date.now() });
  if (!buf) return res.status(404).json({ error: "Unavailable" });
  res.set("Content-Type", "image/webp");
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.send(buf);
});

// ─────────────────────────────────────────────
//  Price Chart (7-day sparkline)
// ─────────────────────────────────────────────

// Bounded chart cache — max 50 entries, evicts oldest on overflow
const chartCache = new Map();
const CHART_CACHE_MAX = 50;

app.get("/api/prices/:id/chart", async (req, res) => {
  const { id } = req.params;
  if (!COIN_IDS.has(id)) return res.status(400).json({ error: "Invalid coin ID" });
  const hit = chartCache.get(id);
  if (hit && Date.now() - hit.ts < 5 * 60_000) return res.json(hit.data);

  try {
    const r = await fetchSafe(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=7`, {}, 10000);
    if (!r.ok) return res.status(502).json({ error: "CoinGecko unavailable" });
    const data = JSON.parse(await safeText(r));
    const result = { prices: data.prices || [] };
    if (chartCache.size >= CHART_CACHE_MAX) {
      const oldest = chartCache.keys().next().value;
      chartCache.delete(oldest);
    }
    chartCache.set(id, { data: result, ts: Date.now() });
    res.json(result);
  } catch (e) {
    console.error("[chart]", e.message);
    res.status(500).json({ error: "Chart data unavailable" });
  }
});

const { enrichArtistImages, ARTIST_IMAGE_BUDGET_MS } = montarArtistas(app, { GENRE_LIST, SNAPSHOT_DIR, fetchSafe, safeText, translateText });

montarLayer(app, { MONTHS_ES, rootDir: __dirname, cache, cached, eachLimit, fetchSafe, safeText, setCache, swr, translateTitle });

// ─────────────────────────────────────────────
//  Health
// ─────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  // Edad de cada cache en segundos (null = nunca cargó) y estado de la última
  // build de eventos por fuente. "degraded" si no hay eventos o RA no aportó:
  // el sitio responde, pero con la agenda a medias.
  const ages = Object.fromEntries(Object.entries(cache).map(([k, c]) => [k, c.data ? Math.round((Date.now() - c.ts) / 1000) : null]));
  const ev = lastEventsBuild;
  const degraded = !cache.events.data?.length || (ev && !ev.sources.ra);
  const data = {
    status: degraded ? "degraded" : "ok",
    version: PKG_VERSION,
    uptime: Math.floor(process.uptime()),
    events: ev ? { total: ev.total, sources: ev.sources, builtAgo: Math.round((Date.now() - ev.ts) / 1000), buildMs: ev.ms } : (cache.events.data ? { total: cache.events.data.length, fromSnapshot: true } : null),
    cacheAge: ages,
  };
  res.status(degraded ? 503 : 200).json(data);
});

const { loadCuratedEvents, loadCryptoIrl } = montarCriptoEventos(app, { rootDir: __dirname, cached, fetchSafe, safeText, setCache });

const { icsDateParts, musicEventSchema } = montarFeeds(app, { GENRE_LIST, MONTH_MAP, PROD_ORIGIN, cached, eventSlug, festivalSlug, festivalStatus, findEventBySlug, findFestivalBySlug, findNewsBySlug, genreSlug, loadFestivals, loadGuias, semanaData });

// API 404 — return JSON instead of falling through to SPA
app.all("/api/*", (req, res) => res.status(404).json({ error: "Endpoint not found" }));

if (IS_PROD) {
  montarPrerender(app, {
    PROD_ORIGIN, rootDir: __dirname, cached, MONTH_MAP, GENRE_LIST, genreLabel, genreSlug, genreFromSlug,
    eventSlug, newsSlug, festivalSlug, festivalStatus, findEventBySlug, findNewsBySlug, findFestivalBySlug, findGuiaBySlug,
    loadFestivals, icsDateParts, musicEventSchema, semanaData,
  });
}

// Último recurso: cualquier error propagado con next(err) responde JSON, nunca HTML con stack.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return;
  const status = err?.status || err?.statusCode || 500;
  if (status >= 500) console.error("[error]", req.method, req.originalUrl, err?.message || err);
  res.status(status).json({ error: status >= 500 ? "Internal error" : (err?.message || "Bad request") });
});

// Warm-up: las dos fuentes lentas se construyen apenas arranca el proceso
// (el snapshot ya sirve mientras tanto) y se mantienen calientes aunque no
// haya tráfico, para que ningún visitante pague el frío.
const KEEP_WARM = [["events", () => buildEvents()], ["bassNews", () => buildBassNews()]];
for (const [key, build] of KEEP_WARM) {
  setTimeout(() => swr(key, build).catch(() => {}), 1500);
  setInterval(() => swr(key, build).catch(() => {}), Math.round(cache[key].ttl * 0.8)).unref();
}

// Las caches de Layer (noticias, precios, mercados) se llenan con el primer
// visitante; el prerender de /layer las lee, así que las pedimos a la propia
// API al arrancar para que Google nunca vea la página vacía tras un deploy.
setTimeout(() => {
  for (const p of ["/api/news", "/api/finance-news", "/api/prices", "/api/markets"]) {
    fetch(`http://127.0.0.1:${PORT}${p}`).catch(() => {});
  }
}, 2500);

loadSnapshots();
// Venti se lee en segundo plano; si la última lectura está vieja, arranca ya
// (con la agenda guardada, la próxima build puede tardar hasta una hora).
refrescarVentiSiViejo();
// El detalle de fuentes y cachés vive en /api/health; acá, solo dónde escucha.
const server = app.listen(PORT, () => console.log(`BassLayer API v${PKG_VERSION} · http://localhost:${PORT} · estado en /api/health`));


// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => { console.log("Server closed."); process.exit(0); });
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

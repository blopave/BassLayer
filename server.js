// ═══════════════════════════════════════════════════════
//  BassLayer API — v1.5
//  Bass: BA electronic events (Buenos Aliens + RA + fallback)
//  Layer: Crypto news (16 RSS feeds) + prices (CoinGecko)
// ═══════════════════════════════════════════════════════

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { generateEventOG, generateFestivalOG, generateNewsOG } from "./og.js";
import { marked } from "marked";
import matter from "gray-matter";
import { readdirSync } from "node:fs";

// ── Supabase ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

if (!supabase) console.warn("⚠ SUPABASE_URL or SUPABASE_SERVICE_KEY missing — venue/project features disabled");

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === "production";
const PROD_ORIGIN = process.env.ORIGIN || "https://basslayer.app";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // imgSrc abierto a cualquier HTTPS — los festivales y feeds se hostean en
      // dominios variados e impredecibles (CDNs, WP, S3, etc.). Las URLs vienen
      // de fuentes que controlamos curatorialmente, no de input de usuario.
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://jbszspnwegykpnlagypf.supabase.co"],
    },
  },
}));
app.use(compression());
app.use(cors({
  origin: IS_PROD
    ? [PROD_ORIGIN]
    : ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
}));

app.use(express.json({ limit: "10kb" }));

// Rate limiter — sliding window, per IP, bounded map size
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_MAP_MAX = 10_000; // Max tracked IPs to prevent memory exhaustion

// Sweep expired rate limit entries every 2 minutes
const rateLimitSweep = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_LIMIT_WINDOW) rateLimitMap.delete(ip);
  }
}, 120_000);

app.use("/api", (req, res, next) => {
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const entry = rateLimitMap.get(ip);

  if (entry) {
    // Slide the window: reset if window has passed
    if (now - entry.start > RATE_LIMIT_WINDOW) {
      entry.count = 1;
      entry.start = now;
    } else {
      entry.count++;
    }
    if (entry.count > RATE_LIMIT_MAX) {
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
});

if (IS_PROD) {
  app.use(express.static(join(__dirname, "dist"), { index: false }));
}

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

const cache = {
  prices:      { data: null, ts: 0, ttl: 30_000 },
  news:        { data: null, ts: 0, ttl: 5 * 60_000 },
  events:      { data: null, ts: 0, ttl: 60 * 60_000 },
  bassNews:    { data: null, ts: 0, ttl: 30 * 60_000 },
  dashboard:   { data: null, ts: 0, ttl: 5 * 60_000 },   // 5min — crypto dashboard
  cryptoEvents:{ data: null, ts: 0, ttl: 60 * 60_000 },  // 1h — crypto events
  predictions: { data: null, ts: 0, ttl: 5 * 60_000 },   // 5min — Polymarket trending
};

function cached(key) {
  const c = cache[key];
  return c.data && (Date.now() - c.ts < c.ttl) ? c.data : null;
}
function setCache(key, data) {
  cache[key] = { ...cache[key], data, ts: Date.now() };
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

// Sanitize URLs from external sources — only allow http/https
function sanitizeUrl(url) {
  const str = String(url || "").trim();
  if (str.startsWith("https://") || str.startsWith("http://")) return str;
  return "";
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTH_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

// ─── Slug helpers (SEO URLs) ─────────────────
// Determinista: el mismo evento siempre produce el mismo slug en server y cliente.
function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
function eventSlug(ev) {
  if (!ev || !ev.name) return "";
  const namePart = slugify(ev.name);
  const datePart = slugify(`${ev.day || ""}-${ev.month || ""}`);
  return [namePart, datePart].filter(Boolean).join("-");
}
function findEventBySlug(slug) {
  const events = cached("events") || [];
  for (const ev of events) {
    if (eventSlug(ev) === slug) return ev;
  }
  return null;
}
function hash6(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}
function newsSlug(n) {
  if (!n || !n.title) return "";
  const titlePart = slugify(n.title).slice(0, 60);
  const idPart = n.url ? hash6(n.url) : hash6(n.title + (n.source || ""));
  return [titlePart, idPart].filter(Boolean).join("-");
}
function findNewsBySlug(slug) {
  // Buscar en ambos pools: crypto (news) y música (bassNews)
  const pools = [cached("news") || [], cached("bassNews") || []];
  for (const pool of pools) {
    for (const n of pool) {
      if (newsSlug(n) === slug) return n;
    }
  }
  return null;
}
function festivalSlug(f) {
  if (!f) return "";
  return f.id || slugify(f.name);
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

// ─── Géneros: slugs + descripciones evergreen ──
// Mismo map que src/utils/slug.js para que server y cliente coincidan.
const GENRE_LIST = [
  "Techno", "House", "Deep House", "Tech House", "Progressive",
  "Melodic", "Minimal", "DnB", "Trance", "Disco", "Ambient", "Electronic",
];
const GENRE_ALIAS = { "DnB": "drum-and-bass" };
const GENRE_FROM_SLUG = {};
for (const g of GENRE_LIST) {
  const slug = GENRE_ALIAS[g] || slugify(g);
  GENRE_FROM_SLUG[slug] = g;
}
function genreSlug(genre) {
  if (!genre || genre === "All") return "";
  return GENRE_ALIAS[genre] || slugify(genre);
}
function genreFromSlug(slug) {
  return GENRE_FROM_SLUG[slug] || null;
}
// Blurbs evergreen — texto curado para SEO. Para géneros sin entrada explícita
// se usa un template genérico ("X en Buenos Aires...").
const GENRE_BLURBS = {
  "Techno": "El techno tiene en Buenos Aires una de las escenas más fuertes de Latinoamérica. De los warehouses de Crobar y Mandarine al underground de Niceto, pasando por after-hours en zonas industriales, la ciudad respira beats 4x4 todo el año. Headliners internacionales como Adam Beyer, Charlotte de Witte, Sven Väth y Nina Kraviz visitan con regularidad; en el lado local, DJs como Hernán Cattáneo, Wehbba (BR), Pablo Bolivar y la nueva camada llenan las pistas semana tras semana.",
  "House": "Buenos Aires ama el house en todas sus formas — del soulful clásico al deep contemporáneo. Sets que arrancan al atardecer en clubes con terraza, llenos en boliches como Bresh para el house más festivo, y residencias en venues como Crobar. Carl Cox, Solomun, Black Coffee y Damian Lazarus son visitas habituales; locales como Bárbara Boeing y Pablo Fierro empujan la escena.",
  "Deep House": "Deep house en Buenos Aires: la versión más íntima del house, con líneas de bajo profundas y atmósferas elegantes. Se escucha en sesiones early-evening, en clubes boutique y rooftops, con DJs como Tale of Us, Mind Against y Mathame en los headliners; locales como Nicola Cruz y Sofia Kourtesis aportan la mirada sudamericana.",
  "Tech House": "El tech house — esa mezcla de groove house con la energía mecánica del techno — es uno de los géneros más populares en la pista porteña. Solid Grooves, Hot Creations y todo el sello DC-10 aparecen en line-ups de Crobar, Jet y festivales como Creamfields. Fisher, Chris Lake, Patrick Topping y Cloonee son los nombres que mueven el público hoy.",
  "Progressive": "Progressive en Buenos Aires tiene la firma de Hernán Cattáneo, el referente argentino que llevó al género a una escala global. Sets largos, narrativos, con climaxes lentos — se escucha en clubes como Mandarine Park, en eventos curados como Sudbeat y en festivales como Forja.",
  "Melodic": "Melodic techno y house — el sonido emocional y atmosférico que define una era. Tale of Us, ARTBAT, Anyma, Cassian y Mathame son la columna vertebral del género; en Buenos Aires se escucha en eventos producidos por Sound Group, Polaroid y similar curaduría.",
  "Minimal": "Minimal en Buenos Aires: la rama más purista y reducida del techno/house. Eventos chicos y curados, mucho énfasis en sound system y atmósfera. Ricardo Villalobos, Zip y Sonja Moonear son las referencias que orientan la escena local.",
  "DnB": "Drum and bass en Buenos Aires tiene una escena fiel y de larga data — fiestas dedicadas en clubes como Liv Outside y eventos como Sun & Bass Argentina. Andy C, Sub Focus, Chase & Status, Camo & Krooked aparecen en festivales y line-ups; locales como Bratto y Sub Killaz empujan la cultura.",
  "Trance": "Trance en Argentina: la escena más emocional y de mayor longevidad. Festivales como Forja y eventos producidos por Trance Argentina convocan a Above & Beyond, ATB, Aly & Fila y todo el universo Anjunabeats/Pure Trance. Una comunidad ferviente que llena venues con sets de 6+ horas.",
  "Disco": "Disco y nu-disco en Buenos Aires — el groove de los 70s y 80s revisitado con producción contemporánea. Eventos como Sun & Sea, fiestas curadas en rooftops de Palermo y line-ups con Folamour, Honey Dijon, Dimitri From Paris.",
  "Ambient": "Ambient y experimental en Buenos Aires: sesiones inmersivas, espacios alternativos, productores locales como Lucrecia Dalt y experimentación con instalaciones audio-visuales.",
  "Electronic": "Música electrónica en Buenos Aires en todas sus formas — techno, house, trance, drum & bass, disco, melodic. La ciudad tiene una de las escenas más activas y diversas de Latinoamérica, con clubes históricos, festivales de talla mundial y una comunidad que escucha todos los días de la semana.",
};

// ─── City detection ──────────────────────────
const CITY_PATTERNS = [
  { city: "CABA",     rx: /\b(palermo|recoleta|san telmo|microcentro|belgrano|almagro|caballito|flores|villa crespo|villa urquiza|nuñez|colegiales|barracas|la boca|congreso|abasto|chacarita|constitución|monserrat|retiro|tribunales|costanera|puerto madero)\b/i },
  { city: "CABA",     rx: /\bbuen(?:os\s)?aires\b(?!.*\bprovincia\b)/i },
  { city: "Córdoba",  rx: /\bc[oó]rdoba\b/i },
  { city: "Rosario",  rx: /\brosario\b/i },
  { city: "Mendoza",  rx: /\bmendoza\b/i },
  { city: "La Plata", rx: /\bla plata\b/i },
  { city: "Mar del Plata", rx: /\bmar del plata\b/i },
  { city: "Bariloche", rx: /\bbariloche\b/i },
];

function detectCity(venue, address) {
  const text = `${venue || ""} ${address || ""}`;
  for (const { city, rx } of CITY_PATTERNS) {
    if (rx.test(text)) return city;
  }
  return "CABA"; // default for Buenos Aliens / RA Buenos Aires data
}

// ─────────────────────────────────────────────
//  GET /api/prices — CoinGecko
// ─────────────────────────────────────────────

const COIN_IDS_STR = "bitcoin,ethereum,solana,arbitrum,chainlink,aave,uniswap,optimism";
const COIN_IDS = new Set(COIN_IDS_STR.split(","));
const SYM_MAP = {
  bitcoin:"BTC", ethereum:"ETH", solana:"SOL", arbitrum:"ARB",
  chainlink:"LINK", aave:"AAVE", uniswap:"UNI", optimism:"OP",
};

app.get("/api/prices", async (req, res) => {
  const hit = cached("prices");
  if (hit) return res.json(hit);
  try {
    const r = await fetchSafe(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COIN_IDS_STR}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const raw = JSON.parse(await safeText(r));
    const prices = raw.map((d) => ({
      id: d.id, sym: SYM_MAP[d.id] || d.id.toUpperCase(), name: d.id, usd: d.current_price,
      change: Math.round((d.price_change_percentage_24h || 0) * 10) / 10,
      marketCap: d.market_cap || null,
      sparkline: d.sparkline_in_7d?.price || [],
    }));
    setCache("prices", prices);
    res.json(prices);
  } catch (e) {
    console.error("[prices]", e.message);
    if (cache.prices.data) return res.json(cache.prices.data);
    res.status(502).json({ error: "Price data unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/news — RSS Feeds (?tag=BTC)
// ─────────────────────────────────────────────

const RSS_FEEDS = [
  // English
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
  { url: "https://thedefiant.io/feed", source: "The Defiant" },
  { url: "https://blockworks.co/feed", source: "Blockworks" },
  { url: "https://bitcoinmagazine.com/feed", source: "Bitcoin Mag" },
  { url: "https://cryptoslate.com/feed/", source: "CryptoSlate" },
  { url: "https://cryptobriefing.com/feed/", source: "CryptoBriefing" },
  { url: "https://u.today/rss", source: "U.Today" },
  { url: "https://dailyhodl.com/feed/", source: "Daily Hodl" },
  // Español / Latam
  { url: "https://diariobitcoin.com/feed/", source: "DiarioBitcoin" },
  { url: "https://criptotendencia.com/feed/", source: "CriptoTendencia" },
  // Removidos (audit 2026-06-16):
  //   The Block        → HTTP 403 (bloquea nuestro User-Agent)
  //   Unchained        → timeout consistente (>15s en fetchSafe)
  //   CT Español       → HTTP 410 Gone (feed retirado)
  //   CriptoNoticias   → HTTP 403
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,       // Disable entity expansion entirely — prevents XXE/entity DoS
  htmlEntities: true,           // Still decode standard HTML entities (amp, lt, etc.)
});

// Lista de nombres que algunos feeds RSS anteponen/posponen al título
// (incluye variantes que no son exactamente `source` de RSS_FEEDS).
const NEWS_TITLE_BRANDS = [
  "CoinDesk", "Cointelegraph", "Decrypt", "The Defiant", "The Block",
  "Blockworks", "Bitcoin Magazine", "Bitcoin Mag", "Unchained",
  "CryptoSlate", "Crypto Briefing", "CryptoBriefing", "U.Today", "UToday",
  "Daily Hodl", "DailyHodl", "CT Español", "Cointelegraph Español",
  "CriptoNoticias", "Cripto Noticias", "DiarioBitcoin", "Diario Bitcoin",
  "CriptoTendencia", "Cripto Tendencia",
];
const NEWS_TITLE_BRAND_RE = NEWS_TITLE_BRANDS
  .map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const NEWS_TITLE_PREFIX = new RegExp(`^(?:${NEWS_TITLE_BRAND_RE})\\s*[:\\-–—|]\\s*`, "i");
const NEWS_TITLE_SUFFIX = new RegExp(`\\s*[\\-–—|]\\s*(?:${NEWS_TITLE_BRAND_RE})\\s*$`, "i");

// Tabla extendida de entidades HTML named que aparecen seguido en títulos RSS
// (htmlToText solo cubre un subconjunto; acá agregamos puntuación tipográfica
// y símbolos comunes para no dejar &mdash;, &hellip;, &rsquo; en pantalla).
const NAMED_ENTITIES = {
  mdash: "—", ndash: "–", hellip: "…", bull: "•", middot: "·",
  lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„",
  laquo: "«", raquo: "»", prime: "′", Prime: "″",
  copy: "©", reg: "®", trade: "™",
  euro: "€", pound: "£", cent: "¢", yen: "¥",
  deg: "°", plusmn: "±", times: "×", divide: "÷",
  hearts: "♥", diams: "♦", clubs: "♣", spades: "♠",
  larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔",
};
function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const c = parseInt(n, 10);
      return Number.isFinite(c) ? String.fromCodePoint(c) : _;
    })
    .replace(/&([a-zA-Z]+);/g, (m, name) => {
      const lower = name.toLowerCase();
      if (lower === "amp")  return "&";
      if (lower === "lt")   return "<";
      if (lower === "gt")   return ">";
      if (lower === "quot") return "\"";
      if (lower === "apos") return "'";
      if (lower === "nbsp") return " ";
      if (NAMED_ENTITIES[name]) return NAMED_ENTITIES[name];
      if (NAMED_ENTITIES[lower]) return NAMED_ENTITIES[lower];
      return m;
    });
}

// Limpia un título RSS: decodifica entidades, stripea tags, quita prefijo/sufijo
// de fuente, colapsa whitespace y trunca. El orden importa: decodificar PRIMERO
// para que `&lt;b&gt;` se convierta en `<b>` y la pasada de strip lo elimine.
function cleanNewsTitle(raw) {
  if (!raw) return "";
  let t = decodeHtmlEntities(String(raw));
  t = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  t = t.replace(/<[^>]+>/g, " ");
  // Algunos feeds agregan paréntesis tipo "(coindesk.com)" o "(Bitcoinist)"
  t = t.replace(/\s*\((?:[a-z0-9.-]+\.[a-z]{2,})\)\s*$/i, "");
  t = t.replace(NEWS_TITLE_PREFIX, "");
  t = t.replace(NEWS_TITLE_SUFFIX, "");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t.slice(0, 140);
}

// ─────────────────────────────────────────────
//  TAG_RULES — source of truth única
// ─────────────────────────────────────────────
// Cada entrada mapea un tag a sus patrones. El orden es la prioridad:
// si un item matchea BTC y ETH, gana BTC (consistente con el detectTag
// original que usaba un if-else chain).
//
// Esta tabla la consumen DOS funciones:
//   - detectTag(title): elige el primer tag que matchee, default "Crypto".
//     Iterates TODAS las reglas (incluyendo tagOnly).
//   - isCryptoOrFinance(title, description): admite si matchea cualquier
//     regla que NO sea tagOnly. Las reglas tagOnly (AI, Reg) solo sirven
//     para clasificar items que ya admitieron por otra señal — sin esto,
//     headlines como "OpenAI raises $38B" o "Regulators target X" pasarían
//     sin contexto cripto real.
//
// Convención: stems abiertos (sin \b final) para cubrir plurales/derivados
// españoles e ingleses (criptomonedas, blockchains, bitcoiner, etc.).
const TAG_RULES = [
  // Bitcoin family — incluye proxies institucionales (MicroStrategy, Saylor)
  // y compuestos típicos (bitcoin mining/wallet/treasury) que antes drift-eaban
  // a "Crypto" genérico.
  { tag: "BTC", pats: [
    /\bbtc\b/i, /\bbitc[oó]in/i, /\bsatoshi\b/i,
    /\bmicrostrategy\b/i, /\bsaylor\b/i,
    /\b(bitcoin|btc) (mining|miner|wallet|treasury|reserve|holdings)/i,
  ]},
  // Ethereum — vitalik incluido como proxy
  { tag: "ETH", pats: [
    /\beth\b/i, /\bethereum\b/i, /\bvitalik\b/i,
  ]},
  // Activos: usamos el nombre completo, no el ticker corto (sol=sun, ada=Ada Lovelace)
  { tag: "SOL",  pats: [/\bsolana\b/i] },
  { tag: "XRP",  pats: [/\bxrp\b/i, /\bripple\b/i] },
  { tag: "ADA",  pats: [/\bcardano\b/i] },
  { tag: "DOGE", pats: [/\bdoge(coin)?\b/i] },
  // SHIB — Shiba Inu + Shibarium (L2 propio). Sin el tag, U.Today drop-eaba
  // ~12 items SHIB por audit; ahora admiten y se clasifican.
  { tag: "SHIB", pats: [/\bshib(a inu)?\b/i, /\bshibarium\b/i] },
  // DeFi: lending/yield anclados a contexto cripto para no matchear
  // "yield curve" o "consumer lending" macro
  { tag: "DeFi", pats: [
    /\bdefi\b/i, /\baave\b/i, /\buniswap\b/i,
    /\b(crypto|defi) (lending|yield)/i,
  ]},
  // NFT
  { tag: "NFT", pats: [/\bnft/i, /\bopensea\b/i, /\bcollectible/i] },
  // Regulación — tagOnly: items con "SEC sues..." o "regulators target..."
  // sin otra señal cripto no garantizan que sean crypto news. Si hay
  // contexto cripto, otra regla los admite y este tag los clasifica.
  { tag: "Reg", tagOnly: true, pats: [
    /\bregulat/i, /\bsec\b/i, /\bgensler\b/i, /\bcongress\b/i,
    /\blegislation\b/i, /\blawsuit\b/i,
  ]},
  // L2 / Rollups — antes "layer" suelto matcheaba "Coinbase launches new
  // product layer"; ahora anclado a "L2", "Layer 2", "Layer2"
  { tag: "L2", pats: [
    /\bl(ayer)? ?2\b/i, /\brollup/i,
    /\barbitrum\b/i, /\boptimism\b/i, /\bzksync\b/i, /\bpolygon\b/i,
  ]},
  // AI — tagOnly: \bai\b y \bopenai\b son demasiado amplios para admitir
  // ("Y Combinator AI agent", "OpenAI losses"). Si el item tiene contexto
  // cripto (Bittensor + IA descentralizada), otra regla lo admite.
  // \bia\b cubre la abreviación española (Inteligencia Artificial).
  { tag: "AI", tagOnly: true, pats: [
    /\bai\b/i, /\bia\b/i, /\bartificial intelligence\b/i,
    /\binteligencia artificial\b/i, /\bmachine learn/i, /\bopenai\b/i,
  ]},
  // Stablecoins
  { tag: "Stable", pats: [
    /\bstablecoin/i, /\busdt\b/i, /\busdc\b/i, /\btether\b/i,
  ]},
  // Mining (sin "mining" suelto — chocaba con "gold mining"; queda en BTC
  // via bitcoin mining)
  { tag: "Mining", pats: [/\bhalving\b/i, /\bhashrate\b/i] },
  // Catch-all crypto: términos genéricos, exchanges, players, derivados.
  // Llega solo cuando ningún tag específico matcheó. Empareja "Bybit announces
  // new perpetual" → "Crypto" en vez de descartar.
  //
  // weakPats vs pats: las weak (crypto/cripto/blockchain) NO admiten por
  // description — solo por title o categories. CryptoBriefing escribe
  // "crypto"/"cryptocurrencies" como tag-along en cada description de notas
  // off-topic (SpaceX IPO, ECB rates, Trump-Iran). Sin esta restricción,
  // ~36% del feed eran items macro/equity admitidos por buzzword en desc.
  // Items legítimos casi siempre traen el asset/exchange/protocol en title
  // o como category del publisher.
  { tag: "Crypto",
    weakPats: [
      /\bcrypto/i,        // crypto, cryptocurrency, cryptocurrencies
      /\bcripto/i,        // cripto, criptomonedas, criptoactivos
      /\bblockchain/i,    // blockchain, blockchains
    ],
    pats: [
      /\baltcoin/i, /\bweb3\b/i,
      /\bon[- ]?chain\b/i, /\bairdrop/i, /\btokeniz/i, /\brwa\b/i,
      // Exchanges / infra que no merecen tag propio
      /\bbinance\b/i, /\bcoinbase\b/i, /\bkraken\b/i, /\bbybit\b/i,
      /\bokx\b/i, /\bbitget\b/i, /\bgemini\b/i, /\bpolymarket\b/i, /\bhyperliquid\b/i,
      /\bgrayscale\b/i, /\bondo\b/i, /\bblackrock\b/i,
      /\bavalanche\b/i, /\bchainlink\b/i, /\bpolkadot\b/i,
      // ETFs cripto (anclado a contexto para no matchear ETFs de equities)
      /\b(spot|bitcoin|eth|crypto) etf\b/i,
      /\bperpetual/i, /\bperp futures?\b/i,
      // Liquidaciones anclado a contexto cripto
      /\b(crypto|bitcoin|btc|eth|defi|leverage) liquidat/i,
      /\bliquidat\w* (the (long|short)|on (the )?(btc|eth|crypto))/i,
    ]},
];

// Helper: junta strong + weak patterns de una regla en un solo array
function allPats(rule) {
  return [...(rule.pats || []), ...(rule.weakPats || [])];
}

function detectTag(title, categories = []) {
  // Las categories del RSS son alta señal cuando el publisher las tagea
  // semánticamente (Cointelegraph manda "Bitcoin Price", "CFTC", "Robinhood";
  // CoinDesk manda "Prices", "News"). Las incluimos en el haystack del tagger
  // para que items con título críptico ("Here's what happened in crypto today")
  // se beneficien de los tags del publisher.
  const haystack = `${title} ${categories.join(" ")}`;
  for (const rule of TAG_RULES) {
    if (allPats(rule).some((p) => p.test(haystack))) return rule.tag;
  }
  return "Crypto";
}

// Algunos feeds "crypto" (CryptoBriefing, Cointelegraph) publican filler de
// macro pura, M&A no-cripto y hasta sports stories. Filtro:
//   1) Allowlist positiva (TAG_RULES): el item necesita matchear al menos
//      un patrón en título o descripción. Esto solo descarta items sin
//      contexto cripto (Pizza Hut M&A, SpaceX IPO, housing starts).
//   2) Solo unos pocos patrones de deny para casos donde el publisher
//      menciona crypto incidentalmente. NO usamos sport leagues como deny:
//      NBA Top Shot, fan tokens del Mundial, etc. son crypto válido.
const OFF_TOPIC_PATTERNS = [
  /\bnot a crypto story\b/i,  // CryptoBriefing autodelata sus filler items
];

function isCryptoOrFinance(title, description = "", categories = []) {
  // Las categories del RSS son señal positiva adicional: si el publisher
  // tagueó la nota como "Bitcoin Price" o "DeFi", se admite aunque el
  // título sea ambiguo. NO usamos categories como deny — son ruidosas
  // ("Technology" para SpaceX, "Mercados" para petróleo).
  //
  // Las weak patterns (crypto/cripto/blockchain) solo matchean title+cats
  // — ver comentario en la regla "Crypto" de TAG_RULES.
  const titleHaystack = `${title} ${categories.join(" ")}`;
  const fullHaystack = `${titleHaystack} ${description}`;
  for (const pat of OFF_TOPIC_PATTERNS) if (pat.test(fullHaystack)) return false;
  for (const rule of TAG_RULES) {
    if (rule.tagOnly) continue;
    for (const p of (rule.pats || [])) if (p.test(fullHaystack)) return true;
    for (const p of (rule.weakPats || [])) if (p.test(titleHaystack)) return true;
  }
  return false;
}

// Common timezone abbreviations Node's Date parser doesn't accept (BST, EDT, etc.)
const TZ_OFFSETS = {
  BST:"+0100", GMT:"+0000", UTC:"+0000",
  EST:"-0500", EDT:"-0400", CST:"-0600", CDT:"-0500", MST:"-0700", MDT:"-0600", PST:"-0800", PDT:"-0700",
  CET:"+0100", CEST:"+0200", AEST:"+1000", AEDT:"+1100", JST:"+0900",
};
function normalizeDateString(s) {
  if (!s) return s;
  return String(s).replace(/\b([A-Z]{2,5})\b\s*$/, (m, abbr) => TZ_OFFSETS[abbr] || m);
}

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const ms = new Date(normalizeDateString(dateStr)).getTime();
  if (isNaN(ms)) return "";
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 0) return "now";
  if (mins < 60) return mins + "m";
  if (mins < 1440) return Math.floor(mins / 60) + "h";
  return Math.floor(mins / 1440) + "d";
}

function timeToMins(t) {
  if (!t) return 99999;
  const n = parseInt(t) || 99999;
  if (t.endsWith("m")) return n;
  if (t.endsWith("h")) return n * 60;
  if (t.endsWith("d")) return n * 1440;
  return 99999;
}

// Extrae las categories de un item RSS/Atom como array de strings normalizado.
// Cubre los 3 formatos comunes que emiten los publishers:
//   1) string suelto: <category>Technology</category>
//   2) array de strings: múltiples <category> tags
//   3) array de objetos: Atom-style <category term="..." /> o RSS con attrs
function extractCategories(item) {
  const raw = item.category ?? item["dc:subject"];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((c) => {
      if (typeof c === "string") return c.trim();
      if (c && typeof c === "object") return String(c["#text"] || c["@_term"] || "").trim();
      return "";
    })
    .filter(Boolean)
    .slice(0, 12);  // cap para evitar haystacks gigantes
}

async function fetchRSSFeed(feed) {
  try {
    const r = await fetchSafe(feed.url, { headers: { "User-Agent": "BassLayer/1.0" } });
    if (!r.ok) return [];
    const xml = await safeText(r, 2 * 1024 * 1024); // 2MB max for RSS
    const parsed = xmlParser.parse(xml);
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    if (!Array.isArray(items)) items = [items];
    return items.slice(0, 10).map((item) => {
      const rawTitle = item.title?.["#text"] || item.title || "";
      const title = cleanNewsTitle(rawTitle);
      const rawLink = item.link?.["@_href"] || item.link || "";
      const link = typeof rawLink === "object" ? (rawLink["@_href"] || "") : String(rawLink);
      const url = sanitizeUrl(link);
      const date = item.pubDate || item.published || item.updated || "";
      const rel = relativeTime(date);
      // Algunos feeds (CriptoNoticias y otros WordPress) ponen el resumen
      // útil en content:encoded y dejan <description> mínimo. Probamos varios
      // campos y nos quedamos con el texto más rico.
      const descCandidates = [
        item.description, item.summary, item["content:encoded"], item.content,
      ];
      let descStr = "";
      for (const c of descCandidates) {
        if (!c) continue;
        const s = typeof c === "object" ? (c["#text"] || "") : String(c);
        if (s.length > descStr.length) descStr = s;
      }
      const image = pickItemImage(item, descStr);
      const description = htmlToText(descStr)
        .replace(/\s*The post\s+.+?\s+appeared first on\s+.+?\.?\s*$/i, "")
        .replace(/\s*La entrada\s+.+?\s+apareci[óo] primero en\s+.+?\.?\s*$/i, "")
        .replace(/\s*L[''`]article\s+.+?\s+est apparu en premier sur\s+.+?\.?\s*$/i, "")
        .replace(/\s*Der Beitrag\s+.+?\s+erschien zuerst auf\s+.+?\.?\s*$/i, "")
        .replace(/\s*(?:Continue reading|Read more|Seguir leyendo|Leer más|Suite|Weiterlesen)\.{0,3}\s*$/i, "")
        .slice(0, 320);
      const categories = extractCategories(item);
      return {
        time: rel,
        _mins: timeToMins(rel),
        tag: detectTag(title, categories),
        title,
        description,
        categories,
        image: image ? sanitizeUrl(image) : null,
        source: feed.source,
        url,
      };
    });
  } catch (e) {
    console.error(`[news] ${feed.source}:`, e.message);
    return [];
  }
}

app.get("/api/news", async (req, res) => {
  const rawTag = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const tagFilter = rawTag?.toUpperCase();
  // El caché guarda la lista sin filtrar para que findNewsBySlug pueda
  // resolver deep links históricos aunque el item ya no clasifique como
  // crypto/finanzas. El filtro de contenido + tag corre por request.
  const applyFilter = (arr) => {
    let out = arr.filter((n) => isCryptoOrFinance(n.title, n.description, n.categories));
    if (tagFilter && tagFilter !== "ALL") out = out.filter((n) => n.tag === tagFilter);
    return out;
  };

  const hit = cached("news");
  if (hit) return res.json(applyFilter(hit));

  try {
    const results = await Promise.allSettled(RSS_FEEDS.map(fetchRSSFeed));
    const news = results
      .filter((r) => r.status === "fulfilled").flatMap((r) => r.value)
      .filter((item) => item.title)
      .sort((a, b) => a._mins - b._mins)
      .slice(0, 50)
      .map(({ _mins, ...rest }) => rest);
    setCache("news", news);
    res.json(applyFilter(news));
  } catch (e) {
    console.error("[news]", e.message);
    if (cache.news.data) return res.json(applyFilter(cache.news.data));
    res.status(502).json({ error: "News unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/bass-news — Música electrónica BA + LatAm
//  Fuentes: Buenos Aliens (scrape) + Mixmag Latam (RSS)
//  Curaduría chica y local-first; ver memoria del proyecto.
// ─────────────────────────────────────────────

// Curaduría chica y deliberada: 1 BA (scrape) + 1 LatAm + 2 internacionales.
// Si una fuente cae, el cap de antigüedad mantiene el feed honesto en lugar de
// rellenar con notas viejas.
const BASS_NEWS_FEEDS = [
  // Curaduría: BA + LatAm + 12 internacionales, electrónica-first y excluyente.
  // `freshOnNoDate` se usa para fuentes cuyo RSS no expone pubDate; sin él el
  // filtro de 7 días los descartaría. Asume que items al tope del feed son
  // recientes (válido para publicaciones que rotan a diario).
  { url: "https://mixmaglatam.com/rss.xml",         source: "Mixmag Latam",     slug: "mixmaglatam",   region: "LatAm" },
  { url: "https://djmag.com/rss",                   source: "DJ Mag",           slug: "djmag",         region: "Intl"  },
  { url: "https://mixmag.net/rss.xml",              source: "Mixmag",           slug: "mixmaguk",      region: "Intl", freshOnNoDate: true },
  { url: "https://crackmagazine.net/feed/",         source: "Crack",            slug: "crack",         region: "Intl"  },
  { url: "https://daily.bandcamp.com/feed",         source: "Bandcamp",         slug: "bandcamp",      region: "Intl"  },
  { url: "https://www.attackmagazine.com/feed/",    source: "Attack Mag",       slug: "attackmag",     region: "Intl"  },
  { url: "https://www.5mag.net/feed/",              source: "5 Magazine",       slug: "5mag",          region: "Intl"  },
  { url: "https://magneticmag.com/feed",            source: "Magnetic",         slug: "magneticmag",   region: "Intl"  },
  { url: "https://inverted-audio.com/feed/",        source: "Inverted Audio",   slug: "invertedaudio", region: "Intl"  },
  { url: "https://www.theransomnote.com/feed/",     source: "Ransom Note",      slug: "ransomnote",    region: "Intl"  },
  { url: "https://www.decodedmagazine.com/feed/",   source: "Decoded",          slug: "decodedmag",    region: "Intl"  },
  { url: "https://www.tsugi.fr/feed/",              source: "Tsugi",            slug: "tsugi",         region: "Intl"  },
  { url: "https://www.groove.de/feed/",             source: "Groove",           slug: "groove",        region: "Intl"  },
];

// Items publicados hace más de N días no aparecen en el feed.
// 7d = "esta semana en electrónica". Las fuentes weekly (Crack, Attack, 5 Mag)
// alcanzan a tener 1-2 ítems; las daily (DJ Mag, Bandcamp, Mixmag Latam) siempre
// están frescas. BA queda fuera la mayor parte del tiempo — decisión deliberada.
const MAX_NEWS_AGE_DAYS = 7;
// Tope de items por fuente. Garantiza diversidad: las fuentes que publican
// daily (DJ Mag, Bandcamp) no eclipsan a las que publican semanal (Attack
// Magazine) ni a Buenos Aliens (mensual).
const MAX_ITEMS_PER_SOURCE = 8;

function detectMusicTag(title) {
  const t = title.toLowerCase();
  if (t.includes("interview") || t.includes("entrevista") || t.includes("speaks") || t.includes("talks") || t.includes("habla") || t.includes("charla")) return "Interview";
  if (t.includes("festival") || t.includes("lineup") || t.includes("line-up") || t.includes("grilla") || t.includes("lollapalooza") || t.includes("creamfields")) return "Festival";
  if (t.includes("review") || t.includes("álbum") || t.includes("album") || t.includes("release") || t.includes("lanzamiento") || t.includes("estreno") || t.includes("track") || t.includes("remix") || t.includes(" ep ") || t.includes(" lp ") || t.includes("disco")) return "Music";
  if (t.includes("club") || t.includes("venue") || t.includes("boliche") || t.includes("closing") || t.includes("opening") || t.includes("fiesta")) return "Clubs";
  if (t.includes("tour") || t.includes("gira") || t.includes("dates") || t.includes("show") || t.includes("recital") || t.includes("concierto")) return "Tour";
  if (t.includes("mix") || t.includes("set") || t.includes("podcast") || t.includes("sesión") || t.includes("sesion")) return "Mix";
  if (t.includes("buenos aires") || t.includes("argentina") || t.includes("córdoba") || t.includes("rosario") || t.includes("mendoza")) return "Local";
  return "Scene";
}

// Strip HTML, decode named entities, collapse whitespace.
function htmlToText(s) {
  if (!s) return "";
  return String(s)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&iexcl;/gi, "¡").replace(/&iquest;/gi, "¿")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirstImage(html) {
  if (!html) return null;
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? sanitizeUrl(m[1]) || null : null;
}

// Different feeds expose the cover image differently:
//   • <media:content url="..."/>            → object with @_url attr
//   • <media:content>https://...</media:content>  → bare URL as text content
//   • <enclosure url="..." type="image/jpeg"/>  → object with @_url + @_type
//   • <content:encoded><![CDATA[https://...]]></content:encoded> → CDATA URL
//   • <description>...<img src="..."/>...</description>          → first img
// Important: some feeds (Attack Magazine) put audio MP3s in <enclosure> — we
// must reject those by type, and handle arrays since a single item can have
// multiple enclosures.
function isImageType(t) {
  if (!t) return true; // unknown type → assume image (most feeds omit it)
  return /^image\//i.test(String(t));
}

function extractUrlIfImage(field) {
  if (!field) return null;
  // Array — try each
  if (Array.isArray(field)) {
    for (const f of field) {
      const u = extractUrlIfImage(f);
      if (u) return u;
    }
    return null;
  }
  // Plain string with bare URL
  if (typeof field === "string" && /^https?:\/\//i.test(field.trim())) {
    const url = field.trim();
    return /\.(?:mp3|mp4|m4a|ogg|wav|webm)(?:\?|$)/i.test(url) ? null : url;
  }
  // Object (typical: { "@_url": "...", "@_type": "..." })
  if (typeof field === "object") {
    if (!isImageType(field["@_type"])) return null;
    const url = field["@_url"] || (typeof field["#text"] === "string" ? field["#text"] : null);
    if (url && /^https?:\/\//i.test(url)) {
      return /\.(?:mp3|mp4|m4a|ogg|wav|webm)(?:\?|$)/i.test(url) ? null : url;
    }
  }
  return null;
}

function pickItemImage(item, descStr) {
  for (const key of ["media:content", "media:thumbnail", "enclosure"]) {
    const u = extractUrlIfImage(item[key]);
    if (u) return u;
  }
  const ce = item["content:encoded"];
  if (ce) {
    const ceStr = typeof ce === "object" ? (ce["#text"] || "") : String(ce);
    const fromImg = pickFirstImage(ceStr);
    if (fromImg) return fromImg;
    const bare = ceStr.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?/i);
    if (bare) return bare[0];
  }
  return pickFirstImage(descStr);
}

async function fetchBassNewsRSSFeed(feed) {
  try {
    const r = await fetchSafe(feed.url, { headers: { "User-Agent": "BassLayer/1.0" } });
    if (!r.ok) return [];
    const xml = await safeText(r, 2 * 1024 * 1024);
    const parsed = xmlParser.parse(xml);
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    if (!Array.isArray(items)) items = [items];
    return items.slice(0, 15).map((item, idx) => {
      const title = item.title?.["#text"] || item.title || "";
      const rawLink = item.link?.["@_href"] || item.link || "";
      const link = typeof rawLink === "object" ? (rawLink["@_href"] || "") : String(rawLink);
      const url = sanitizeUrl(link);
      let date = item.pubDate || item.published || item.updated || "";
      // Algunos feeds (ej: Mixmag) no exponen pubDate. Los marcados con
      // freshOnNoDate asumen que el orden del RSS = orden cronológico real;
      // staggeo unos minutos por posición para preservar el orden al sortear.
      if (!date && feed.freshOnNoDate) {
        date = new Date(Date.now() - idx * 60_000).toISOString();
      }
      const rel = relativeTime(date);
      const descRaw = item.description || item.summary || "";
      const descStr = typeof descRaw === "object" ? (descRaw["#text"] || "") : String(descRaw);
      const image = pickItemImage(item, descStr);
      const description = htmlToText(descStr)
        // WordPress trailers in multiple languages
        .replace(/\s*The post\s+.+?\s+appeared first on\s+.+?\.?\s*$/i, "")            // EN
        .replace(/\s*La entrada\s+.+?\s+apareci[óo] primero en\s+.+?\.?\s*$/i, "")     // ES
        .replace(/\s*L[''`]article\s+.+?\s+est apparu en premier sur\s+.+?\.?\s*$/i, "") // FR
        .replace(/\s*Der Beitrag\s+.+?\s+erschien zuerst auf\s+.+?\.?\s*$/i, "")       // DE
        .replace(/\s*(?:Continue reading|Read more|Seguir leyendo|Leer más|Suite|Weiterlesen)\.{0,3}\s*$/i, "")
        .slice(0, 320);
      let cleanTitle = String(title).replace(/^(Mixmag|DJ Mag|RA|EDM\.com)\s*[:–—\-|]\s*/i, "").trim();
      cleanTitle = cleanTitle.replace(/\s{2,}/g, " ").slice(0, 140);
      return {
        time: rel,
        _mins: timeToMins(rel),
        _pubDate: date || null,
        tag: detectMusicTag(String(title) + " " + description),
        title: cleanTitle,
        description,
        image: image ? sanitizeUrl(image) : null,
        source: feed.source,
        source_slug: feed.slug,
        region: feed.region || "Intl",
        url,
      };
    });
  } catch (e) {
    console.error(`[bass-news] ${feed.source}:`, e.message);
    return [];
  }
}

// Scrape /notas page on Buenos Aliens. They publish editorial pieces about local
// artists, labels and venues. No RSS — but the listing is HTML-stable.
async function fetchBuenosAliensNotas() {
  try {
    const r = await fetchSafe("https://www.buenosaliens.com/notas", {
      headers: { ...BROWSER_HEADERS, Accept: "text/html" },
    }, 12000);
    if (!r.ok) { console.error(`[bass-news] BA Notas ${r.status}`); return []; }
    const html = await safeText(r, 2 * 1024 * 1024);

    // Each note is wrapped in <article class="card …"> with an inner <a href> + <img> + <h1 class="card__title">
    // and a <span class="tag__date"> like "MIE 29 ABR".
    const articles = html.split(/<article class="card[^"]*"[^>]*>/).slice(1);
    const items = [];
    for (const block of articles) {
      const end = block.indexOf("</article>");
      const seg = end >= 0 ? block.slice(0, end) : block;
      const hrefMatch = seg.match(/href="([^"]+notas\.cfm[^"]+)"/);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      const url = href.startsWith("http") ? href : `https://www.buenosaliens.com${href.startsWith("/") ? "" : "/"}${href}`;
      const imgMatch = seg.match(/<img[^>]+src="([^"]+)"/);
      const image = imgMatch ? sanitizeUrl(imgMatch[1]) : null;
      const dateMatch = seg.match(/<span class="tag__date">([^<]+)<\/span>/);
      const dateLabel = dateMatch ? dateMatch[1].trim() : "";
      const titleMatch = seg.match(/<h1 class="card__title[^"]*">([\s\S]*?)<\/h1>/);
      let titleHtml = titleMatch ? titleMatch[1] : "";
      // Title shape: "ARTIST<br/>Subtitle" — split into artist + subtitle.
      const parts = titleHtml.split(/<br\s*\/?>/i);
      const artist = htmlToText(parts[0] || "");
      const subtitle = htmlToText(parts.slice(1).join(" "));
      const title = subtitle ? `${artist} — ${subtitle}` : artist;
      if (!title) continue;

      // Convert "MIE 29 ABR" → mins-ago using current year
      let mins = 999_999;
      let pubDateISO = null;
      const dm = dateLabel.match(/(\d{1,2})\s+([A-Za-zñÑ]{3})/);
      if (dm) {
        const day = parseInt(dm[1], 10);
        const monIdx = MONTH_MAP[dm[2].toLowerCase().slice(0,3)];
        if (monIdx !== undefined) {
          const now = new Date();
          let d = new Date(now.getFullYear(), monIdx, day);
          if (d > now) d = new Date(now.getFullYear() - 1, monIdx, day);
          mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60_000));
          pubDateISO = d.toISOString();
        }
      }
      const time = mins < 60 ? `${mins}m` : mins < 24*60 ? `${Math.floor(mins/60)}h` : `${Math.floor(mins/(24*60))}d`;

      items.push({
        time,
        _mins: mins,
        _pubDate: pubDateISO,
        tag: detectMusicTag(title),
        title: title.slice(0, 140),
        description: subtitle ? `${artist}. ${subtitle}` : artist,
        image,
        source: "Buenos Aliens",
        source_slug: "buenosaliens",
        region: "BA",
        url,
        artist,
        date_label: dateLabel,
      });
    }
    console.log(`[bass-news] Buenos Aliens Notas: ${items.length} items`);
    return items;
  } catch (e) {
    console.error("[bass-news] BA Notas error:", e.message);
    return [];
  }
}

// Per-source last-good cache: si una fuente devuelve 0 ítems en un ciclo
// (caída temporal, rate-limit, schema change), reutilizamos sus últimos ítems
// buenos en lugar de borrarlos del feed durante 30min. Tiene techo: si la
// fuente sigue caída, eventualmente sus ítems caerán fuera del cap de edad.
const bassNewsLastGood = new Map(); // slug → { items, ts }
const BASS_NEWS_LAST_GOOD_MAX_AGE_MS = 24 * 60 * 60 * 1000; // descartar fallback si lleva +24h sin éxito

async function fetchSourceWithFallback(slug, fetcher) {
  let items = [];
  try { items = await fetcher(); } catch (e) {
    console.error(`[bass-news] ${slug}: fetch threw — ${e.message}`);
  }
  if (Array.isArray(items) && items.length > 0) {
    bassNewsLastGood.set(slug, { items, ts: Date.now() });
    return items;
  }
  const last = bassNewsLastGood.get(slug);
  if (last && (Date.now() - last.ts) < BASS_NEWS_LAST_GOOD_MAX_AGE_MS) {
    const ageMin = Math.round((Date.now() - last.ts) / 60_000);
    console.log(`[bass-news] ${slug}: 0 ítems frescos, reutilizando últimos buenos (${last.items.length} ítems, hace ${ageMin}m)`);
    return last.items;
  }
  return [];
}

// Recalcula time/_mins desde _pubDate. Necesario para fallbacks: ítems
// cacheados pueden tener varias horas y la edad relativa debe reflejar ahora.
function refreshItemAges(items) {
  return items.map((item) => {
    if (!item._pubDate) return item;
    const rel = relativeTime(item._pubDate);
    if (!rel) return item;
    return { ...item, time: rel, _mins: timeToMins(rel) };
  });
}

app.get("/api/bass-news", async (req, res) => {
  const tagFilter = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const applyFilter = (arr) => tagFilter && tagFilter.toLowerCase() !== "all"
    ? arr.filter((n) => n.tag.toLowerCase() === tagFilter.toLowerCase()) : arr;

  const hit = cached("bassNews");
  if (hit) return res.json(applyFilter(hit));

  try {
    const [notas, ...rssResults] = await Promise.all([
      fetchSourceWithFallback("buenosaliens", fetchBuenosAliensNotas),
      ...BASS_NEWS_FEEDS.map((feed) =>
        fetchSourceWithFallback(feed.slug, () => fetchBassNewsRSSFeed(feed))
      ),
    ]);
    const maxAgeMins = MAX_NEWS_AGE_DAYS * 24 * 60;
    const all = refreshItemAges([...notas, ...rssResults.flat()])
      .filter((item) => item.title && item._mins < maxAgeMins)
      .sort((a, b) => a._mins - b._mins);

    // Quota por fuente para garantizar diversidad (ver MAX_ITEMS_PER_SOURCE).
    const perSource = new Map();
    const quotaApplied = [];
    for (const item of all) {
      const slug = item.source_slug || item.source;
      const used = perSource.get(slug) || 0;
      if (used >= MAX_ITEMS_PER_SOURCE) continue;
      perSource.set(slug, used + 1);
      quotaApplied.push(item);
    }

    const news = quotaApplied
      .slice(0, 40)
      .map(({ _mins, _pubDate, ...rest }) => rest);
    setCache("bassNews", news);
    res.json(applyFilter(news));
  } catch (e) {
    console.error("[bass-news]", e.message);
    if (cache.bassNews.data) return res.json(cache.bassNews.data);
    res.status(502).json({ error: "Bass news unavailable" });
  }
});

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

// ── Strategy 1: Buenos Aliens HTML scraper ──

async function fetchBuenosAliens() {
  try {
    const r = await fetchSafe("https://www.buenosaliens.com/", {
      headers: { ...BROWSER_HEADERS, Accept: "text/html,application/xhtml+xml" },
    }, 15000);
    if (!r.ok) { console.error(`[events] Buenos Aliens ${r.status}`); return []; }
    const html = await safeText(r, 3 * 1024 * 1024); // 3MB max for HTML pages
    const events = [];

    // Strip to clean text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#x27;/g, "'")
      .replace(/\n{3,}/g, "\n\n");

    // Split on "Line up" to get event blocks
    const blocks = text.split(/Line up\s*/i);

    for (let i = 1; i < blocks.length; i++) {
      const afterLineup = blocks[i];
      const beforeLineup = blocks[i - 1];
      const prevLines = beforeLineup.trim().split("\n").filter(l => l.trim()).slice(-8);

      // --- Extract date ---
      let day = "", month = "";
      let dateLineIdx = -1;
      const DAY_NAMES = /^(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)$/i;
      for (let j = 0; j < prevLines.length; j++) {
        // Handle multi-day events: "SAB 11 DOM 12 ABR" → take first day, last month
        const multiDayMatch = prevLines[j].match(
          /(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+(\d{1,2})\s+(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+\d{1,2}\s+(\w{3})/i
        );
        if (multiDayMatch) {
          day = multiDayMatch[1].padStart(2, "0");
          month = multiDayMatch[2].charAt(0).toUpperCase() + multiDayMatch[2].slice(1).toLowerCase();
          dateLineIdx = j;
          continue;
        }
        // Standard single-day: "SAB 11 ABR"
        const dateMatch = prevLines[j].match(/(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+(\d{1,2})\s+(\w{3})/i);
        if (dateMatch && !DAY_NAMES.test(dateMatch[2])) {
          day = dateMatch[1].padStart(2, "0");
          month = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1).toLowerCase();
          dateLineIdx = j;
        }
      }
      if (!day || !month) continue;

      // --- Determine format ---
      // "Destacados" format: date line contains " - " suffix, next line is "Artists y más en VENUE"
      // "Agenda" format: title line → date line → venue line → Line up
      const dateLine = prevLines[dateLineIdx] || "";
      const isDestacado = dateLine.includes(" - ") || dateLine.match(/^(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+\d{1,2}\s+\w{3}\s*-/i);

      let eventName = "";
      let venue = "";
      let address = "";

      if (isDestacado) {
        // Destacados: line after date is "Artists y más en VENUE, City"
        const titleLine = (dateLineIdx + 1 < prevLines.length) ? prevLines[dateLineIdx + 1].trim() : "";
        // Extract venue from "Artists y más en VENUE_NAME" or just the full title
        const enMatch = titleLine.match(/^(.+?)\s+en\s+(.+)$/i);
        if (enMatch) {
          eventName = enMatch[1].trim();
          venue = enMatch[2].trim();
        } else {
          eventName = titleLine;
        }
      } else {
        // Agenda: lines before date are title, line after date is venue
        // Pattern: ... Title → SAB 28 MAR → Venue → Line up
        if (dateLineIdx > 0) {
          eventName = prevLines[dateLineIdx - 1].trim();
        }
        if (dateLineIdx + 1 < prevLines.length) {
          const nextLine = prevLines[dateLineIdx + 1].trim();
          // Make sure it's not another date line or "Line up"
          if (!nextLine.match(/^(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s/i) && !nextLine.match(/^Line up/i)) {
            venue = nextLine;
          }
        }
      }

      // --- Extract artists ---
      const postLines = afterLineup.split("\n").filter(l => l.trim());
      const artists = [];
      for (const line of postLines) {
        const clean = line.trim().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
        // Stop at metadata lines
        if (clean.match(/^(Desde las|Estilo:|queda en|será en)/i)) break;
        if (clean.match(/^https?:/i)) break;
        // Stop at date lines (e.g. "VIE 10 ABR -") — means we've leaked into next event
        if (clean.match(/^(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+\d{1,2}\s+\w{3}/i)) break;
        // Stop at venue address patterns
        if (clean.match(/\bqueda en\b/i) || clean.match(/\bserá en\b/i)) break;
        // Skip empty/short or metadata
        if (clean.length < 2 || clean.length > 50) continue;
        if (clean.match(/^(Line up|Edad|Precio)/i)) continue;
        // Skip day-of-week headers in multi-day events (e.g. "sábado", "Domingo")
        if (clean.match(/^(?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)$/i)) continue;
        // Clean "b2b" formatting
        const artistClean = clean.replace(/\bb2b\b/gi, "b2b").trim();
        if (artistClean.length > 1) artists.push(artistClean);
        if (artists.length >= 10) break;
      }

      if (artists.length === 0) continue;

      // --- Extract venue address for Maps ---
      // Patterns: "X queda en ADDRESS", "X será en ADDRESS", "X es ADDRESS"
      const addressMatch = afterLineup.match(/(?:queda en|será en)\s*([^\n]+)/i)
        || afterLineup.match(/\b(?:es)\s+([A-Z][^\n]{10,})/m); // "Crobar es Marcelino Freyre..."
      if (addressMatch) {
        address = addressMatch[1]
          .replace(/\.\s*$/, "")
          .replace(/\bqueda en\b.*/i, "") // clean nested "queda en" within address
          .trim();
      }

      // If venue wasn't found, try to extract from the "y más en" pattern or address
      if (!venue && address) {
        venue = address.split(",")[0].trim();
      }
      if (!venue) venue = "TBA";

      // Clean venue: remove trailing truncation, limit length
      venue = venue.replace(/,\s*$/, "").slice(0, 50);

      // --- Extract time ---
      const timeMatch = afterLineup.match(/Desde las (\d{1,2}(?::\d{2})?)\s*hs/i);
      const time = timeMatch ? timeMatch[1] + (timeMatch[1].includes(":") ? "" : ":00") : "23:00";

      // --- Extract genre ---
      const styleMatch = afterLineup.match(/Estilo:\s*([^\n.]+)/i);
      const genre = styleMatch ? detectGenre(styleMatch[1]) : detectGenre(artists.join(" ") + " " + eventName);

      // --- Build clean event name ---
      // Clean up any address fragments that leaked in
      eventName = eventName
        .replace(/\s*queda en\s.*/i, "")
        .replace(/\s*será en\s.*/i, "")
        .trim()
        .slice(0, 60);

      if (!eventName) eventName = artists.slice(0, 2).join(", ");

      const fullAddress = address || venue;
      events.push({
        day, month,
        name: eventName,
        venue,
        address: fullAddress,
        city: detectCity(venue, fullAddress),
        artists,
        time,
        genre,
        url: "",
        image: null,
        source: "buenosaliens",
      });
    }

    // Deduplicate within BA results (page sometimes repeats events)
    const seen = new Set();
    const unique = events.filter(ev => {
      const key = `${ev.day}-${ev.month}-${ev.name}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[events] Buenos Aliens: parsed ${unique.length} events (${events.length - unique.length} dupes removed)`);
    return unique;

  } catch (e) {
    console.error("[events] Buenos Aliens error:", e.message);
    return [];
  }
}

// ── Strategy 2: RA GraphQL ──

const RA_GRAPHQL = "https://ra.co/graphql";
// Buenos Aires area id changed to 395 (was 218; 218 is now San Francisco/Oakland).
const RA_AREAS = [395];
// RA dropped sortOrder/sortField args and moved flyer URLs from `flyerFront` (now always null)
// to `images[]` with `type: "FLYERFRONT"`. Filter syntax also changed: `areas:{eq:N}` returns 0,
// must use `areas:{any:[N]}`.
const RA_QUERY = `query GET_DEFAULT_EVENTS_LISTING($filters:FilterInputDtoInput,$pageSize:Int){eventListings(filters:$filters,pageSize:$pageSize,page:1){data{event{id title date startTime endTime contentUrl images{filename type} venue{name area{name}}artists{name}}}totalResults}}`;

function pickRAFlyer(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const front = images.find(i => i?.type === "FLYERFRONT" && i?.filename);
  if (front) return front.filename;
  const any = images.find(i => i?.filename);
  return any?.filename || null;
}

function extractRATime(t) {
  if (!t) return "23:00";
  if (typeof t === "string" && t.includes("T")) return t.split("T")[1].slice(0, 5);
  return t;
}

function formatRAEvent(ev) {
  const date = new Date(ev.date);
  const artists = (ev.artists || []).map(a => a.name);
  const venueName = (ev.venue?.name || "TBA").slice(0, 50);
  const areaName = ev.venue?.area?.name || "";
  const genre = detectGenre((ev.title || "") + " " + artists.join(" "));
  const fullAddress = areaName ? `${venueName}, ${areaName}` : venueName;
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: MONTHS_ES[date.getMonth()],
    name: (ev.title || "Event").slice(0, 60),
    venue: venueName,
    address: fullAddress,
    city: detectCity(venueName, fullAddress),
    artists,
    time: extractRATime(ev.startTime),
    genre,
    url: ev.contentUrl ? `https://ra.co${ev.contentUrl}` : "",
    image: pickRAFlyer(ev.images) || ev.flyerFront || null,
    source: "ra",
  };
}

async function fetchRAGraphQL(areaId) {
  const today = new Date().toISOString().split("T")[0];
  // Ventana 60 días: diagnóstico mostró que RA tiene ~58 eventos en 60d para
  // CABA, contra ~30 en 30d. pageSize 100 cubre el total con margen sin paginar.
  const windowEnd = new Date(Date.now() + 60*86400000).toISOString().split("T")[0];
  try {
    const r = await fetchSafe(RA_GRAPHQL, {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "Content-Type":"application/json", Referer:"https://ra.co/events/ar/buenosaires", Origin:"https://ra.co", Accept:"application/json" },
      body: JSON.stringify({ query: RA_QUERY, variables: { filters: { areas:{any:[areaId]}, listingDate:{gte:today,lte:windowEnd} }, pageSize:100 } }),
    }, 12000);
    if (!r.ok) return [];
    const json = JSON.parse(await safeText(r));
    return (json?.data?.eventListings?.data || []).map(l => formatRAEvent(l.event));
  } catch (e) {
    console.error(`[events] RA GraphQL (${areaId}):`, e.message);
    return [];
  }
}

// ── Strategy 3: RA HTML __NEXT_DATA__ ──

async function fetchRAHtml() {
  try {
    const r = await fetchSafe("https://ra.co/events/ar/buenosaires", {
      headers: { ...BROWSER_HEADERS, Accept:"text/html" },
    }, 12000);
    if (!r.ok) return [];
    const html = await safeText(r, 3 * 1024 * 1024);
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return [];
    const nd = JSON.parse(match[1]);
    const listings = nd?.props?.pageProps?.eventListings?.data || nd?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.eventListings?.data || [];
    return listings.slice(0,20).map(l => formatRAEvent(l.event || l));
  } catch (e) {
    console.error("[events] RA HTML:", e.message);
    return [];
  }
}

// ── Strategy 4: Curated fallback ──

// Fallback events are generated dynamically to always show future dates
function generateFallbackEvents() {
  const templates = [
    { name:"Techno Night",           genre:"Techno",      time:"23:59", venue:"Blow",              address:"Blow, Palermo, Buenos Aires",              city:"CABA", artists:["TBA"], url:"", source:"fallback", image:null },
    { name:"House Session",          genre:"House",       time:"23:00", venue:"La Biblioteca",     address:"La Biblioteca, Buenos Aires",              city:"CABA", artists:["TBA"], url:"", source:"fallback", image:null },
    { name:"Progressive Sunday",     genre:"Progressive", time:"18:00", venue:"Club de Pescadores", address:"Club de Pescadores, Costanera Norte, Buenos Aires", city:"CABA", artists:["TBA"], url:"", source:"fallback", image:null },
    { name:"Electronic Underground", genre:"Electronic",  time:"23:00", venue:"Crobar",            address:"Crobar, Palermo, Buenos Aires",            city:"CABA", artists:["TBA"], url:"", source:"fallback", image:null },
  ];
  const events = [];
  const now = new Date();
  for (let i = 0; i < templates.length; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + (i + 1) * 3); // space events every 3 days starting from tomorrow-ish
    events.push({
      day: String(d.getDate()).padStart(2, "0"),
      month: MONTHS_ES[d.getMonth()],
      ...templates[i],
    });
  }
  return events;
}

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
      .replace(/^(tba|tbd|tbc)\s*[-:|–—]\s*/i, "")
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

  const byVenue = new Map();
  for (const ev of events) {
    const key = `${ev.day}-${ev.month}-${normVenue(ev.venue)}`;
    const existing = byVenue.get(key);
    if (!existing) byVenue.set(key, ev);
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
  const artistSet = (ev) => new Set(
    (ev.artists || []).map(normArtist).filter(a => a && !TRIVIAL_ARTISTS.has(a))
  );
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
    if (/^(tba|tbd|tbc)\s*[-:|–—]/i.test(ev.venue || "")) s -= 3;
    if (/\bMORE ARTISTS\b/.test(ev.name || "")) s -= 2;
    return s;
  };

  const list = [...byVenue.values()];
  const byDay = new Map();
  for (const ev of list) {
    const dKey = `${ev.day}-${ev.month}`;
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
  return list.filter(ev => !dropped.has(ev));
}

// ─────────────────────────────────────────────
//  GET /api/festivals — Curaduría manual de festivales
//  Foco electrónica. Datos en data/festivals.json.
//  Imágenes: si el JSON no trae `image`, scrapea og:image del sitio oficial
//  y la cachea 7 días.
// ─────────────────────────────────────────────

const FESTIVALS_FILE = join(__dirname, "data", "festivals.json");
let festivalsCache = null;
let festivalsCacheTs = 0;
const FESTIVALS_CACHE_TTL = 60 * 60_000; // 1h — el JSON no cambia frecuentemente

function loadFestivals() {
  const now = Date.now();
  if (festivalsCache && (now - festivalsCacheTs) < FESTIVALS_CACHE_TTL) return festivalsCache;
  try {
    if (existsSync(FESTIVALS_FILE)) {
      festivalsCache = JSON.parse(readFileSync(FESTIVALS_FILE, "utf-8"));
      festivalsCacheTs = now;
      return festivalsCache;
    }
  } catch (e) {
    console.error("[festivals] load error:", e.message);
  }
  return [];
}

function festivalStatus(f) {
  const now = new Date();
  const start = f.dates_start ? new Date(f.dates_start) : null;
  const end = f.dates_end ? new Date(f.dates_end) : start;
  if (!start) return "tba";
  if (end && end < now) return "past";
  if (start <= now && (!end || end >= now)) return "live";
  return "upcoming";
}

// Cache de meta (image + link status) por festival id. La primera carga es
// lenta (~3-5s, 30 fetches en paralelo); las siguientes son instantáneas
// durante 7 días para imagen, 12h para link status (chequeamos vigencia más
// seguido por si un dominio cae o se recupera).
const festivalImageCache = new Map();   // id → { image, ts }
const festivalLinkCache  = new Map();   // id → { status, ts }
const FESTIVAL_IMAGE_TTL = 7 * 24 * 60 * 60 * 1000;
const FESTIVAL_LINK_TTL  = 12 * 60 * 60 * 1000;

function extractOgImage(html) {
  if (!html) return null;
  // Probar property="og:image", twitter:image, og:image:secure_url, etc.
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const rx of patterns) {
    const m = html.match(rx);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function absolutizeUrl(maybeRelative, base) {
  if (!maybeRelative) return null;
  try { return new URL(maybeRelative, base).toString(); } catch { return null; }
}

// Lee los primeros N bytes de una respuesta y trunca el resto SIN tirar error.
// Necesario para extraer og:image: la mayoría está en los primeros ~50KB (head),
// pero algunos sitios sirven HTMLs de varios MB que el safeText rechaza entero.
// Soporta tanto Web Streams (response.body.getReader) como Node Streams (node-fetch).
async function readHead(response, maxBytes = 256 * 1024) {
  const chunks = [];
  let total = 0;
  const webReader = response.body?.getReader?.();
  if (webReader) {
    try {
      while (true) {
        const { done, value } = await webReader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          chunks.push(value.slice(0, value.length - (total - maxBytes)));
          try { await webReader.cancel(); } catch {}
          break;
        }
        chunks.push(value);
      }
    } catch {
      try { await webReader.cancel(); } catch {}
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
  // node-fetch: Node Stream con async iteration
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) {
        chunks.push(chunk.slice(0, chunk.length - (total - maxBytes)));
        response.body.destroy?.();
        break;
      }
      chunks.push(chunk);
    }
  } catch {
    response.body.destroy?.();
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// Devuelve { image, linkStatus } para un festival.
//   linkStatus: 'ok'        → el sitio respondió 2xx
//               'broken'    → DNS, timeout, 4xx/5xx persistente
//               'no_url'    → no tiene URL en el JSON
//               'cached_ok' → no chequeado este ciclo, usamos cache previo OK
async function resolveFestivalMeta(festival) {
  // Si tiene image explícita en el JSON, no hacemos fetch — confiamos.
  // Pero igual chequeamos el link status si tiene url.
  const hasExplicitImage = !!festival.image;

  // Sin URL: image como esté en JSON, status no_url.
  if (!festival.url) {
    return { image: festival.image || null, linkStatus: "no_url" };
  }

  const imgCached = festivalImageCache.get(festival.id);
  const linkCached = festivalLinkCache.get(festival.id);
  const now = Date.now();

  const imgFresh = imgCached && (now - imgCached.ts) < FESTIVAL_IMAGE_TTL;
  const linkFresh = linkCached && (now - linkCached.ts) < FESTIVAL_LINK_TTL;

  if (imgFresh && linkFresh) {
    return {
      image: hasExplicitImage ? festival.image : imgCached.image,
      linkStatus: linkCached.status,
    };
  }

  try {
    const r = await fetchSafe(festival.url, {
      headers: { ...BROWSER_HEADERS, Accept: "text/html" },
    }, 8000);

    const linkStatus = r.ok ? "ok" : "broken";
    festivalLinkCache.set(festival.id, { status: linkStatus, ts: now });

    if (!r.ok || hasExplicitImage) {
      // No parseamos imagen si la URL falló o si ya tenemos image explícita.
      if (!imgFresh && !hasExplicitImage) {
        festivalImageCache.set(festival.id, { image: null, ts: now });
      }
      return { image: hasExplicitImage ? festival.image : (imgFresh ? imgCached.image : null), linkStatus };
    }

    const html = await readHead(r, 256 * 1024);
    const raw = extractOgImage(html);
    const abs = absolutizeUrl(raw, festival.url);
    const image = abs ? sanitizeUrl(abs) : null;
    festivalImageCache.set(festival.id, { image, ts: now });
    return { image, linkStatus };
  } catch (e) {
    console.error(`[festivals] meta ${festival.id}:`, e.message);
    festivalLinkCache.set(festival.id, { status: "broken", ts: now });
    if (!imgFresh && !hasExplicitImage) {
      festivalImageCache.set(festival.id, { image: null, ts: now });
    }
    return {
      image: hasExplicitImage ? festival.image : (imgFresh ? imgCached.image : null),
      linkStatus: "broken",
    };
  }
}

app.get("/api/festivals", async (req, res) => {
  const regionFilter = Array.isArray(req.query.region) ? req.query.region[0] : req.query.region;
  const all = loadFestivals();

  // Drop past first (no gastamos fetches en festivales pasados)
  const includesPast = String(req.query.past || "").toLowerCase() === "1";
  let pool = all.map((f) => ({ ...f, status: festivalStatus(f) }));
  if (!includesPast) pool = pool.filter((f) => f.status !== "past");
  if (regionFilter && regionFilter.toLowerCase() !== "all") {
    pool = pool.filter((f) => (f.region || "").toLowerCase() === regionFilter.toLowerCase());
  }

  // Resolver imagen + link status en paralelo (cacheadas)
  const enriched = await Promise.all(pool.map(async (f) => {
    const { image, linkStatus } = await resolveFestivalMeta(f);
    return { ...f, image, linkStatus };
  }));

  // Sort: live first, then upcoming por fecha asc, then tba
  const order = { live: 0, upcoming: 1, tba: 2, past: 3 };
  enriched.sort((a, b) => {
    const o = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (o !== 0) return o;
    const da = a.dates_start ? new Date(a.dates_start).getTime() : Infinity;
    const db = b.dates_start ? new Date(b.dates_start).getTime() : Infinity;
    return da - db;
  });

  res.json(enriched);
});

app.get("/api/events", async (req, res) => {
  const genreFilter = Array.isArray(req.query.genre) ? req.query.genre[0] : req.query.genre;
  const applyFilter = (arr) => genreFilter && genreFilter.toLowerCase() !== "all"
    ? arr.filter(e => e.genre.toLowerCase() === genreFilter.toLowerCase()) : arr;

  const hit = cached("events");
  if (hit) return res.json(applyFilter(hit));

  let allEvents = [];

  // Try Buenos Aliens first (primary source)
  const baEvents = await fetchBuenosAliens();
  if (baEvents.length > 0) {
    console.log(`[events] Buenos Aliens: ${baEvents.length} events loaded`);
    allEvents.push(...baEvents);
  }

  // Try RA as supplement (parallel)
  const raResults = await Promise.allSettled(RA_AREAS.map(fetchRAGraphQL));
  for (const r of raResults) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      console.log(`[events] RA GraphQL: ${r.value.length} events loaded`);
      allEvents.push(...r.value);
      break;
    }
  }

  // Try RA HTML if GraphQL failed
  if (!allEvents.some(e => e.source === "ra")) {
    const raHtml = await fetchRAHtml();
    if (raHtml.length > 0) {
      console.log(`[events] RA HTML: ${raHtml.length} events loaded`);
      allEvents.push(...raHtml);
    }
  }

  // Fetch approved venue-submitted events from Supabase
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: venueEvents } = await supabase
      .from("venue_events")
      .select("*, profiles(display_name, slug, logo_url, verified)")
      .eq("status", "approved")
      .gte("date", today);

    if (venueEvents && venueEvents.length > 0) {
      console.log(`[events] Venue-submitted: ${venueEvents.length} events`);
      for (const ve of venueEvents) {
        const d = new Date(ve.date);
        allEvents.push({
          day: String(d.getUTCDate()).padStart(2, "0"),
          month: MONTHS_ES[d.getUTCMonth()],
          name: ve.name,
          venue: ve.profiles?.display_name || "TBA",
          address: "",
          city: "CABA",
          artists: ve.artists || [],
          time: ve.time_start?.slice(0, 5) || "",
          genre: ve.genre || "Electronic",
          url: ve.ticket_url || "",
          image: ve.flyer_url || null,
          source: "venue",
          venue_slug: ve.profiles?.slug,
          venue_verified: ve.profiles?.verified || false,
          featured: ve.featured || false,
          ticket_price: ve.ticket_price || null,
          description: ve.description || null,
        });
      }
    }
  } catch (e) {
    console.error("[events] Venue events fetch error:", e.message);
  }

  // If nothing worked, use curated fallback
  if (allEvents.length === 0) {
    console.log("[events] All sources failed, using curated fallback");
    allEvents = generateFallbackEvents();
  }

  // Deduplicate (same day+venue = same event)
  const deduped = deduplicateEvents(allEvents);

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

  const events = deduped.filter(ev => {
    const evDate = getEventFullDate(ev);
    if (!evDate) return true; // keep unknown months
    // Keep events from today onward (allow same-day events)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return evDate >= today;
  });

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

  setCache("events", events);
  res.json(applyFilter(events));
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

// ─────────────────────────────────────────────
//  GET /api/artist?name=X — bio + thumbnail (Wikipedia REST, public)
// ─────────────────────────────────────────────
const artistCache = new Map();
const ARTIST_CACHE_MAX = 200;
const ARTIST_TTL = 24 * 60 * 60_000;

async function tryWikipediaLang(name, lang) {
  const baseCandidates = [name, `${name} (DJ)`, `${name} (musician)`, `${name} (producer)`];
  const esExtras = lang === "es"
    ? [`${name} (DJ argentino)`, `${name} (productor)`, `${name} (músico)`, `${name} (cantante)`]
    : [];
  const candidates = [...baseCandidates, ...esExtras];

  for (const candidate of candidates) {
    const slug = candidate.replace(/ /g, "_");
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`;
    try {
      const r = await fetchSafe(url, {
        headers: { "User-Agent": "BassLayer/1.0 (basslayer.app)" },
      }, 8000);
      if (!r.ok) continue;
      const text = await safeText(r);
      const j = JSON.parse(text);
      if (j.type === "disambiguation") continue;
      if (!j.extract) continue;
      const haystack = `${j.description || ""} ${j.extract || ""}`.toLowerCase();
      const isMusical = /\b(dj|musician|producer|artist|electronic|techno|house|trance|drum|composer|singer|band|músico|música|productor|productora|cantante|compositor|compositora|artista|banda|electrónica|electronica)\b/.test(haystack);
      if (!isMusical) continue;
      return {
        name,
        found: true,
        title: j.title,
        description: j.description || "",
        extract: j.extract,
        thumbnail: j.thumbnail?.source || null,
        url: j.content_urls?.desktop?.page || null,
        source: `wikipedia-${lang}`,
      };
    } catch {}
  }
  return null;
}

function normalizeArtistName(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

async function tryDeezer(name) {
  const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=3`;
  try {
    const r = await fetchSafe(url, {}, 6000);
    if (!r.ok) return null;
    const j = JSON.parse(await safeText(r));
    const candidates = j.data || [];
    if (candidates.length === 0) return null;
    const target = normalizeArtistName(name);
    const match = candidates.find(a => normalizeArtistName(a.name) === target)
                || candidates.find(a => normalizeArtistName(a.name).includes(target) || target.includes(normalizeArtistName(a.name)));
    if (!match) return null;
    const fans = match.nb_fan || 0;
    const albums = match.nb_album || 0;
    const desc = [
      fans > 0 ? `${fans.toLocaleString("es-AR")} fans en Deezer` : null,
      albums > 0 ? `${albums} ${albums === 1 ? "álbum" : "álbumes"}` : null,
    ].filter(Boolean).join(" · ");
    return {
      name,
      found: true,
      title: match.name,
      description: desc || "Perfil de Deezer",
      extract: null,
      thumbnail: match.picture_xl || match.picture_big || match.picture_medium || null,
      url: match.link || null,
      source: "deezer",
    };
  } catch {
    return null;
  }
}

async function tryItunes(name) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=3`;
  try {
    const r = await fetchSafe(url, {}, 6000);
    if (!r.ok) return null;
    const j = JSON.parse(await safeText(r));
    const candidates = j.results || [];
    if (candidates.length === 0) return null;
    const target = normalizeArtistName(name);
    const match = candidates.find(a => normalizeArtistName(a.artistName) === target)
                || candidates.find(a => normalizeArtistName(a.artistName).includes(target) || target.includes(normalizeArtistName(a.artistName)));
    if (!match) return null;
    const genre = match.primaryGenreName ? match.primaryGenreName : null;
    return {
      name,
      found: true,
      title: match.artistName,
      description: genre ? `${genre} · iTunes` : "iTunes",
      extract: null,
      thumbnail: null,
      url: match.artistLinkUrl || null,
      source: "itunes",
    };
  } catch {
    return null;
  }
}

async function tryMusicBrainz(name) {
  const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json&limit=3`;
  try {
    const r = await fetchSafe(url, {
      headers: {
        "User-Agent": "BassLayer/1.0 (basslayer.app)",
        "Accept": "application/json",
      },
    }, 7000);
    if (!r.ok) return null;
    const j = JSON.parse(await safeText(r));
    const candidates = j.artists || [];
    if (candidates.length === 0) return null;
    const target = normalizeArtistName(name);
    const match = candidates.find(a => normalizeArtistName(a.name) === target)
                || candidates.find(a => normalizeArtistName(a.name).includes(target) || target.includes(normalizeArtistName(a.name)));
    if (!match) return null;
    const parts = [
      match.country ? match.country : null,
      match.type ? match.type : null,
      match["life-span"]?.begin ? `${match["life-span"].begin}` : null,
    ].filter(Boolean);
    return {
      name,
      found: true,
      title: match.name,
      description: parts.length > 0 ? `${parts.join(" · ")} · MusicBrainz` : "MusicBrainz",
      extract: match.disambiguation || null,
      thumbnail: null,
      url: `https://musicbrainz.org/artist/${match.id}`,
      source: "musicbrainz",
    };
  } catch {
    return null;
  }
}

async function fetchArtistInfo(name, locale = "es") {
  const primary = locale === "en" ? "en" : "es";
  const fallback = primary === "en" ? "es" : "en";
  // 1. Wikipedia in the user's language (rich bio + thumbnail)
  const wikiPrimary = await tryWikipediaLang(name, primary);
  if (wikiPrimary) return wikiPrimary;
  // 2. Wikipedia in the other language
  const wikiFallback = await tryWikipediaLang(name, fallback);
  if (wikiFallback) return wikiFallback;
  // 3. Deezer (photo + fan count, great for DJs)
  const deezer = await tryDeezer(name);
  if (deezer) return deezer;
  // 4. iTunes (genre + official link)
  const itunes = await tryItunes(name);
  if (itunes) return itunes;
  // 5. MusicBrainz (country + type + start year, last-resort metadata)
  const mb = await tryMusicBrainz(name);
  if (mb) return mb;
  return { name, found: false };
}

app.get("/api/artist", async (req, res) => {
  const raw = (req.query.name || "").toString().trim();
  const locale = (req.query.locale || "es").toString().toLowerCase() === "en" ? "en" : "es";
  if (!raw || raw.length > 80) return res.status(400).json({ error: "Invalid name" });
  const key = `${locale}:${raw.toLowerCase()}`;

  const hit = artistCache.get(key);
  if (hit && Date.now() - hit.ts < ARTIST_TTL) return res.json(hit.data);

  try {
    const data = await fetchArtistInfo(raw, locale);
    if (artistCache.size >= ARTIST_CACHE_MAX) {
      const oldest = artistCache.keys().next().value;
      artistCache.delete(oldest);
    }
    artistCache.set(key, { data, ts: Date.now() });
    res.json(data);
  } catch (e) {
    console.error("[artist]", e.message);
    res.json({ name: raw, found: false });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dashboard — BTC dominance, Fear & Greed, ETH gas
// ─────────────────────────────────────────────

app.get("/api/dashboard", async (req, res) => {
  const hit = cached("dashboard");
  if (hit) return res.json(hit);

  try {
    const results = await Promise.allSettled([
      fetchSafe("https://api.coingecko.com/api/v3/global").then(r => r.ok ? safeText(r).then(JSON.parse) : null),
      fetchSafe("https://api.alternative.me/fng/?limit=1").then(r => r.ok ? safeText(r).then(JSON.parse) : null),
      fetchSafe("https://api.etherscan.io/api?module=gastracker&action=gasoracle").then(r => r.ok ? safeText(r).then(JSON.parse) : null),
    ]);

    const globalData = results[0].status === "fulfilled" ? results[0].value : null;
    const fngData = results[1].status === "fulfilled" ? results[1].value : null;
    const gasData = results[2].status === "fulfilled" ? results[2].value : null;

    const dashboard = {
      btcDominance: globalData?.data?.market_cap_percentage?.btc
        ? Math.round(globalData.data.market_cap_percentage.btc * 10) / 10
        : null,
      ethDominance: globalData?.data?.market_cap_percentage?.eth
        ? Math.round(globalData.data.market_cap_percentage.eth * 10) / 10
        : null,
      totalMarketCap: globalData?.data?.total_market_cap?.usd || null,
      marketCapChange24h: globalData?.data?.market_cap_change_percentage_24h_usd
        ? Math.round(globalData.data.market_cap_change_percentage_24h_usd * 10) / 10
        : null,
      fearGreed: fngData?.data?.[0] ? {
        value: parseInt(fngData.data[0].value),
        label: fngData.data[0].value_classification,
      } : null,
      ethGas: gasData?.result?.ProposeGasPrice ? {
        low: parseInt(gasData.result.SafeGasPrice) || null,
        avg: parseInt(gasData.result.ProposeGasPrice) || null,
        high: parseInt(gasData.result.FastGasPrice) || null,
      } : null,
    };

    setCache("dashboard", dashboard);
    res.json(dashboard);
  } catch (e) {
    console.error("[dashboard]", e.message);
    if (cache.dashboard?.data) return res.json(cache.dashboard.data);
    res.status(500).json({ error: "Dashboard data unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/prediction-markets — Polymarket Gamma
// ─────────────────────────────────────────────

function parseMaybeJSONArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

app.get("/api/prediction-markets", async (req, res) => {
  const hit = cached("predictions");
  if (hit) return res.json(hit);
  try {
    // Pull a wider window because we filter out resolved/expired markets after
    const url = "https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=80&order=volume24hr&ascending=false";
    const r = await fetchSafe(url, { headers: { "Accept": "application/json" } }, 10000);
    if (!r.ok) throw new Error(`Polymarket ${r.status}`);
    const raw = JSON.parse(await safeText(r));
    const list = Array.isArray(raw) ? raw : (raw.data || []);
    const now = Date.now();

    const markets = list.map((m) => {
      const outcomes = parseMaybeJSONArray(m.outcomes);
      const prices = parseMaybeJSONArray(m.outcomePrices).map(Number);
      // Pick the leading outcome (highest price)
      let topIdx = 0;
      for (let i = 1; i < prices.length; i++) if (prices[i] > prices[topIdx]) topIdx = i;
      const topOutcome = outcomes[topIdx] || null;
      const topPct = prices[topIdx] != null ? Math.round(prices[topIdx] * 100) : null;
      const vol24 = Number(m.volume24hr) || 0;
      const endDate = m.endDate || m.end_date_iso || null;
      const endTs = endDate ? new Date(endDate).getTime() : null;
      // Prefer the event slug — Polymarket URLs are /event/{eventSlug}, not market slug
      const eventSlug = (Array.isArray(m.events) && m.events[0]?.slug) || m.slug || "";
      return {
        id: String(m.id || m.conditionId || m.slug),
        slug: m.slug || "",
        question: m.question || m.title || "",
        icon: sanitizeUrl(m.icon || m.image || ""),
        topOutcome,
        topPct,
        outcomes,
        prices,
        volume24h: Math.round(vol24),
        endDate,
        endTs,
        url: eventSlug ? `https://polymarket.com/event/${eventSlug}` : "https://polymarket.com",
      };
    })
      // Quality gates: alive market, real uncertainty, real volume, future deadline
      .filter((m) =>
        m.question &&
        m.topPct != null &&
        m.topPct < 97 &&
        m.volume24h >= 1000 &&
        (!m.endTs || m.endTs > now)
      )
      .slice(0, 12)
      // Drop the temp endTs field before responding
      .map(({ endTs: _t, ...rest }) => rest);

    setCache("predictions", markets);
    res.json(markets);
  } catch (e) {
    console.error("[prediction-markets]", e.message);
    if (cache.predictions.data) return res.json(cache.predictions.data);
    res.status(502).json({ error: "Prediction markets unavailable" });
  }
});

// ─────────────────────────────────────────────
//  Meta + Health
// ─────────────────────────────────────────────

app.get("/api/meta", (req, res) => res.json({
  newsTags: ["All","BTC","ETH","SOL","XRP","DeFi","L2","NFT","Reg","AI","Stable","Mining","Crypto"],
  eventGenres: ["All","Techno","House","Deep House","Tech House","Progressive","Melodic","Minimal","DnB","Trance","Disco","Ambient","Festival","Electronic"],
}));

app.get("/api/health", (req, res) => {
  const data = { status: "ok", version: "1.5" };
  // Only expose internals in development
  if (!IS_PROD) {
    data.uptime = Math.floor(process.uptime());
    data.cache = Object.fromEntries(Object.entries(cache).map(([k]) => [k, cached(k) ? "fresh" : "stale"]));
  }
  res.json(data);
});

// ═══════════════════════════════════════════════════════
//  Crypto Events — scraped from Eventbrite + Meetup
// ═══════════════════════════════════════════════════════

const LUMA_CATEGORIES = ["crypto", "blockchain", "web3"];

async function fetchLumaEvents() {
  const events = [];
  for (const category of LUMA_CATEGORIES) {
    try {
      const url = `https://api.lu.ma/discover/get-paginated-events?pagination_limit=50&category=${category}`;
      const res = await fetchSafe(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BassLayer/1.5)" }
      }, 12000);
      if (!res || !res.ok) continue;
      const text = await safeText(res);
      const data = JSON.parse(text);
      const entries = data.entries || [];

      for (const entry of entries) {
        const ev = entry.event || {};
        const cal = entry.calendar || {};
        if (!ev.name) continue;

        const startDate = ev.start_at ? new Date(ev.start_at) : null;
        if (startDate && startDate < Date.now()) continue;

        // Get location info
        let location = "";
        if (ev.geo_address_info) {
          location = ev.geo_address_info.city || ev.geo_address_info.full_address || "";
        } else if (ev.location_type === "online") {
          location = "Online";
        }

        // Determine if free
        const ticketInfo = entry.ticket_info || {};
        const isFree = ticketInfo.is_free !== false && !ticketInfo.min_price;

        events.push({
          title: String(ev.name).slice(0, 200),
          organizer: cal.name || (entry.hosts || []).map(h => h.name).filter(Boolean).join(", ") || "Luma",
          date: startDate ? startDate.toISOString().split("T")[0] : "",
          time: startDate ? startDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ev.timezone || "America/Buenos_Aires" }) : "",
          location,
          url: ev.url ? `https://lu.ma/${ev.url}` : "",
          description: String(ev.description_short || "").slice(0, 300),
          free: isFree,
          source: "luma",
          guests: entry.guest_count || 0,
        });
      }
    } catch (err) {
      console.error(`[crypto-events] Luma ${category}:`, err.message);
    }
  }
  return events;
}

async function fetchCryptoEvents() {
  const hit = cached("cryptoEvents");
  if (hit) return hit;

  console.log("[crypto-events] Fetching from Luma...");
  const lumaEvents = await fetchLumaEvents().catch(() => []);

  // Deduplicate by title similarity
  const seen = new Set();
  const unique = [];
  for (const ev of lumaEvents) {
    const key = ev.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ev);
  }

  // Sort by date
  unique.sort((a, b) => (a.date || "9999") > (b.date || "9999") ? 1 : -1);

  console.log(`[crypto-events] Luma: ${lumaEvents.length}, Total unique: ${unique.length}`);
  setCache("cryptoEvents", unique);
  return unique;
}

app.get("/api/crypto-events", async (req, res) => {
  try {
    const scraped = await fetchCryptoEvents();
    // Merge with manually submitted events
    const manual = loadCryptoIrl();
    const manualEvents = (manual.events || [])
      .filter(e => e.status === "approved")
      .map(e => ({ ...e, source: "community" }));

    const all = [...manualEvents, ...scraped];
    // Sort by date
    all.sort((a, b) => (a.date || "9999") > (b.date || "9999") ? 1 : -1);

    res.json(all);
  } catch (err) {
    console.error("[crypto-events] Error:", err.message);
    // Return at least manual events
    const manual = loadCryptoIrl();
    res.json((manual.events || []).filter(e => e.status === "approved"));
  }
});

// ═══════════════════════════════════════════════════════
//  Crypto IRL — community events & courses
// ═══════════════════════════════════════════════════════

const CRYPTO_IRL_FILE = join(__dirname, "data", "crypto-irl.json");
let cryptoIrlCache = null;

function loadCryptoIrl() {
  if (cryptoIrlCache) return cryptoIrlCache;
  try {
    if (existsSync(CRYPTO_IRL_FILE)) {
      cryptoIrlCache = JSON.parse(readFileSync(CRYPTO_IRL_FILE, "utf-8"));
      return cryptoIrlCache;
    }
  } catch { /* ignore */ }
  return { events: [], courses: [] };
}

function saveCryptoIrl(data) {
  const dir = join(__dirname, "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CRYPTO_IRL_FILE, JSON.stringify(data, null, 2));
  cryptoIrlCache = data;
}

app.get("/api/crypto-irl", (req, res) => {
  try {
    const data = loadCryptoIrl();
    res.json({
      events: (data.events || []).filter(e => e.status === "approved"),
      courses: (data.courses || []).filter(c => c.status === "approved"),
    });
  } catch (e) {
    console.error("[crypto-irl GET]", e.message);
    res.status(500).json({ error: "Error loading crypto IRL data" });
  }
});

// Write lock to prevent TOCTOU race conditions on crypto-irl.json
let irlWriteLock = false;
const MAX_IRL_ENTRIES = 200;

app.post("/api/crypto-irl", (req, res) => {
  const { type, title, organizer, date, time, location, url, description, free } = req.body;

  if (!type || !title || !organizer) {
    return res.status(400).json({ error: "title, organizer y type son requeridos" });
  }
  if (!["event", "course"].includes(type)) {
    return res.status(400).json({ error: "type debe ser 'event' o 'course'" });
  }

  if (irlWriteLock) {
    return res.status(503).json({ error: "Servidor ocupado, intentá de nuevo" });
  }

  const sanitizeField = (s) => String(s || "").slice(0, 200).replace(/[<>"'`]/g, "");

  const item = {
    id: crypto.randomUUID(),
    type,
    title: sanitizeField(title),
    organizer: sanitizeField(organizer),
    date: sanitizeField(date),
    time: sanitizeField(time),
    location: sanitizeField(location),
    url: sanitizeUrl(url),
    description: sanitizeField(description).slice(0, 500),
    free: Boolean(free),
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  try {
    irlWriteLock = true;
    const data = loadCryptoIrl();
    const target = type === "event" ? data.events : data.courses;
    if (target.length >= MAX_IRL_ENTRIES) {
      return res.status(400).json({ error: "Límite de eventos alcanzado" });
    }
    target.push(item);
    saveCryptoIrl(data);
    res.status(201).json(item);
  } catch (e) {
    console.error("[crypto-irl POST]", e.message);
    res.status(500).json({ error: "Error al guardar" });
  } finally {
    irlWriteLock = false;
  }
});

// ═══════════════════════════════════════════════════════
//  Venue System — auth, profiles, event management
// ═══════════════════════════════════════════════════════

// Auth middleware — extracts user from Bearer token
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Token requerido" });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Token inválido" });

  req.user = user;
  next();
}

// Admin middleware — requires admin role
async function requireAdmin(req, res, next) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", req.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
}

// ── Venue Profile ──

app.get("/api/venue/me", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", req.user.id)
    .single();

  if (error) return res.status(404).json({ error: "Perfil no encontrado" });
  res.json(data);
});

app.put("/api/venue/me", requireAuth, async (req, res) => {
  const allowed = [
    "display_name", "slug", "description", "venue_type", "address",
    "barrio", "city", "capacity", "logo_url", "cover_url",
    "instagram", "website", "ra_url", "whatsapp"
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Venue Events ──

app.post("/api/venue/events", requireAuth, async (req, res) => {
  const { name, description, date, time_start, time_end, genre, artists, flyer_url, ticket_url, ticket_price, min_age, status } = req.body;

  if (!name || !date || !time_start || !genre) {
    return res.status(400).json({ error: "name, date, time_start y genre son requeridos" });
  }

  const eventStatus = status === "draft" ? "draft" : "pending";

  const { data, error } = await supabase
    .from("venue_events")
    .insert({
      venue_id: req.user.id,
      name: String(name).slice(0, 80),
      description: description ? String(description).slice(0, 1000) : null,
      date,
      time_start,
      time_end: time_end || null,
      genre,
      artists: artists || [],
      flyer_url: flyer_url || null,
      ticket_url: ticket_url || null,
      ticket_price: ticket_price || null,
      min_age: min_age || 18,
      status: eventStatus,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.get("/api/venue/events", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("venue_events")
    .select("*")
    .eq("venue_id", req.user.id)
    .order("date", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/venue/events/:id", requireAuth, async (req, res) => {
  // First check ownership and status
  const { data: existing } = await supabase
    .from("venue_events")
    .select("venue_id, status")
    .eq("id", req.params.id)
    .single();

  if (!existing || existing.venue_id !== req.user.id) {
    return res.status(404).json({ error: "Evento no encontrado" });
  }
  if (!["draft", "rejected"].includes(existing.status)) {
    return res.status(400).json({ error: "Solo se pueden editar eventos en borrador o rechazados" });
  }

  const allowed = [
    "name", "description", "date", "time_start", "time_end", "genre",
    "artists", "flyer_url", "ticket_url", "ticket_price", "min_age", "status"
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  // If resubmitting, set to pending
  if (updates.status === "pending") updates.status = "pending";
  // Don't allow setting to approved directly
  if (updates.status === "approved") delete updates.status;

  const { data, error } = await supabase
    .from("venue_events")
    .update(updates)
    .eq("id", req.params.id)
    .eq("venue_id", req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete("/api/venue/events/:id", requireAuth, async (req, res) => {
  const { error } = await supabase
    .from("venue_events")
    .delete()
    .eq("id", req.params.id)
    .eq("venue_id", req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── Venue Public Profile (must be after all /api/venue/* specific routes) ──
app.get("/api/venue/:slug", async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, slug, description, venue_type, address, barrio, city, capacity, logo_url, cover_url, instagram, website, ra_url, verified")
    .eq("slug", req.params.slug)
    .single();

  if (error) return res.status(404).json({ error: "Venue no encontrado" });
  res.json(data);
});

// ── Admin Moderation ──

app.get("/api/admin/events", requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || "pending";
  const { data, error } = await supabase
    .from("venue_events")
    .select("*, profiles(display_name, slug, logo_url, verified)")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/admin/events/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("venue_events")
    .update({ status: "approved", rejection_note: null })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Log action
  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "approve",
    target_type: "event",
    target_id: req.params.id,
  });

  // Invalidate events cache so approved event appears in feed
  cache.events.ts = 0;

  res.json(data);
});

app.put("/api/admin/events/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const note = req.body.note || "";

  const { data, error } = await supabase
    .from("venue_events")
    .update({ status: "rejected", rejection_note: note })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "reject",
    target_type: "event",
    target_id: req.params.id,
    note,
  });

  res.json(data);
});

app.put("/api/admin/events/:id/feature", requireAuth, requireAdmin, async (req, res) => {
  // Toggle featured
  const { data: current } = await supabase
    .from("venue_events")
    .select("featured")
    .eq("id", req.params.id)
    .single();

  const { data, error } = await supabase
    .from("venue_events")
    .update({ featured: !current?.featured })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "feature",
    target_type: "event",
    target_id: req.params.id,
  });

  cache.events.ts = 0;
  res.json(data);
});

app.get("/api/admin/venues", requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/admin/venues/:id/verify", requireAuth, requireAdmin, async (req, res) => {
  const { data: current } = await supabase
    .from("profiles")
    .select("verified")
    .eq("id", req.params.id)
    .single();

  const { data, error } = await supabase
    .from("profiles")
    .update({ verified: !current?.verified })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "verify_venue",
    target_type: "venue",
    target_id: req.params.id,
  });

  res.json(data);
});

// ═══════════════════════════════════════════════════════
//  Announcements — crypto project news in Layer feed
// ═══════════════════════════════════════════════════════

// ── Public: approved announcements ──

app.get("/api/announcements", async (req, res) => {
  const { data, error } = await supabase
    .from("announcements")
    .select("*, profiles(display_name, slug, logo_url, verified, crypto_type)")
    .eq("status", "approved")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Authenticated: own announcements ──

app.get("/api/project/announcements", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("profile_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/api/project/announcements", requireAuth, async (req, res) => {
  const { title, body, category, url, image_url, status } = req.body;

  if (!title || !category) {
    return res.status(400).json({ error: "title y category son requeridos" });
  }

  const announcementStatus = status === "draft" ? "draft" : "pending";

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      profile_id: req.user.id,
      title: String(title).slice(0, 120),
      body: body ? String(body).slice(0, 1000) : null,
      category,
      url: url || null,
      image_url: image_url || null,
      status: announcementStatus,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.put("/api/project/announcements/:id", requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from("announcements")
    .select("profile_id, status")
    .eq("id", req.params.id)
    .single();

  if (!existing || existing.profile_id !== req.user.id) {
    return res.status(404).json({ error: "Anuncio no encontrado" });
  }
  if (!["draft", "rejected"].includes(existing.status)) {
    return res.status(400).json({ error: "Solo se pueden editar borradores o rechazados" });
  }

  const allowed = ["title", "body", "category", "url", "image_url", "status"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.status === "approved") delete updates.status;

  const { data, error } = await supabase
    .from("announcements")
    .update(updates)
    .eq("id", req.params.id)
    .eq("profile_id", req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete("/api/project/announcements/:id", requireAuth, async (req, res) => {
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", req.params.id)
    .eq("profile_id", req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── Admin moderation for announcements ──

app.get("/api/admin/announcements", requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || "pending";
  const { data, error } = await supabase
    .from("announcements")
    .select("*, profiles(display_name, slug, logo_url, verified, crypto_type)")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/admin/announcements/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("announcements")
    .update({ status: "approved", rejection_note: null })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id, action: "approve", target_type: "announcement", target_id: req.params.id,
  });

  res.json(data);
});

app.put("/api/admin/announcements/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const note = req.body.note || "";
  const { data, error } = await supabase
    .from("announcements")
    .update({ status: "rejected", rejection_note: note })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id, action: "reject", target_type: "announcement", target_id: req.params.id, note,
  });

  res.json(data);
});

app.put("/api/admin/announcements/:id/pin", requireAuth, requireAdmin, async (req, res) => {
  const { data: current } = await supabase
    .from("announcements")
    .select("pinned")
    .eq("id", req.params.id)
    .single();

  const { data, error } = await supabase
    .from("announcements")
    .update({ pinned: !current?.pinned })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// OG image dinámica — generada con satori + resvg-js, cacheada 1-24h.
// Las rutas devuelven PNG 1200×630 branded por evento / festival / noticia.
app.get("/og/event/:slug.png", async (req, res) => {
  try {
    const ev = findEventBySlug(req.params.slug);
    if (!ev) return res.status(404).end();
    const png = await generateEventOG(ev);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.send(png);
  } catch (e) {
    console.error("[og/event] error:", e.message);
    res.status(500).end();
  }
});

app.get("/og/festival/:slug.png", async (req, res) => {
  try {
    const f = findFestivalBySlug(req.params.slug);
    if (!f) return res.status(404).end();
    const png = await generateFestivalOG(f);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
    res.send(png);
  } catch (e) {
    console.error("[og/festival] error:", e.message);
    res.status(500).end();
  }
});

app.get("/og/news/:slug.png", async (req, res) => {
  try {
    const n = findNewsBySlug(req.params.slug);
    if (!n) return res.status(404).end();
    const png = await generateNewsOG(n);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.send(png);
  } catch (e) {
    console.error("[og/news] error:", e.message);
    res.status(500).end();
  }
});

// SEO: sitemap dinámico — home + un URL por evento en el caché
app.get("/sitemap.xml", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const xmlEsc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const urls = [
    {
      loc: `${PROD_ORIGIN}/`,
      lastmod: today,
      changefreq: "daily",
      priority: "1.0",
      alternates: [
        { hreflang: "es-AR", href: `${PROD_ORIGIN}/` },
        { hreflang: "es", href: `${PROD_ORIGIN}/` },
        { hreflang: "en", href: `${PROD_ORIGIN}/?lang=en` },
        { hreflang: "x-default", href: `${PROD_ORIGIN}/` },
      ],
    },
  ];

  // Eventos
  const events = cached("events") || [];
  const seen = new Set();
  for (const ev of events) {
    const slug = eventSlug(ev);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    urls.push({
      loc: `${PROD_ORIGIN}/eventos/${slug}`,
      lastmod: today,
      changefreq: "weekly",
      priority: "0.8",
    });
  }

  // Hubs por género — solo los que tienen al menos 1 evento en caché.
  // Captura queries de cola larga de alto volumen ("techno buenos aires").
  const genreCounts = {};
  for (const ev of events) {
    const g = ev.genre;
    if (!g || g === "Electronic") continue; // Skip catch-all genérico
    genreCounts[g] = (genreCounts[g] || 0) + 1;
  }
  for (const genre of Object.keys(genreCounts)) {
    const slug = genreSlug(genre);
    if (!slug || !genreFromSlug(slug)) continue; // solo géneros reconocidos
    urls.push({
      loc: `${PROD_ORIGIN}/eventos/genero/${slug}`,
      lastmod: today,
      changefreq: "weekly",
      priority: "0.7",
    });
  }

  // Guías editoriales — máxima prioridad SEO (contenido original largo)
  const guias = loadGuias();
  for (const g of guias) {
    urls.push({
      loc: `${PROD_ORIGIN}/guias/${g.slug}`,
      lastmod: g.updatedAt || g.publishedAt || today,
      changefreq: "monthly",
      priority: "0.9",
    });
  }

  // Festivales — curados, evergreen, sólo los no pasados
  const festivals = loadFestivals();
  for (const f of festivals) {
    if (festivalStatus(f) === "past") continue;
    const slug = festivalSlug(f);
    if (!slug) continue;
    urls.push({
      loc: `${PROD_ORIGIN}/festivales/${slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const u of urls) {
    xml.push("  <url>");
    xml.push(`    <loc>${xmlEsc(u.loc)}</loc>`);
    xml.push(`    <lastmod>${u.lastmod}</lastmod>`);
    xml.push(`    <changefreq>${u.changefreq}</changefreq>`);
    xml.push(`    <priority>${u.priority}</priority>`);
    for (const alt of u.alternates || []) {
      xml.push(`    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${xmlEsc(alt.href)}"/>`);
    }
    xml.push("  </url>");
  }
  xml.push("</urlset>");

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml.join("\n"));
});

// API 404 — return JSON instead of falling through to SPA
app.all("/api/*", (req, res) => res.status(404).json({ error: "Endpoint not found" }));

if (IS_PROD) {
  const distIndex = join(__dirname, "dist", "index.html");
  if (!existsSync(distIndex)) {
    console.error("[FATAL] dist/index.html not found — run 'npm run build' before starting in production");
    process.exit(1);
  }
  const indexHtml = readFileSync(distIndex, "utf-8");

  // SEO: prerendered content visible y semántico dentro de #root.
  // React reemplaza el contenido al hidratar (createRoot.render() clears container),
  // así que es progressive enhancement honesto, no cloaking.
  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function buildSeoHtml() {
    const events = cached("events") || [];
    const news = cached("news") || [];

    if (events.length === 0 && news.length === 0) return "";

    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:1100px;margin:0 auto;padding:2.5rem 1.25rem";
    const h1Style = "font-size:1.85rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 0.75rem;color:#fff";
    const introStyle = "color:#a0a0a0;margin:0 0 2.5rem;max-width:62ch;line-height:1.55;font-size:1rem";
    const h2Style = "font-size:1.15rem;font-weight:500;color:#fff;margin:0 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid #222;letter-spacing:-0.01em";
    const ulStyle = "list-style:none;padding:0;margin:0";
    const liStyle = "padding:0.65rem 0;border-bottom:1px solid #141414;line-height:1.4;font-size:0.95rem";
    const linkStyle = "color:#7ec8ff;text-decoration:none";
    const metaStyle = "color:#888;font-size:0.88em";
    const sectionStyle = "margin-bottom:2.5rem";

    const lines = [`<main style="${wrapStyle}" aria-label="BassLayer">`, `<div style="${innerStyle}">`];

    lines.push(`<h1 style="${h1Style}">Eventos de música electrónica en Buenos Aires + Crypto LATAM</h1>`);
    lines.push(`<p style="${introStyle}">Agenda completa de fiestas, festivales y boliches de música electrónica en Buenos Aires — techno, house, drum &amp; bass, DJs locales e internacionales. Precios en vivo de Bitcoin, Ethereum y noticias crypto en español. Actualizado cada hora.</p>`);

    // Navegación semántica
    lines.push('<nav aria-label="Secciones" style="margin-bottom:2.5rem;display:flex;gap:1rem;flex-wrap:wrap">');
    lines.push(`<a href="/" style="${linkStyle};padding:0.4rem 0.85rem;border:1px solid #333;border-radius:999px">Eventos</a>`);
    lines.push(`<a href="/?view=layer" style="${linkStyle};padding:0.4rem 0.85rem;border:1px solid #333;border-radius:999px">Crypto</a>`);
    lines.push(`<a href="/?lang=en" style="${linkStyle};padding:0.4rem 0.85rem;border:1px solid #333;border-radius:999px">English</a>`);
    lines.push("</nav>");

    if (events.length > 0) {
      lines.push(`<section style="${sectionStyle}" aria-labelledby="seo-events">`);
      lines.push(`<h2 id="seo-events" style="${h2Style}">Próximos eventos electrónicos en Buenos Aires</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      for (const ev of events.slice(0, 25)) {
        const artists = (ev.artists || []).slice(0, 3).map(escHtml).join(", ");
        const nameMarkup = ev.url
          ? `<a href="${escHtml(ev.url)}" rel="noopener" style="${linkStyle};font-weight:500">${escHtml(ev.name)}</a>`
          : `<strong style="color:#fff">${escHtml(ev.name)}</strong>`;
        const venue = ev.venue ? ` · <span>${escHtml(ev.venue)}</span>` : "";
        const genre = ev.genre ? ` · <em style="color:#7ec8ff;font-style:normal">${escHtml(ev.genre)}</em>` : "";
        const performers = artists ? ` · <span style="${metaStyle}">${artists}</span>` : "";
        lines.push(`<li style="${liStyle}">${nameMarkup} <span style="${metaStyle}">${escHtml(ev.day)} ${escHtml(ev.month)}</span>${venue}${genre}${performers}</li>`);
      }
      lines.push("</ul></section>");
    }

    if (news.length > 0) {
      lines.push(`<section style="${sectionStyle}" aria-labelledby="seo-news">`);
      lines.push(`<h2 id="seo-news" style="${h2Style}">Últimas noticias crypto y música electrónica</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      for (const n of news.slice(0, 15)) {
        const titleMarkup = n.url
          ? `<a href="${escHtml(n.url)}" rel="noopener nofollow" style="color:#e5e5e5;text-decoration:none">${escHtml(n.title)}</a>`
          : `<span>${escHtml(n.title)}</span>`;
        const source = n.source ? ` <span style="${metaStyle}">(${escHtml(n.source)})</span>` : "";
        lines.push(`<li style="${liStyle}">${titleMarkup}${source}</li>`);
      }
      lines.push("</ul></section>");
    }

    lines.push('<p style="color:#666;font-size:0.85rem;margin-top:3rem">Cargando experiencia interactiva…</p>');
    lines.push("</div></main>");

    // JSON-LD: ItemList con MusicEvent por evento (rich results en Google Events)
    const eventSchemas = events.slice(0, 25).map(ev => {
      const m = MONTH_MAP[ev.month?.toLowerCase()] ?? 0;
      const year = new Date().getFullYear();
      const date = new Date(year, m, parseInt(ev.day));
      if (date < new Date() - 30 * 86400000) date.setFullYear(year + 1);
      const schema = {
        "@type": "MusicEvent",
        "name": ev.name,
        "startDate": date.toISOString().split("T")[0],
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "location": {
          "@type": "Place",
          "name": ev.venue || "Buenos Aires",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": ev.city || "Buenos Aires",
            "addressRegion": "CABA",
            "addressCountry": "AR"
          }
        },
        "performer": (ev.artists || []).slice(0, 5).map(a => ({ "@type": "PerformingGroup", "name": a })),
        "organizer": { "@type": "Organization", "name": ev.venue || "BassLayer" }
      };
      if (ev.image) schema.image = [ev.image];
      if (ev.url) {
        schema.url = ev.url;
        schema.offers = {
          "@type": "Offer",
          "url": ev.url,
          "availability": "https://schema.org/InStock",
          "category": "primary"
        };
      }
      return schema;
    });

    if (eventSchemas.length > 0) {
      const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Próximos eventos electrónicos en Buenos Aires",
        "numberOfItems": eventSchemas.length,
        "itemListElement": eventSchemas.map((schema, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": schema
        }))
      };
      const jsonLd = JSON.stringify(itemList).replace(/<\//g, "<\\/");
      lines.push(`<script type="application/ld+json">${jsonLd}</script>`);
    }

    // BreadcrumbList — mejora apariencia en SERP
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return lines.join("");
  }

  // Reemplazo selectivo de meta tags en el template del index.
  // Cuando una ruta tiene contenido propio (evento, noticia, etc), sobreescribimos
  // title/description/canonical/OG para que Google indexe la pieza correcta.
  function renderHtmlWithMeta(meta) {
    let html = indexHtml;
    if (meta.title) {
      const t = escHtml(meta.title);
      html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
      html = html.replace(/<meta property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${t}" />`);
      html = html.replace(/<meta name="twitter:title"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${t}" />`);
    }
    if (meta.description) {
      const d = escHtml(meta.description);
      html = html.replace(/<meta name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`);
      html = html.replace(/<meta property="og:description"\s+content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${d}" />`);
      html = html.replace(/<meta name="twitter:description"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${d}" />`);
    }
    if (meta.canonical) {
      const c = escHtml(meta.canonical);
      html = html.replace(/<link rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${c}" />`);
      html = html.replace(/<meta property="og:url"\s+content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${c}" />`);
    }
    if (meta.image) {
      const img = escHtml(meta.image);
      html = html.replace(/<meta property="og:image"\s+content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${img}" />`);
      html = html.replace(/<meta name="twitter:image"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${img}" />`);
    }
    if (meta.robots) {
      html = html.replace(/<meta name="robots"\s+content="[^"]*"\s*\/?>/, `<meta name="robots" content="${escHtml(meta.robots)}" />`);
    }
    if (meta.preloadImage) {
      // Preload del LCP image: arranca el download antes de que el parser HTML
      // llegue al <img>. Combinado con fetchpriority=high en el <img>, mejora
      // LCP significativamente en /eventos /festivales /noticias detail.
      html = html.replace("</head>", `  <link rel="preload" as="image" href="${escHtml(meta.preloadImage)}" fetchpriority="high" />\n</head>`);
    }
    if (meta.body) {
      html = html.replace('<div id="root"></div>', `<div id="root">${meta.body}</div>`);
    }
    if (meta.extraHead) {
      html = html.replace("</head>", `${meta.extraHead}\n</head>`);
    }
    return html;
  }

  // Construye el body SEO de una ficha de evento (lo que el crawler indexa,
  // y lo que el usuario ve durante el flash pre-hidratación).
  function buildEventPageBody(ev) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:780px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:1.9rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 1rem;color:#fff";
    const metaRow = "color:#a0a0a0;margin:0 0 1.5rem;font-size:0.95rem;line-height:1.6";
    const dlStyle = "display:grid;grid-template-columns:140px 1fr;gap:0.75rem 1rem;margin:1.5rem 0;font-size:0.95rem";
    const dtStyle = "color:#888";
    const ddStyle = "color:#e5e5e5;margin:0";
    const ctaStyle = "display:inline-block;margin-top:1.5rem;padding:0.75rem 1.5rem;background:#7ec8ff;color:#000;text-decoration:none;border-radius:6px;font-weight:600";

    const artists = (ev.artists || []).filter(a => a && a !== "TBA").slice(0, 8);
    const artistsLine = artists.map(escHtml).join(", ");

    const desc = [
      `${ev.name} se realiza el ${ev.day} de ${ev.month} en ${ev.venue || "Buenos Aires"}.`,
      ev.genre ? `Género: ${ev.genre}.` : "",
      artistsLine ? `Lineup: ${artistsLine}.` : "",
      "Más información, próximos eventos y agenda completa de música electrónica en Buenos Aires en BassLayer.",
    ].filter(Boolean).join(" ");

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(ev.name)}">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Eventos</a> <span>›</span> <span>${escHtml(ev.name)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<h1 style="${h1Style}">${escHtml(ev.name)}</h1>`);
    lines.push(`<p style="${metaRow}">${escHtml(ev.day)} ${escHtml(ev.month)}${ev.venue ? ` · ${escHtml(ev.venue)}` : ""}${ev.city ? `, ${escHtml(ev.city)}` : ""}</p>`);

    if (ev.image) {
      lines.push(`<img src="${escHtml(ev.image)}" alt="Flyer de ${escHtml(ev.name)}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;max-width:600px;height:auto;border-radius:8px;margin-bottom:1.5rem" />`);
    }

    lines.push(`<p style="color:#bcbcbc;line-height:1.6;margin:0 0 1.5rem">${escHtml(desc)}</p>`);

    lines.push(`<dl style="${dlStyle}">`);
    lines.push(`<dt style="${dtStyle}">Fecha</dt><dd style="${ddStyle}">${escHtml(ev.day)} de ${escHtml(ev.month)}</dd>`);
    if (ev.venue) lines.push(`<dt style="${dtStyle}">Venue</dt><dd style="${ddStyle}">${escHtml(ev.venue)}</dd>`);
    if (ev.city) lines.push(`<dt style="${dtStyle}">Ciudad</dt><dd style="${ddStyle}">${escHtml(ev.city)}</dd>`);
    if (ev.genre) lines.push(`<dt style="${dtStyle}">Género</dt><dd style="${ddStyle}">${escHtml(ev.genre)}</dd>`);
    if (artistsLine) lines.push(`<dt style="${dtStyle}">Artistas</dt><dd style="${ddStyle}">${artistsLine}</dd>`);
    lines.push(`</dl>`);

    if (ev.url) {
      lines.push(`<a href="${escHtml(ev.url)}" rel="noopener" style="${ctaStyle}">Ver entradas / más info</a>`);
    }

    lines.push(`</article>`);
    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${crumbLink}">← Volver a la agenda completa</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD MusicEvent enriquecido
    const m = MONTH_MAP[ev.month?.toLowerCase()] ?? 0;
    const year = new Date().getFullYear();
    const date = new Date(year, m, parseInt(ev.day));
    if (date < new Date() - 30 * 86400000) date.setFullYear(year + 1);

    const eventSchema = {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      "name": ev.name,
      "description": desc,
      "startDate": date.toISOString().split("T")[0],
      "eventStatus": "https://schema.org/EventScheduled",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "location": {
        "@type": "Place",
        "name": ev.venue || "Buenos Aires",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": ev.city || "Buenos Aires",
          "addressRegion": "CABA",
          "addressCountry": "AR"
        }
      },
      "performer": artists.map(a => ({ "@type": "PerformingGroup", "name": a })),
      "organizer": { "@type": "Organization", "name": ev.venue || "BassLayer" },
      "url": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}`
    };
    if (ev.image) eventSchema.image = [ev.image];
    if (ev.url) {
      eventSchema.offers = {
        "@type": "Offer",
        "url": ev.url,
        "availability": "https://schema.org/InStock",
        "category": "primary"
      };
    }
    lines.push(`<script type="application/ld+json">${JSON.stringify(eventSchema).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Eventos", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": ev.name, "item": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc };
  }

  function renderEventPage(ev) {
    const { html: body, desc } = buildEventPageBody(ev);
    const slug = eventSlug(ev);
    const title = `${ev.name} — ${ev.day} ${ev.month}${ev.venue ? ` en ${ev.venue}` : ""} | BassLayer`;
    return renderHtmlWithMeta({
      title,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/eventos/${slug}`,
      // OG dinámica branded por evento (vs flyer crudo que puede no tener
      // contexto del sitio). El preload sí usa el flyer porque es el LCP
      // del usuario que aterriza, no del crawler social.
      image: `${PROD_ORIGIN}/og/event/${slug}.png`,
      preloadImage: ev.image || null,
      body,
    });
  }

  // Página de noticia: la canonical apunta a la fuente original (somos un
  // agregador, no creamos el contenido). Esto le dice a Google "esta es una
  // copia, indexá la fuente". Lo nuestro suma valor en share previews + UX
  // sin pelearle ranking al medio original.
  function buildNewsPageBody(n) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:720px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:1.85rem;font-weight:600;letter-spacing:-0.02em;line-height:1.25;margin:0 0 1rem;color:#fff";
    const metaRow = "color:#a0a0a0;margin:0 0 1.5rem;font-size:0.9rem;display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap";
    const sourcePill = "display:inline-block;padding:0.2rem 0.6rem;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:999px;color:#bcbcbc;font-size:0.8rem";
    const tagPill = "display:inline-block;padding:0.2rem 0.6rem;background:#7ec8ff;color:#000;border-radius:999px;font-size:0.78rem;font-weight:600";
    const ctaStyle = "display:inline-block;margin-top:1.5rem;padding:0.85rem 1.5rem;background:#7ec8ff;color:#000;text-decoration:none;border-radius:6px;font-weight:600";
    const noteStyle = "color:#666;font-size:0.85rem;margin-top:2.5rem;line-height:1.5;border-top:1px solid #1a1a1a;padding-top:1.5rem";

    const desc = String(n.description || "").slice(0, 500);
    const sourceName = n.source || "fuente original";

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(n.title)}">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Noticias</a> <span>›</span> <span>${escHtml(sourceName)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<p style="${metaRow}">`);
    lines.push(`<span style="${sourcePill}">${escHtml(sourceName)}</span>`);
    if (n.tag) lines.push(`<span style="${tagPill}">${escHtml(n.tag)}</span>`);
    if (n.time) lines.push(`<span>${escHtml(n.time)}</span>`);
    lines.push(`</p>`);

    lines.push(`<h1 style="${h1Style}">${escHtml(n.title)}</h1>`);

    if (n.image) {
      lines.push(`<img src="${escHtml(n.image)}" alt="${escHtml(n.title)}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;max-width:600px;height:auto;border-radius:8px;margin-bottom:1.5rem" />`);
    }

    if (desc) {
      lines.push(`<p style="color:#d0d0d0;line-height:1.65;margin:0 0 1.5rem;font-size:1.05rem">${escHtml(desc)}</p>`);
    }

    if (n.url) {
      lines.push(`<a href="${escHtml(n.url)}" rel="noopener" target="_blank" style="${ctaStyle}">Leer artículo completo en ${escHtml(sourceName)} →</a>`);
    }

    lines.push(`<p style="${noteStyle}">Esta es una vista resumen curada por BassLayer. El artículo completo y la atribución pertenecen a <strong>${escHtml(sourceName)}</strong>. Para más noticias y eventos, volvé a <a href="/" style="${crumbLink}">BassLayer</a>.</p>`);
    lines.push(`</article>`);
    lines.push(`</div></main>`);

    // JSON-LD NewsArticle — publisher = fuente original, mainEntityOfPage = source.
    // Esto comunica a Google que somos una vista derivada, no la fuente.
    const newsSchema = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": String(n.title || "").slice(0, 110),
      "description": desc,
      "url": n.url || `${PROD_ORIGIN}/noticias/${newsSlug(n)}`,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": n.url || `${PROD_ORIGIN}/noticias/${newsSlug(n)}`
      },
      "publisher": {
        "@type": "Organization",
        "name": sourceName
      },
      "isAccessibleForFree": true,
      "inLanguage": n.region === "Intl" ? "en" : "es"
    };
    if (n.image) newsSchema.image = [n.image];
    if (n.tag) newsSchema.keywords = n.tag;
    lines.push(`<script type="application/ld+json">${JSON.stringify(newsSchema).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Noticias", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": n.title, "item": `${PROD_ORIGIN}/noticias/${newsSlug(n)}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc };
  }

  // Página de festival: curado por nosotros → SÍ es indexable (no hay riesgo
  // de duplicate content). Schema MusicFestival (subtipo de MusicEvent reconocido
  // por Google Events) con startDate/endDate, location multi-país, tags, etc.
  function formatLongDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }
  function dateRange(start, end) {
    if (!start) return "fecha por confirmar";
    if (!end || end === start) return formatLongDate(start);
    const s = new Date(start), e = new Date(end);
    if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
      const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
      return `${s.getUTCDate()} – ${e.getUTCDate()} de ${months[s.getUTCMonth()]} de ${s.getUTCFullYear()}`;
    }
    return `${formatLongDate(start)} – ${formatLongDate(end)}`;
  }

  function buildFestivalPageBody(f) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:760px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:2rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 0.5rem;color:#fff";
    const subtitleStyle = "color:#a0a0a0;margin:0 0 1.5rem;font-size:1rem";
    const dlStyle = "display:grid;grid-template-columns:140px 1fr;gap:0.75rem 1rem;margin:1.5rem 0;font-size:0.95rem";
    const dtStyle = "color:#888";
    const ddStyle = "color:#e5e5e5;margin:0";
    const tagStyle = "display:inline-block;padding:0.25rem 0.7rem;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:999px;color:#bcbcbc;font-size:0.8rem;margin:0 0.4rem 0.4rem 0";
    const ctaStyle = "display:inline-block;margin-top:1.5rem;padding:0.85rem 1.5rem;background:#7ec8ff;color:#000;text-decoration:none;border-radius:6px;font-weight:600";
    const statusBadge = "display:inline-block;padding:0.25rem 0.7rem;border-radius:999px;font-size:0.8rem;font-weight:600;margin-left:0.5rem";

    const status = festivalStatus(f);
    const statusLabel = { live: "EN VIVO", upcoming: "PRÓXIMO", tba: "POR CONFIRMAR", past: "FINALIZADO" }[status] || "";
    const statusColor = { live: "background:#ff4444;color:#fff", upcoming: "background:#7ec8ff;color:#000", tba: "background:#444;color:#fff", past: "background:#333;color:#888" }[status] || "background:#333;color:#888";

    const range = dateRange(f.dates_start, f.dates_end);
    const location = [f.city, f.country].filter(Boolean).join(", ");
    const tags = Array.isArray(f.tags) ? f.tags : [];

    const desc = [
      f.description || `${f.name} en ${location}, ${range}.`,
      tags.length ? `Géneros: ${tags.join(", ")}.` : "",
      "Más festivales y agenda completa de música electrónica en BassLayer.",
    ].filter(Boolean).join(" ");

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(f.name)}">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Festivales</a> <span>›</span> <span>${escHtml(f.name)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<h1 style="${h1Style}">${escHtml(f.name)}${statusLabel ? `<span style="${statusBadge};${statusColor}">${statusLabel}</span>` : ""}</h1>`);
    lines.push(`<p style="${subtitleStyle}">${escHtml(range)}${location ? ` · ${escHtml(location)}` : ""}</p>`);

    if (f.image) {
      lines.push(`<img src="${escHtml(f.image)}" alt="Logo ${escHtml(f.name)}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;max-width:480px;height:auto;border-radius:8px;margin-bottom:1.5rem;background:#0a0a0a;padding:1rem" />`);
    }

    if (f.description) {
      lines.push(`<p style="color:#d0d0d0;line-height:1.65;margin:0 0 1.5rem;font-size:1.05rem">${escHtml(f.description)}</p>`);
    }

    lines.push(`<dl style="${dlStyle}">`);
    if (f.dates_start) lines.push(`<dt style="${dtStyle}">Fechas</dt><dd style="${ddStyle}">${escHtml(range)}</dd>`);
    if (f.city) lines.push(`<dt style="${dtStyle}">Ciudad</dt><dd style="${ddStyle}">${escHtml(f.city)}</dd>`);
    if (f.country) lines.push(`<dt style="${dtStyle}">País</dt><dd style="${ddStyle}">${escHtml(f.country)}</dd>`);
    if (f.region) lines.push(`<dt style="${dtStyle}">Región</dt><dd style="${ddStyle}">${escHtml(f.region)}</dd>`);
    if (tags.length) {
      lines.push(`<dt style="${dtStyle}">Géneros</dt><dd style="${ddStyle}">${tags.map(t => `<span style="${tagStyle}">${escHtml(t)}</span>`).join("")}</dd>`);
    }
    lines.push(`</dl>`);

    if (f.url) {
      lines.push(`<a href="${escHtml(f.url)}" rel="noopener" target="_blank" style="${ctaStyle}">Sitio oficial / entradas →</a>`);
    }

    lines.push(`</article>`);
    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${crumbLink}">← Ver todos los festivales y agenda completa</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD MusicFestival — Google Events lo entiende y lo muestra en rich
    // results con un panel especial de festivales.
    const eventStatusMap = {
      live: "https://schema.org/EventScheduled",
      upcoming: "https://schema.org/EventScheduled",
      tba: "https://schema.org/EventScheduled",
      past: "https://schema.org/EventScheduled",
    };
    const festivalSchema = {
      "@context": "https://schema.org",
      "@type": "MusicFestival",
      "name": f.name,
      "description": f.description || desc,
      "url": `${PROD_ORIGIN}/festivales/${festivalSlug(f)}`,
      "startDate": f.dates_start || undefined,
      "endDate": f.dates_end || f.dates_start || undefined,
      "eventStatus": eventStatusMap[status],
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "location": {
        "@type": "Place",
        "name": location || f.name,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": f.city || undefined,
          "addressCountry": f.country || undefined
        }
      },
      "organizer": { "@type": "Organization", "name": f.name, "url": f.url || undefined },
      "isAccessibleForFree": false
    };
    if (f.image) festivalSchema.image = [f.image];
    if (tags.length) festivalSchema.keywords = tags.join(", ");
    if (f.url) {
      festivalSchema.offers = {
        "@type": "Offer",
        "url": f.url,
        "availability": status === "past" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        "category": "primary"
      };
    }
    // Limpiar undefined (JSON.stringify ya los omite, pero por prolijidad)
    lines.push(`<script type="application/ld+json">${JSON.stringify(festivalSchema).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Festivales", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": f.name, "item": `${PROD_ORIGIN}/festivales/${festivalSlug(f)}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc };
  }

  // Hub por género: ataca queries de cola larga de alto volumen
  // ("techno buenos aires", "house buenos aires"). Cada hub es indexable y
  // tiene texto evergreen + lista actualizable de eventos del género.
  function buildGenrePageBody(genre, events) {
    const slug = genreSlug(genre);
    const blurb = GENRE_BLURBS[genre] || `${genre} en Buenos Aires y Argentina: agenda de eventos, fiestas y festivales del género.`;
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:880px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:2rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 0.75rem;color:#fff";
    const introStyle = "color:#bcbcbc;line-height:1.65;margin:0 0 2.5rem;font-size:1rem;max-width:65ch";
    const h2Style = "font-size:1.2rem;font-weight:500;color:#fff;margin:2rem 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid #222;letter-spacing:-0.01em";
    const ulStyle = "list-style:none;padding:0;margin:0";
    const liStyle = "padding:0.7rem 0;border-bottom:1px solid #141414;line-height:1.5;font-size:0.95rem";
    const linkStyle = "color:#7ec8ff;text-decoration:none";
    const metaStyle = "color:#888;font-size:0.88em";
    const tagRow = "display:flex;flex-wrap:wrap;gap:0.4rem;margin:1.5rem 0 2rem";
    const tagPill = "padding:0.35rem 0.8rem;border-radius:999px;font-size:0.8rem;text-decoration:none";

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(genre)} en Buenos Aires">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Eventos</a> <span>›</span> <a href="/" style="${crumbLink}">Géneros</a> <span>›</span> <span>${escHtml(genre)}</span></nav>`);

    lines.push(`<h1 style="${h1Style}">${escHtml(genre)} en Buenos Aires — Próximos eventos</h1>`);
    lines.push(`<p style="${introStyle}">${escHtml(blurb)}</p>`);

    // Nav cruzado a otros géneros (internal linking = autoridad temática para Google)
    lines.push(`<nav aria-label="Otros géneros" style="${tagRow}">`);
    for (const g of GENRE_LIST) {
      if (g === genre || g === "Electronic") continue;
      const isActive = false;
      lines.push(`<a href="/eventos/genero/${escHtml(genreSlug(g))}" style="${tagPill};${isActive ? "background:#7ec8ff;color:#000" : "background:#1a1a1a;color:#bcbcbc;border:1px solid #2a2a2a"}">${escHtml(g)}</a>`);
    }
    lines.push(`</nav>`);

    if (events.length > 0) {
      lines.push(`<section aria-labelledby="seo-genre-events">`);
      lines.push(`<h2 id="seo-genre-events" style="${h2Style}">Eventos de ${escHtml(genre)} próximos</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      for (const ev of events.slice(0, 30)) {
        const evSlug = eventSlug(ev);
        const artists = (ev.artists || []).slice(0, 3).map(escHtml).join(", ");
        const name = `<a href="/eventos/${escHtml(evSlug)}" style="${linkStyle};font-weight:500">${escHtml(ev.name)}</a>`;
        const venue = ev.venue ? ` · ${escHtml(ev.venue)}` : "";
        const performers = artists ? ` · <span style="${metaStyle}">${artists}</span>` : "";
        lines.push(`<li style="${liStyle}">${name} <span style="${metaStyle}">${escHtml(ev.day)} ${escHtml(ev.month)}</span>${venue}${performers}</li>`);
      }
      lines.push(`</ul></section>`);
    } else {
      lines.push(`<p style="color:#888;line-height:1.5;margin:2rem 0;padding:1rem;background:#0a0a0a;border-radius:8px">No hay eventos de ${escHtml(genre)} programados en este momento. Volvé a chequear pronto — actualizamos la agenda todos los días.</p>`);
    }

    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${linkStyle}">← Ver toda la agenda y otros géneros</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD ItemList de eventos del género
    if (events.length > 0) {
      const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": `Eventos de ${genre} en Buenos Aires`,
        "numberOfItems": Math.min(events.length, 30),
        "itemListElement": events.slice(0, 30).map((ev, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "url": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}`,
          "name": ev.name
        }))
      };
      lines.push(`<script type="application/ld+json">${JSON.stringify(itemList).replace(/<\//g, "<\\/")}</script>`);
    }

    // CollectionPage describe el hub mismo (no la lista)
    const collection = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": `${genre} en Buenos Aires`,
      "description": blurb,
      "url": `${PROD_ORIGIN}/eventos/genero/${slug}`,
      "inLanguage": "es-AR",
      "isPartOf": { "@type": "WebSite", "@id": `${PROD_ORIGIN}/#website` },
      "about": { "@type": "Thing", "name": `${genre} music` }
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(collection).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Eventos", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": genre, "item": `${PROD_ORIGIN}/eventos/genero/${slug}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc: blurb };
  }

  // Guía long-form — Markdown body con full SEO meta + Article JSON-LD + FAQ
  function buildGuiaPageBody(g) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:720px;margin:0 auto;padding:2.5rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:2.1rem;font-weight:600;letter-spacing:-0.025em;line-height:1.15;margin:0 0 1rem;color:#fff";
    const metaRow = "color:#888;font-size:0.85rem;margin:0 0 2rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center";
    const tldrBox = "background:#0f0f0f;border-left:3px solid #7ec8ff;padding:1.25rem 1.5rem;margin:1.5rem 0 2.5rem;border-radius:0 6px 6px 0;color:#d0d0d0;line-height:1.6;font-size:1rem";
    // Estilos para los nodos generados por marked (h2/h3/p/ul/li/a/strong/em)
    const proseCss = `
      .prose { line-height:1.7; font-size:1.05rem; color:#d5d5d5; }
      .prose h2 { font-size:1.55rem; font-weight:600; letter-spacing:-0.015em; margin:2.5rem 0 1rem; color:#fff; padding-bottom:0.4rem; border-bottom:1px solid #1f1f1f; }
      .prose h3 { font-size:1.2rem; font-weight:600; margin:2rem 0 0.75rem; color:#fff; }
      .prose p { margin:0 0 1.1rem; }
      .prose ul, .prose ol { margin:0 0 1.25rem 1.5rem; padding:0; }
      .prose li { margin:0.35rem 0; }
      .prose a { color:#7ec8ff; text-decoration:none; border-bottom:1px solid rgba(126,200,255,0.3); }
      .prose a:hover { border-bottom-color:#7ec8ff; }
      .prose strong { color:#fff; font-weight:700; }
      .prose em { font-style:italic; color:#bcbcbc; }
      .prose hr { border:0; border-top:1px solid #1f1f1f; margin:2.5rem 0; }
      .prose blockquote { border-left:3px solid #2a2a2a; padding:0.5rem 1rem; margin:1.25rem 0; color:#a0a0a0; font-style:italic; }
      .prose code { background:#1a1a1a; padding:0.15rem 0.4rem; border-radius:3px; font-size:0.92em; color:#e6c896; }
    `;

    const lines = [
      `<style>${proseCss}</style>`,
      `<main style="${wrapStyle}" aria-label="${escHtml(g.title)}">`,
      `<div style="${innerStyle}">`,
    ];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Guías</a> <span>›</span> <span>${escHtml(g.title)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<h1 style="${h1Style}">${escHtml(g.title)}</h1>`);
    lines.push(`<p style="${metaRow}">`);
    lines.push(`<span>Por ${escHtml(g.author)}</span>`);
    if (g.publishedAt) lines.push(`<span>·</span><time datetime="${escHtml(g.publishedAt)}">Publicado ${escHtml(g.publishedAt)}</time>`);
    if (g.updatedAt && g.updatedAt !== g.publishedAt) {
      lines.push(`<span>·</span><span>Actualizado ${escHtml(g.updatedAt)}</span>`);
    }
    lines.push(`</p>`);

    if (g.tldr) {
      lines.push(`<aside style="${tldrBox}"><strong style="color:#7ec8ff;text-transform:uppercase;letter-spacing:0.08em;font-size:0.78rem;display:block;margin-bottom:0.5rem">TL;DR</strong>${escHtml(g.tldr)}</aside>`);
    }

    // marked.parse genera HTML seguro — los .md están en el repo (no input usuario)
    lines.push(`<div class="prose">${g.bodyHtml}</div>`);

    lines.push(`</article>`);
    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${crumbLink}">← Volver a BassLayer</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD Article — elegible para Top Stories y rich results
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": g.title,
      "description": g.description,
      "url": `${PROD_ORIGIN}/guias/${g.slug}`,
      "image": [`${PROD_ORIGIN}/og-image.png`],
      "datePublished": g.publishedAt,
      "dateModified": g.updatedAt || g.publishedAt,
      "author": { "@type": "Organization", "name": g.author, "url": PROD_ORIGIN },
      "publisher": {
        "@type": "Organization",
        "name": "BassLayer",
        "logo": { "@type": "ImageObject", "url": `${PROD_ORIGIN}/icon-512.png`, "width": 512, "height": 512 }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": `${PROD_ORIGIN}/guias/${g.slug}` },
      "inLanguage": "es-AR",
      "keywords": Array.isArray(g.keywords) ? g.keywords.join(", ") : "",
      "articleSection": g.category
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(articleSchema).replace(/<\//g, "<\\/")}</script>`);

    // FAQPage JSON-LD — rich result que ocupa mucho espacio en SERP
    if (Array.isArray(g.faqs) && g.faqs.length > 0) {
      const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": g.faqs.map(f => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      };
      lines.push(`<script type="application/ld+json">${JSON.stringify(faqSchema).replace(/<\//g, "<\\/")}</script>`);
    }

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Guías", "item": `${PROD_ORIGIN}/guias` },
        { "@type": "ListItem", "position": 3, "name": g.title, "item": `${PROD_ORIGIN}/guias/${g.slug}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc: g.description || g.tldr || g.title };
  }

  function renderGuiaPage(g) {
    const { html: body, desc } = buildGuiaPageBody(g);
    return renderHtmlWithMeta({
      title: `${g.title} | BassLayer`,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/guias/${g.slug}`,
      image: `${PROD_ORIGIN}/og-image.png`,
      body,
    });
  }

  function renderGenrePage(genre) {
    const allEvents = cached("events") || [];
    const events = allEvents.filter(e => (e.genre || "").toLowerCase() === genre.toLowerCase());
    const { html: body, desc } = buildGenrePageBody(genre, events);
    const count = events.length;
    const titleSuffix = count > 0 ? `${count} eventos próximos` : "Agenda";
    return renderHtmlWithMeta({
      title: `${genre} en Buenos Aires — ${titleSuffix} | BassLayer`,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/eventos/genero/${genreSlug(genre)}`,
      image: `${PROD_ORIGIN}/og-image.png`,
      body,
    });
  }

  function renderFestivalPage(f) {
    const { html: body, desc } = buildFestivalPageBody(f);
    const range = dateRange(f.dates_start, f.dates_end);
    const slug = festivalSlug(f);
    const title = `${f.name} ${f.dates_start ? `(${range})` : ""} | BassLayer`.trim().replace(/\s+/g, " ");
    return renderHtmlWithMeta({
      title,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/festivales/${slug}`,
      image: `${PROD_ORIGIN}/og/festival/${slug}.png`,
      preloadImage: f.image || null,
      body,
    });
  }

  function renderNewsPage(n) {
    const { html: body, desc } = buildNewsPageBody(n);
    const sourceName = n.source || "BassLayer";
    const slug = newsSlug(n);
    const title = `${n.title} — ${sourceName} | BassLayer`;
    // Canonical apunta a la fuente original cuando existe — somos derivados.
    const canonical = n.url || `${PROD_ORIGIN}/noticias/${slug}`;
    return renderHtmlWithMeta({
      title,
      description: (desc || `Resumen de ${n.title}, publicado por ${sourceName}.`).slice(0, 300),
      canonical,
      // OG dinámica branded para mejorar share previews en WhatsApp/redes.
      // Aunque la página es noindex, el OG sí afecta el preview cuando
      // alguien comparte el link de BassLayer (no el de la fuente).
      image: `${PROD_ORIGIN}/og/news/${slug}.png`,
      preloadImage: n.image || null,
      body,
      robots: "noindex, follow, max-image-preview:large",
    });
  }

  app.get("*", (req, res) => {
    // /eventos/genero/[slug] — hub por género (high-volume keywords)
    const genreMatch = req.path.match(/^\/eventos\/genero\/([^/]+)\/?$/);
    if (genreMatch) {
      const slug = decodeURIComponent(genreMatch[1]);
      const genre = genreFromSlug(slug);
      if (genre) {
        res.set("Content-Type", "text/html");
        return res.send(renderGenrePage(genre));
      }
      const seoBlock = buildSeoHtml();
      const html = seoBlock
        ? indexHtml.replace('<div id="root"></div>', `<div id="root">${seoBlock}</div>`)
        : indexHtml;
      return res.status(404).set("Content-Type", "text/html").send(html);
    }

    // /eventos/[slug] — ficha individual indexable
    const eventMatch = req.path.match(/^\/eventos\/([^/]+)\/?$/);
    if (eventMatch) {
      const slug = decodeURIComponent(eventMatch[1]);
      const ev = findEventBySlug(slug);
      if (ev) {
        res.set("Content-Type", "text/html");
        return res.send(renderEventPage(ev));
      }
      const seoBlock = buildSeoHtml();
      const html = seoBlock
        ? indexHtml.replace('<div id="root"></div>', `<div id="root">${seoBlock}</div>`)
        : indexHtml;
      return res.status(404).set("Content-Type", "text/html").send(html);
    }

    // /noticias/[slug] — ficha de noticia (noindex, canonical a la fuente)
    const newsMatch = req.path.match(/^\/noticias\/([^/]+)\/?$/);
    if (newsMatch) {
      const slug = decodeURIComponent(newsMatch[1]);
      const n = findNewsBySlug(slug);
      if (n) {
        res.set("Content-Type", "text/html");
        return res.send(renderNewsPage(n));
      }
      const seoBlock = buildSeoHtml();
      const html = seoBlock
        ? indexHtml.replace('<div id="root"></div>', `<div id="root">${seoBlock}</div>`)
        : indexHtml;
      return res.status(404).set("Content-Type", "text/html").send(html);
    }

    // /guias/[slug] — guía editorial long-form (SÍ indexable, Article JSON-LD)
    const guiaMatch = req.path.match(/^\/guias\/([^/]+)\/?$/);
    if (guiaMatch) {
      const slug = decodeURIComponent(guiaMatch[1]);
      const g = findGuiaBySlug(slug);
      if (g) {
        res.set("Content-Type", "text/html");
        return res.send(renderGuiaPage(g));
      }
      const seoBlock = buildSeoHtml();
      const html = seoBlock
        ? indexHtml.replace('<div id="root"></div>', `<div id="root">${seoBlock}</div>`)
        : indexHtml;
      return res.status(404).set("Content-Type", "text/html").send(html);
    }

    // /festivales/[slug] — ficha de festival curado (SÍ indexable)
    const festivalMatch = req.path.match(/^\/festivales\/([^/]+)\/?$/);
    if (festivalMatch) {
      const slug = decodeURIComponent(festivalMatch[1]);
      const f = findFestivalBySlug(slug);
      if (f) {
        res.set("Content-Type", "text/html");
        return res.send(renderFestivalPage(f));
      }
      const seoBlock = buildSeoHtml();
      const html = seoBlock
        ? indexHtml.replace('<div id="root"></div>', `<div id="root">${seoBlock}</div>`)
        : indexHtml;
      return res.status(404).set("Content-Type", "text/html").send(html);
    }

    // Home + cualquier otra ruta SPA
    const seoBlock = buildSeoHtml();
    const html = seoBlock
      ? indexHtml.replace('<div id="root"></div>', `<div id="root">${seoBlock}</div>`)
      : indexHtml;
    res.set("Content-Type", "text/html");
    res.send(html);
  });
}

const server = app.listen(PORT, () => console.log(`
  ┌──────────────────────────────────────────┐
  │  BassLayer API v1.6                      │
  │  http://localhost:${PORT}                  │
  │                                          │
  │  Layer ─────────────────────             │
  │   /api/prices              30s           │
  │   /api/news                5min          │
  │   /api/dashboard           5min          │
  │   /api/prediction-markets  5min          │
  │   /api/crypto-events       1h            │
  │   /api/crypto-irl          static        │
  │                                          │
  │  Bass ──────────────────────             │
  │   /api/events              1h            │
  │   /api/bass-news           30min         │
  │   /api/festivals           1h            │
  │                                          │
  │  Sources:                                │
  │   Events: Buenos Aliens (BA area 395)    │
  │           + RA GraphQL + fallback        │
  │   News:   BA Notas + Mixmag Latam +      │
  │           DJ Mag + Crack + Bandcamp +    │
  │           Attack + 5 Mag + Tsugi + Groove│
  │   Festivals: 30 curados, og:image auto   │
  │   Crypto: 16 RSS feeds (EN+ES)           │
  │   Prices: CoinGecko                      │
  └──────────────────────────────────────────┘
`));

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  clearInterval(rateLimitSweep);
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

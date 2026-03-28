// ═══════════════════════════════════════════════════════
//  BassLayer API — v1.3
//  Bass: BA electronic events (Buenos Aliens + RA + fallback)
//  Layer: Crypto news (6 RSS feeds) + prices (CoinGecko)
// ═══════════════════════════════════════════════════════

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
}));
if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(__dirname, "dist")));
}

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

const cache = {
  prices:    { data: null, ts: 0, ttl: 30_000 },
  news:      { data: null, ts: 0, ttl: 5 * 60_000 },
  events:    { data: null, ts: 0, ttl: 60 * 60_000 },
  musicNews: { data: null, ts: 0, ttl: 10 * 60_000 },
  dashboard: { data: null, ts: 0, ttl: 5 * 60_000 },   // 5min — crypto dashboard
};

function cached(key) {
  const c = cache[key];
  return c.data && (Date.now() - c.ts < c.ttl) ? c.data : null;
}
function setCache(key, data) {
  cache[key] = { ...cache[key], data, ts: Date.now() };
}

async function fetchSafe(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
};

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTH_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

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

const COIN_IDS = "bitcoin,ethereum,solana,arbitrum,chainlink,aave,uniswap,optimism";
const SYM_MAP = {
  bitcoin:"BTC", ethereum:"ETH", solana:"SOL", arbitrum:"ARB",
  chainlink:"LINK", aave:"AAVE", uniswap:"UNI", optimism:"OP",
};

app.get("/api/prices", async (req, res) => {
  const hit = cached("prices");
  if (hit) return res.json(hit);
  try {
    const r = await fetchSafe(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COIN_IDS}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const raw = await r.json();
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
  { url: "https://www.theblock.co/rss.xml", source: "The Block" },
  { url: "https://blockworks.co/feed", source: "Blockworks" },
  { url: "https://bitcoinmagazine.com/feed", source: "Bitcoin Mag" },
  { url: "https://unchainedcrypto.com/feed/", source: "Unchained" },
  { url: "https://cryptoslate.com/feed/", source: "CryptoSlate" },
  { url: "https://cryptobriefing.com/feed/", source: "CryptoBriefing" },
  { url: "https://u.today/rss", source: "U.Today" },
  { url: "https://dailyhodl.com/feed/", source: "Daily Hodl" },
  // Español / Latam
  { url: "https://es.cointelegraph.com/rss", source: "CT Español" },
  { url: "https://www.criptonoticias.com/feed/", source: "CriptoNoticias" },
  { url: "https://diariobitcoin.com/feed/", source: "DiarioBitcoin" },
  { url: "https://criptotendencia.com/feed/", source: "CriptoTendencia" },
];

const xmlParser = new XMLParser({ ignoreAttributes: false });

function detectTag(title) {
  const t = title.toLowerCase();
  if (t.includes("bitcoin") || /\bbtc\b/.test(t))  return "BTC";
  if (t.includes("ethereum") || /\beth\b/.test(t) || t.includes("vitalik")) return "ETH";
  if (t.includes("solana") || /\bsol\b/.test(t))    return "SOL";
  if (t.includes("xrp") || t.includes("ripple"))     return "XRP";
  if (t.includes("cardano") || /\bada\b/.test(t))    return "ADA";
  if (t.includes("defi") || t.includes("aave") || t.includes("uniswap") || t.includes("lending") || t.includes("yield")) return "DeFi";
  if (t.includes("nft") || t.includes("opensea") || t.includes("collectible")) return "NFT";
  if (t.includes("regulat") || t.includes("sec ") || t.includes("gensler") || t.includes("congress") || t.includes("legislation") || t.includes("lawsuit")) return "Reg";
  if (t.includes("layer") || /\bl2\b/.test(t) || t.includes("rollup") || t.includes("arbitrum") || t.includes("optimism") || t.includes("zksync")) return "L2";
  if (/\bai\b/.test(t) || t.includes("artificial") || t.includes("machine learn") || t.includes("openai")) return "AI";
  if (t.includes("stablecoin") || t.includes("usdt") || t.includes("usdc") || t.includes("tether")) return "Stable";
  if (t.includes("mining") || t.includes("halving") || t.includes("hashrate")) return "Mining";
  return "Crypto";
}

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
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

async function fetchRSSFeed(feed) {
  try {
    const r = await fetchSafe(feed.url, { headers: { "User-Agent": "BassLayer/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    const parsed = xmlParser.parse(xml);
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    if (!Array.isArray(items)) items = [items];
    return items.slice(0, 10).map((item) => {
      const title = item.title?.["#text"] || item.title || "";
      const rawLink = item.link?.["@_href"] || item.link || "";
      const link = typeof rawLink === "object" ? (rawLink["@_href"] || "") : String(rawLink);
      const date = item.pubDate || item.published || item.updated || "";
      const rel = relativeTime(date);
      return { time: rel, _mins: timeToMins(rel), tag: detectTag(String(title)), title: String(title).slice(0, 120), source: feed.source, url: link };
    });
  } catch (e) {
    console.error(`[news] ${feed.source}:`, e.message);
    return [];
  }
}

app.get("/api/news", async (req, res) => {
  const tagFilter = req.query.tag?.toUpperCase();
  const applyFilter = (arr) => tagFilter && tagFilter !== "ALL" ? arr.filter((n) => n.tag === tagFilter) : arr;

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
    if (cache.news.data) return res.json(cache.news.data);
    res.status(502).json({ error: "News unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/music-news — Electronic music RSS
// ─────────────────────────────────────────────

const MUSIC_RSS_FEEDS = [
  // Argentina / Latam
  { url: "https://indiehoy.com/feed/", source: "Indie Hoy" },
  { url: "https://www.clarin.com/rss/espectaculos/", source: "Clarín" },
  // International — electronic music
  { url: "https://djmag.com/feed", source: "DJ Mag" },
  { url: "https://magneticmag.com/feed/", source: "Magnetic" },
  { url: "https://daily.bandcamp.com/feed", source: "Bandcamp" },
  { url: "https://crackmagazine.net/feed/", source: "Crack" },
  { url: "https://dancingastronaut.com/feed/", source: "Dancing Astro" },
  { url: "https://datatransmission.co/feed/", source: "Data Trans" },
  { url: "https://clubbingtv.com/feed/", source: "Clubbing TV" },
];

function detectMusicTag(title) {
  const t = title.toLowerCase();
  if (t.includes("interview") || t.includes("entrevista") || t.includes("speaks") || t.includes("talks") || t.includes("habla") || t.includes("charla")) return "Interview";
  if (t.includes("review") || t.includes("album") || t.includes("álbum") || t.includes("release") || t.includes("lanzamiento") || t.includes("estreno") || t.includes("track") || t.includes("remix") || t.includes("ep ") || t.includes("lp ") || t.includes("disco")) return "Music";
  if (t.includes("festival") || t.includes("lineup") || t.includes("line-up") || t.includes("announces") || t.includes("grilla") || t.includes("lollapalooza") || t.includes("creamfields")) return "Festival";
  if (t.includes("techno")) return "Techno";
  if (t.includes("house")) return "House";
  if (t.includes("club") || t.includes("venue") || t.includes("boliche") || t.includes("closing") || t.includes("opening") || t.includes("fiesta")) return "Clubs";
  if (t.includes("tour") || t.includes("gira") || t.includes("dates") || t.includes("show") || t.includes("recital") || t.includes("concierto")) return "Tour";
  if (t.includes("mix") || t.includes("set") || t.includes("podcast") || t.includes("sesión") || t.includes("sesion")) return "Mix";
  if (t.includes("buenos aires") || t.includes("argentina") || t.includes("córdoba") || t.includes("rosario") || t.includes("mendoza")) return "Local";
  return "Scene";
}

async function fetchMusicRSSFeed(feed) {
  try {
    const r = await fetchSafe(feed.url, { headers: { "User-Agent": "BassLayer/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    const parsed = xmlParser.parse(xml);
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    if (!Array.isArray(items)) items = [items];
    return items.slice(0, 12).map((item) => {
      const title = item.title?.["#text"] || item.title || "";
      const rawLink = item.link?.["@_href"] || item.link || "";
      const link = typeof rawLink === "object" ? (rawLink["@_href"] || "") : String(rawLink);
      const date = item.pubDate || item.published || item.updated || "";
      const rel = relativeTime(date);
      // Clean title: remove source prefix, trim whitespace, remove " - " prefixes
      let cleanTitle = String(title).replace(/^(Mixmag|DJ Mag|RA|EDM\.com)\s*[:–—\-|]\s*/i, "").trim();
      cleanTitle = cleanTitle.replace(/\s{2,}/g, " ").slice(0, 120);
      return { time: rel, _mins: timeToMins(rel), tag: detectMusicTag(String(title)), title: cleanTitle, source: feed.source, url: link };
    });
  } catch (e) {
    console.error(`[music-news] ${feed.source}:`, e.message);
    return [];
  }
}

app.get("/api/music-news", async (req, res) => {
  const tagFilter = req.query.tag;
  const applyFilter = (arr) => tagFilter && tagFilter.toLowerCase() !== "all"
    ? arr.filter((n) => n.tag.toLowerCase() === tagFilter.toLowerCase()) : arr;

  const hit = cached("musicNews");
  if (hit) return res.json(applyFilter(hit));

  try {
    const results = await Promise.allSettled(MUSIC_RSS_FEEDS.map(fetchMusicRSSFeed));
    // Filter general sources to only music/electronic related content
    const MUSIC_KEYWORDS = /electr[oó]ni|techno|house|dj\b|club|fiesta|rave|festival|remix|beat|synth|dance|boliche|recital|disco|vinyl|vinilo|producer|productor|bass|bpm|after|underground/i;
    const news = results
      .filter((r) => r.status === "fulfilled").flatMap((r) => r.value)
      .filter((item) => {
        if (!item.title) return false;
        // Music-specific sources: keep all
        if (["DJ Mag", "Magnetic", "Bandcamp", "Crack", "Dancing Astro", "Data Trans", "Clubbing TV"].includes(item.source)) return true;
        // General sources: only keep music/electronic related
        return MUSIC_KEYWORDS.test(item.title);
      })
      .sort((a, b) => a._mins - b._mins)
      .slice(0, 40)
      .map(({ _mins, ...rest }) => rest);
    setCache("musicNews", news);
    res.json(applyFilter(news));
  } catch (e) {
    console.error("[music-news]", e.message);
    if (cache.musicNews.data) return res.json(cache.musicNews.data);
    res.status(502).json({ error: "Music news unavailable" });
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
    const html = await r.text();
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
      for (let j = 0; j < prevLines.length; j++) {
        const dateMatch = prevLines[j].match(/(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+(\d{1,2})\s+(\w{3})/i);
        if (dateMatch) {
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
const RA_AREAS = [218, 13];
const RA_QUERY = `query GET_DEFAULT_EVENTS_LISTING($filters:FilterInputDtoInput,$pageSize:Int){eventListings(filters:$filters,pageSize:$pageSize,page:1,sortOrder:ASCENDING,sortField:DATE){data{event{id title date startTime endTime contentUrl flyerFront venue{name area{name}}artists{name}}}totalResults}}`;

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
    time: ev.startTime || "23:00",
    genre,
    url: ev.contentUrl ? `https://ra.co${ev.contentUrl}` : "",
    image: ev.flyerFront || null,
    source: "ra",
  };
}

async function fetchRAGraphQL(areaId) {
  const today = new Date().toISOString().split("T")[0];
  const nextMonth = new Date(Date.now() + 30*86400000).toISOString().split("T")[0];
  try {
    const r = await fetchSafe(RA_GRAPHQL, {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "Content-Type":"application/json", Referer:"https://ra.co/events/ar/buenosaires", Origin:"https://ra.co", Accept:"application/json" },
      body: JSON.stringify({ query: RA_QUERY, variables: { filters: { areas:{eq:areaId}, listingDate:{gte:today,lte:nextMonth} }, pageSize:20 } }),
    }, 12000);
    if (!r.ok) return [];
    const json = await r.json();
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
    const html = await r.text();
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
  const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
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
  const seen = new Map();
  for (const ev of events) {
    const key = `${ev.day}-${ev.month}-${ev.venue}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, ev);
  }
  return [...seen.values()];
}

app.get("/api/events", async (req, res) => {
  const genreFilter = req.query.genre;
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

  // Try RA as supplement
  for (const areaId of RA_AREAS) {
    const raEvents = await fetchRAGraphQL(areaId);
    if (raEvents.length > 0) {
      console.log(`[events] RA GraphQL: ${raEvents.length} events loaded`);
      allEvents.push(...raEvents);
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

  // If nothing worked, use curated fallback
  if (allEvents.length === 0) {
    console.log("[events] All sources failed, using curated fallback");
    allEvents = generateFallbackEvents();
  }

  // Deduplicate (same day+venue = same event)
  const deduped = deduplicateEvents(allEvents);

  // Filter out past events (keep today and future only)
  const now = new Date();
  const todayMonth = now.getMonth();   // 0-based
  const todayDay = now.getDate();
  const events = deduped.filter(ev => {
    const m = MONTH_MAP[ev.month.toLowerCase()] ?? -1;
    if (m === -1) return true; // keep unknown months
    if (m > todayMonth) return true;
    if (m === todayMonth && parseInt(ev.day) >= todayDay) return true;
    return false;
  });

  // Mark featured events
  events.forEach(markFeatured);

  // Sort by date
  events.sort((a, b) => {
    const ma = MONTH_MAP[a.month.toLowerCase()] ?? 99;
    const mb = MONTH_MAP[b.month.toLowerCase()] ?? 99;
    if (ma !== mb) return ma - mb;
    return parseInt(a.day) - parseInt(b.day);
  });

  setCache("events", events);
  res.json(applyFilter(events));
});

// ─────────────────────────────────────────────
//  Price Chart (7-day sparkline)
// ─────────────────────────────────────────────

const chartCache = {};

app.get("/api/prices/:id/chart", async (req, res) => {
  const { id } = req.params;
  const hit = chartCache[id];
  if (hit && Date.now() - hit.ts < 5 * 60_000) return res.json(hit.data);

  try {
    const r = await fetchSafe(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=7`, {}, 10000);
    if (!r.ok) return res.status(502).json({ error: "CoinGecko unavailable" });
    const data = await r.json();
    const result = { prices: data.prices || [] };
    chartCache[id] = { data: result, ts: Date.now() };
    res.json(result);
  } catch (e) {
    console.error("[chart]", e.message);
    res.status(500).json({ error: "Chart data unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dashboard — BTC dominance, Fear & Greed, ETH gas
// ─────────────────────────────────────────────

app.get("/api/dashboard", async (req, res) => {
  const hit = cached("dashboard");
  if (hit) return res.json(hit);

  const results = await Promise.allSettled([
    // BTC dominance + total market cap from CoinGecko global
    fetchSafe("https://api.coingecko.com/api/v3/global").then(r => r.ok ? r.json() : null),
    // Fear & Greed index
    fetchSafe("https://api.alternative.me/fng/?limit=1").then(r => r.ok ? r.json() : null),
    // ETH gas from Etherscan (free tier, no key needed for gas oracle)
    fetchSafe("https://api.etherscan.io/api?module=gastracker&action=gasoracle").then(r => r.ok ? r.json() : null),
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
});

// ─────────────────────────────────────────────
//  Meta + Health
// ─────────────────────────────────────────────

app.get("/api/meta", (req, res) => res.json({
  newsTags: ["All","BTC","ETH","SOL","XRP","DeFi","L2","NFT","Reg","AI","Stable","Mining","Crypto"],
  eventGenres: ["All","Techno","House","Deep House","Tech House","Progressive","Melodic","Minimal","DnB","Trance","Disco","Ambient","Festival","Electronic"],
}));

app.get("/api/health", (req, res) => res.json({
  status: "ok", version: "1.3", uptime: Math.floor(process.uptime()),
  cache: Object.fromEntries(Object.entries(cache).map(([k]) => [k, cached(k) ? "fresh" : "stale"])),
}));

if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => res.sendFile(join(__dirname, "dist", "index.html")));
}

app.listen(PORT, () => console.log(`
  ┌──────────────────────────────────────┐
  │  BassLayer API v1.4                  │
  │  http://localhost:${PORT}              │
  │                                      │
  │  /api/prices      30s cache          │
  │  /api/news        5min (?tag=BTC)    │
  │  /api/music-news  10min (?tag=...)   │
  │  /api/events      1h (?genre=...)    │
  │  /api/dashboard   5min (market)     │
  │  /api/meta        filter options     │
  │  /api/health                         │
  │                                      │
  │  Sources:                            │
  │   Events: Buenos Aliens → RA → fb   │
  │   Crypto: 16 RSS feeds (EN+ES)      │
  │   Music: 9 feeds (AR+intl)          │
  │   Prices: CoinGecko                 │
  └──────────────────────────────────────┘
`));

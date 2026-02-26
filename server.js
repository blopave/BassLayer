// ═══════════════════════════════════════════════════════
//  BassLayer API — v1.3
//  Bass: BA electronic events (Buenos Aliens + RA + fallback)
//  Layer: Crypto news (6 RSS feeds) + prices (CoinGecko)
// ═══════════════════════════════════════════════════════

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(__dirname, "dist")));
}

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

const cache = {
  prices: { data: null, ts: 0, ttl: 30_000 },
  news:   { data: null, ts: 0, ttl: 5 * 60_000 },
  events: { data: null, ts: 0, ttl: 60 * 60_000 },  // 1h — events don't change fast
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
    const r = await fetchSafe(`https://api.coingecko.com/api/v3/simple/price?ids=${COIN_IDS}&vs_currencies=usd&include_24hr_change=true`);
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    const raw = await r.json();
    const prices = Object.entries(raw).map(([id, d]) => ({
      id, sym: SYM_MAP[id] || id.toUpperCase(), usd: d.usd,
      change: Math.round((d.usd_24h_change || 0) * 10) / 10,
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
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
  { url: "https://thedefiant.io/feed", source: "The Defiant" },
  { url: "https://www.theblock.co/rss.xml", source: "The Block" },
  { url: "https://blockworks.co/feed", source: "Blockworks" },
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
      .slice(0, 30)
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

    // Parse event blocks — each event starts with a headline + date + venue pattern
    // The page has structured text blocks per event
    const events = [];
    const currentYear = new Date().getFullYear();

    // Match pattern: "Title\nDAY_WEEKDAY DD MONTH\nVenue" with line-up info
    // Buenos Aliens uses this format: "Artists y más\nDIA DD MES\nVenue"
    // We'll extract from the agenda section

    // Find agenda section
    const agendaStart = html.indexOf("# Agenda");
    if (agendaStart === -1) {
      // Try alternate: look for event blocks with date patterns
    }

    // Strategy: extract all text blocks that contain event data
    // Each event block has: title line, date line (VIE/SAB/DOM DD MES), venue, lineup
    const eventPattern = /([^<\n]+(?:y más|y otros)?)\s*\n?\s*(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+(\d{1,2})\s+(?:SAB\s+\d{1,2}\s+)?(\w{3})\s*\n?\s*([^\n<]+?)(?:\n|<)/gi;

    // Simpler approach: parse the raw text content
    // Remove HTML tags to get clean text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#x27;/g, "'")
      .replace(/\n{3,}/g, "\n\n");

    // Find event blocks: look for "Line up" sections which indicate event details
    const blocks = text.split(/Line up\s*/i);

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const prevBlock = blocks[i - 1];

      // Get venue and date from previous block (it's the header before "Line up")
      const lines = prevBlock.trim().split("\n").filter(l => l.trim()).slice(-6);

      // Find date: pattern like "VIE 27 FEB" or "SAB 28 FEB"
      let day = "", month = "";
      let venue = "";
      let eventTitle = "";

      for (const line of lines) {
        const dateMatch = line.match(/(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+(\d{1,2})\s+(\w{3})/i);
        if (dateMatch) {
          day = dateMatch[1].padStart(2, "0");
          month = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1).toLowerCase();
        }
      }

      // Venue is typically the last meaningful line before "Line up"
      const venueLines = lines.filter(l => !l.match(/^(VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s/i) && l.trim().length > 2);
      if (venueLines.length > 0) {
        venue = venueLines[venueLines.length - 1].trim().slice(0, 30);
        if (venueLines.length > 1) {
          eventTitle = venueLines[venueLines.length - 2].trim();
        }
      }

      // Extract artists from lineup block
      const artistLines = block.split("\n").filter(l => l.trim()).slice(0, 10);
      const artists = [];
      for (const line of artistLines) {
        const clean = line.trim()
          .replace(/\(.*?\)/g, "").replace(/b2b/gi, " b2b ").trim();
        if (clean.length > 1 && clean.length < 50 &&
            !clean.match(/^(Desde|Estilo|queda en|Line up|Edad|https?)/i)) {
          artists.push(clean);
        }
        if (clean.match(/^Desde las/i) || clean.match(/queda en/i)) break;
      }

      if (!day || !month || artists.length === 0) continue;

      // Find time
      const timeMatch = block.match(/Desde las (\d{1,2}(?::\d{2})?)\s*hs/i);
      const time = timeMatch ? timeMatch[1] + (timeMatch[1].includes(":") ? "" : ":00") : "23:00";

      // Find style/genre
      const styleMatch = block.match(/Estilo:\s*([^\n.]+)/i);
      const genre = styleMatch ? detectGenre(styleMatch[1]) : detectGenre(artists.join(" ") + " " + (eventTitle || ""));

      const name = eventTitle || artists[0] || "Event";
      const artistStr = artists.slice(0, 3).join(", ");

      events.push({
        day, month,
        name: name.slice(0, 50),
        detail: artistStr ? `${genre} · ${artistStr}` : genre,
        genre,
        time,
        venue: venue || "TBA",
        artists,
        url: "",  // Buenos Aliens doesn't have individual event URLs easily
        source: "buenosaliens",
      });
    }

    console.log(`[events] Buenos Aliens: parsed ${events.length} events`);
    return events;

  } catch (e) {
    console.error("[events] Buenos Aliens error:", e.message);
    return [];
  }
}

// ── Strategy 2: RA GraphQL ──

const RA_GRAPHQL = "https://ra.co/graphql";
const RA_AREAS = [218, 13];
const RA_QUERY = `query GET_DEFAULT_EVENTS_LISTING($filters:FilterInputDtoInput,$pageSize:Int){eventListings(filters:$filters,pageSize:$pageSize,page:1,sortOrder:ASCENDING,sortField:DATE){data{event{id title date startTime endTime contentUrl venue{name area{name}}artists{name}}}totalResults}}`;

function formatRAEvent(ev) {
  const date = new Date(ev.date);
  const artists = (ev.artists || []).map(a => a.name);
  const genre = detectGenre((ev.title || "") + " " + artists.join(" "));
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: MONTHS_ES[date.getMonth()],
    name: (ev.title || "Event").slice(0, 50),
    detail: artists.length ? `${genre} · ${artists.slice(0,3).join(", ")}` : genre,
    genre, time: ev.startTime || "23:00",
    venue: (ev.venue?.name || "TBA").slice(0, 25),
    artists,
    url: ev.contentUrl ? `https://ra.co${ev.contentUrl}` : "",
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

const FALLBACK_EVENTS = [
  { day:"28", month:"Feb", name:"Obscure Shape @ Blow",         detail:"Techno · Obscure Shape, fidelos90s", genre:"Techno",      time:"23:59", venue:"Blow, Palermo",         artists:["Obscure Shape","fidelos90s","West Code"], url:"", source:"fallback" },
  { day:"28", month:"Feb", name:"TH;EN + Mila Journée",        detail:"Electronic · TH;EN, Mila Journée",   genre:"Electronic",  time:"23:00", venue:"Oasis",                artists:["TH;EN","Mila Journée","Gueva"], url:"", source:"fallback" },
  { day:"28", month:"Feb", name:"Budakid @ La Biblioteca",     detail:"House · Budakid, Diego Colombo",     genre:"House",        time:"23:00", venue:"La Biblioteca",         artists:["Budakid","Diego Colombo","Franco Camiolo"], url:"", source:"fallback" },
  { day:"01", month:"Mar", name:"Danny Howells @ Crobar",      detail:"House · Danny Howells",              genre:"House",        time:"23:00", venue:"Crobar",                artists:["Danny Howells"], url:"", source:"fallback" },
  { day:"07", month:"Mar", name:"PAWSA + Hot Since 82",        detail:"House · PAWSA, Hot Since 82, Rossi", genre:"House",        time:"23:00", venue:"La Biblioteca",         artists:["PAWSA","Hot Since 82","Rossi"], url:"", source:"fallback" },
  { day:"13", month:"Mar", name:"Lollapalooza BA — Day 1",     detail:"Festival · Charlotte de Witte, BLOND:ISH", genre:"Festival", time:"12:00", venue:"Hipódromo San Isidro",  artists:["Charlotte de Witte","BLOND:ISH","Barry Can't Swim"], url:"https://www.lollapaloozaar.com", source:"fallback" },
  { day:"14", month:"Mar", name:"Lollapalooza BA — Day 2",     detail:"Festival · DJ Zedd",                  genre:"Festival",    time:"12:00", venue:"Hipódromo San Isidro",  artists:["DJ Zedd","Teddy Swims"], url:"https://www.lollapaloozaar.com", source:"fallback" },
  { day:"15", month:"Mar", name:"Lollapalooza BA — Day 3",     detail:"Festival · Rüfüs Du Sol, James Hype",genre:"Festival",    time:"12:00", venue:"Hipódromo San Isidro",  artists:["Rüfüs Du Sol","James Hype","Caribou"], url:"https://www.lollapaloozaar.com", source:"fallback" },
  { day:"21", month:"Mar", name:"Sasha & John Digweed",        detail:"Progressive · Sasha, John Digweed",  genre:"Progressive", time:"22:00", venue:"Autódromo de BA",       artists:["Sasha","John Digweed","Marcelo Vasami"], url:"", source:"fallback" },
  { day:"28", month:"Mar", name:"Club de Pescadores",          detail:"Techno · Open air",                  genre:"Techno",      time:"22:00", venue:"Club de Pescadores",    artists:[], url:"", source:"fallback" },
  { day:"29", month:"Mar", name:"Hernán Cattáneo",             detail:"Progressive · Sunset session",       genre:"Progressive", time:"18:00", venue:"TBA",                   artists:["Hernán Cattáneo"], url:"", source:"fallback" },
];

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
    allEvents = FALLBACK_EVENTS;
  }

  // Deduplicate (same day+venue = same event)
  const events = deduplicateEvents(allEvents);

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
  │  BassLayer API v1.3                  │
  │  http://localhost:${PORT}              │
  │                                      │
  │  /api/prices    30s cache            │
  │  /api/news      5min (?tag=BTC)      │
  │  /api/events    1h (?genre=Techno)   │
  │  /api/meta      filter options       │
  │  /api/health                         │
  │                                      │
  │  Sources:                            │
  │   Events: Buenos Aliens → RA → fb    │
  │   News: 6 RSS feeds                  │
  │   Prices: CoinGecko                  │
  └──────────────────────────────────────┘
`));

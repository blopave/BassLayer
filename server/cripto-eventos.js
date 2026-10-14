// Eventos cripto de Layer: los curados (data/crypto-events.json) y Crypto IRL (comunidad y cursos), con su carga desde el admin.
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`;
// devuelve los lectores que usa el resumen de la semana.

import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { sanitizeUrl } from "./texto.js";

export function montarCriptoEventos(app, d) {
  const { rootDir, cached, fetchSafe, safeText, setCache } = d;

// ═══════════════════════════════════════════════════════
//  Crypto Events — scraped from Eventbrite + Meetup
// ═══════════════════════════════════════════════════════

const LUMA_CATEGORIES = ["crypto", "blockchain", "web3"];

// Keywords para filtrar el feed de Luma. La categoría del endpoint no basta:
// muchos meetups genéricos (clubes de lectura, cerámica, fútbol) se cuelan y
// ensucian la agenda cripto. Nos quedamos solo con lo que tenga alguna de estas
// palabras en título / descripción / organizador (case-insensitive).
const LUMA_CRYPTO_KEYWORDS = [
  "crypto", "cripto", "bitcoin", "btc", "ethereum", "eth", "web3", "blockchain",
  "token", "defi", "nft", "stablecoin", "solana", "dao", "onchain", "wallet", "staking",
];
const LUMA_CRYPTO_REGEX = new RegExp(`\\b(${LUMA_CRYPTO_KEYWORDS.join("|")})\\b`, "i");

function lumaMatchesCrypto(ev) {
  const haystack = `${ev.title || ""} ${ev.description || ""} ${ev.organizer || ""}`;
  return LUMA_CRYPTO_REGEX.test(haystack);
}

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
  const lumaEventsRaw = await fetchLumaEvents().catch(() => []);
  const lumaEvents = lumaEventsRaw.filter(lumaMatchesCrypto);
  const filteredOut = lumaEventsRaw.length - lumaEvents.length;

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

  console.log(`[crypto-events] Luma raw: ${lumaEventsRaw.length}, matched crypto keywords: ${lumaEvents.length} (filtered ${filteredOut}), unique: ${unique.length}`);
  // No pinnear un scrape vacío 1h: solo cacheamos si hubo resultados (el caller
  // igual mergea con los eventos curados, así que devolver [] no rompe nada).
  if (unique.length) setCache("cryptoEvents", unique);
  return unique;
}

const CRYPTO_CURATED_FILE = join(rootDir, "data", "crypto-events-curated.json");
let curatedEventsCache = null;

function loadCuratedEvents() {
  if (curatedEventsCache) return curatedEventsCache;
  try {
    const raw = readFileSync(CRYPTO_CURATED_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    curatedEventsCache = Array.isArray(parsed.events) ? parsed.events : [];
  } catch (err) {
    console.error("[crypto-events] curated load:", err.message);
    curatedEventsCache = [];
  }
  return curatedEventsCache;
}

app.get("/api/crypto-events", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const curated = loadCuratedEvents()
    .filter(e => !e.date || e.date >= today)
    .map(e => ({ ...e, source: "curated" }));

  try {
    const scraped = await fetchCryptoEvents();
    const manual = loadCryptoIrl();
    const manualEvents = (manual.events || [])
      .filter(e => e.status === "approved")
      .map(e => ({ ...e, source: "community" }));

    const all = [...manualEvents, ...curated, ...scraped];
    all.sort((a, b) => (a.date || "9999") > (b.date || "9999") ? 1 : -1);

    res.json(all);
  } catch (err) {
    console.error("[crypto-events] Error:", err.message);
    const manual = loadCryptoIrl();
    const manualEvents = (manual.events || [])
      .filter(e => e.status === "approved")
      .map(e => ({ ...e, source: "community" }));
    const fallback = [...manualEvents, ...curated];
    fallback.sort((a, b) => (a.date || "9999") > (b.date || "9999") ? 1 : -1);
    res.json(fallback);
  }
});

// ═══════════════════════════════════════════════════════
//  Crypto IRL — community events & courses
// ═══════════════════════════════════════════════════════

const CRYPTO_IRL_FILE = join(rootDir, "data", "crypto-irl.json");
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
  const dir = join(rootDir, "data");
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
  return { loadCuratedEvents, loadCryptoIrl };
}

// Bass: festivales curados (data/festivals.json), con la imagen og:image y el estado del link verificados.
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`;
// devuelve los lectores que usan la agenda, el prerender y los feeds.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sanitizeUrl, extractOgImage, absolutizeUrl, readHead } from "./texto.js";

export function montarFestivales(app, d) {
  const { BROWSER_HEADERS, MONTHS_ES, rootDir, fetchSafe } = d;

// ─────────────────────────────────────────────
//  GET /api/festivals — Curaduría manual de festivales
//  Foco electrónica. Datos en data/festivals.json.
//  Imágenes: si el JSON no trae `image`, scrapea og:image del sitio oficial
//  y la cachea 7 días.
// ─────────────────────────────────────────────

const FESTIVALS_FILE = join(rootDir, "data", "festivals.json");
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

// Festivales que suceden en Argentina → se inyectan en la agenda de eventos
// (region AR, family "festival") además de vivir en la pestaña Festivales.
// Solo los próximos/en curso; el genre "Festival" hace que classifyFamily los
// mande a la familia festival.
function arFestivalsAsEvents() {
  try {
    const out = [];
    for (const f of loadFestivals()) {
      if ((f.region || "") !== "BA") continue;          // solo Argentina (region BA)
      if (festivalStatus(f) === "past") continue;        // solo próximos / en curso
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f.dates_start || "");
      if (!m) continue;
      const monthIdx = parseInt(m[2], 10) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      out.push({
        day: m[3],
        month: MONTHS_ES[monthIdx],
        name: f.name,
        venue: f.city || "Argentina",
        address: [f.city, f.country].filter(Boolean).join(", "),
        city: f.city || "",
        region: "AR",
        artists: [],
        time: "",
        genre: "Festival",
        url: f.url || "",
        // La misma imagen que muestra la sección Festivales (og:image del sitio oficial, si ya se resolvió).
        image: f.image || festivalImageCache.get(f.id)?.image || null,
        source: "festival",
        description: f.description || null,
        festival_id: f.id,
      });
    }
    return out;
  } catch (e) {
    console.error("[events] AR festivals inject error:", e.message);
    return [];
  }
}

// Cache de meta (image + link status) por festival id. La primera carga es
// lenta (~3-5s, 30 fetches en paralelo); las siguientes son instantáneas
// durante 7 días para imagen, 12h para link status (chequeamos vigencia más
// seguido por si un dominio cae o se recupera).
const festivalImageCache = new Map();   // id → { image, ts }
const festivalLinkCache  = new Map();   // id → { status, ts }
const FESTIVAL_IMAGE_TTL = 7 * 24 * 60 * 60 * 1000;
const FESTIVAL_LINK_TTL  = 12 * 60 * 60 * 1000;

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
  // Con image explícita la imagen sale siempre del JSON: solo el link decide si hay que fetchear.
  const imgResolved = hasExplicitImage || imgFresh;

  if (imgResolved && linkFresh) {
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
      if (!imgResolved) festivalImageCache.set(festival.id, { image: null, ts: now });
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
    if (!imgResolved) festivalImageCache.set(festival.id, { image: null, ts: now });
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

// Construye la agenda completa (todas las fuentes, dedup, orden, familias,
// fotos de artista). Solo la llama swr(): una build en vuelo, el resto sirve
  return { loadFestivals, festivalStatus, arFestivalsAsEvents };
}

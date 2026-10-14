// Bass: artistas — bio y foto (Wikipedia, Deezer verificado por género, iTunes), bios traducidas y la foto del headliner cuando el evento no tiene flyer.
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`;
// devuelve el backfill de fotos que usa la agenda.

import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeArtistName, sanitizeUrl } from "./texto.js";

export function montarArtistas(app, d) {
  const { GENRE_LIST, SNAPSHOT_DIR, fetchSafe, safeText, translateText } = d;

// ─────────────────────────────────────────────
//  GET /api/artist?name=X — bio + thumbnail (Wikipedia REST, public)
// ─────────────────────────────────────────────
const artistCache = new Map();
const artistInflight = new Map(); // key → Promise en curso (dedup entre aperturas simultáneas)
const ARTIST_CACHE_MAX = 200;
const ARTIST_TTL = 24 * 60 * 60_000;
const ARTIST_DEGRADED_TTL = 10 * 60_000;   // armado sin Wikipedia (pausada por 429)

// Wikipedia rate-limitea (429) a quien le pega seguido. Antes cada artista
// probaba hasta 12 títulos especulativos ("X (DJ)", "X (productor)"…): un
// line-up de 10 eran ~100 requests. Ahora: una búsqueda de títulos por idioma
// y, como mucho, dos resúmenes de los que coinciden exacto. Ante un 429 se
// pausa Wikipedia un rato y el resultado degradado se cachea corto.
const WIKI_PAUSE_MS = 15 * 60_000;
let wikiPausedUntil = 0;
const WIKI_UA = { "User-Agent": "BassLayer/1.0 (basslayer.io)" };
const WIKI_MUSICAL = /\b(dj|musician|producer|artist|electronic|techno|house|trance|drum|composer|singer|band|rapper|duo|músico|música|productor|productora|cantante|compositor|compositora|artista|banda|electrónica|electronica|rapero|dúo)\b/;

async function wikiFetch(url) {
  if (Date.now() < wikiPausedUntil) { const e = new Error("wiki paused"); e.transient = true; throw e; }
  const r = await fetchSafe(url, { headers: WIKI_UA }, 8000);
  if (r.status === 429) {
    wikiPausedUntil = Date.now() + WIKI_PAUSE_MS;
    const e = new Error("wiki 429"); e.transient = true; throw e;
  }
  return r;
}

async function tryWikipediaLang(name, lang) {
  const target = normalizeArtistName(name);
  const sr = await wikiFetch(`https://${lang}.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(name)}&limit=6`);
  if (!sr.ok) return null;
  const pages = JSON.parse(await safeText(sr)).pages || [];
  // Título exacto, con o sin desambiguación entre paréntesis: "Ben Klock",
  // "Nicola Cruz (DJ)". Nunca uno que solo lo contenga.
  const exact = pages.filter((pg) => normalizeArtistName(String(pg.title || "").replace(/\s*\([^)]*\)\s*$/, "")) === target).slice(0, 2);
  for (const pg of exact) {
    const r = await wikiFetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pg.key)}`);
    if (!r.ok) continue;
    const j = JSON.parse(await safeText(r));
    if (j.type === "disambiguation" || !j.extract) continue;
    if (!WIKI_MUSICAL.test(`${j.description || ""} ${j.extract || ""}`.toLowerCase())) continue;
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
  }
  return null;
}


// Búsqueda cruda compartida por la bio del modal (tryDeezer) y el fallback de
// flyer (fetchArtistImage). Devuelve null en falla transitoria (cuota, red).
// Cacheada 1 h con dedup en vuelo: el backfill de fotos y /api/artist buscan
// los mismos headliners, y cada request de más cuenta para el ban por IP.
const deezerSearchCache = new Map();   // nombre normalizado → { p, ts }
function deezerSearchArtist(name) {
  const key = normalizeArtistName(name);
  const hit = deezerSearchCache.get(key);
  if (hit && Date.now() - hit.ts < 60 * 60_000) return hit.p;
  const p = (async () => {
    const r = await fetchSafe(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=3`, {}, 6000);
    if (!r.ok) return null;
    const j = JSON.parse(await safeText(r));
    return Array.isArray(j.data) ? j.data : null;
  })();
  // Fallas y "sin datos" no se cachean: se reintentan en el próximo pedido.
  p.then((v) => { if (!v) deezerSearchCache.delete(key); }, () => deezerSearchCache.delete(key));
  if (deezerSearchCache.size >= 1000) deezerSearchCache.delete(deezerSearchCache.keys().next().value);
  deezerSearchCache.set(key, { p, ts: Date.now() });
  return p;
}

// El CDN de Deezer marca "sin foto" con el md5 vacío en el path: o directo
// ("/artist//") o vía 302 a d41d8cd... (md5 del string vacío) = avatar genérico.
function isDeezerPlaceholderUrl(u) {
  return !u || u.includes("/artist//") || u.includes("d41d8cd98f00b204e9800998ecf8427e");
}

// 500px alcanza para todo (tarjeta del headliner, foto de card, hero del
// modal): una sola URL por artista = un solo fetch al CDN y un solo archivo.
function deezerPickPicture(match) {
  const pic = match && (match.picture_big || match.picture_xl || match.picture_medium);
  return isDeezerPlaceholderUrl(pic) ? null : pic;
}

// ── Verificación de identidad en Deezer (fiestas electrónicas) ──
// El match exacto de nombre no alcanza: "Anne" en Deezer es una cantante pop,
// no ANNĒ la DJ de techno. Para eventos club, un artista de Deezer cuenta solo
// si la mayoría de los géneros de sus álbumes son electrónicos. Cacheado 7 días
// por id (y fallas transitorias no se cachean).
const ELECTRONIC_GENRE = /electro|dance|techno|house/i;
const DEEZER_VERIFY_FAMILIES = new Set(["club"]);
const deezerGenreCache = new Map();   // artist id → { p, ts } (promesa: dedup en vuelo)
function deezerElectronicShare(artistId) {
  const hit = deezerGenreCache.get(artistId);
  if (hit && Date.now() - hit.ts < ARTIST_IMAGE_TTL) return hit.p;
  const p = (async () => {
    const r = await fetchSafe(`https://api.deezer.com/artist/${artistId}/albums?limit=4`, {}, 6000);
    if (!r.ok) throw new Error(`deezer albums ${r.status}`);
    const albums = (JSON.parse(await safeText(r)).data || []).slice(0, 4);
    const genres = (await Promise.all(albums.map(async (al) => {
      const ar = await fetchSafe(`https://api.deezer.com/album/${al.id}`, {}, 6000).catch(() => null);
      return ar?.ok ? (JSON.parse(await safeText(ar)).genres?.data || []) : [];
    }))).flat();
    return genres.length ? genres.filter((g) => ELECTRONIC_GENRE.test(g.name)).length / genres.length : 0;
  })();
  p.catch(() => deezerGenreCache.delete(artistId));   // fallas transitorias no se cachean
  if (deezerGenreCache.size >= 2000) deezerGenreCache.delete(deezerGenreCache.keys().next().value);
  deezerGenreCache.set(artistId, { p, ts: Date.now() });
  return p;
}
async function deezerVerified(match, family) {
  if (!DEEZER_VERIFY_FAMILIES.has(family)) return true;
  return (await deezerElectronicShare(match.id)) >= 0.6;
}
// Tema más escuchado (id estable; la URL del preview se firma al reproducir).
async function deezerTopTrack(artistId) {
  const r = await fetchSafe(`https://api.deezer.com/artist/${artistId}/top?limit=1`, {}, 6000);
  if (!r.ok) return null;
  const t = (JSON.parse(await safeText(r)).data || [])[0];
  return t && t.preview ? { id: t.id, title: t.title, album: t.album?.title || null } : null;
}

async function tryDeezer(name, locale = "es", family = "") {
  const en = locale === "en";
  try {
    const candidates = (await deezerSearchArtist(name)) || [];
    if (candidates.length === 0) return null;
    const target = normalizeArtistName(name);
    // Solo match exacto: con "includes" entraban homónimos y nombres que
    // contienen al otro (la ficha mostraba a otra persona).
    const match = candidates.find(a => normalizeArtistName(a.name) === target);
    if (!match) return null;
    const fans = match.nb_fan || 0;
    const albums = match.nb_album || 0;
    // Perfil vacío (0 fans, 0 álbumes): no hay nada que confirme que sea el
    // artista del line-up — mejor la inicial que "Perfil de Deezer".
    if (fans === 0 && albums === 0) return null;
    if (!(await deezerVerified(match, family))) return null;
    const track = await deezerTopTrack(match.id).catch(() => null);
    const nf = fans.toLocaleString(en ? "en-US" : "es-AR");
    const desc = [
      fans > 0 ? (en ? `${nf} fans on Deezer` : `${nf} fans en Deezer`) : null,
      albums > 0 ? (en ? `${albums} ${albums === 1 ? "album" : "albums"}` : `${albums} ${albums === 1 ? "álbum" : "álbumes"}`) : null,
    ].filter(Boolean).join(" · ");
    // El thumbnail va proxeado: el CDN de Deezer da 403 a hotlinks del browser.
    const pic = deezerPickPicture(match);
    return {
      name,
      found: true,
      title: match.name,
      description: desc,
      extract: null,
      thumbnail: pic ? `/api/artist-image?u=${encodeURIComponent(pic)}` : null,
      url: match.link || null,
      track,
      source: "deezer",
    };
  } catch {
    return null;
  }
}

const ITUNES_ELECTRONIC = "electr|dance|house|techno|trance|ambient|downtempo|drum|bass|dubstep|idm|disco|breakbeat";
const ITUNES_URBAN = "hip.?hop|rap|reggaet|latin|urban|trap|r&b|soul|pop|dancehall|cumbia|dance";
const ITUNES_GENRES_BY_FAMILY = {
  club: new RegExp(ITUNES_ELECTRONIC, "i"),
  festival: new RegExp(`${ITUNES_ELECTRONIC}|pop|hip.?hop|rap|latin|urban`, "i"),
  urbano: new RegExp(ITUNES_URBAN, "i"),
};

async function tryItunes(name, family = "") {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=3`;
  try {
    const r = await fetchSafe(url, {}, 6000);
    if (!r.ok) return null;
    const j = JSON.parse(await safeText(r));
    const candidates = j.results || [];
    if (candidates.length === 0) return null;
    const target = normalizeArtistName(name);
    const match = candidates.find(a => normalizeArtistName(a.artistName) === target);
    if (!match) return null;
    const genre = match.primaryGenreName ? match.primaryGenreName : null;
    // El género tiene que cuadrar con el evento: un "Metal · iTunes" en una
    // fiesta de techno es un homónimo, no el DJ del line-up.
    const allowed = ITUNES_GENRES_BY_FAMILY[family];
    if (allowed && !(genre && allowed.test(genre))) return null;
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

async function fetchArtistInfo(name, locale = "es", family = "") {
  const primary = locale === "en" ? "en" : "es";
  const fallback = primary === "en" ? "es" : "en";
  // Deezer se necesita en todos los caminos (foto y tema cuando Wikipedia
  // tiene la bio, o como fuente cuando no): arranca ya, en paralelo.
  const deezerP = tryDeezer(name, locale, family).catch(() => null);
  // 1–2. Wikipedia en el idioma del usuario y después en el otro. Si está
  // pausada (429) se sigue con Deezer/iTunes y el resultado se marca
  // degradado para cachearlo corto.
  let degraded = false;
  const mark = (r) => (degraded ? { ...r, degraded } : r);
  for (const lang of [primary, fallback]) {
    try {
      const wiki = await tryWikipediaLang(name, lang);
      if (wiki) {
        // Deezer completa lo que Wikipedia no tiene: foto y tema para escuchar.
        const dz = await deezerP;
        if (!wiki.thumbnail && dz?.thumbnail) wiki.thumbnail = dz.thumbnail;
        if (dz?.track) wiki.track = dz.track;
        // Bio en el otro idioma: se traduce y se marca como automática.
        const wikiLang = wiki.source.replace("wikipedia-", "");
        if (wikiLang !== primary && wiki.extract) {
          const tr = await translateText(wiki.extract, wikiLang, primary);
          if (tr) { wiki.extract = tr; wiki.translated = true; }
        }
        return wiki;
      }
    } catch (e) {
      if (e.transient) { degraded = true; break; }
    }
  }
  // 3. Deezer (foto + tema, lo mejor para DJs)
  const deezer = await deezerP;
  if (deezer) return mark(deezer);
  // 4. iTunes (género + link oficial), solo si el género cuadra con el evento
  const itunes = await tryItunes(name, family);
  if (itunes) return mark(itunes);
  // Sin match confiable, la fila muestra la inicial y los links de búsqueda.
  return mark({ name, found: false });
}

app.get("/api/artist", async (req, res) => {
  const raw = (req.query.name || "").toString().trim();
  const locale = (req.query.locale || "es").toString().toLowerCase() === "en" ? "en" : "es";
  const familyRaw = (req.query.family || "").toString();
  const family = GENRE_LIST.includes(familyRaw) ? familyRaw : "";
  if (!raw || raw.length > 80) return res.status(400).json({ error: "Invalid name" });
  const key = `${locale}:${family}:${raw.toLowerCase()}`;

  // Degradado (sin Wikipedia): el browser tampoco debe guardarlo 12 h.
  const send = (data) => {
    if (data.degraded) res.set("Cache-Control", `public, max-age=${ARTIST_DEGRADED_TTL / 2000}`);
    res.json(data);
  };
  const hit = artistCache.get(key);
  if (hit && Date.now() - hit.ts < (hit.data.degraded ? ARTIST_DEGRADED_TTL : ARTIST_TTL)) return send(hit.data);

  try {
    // Dos aperturas del mismo evento (o dos usuarios) no deben disparar dos
    // cadenas Wikipedia→Deezer→iTunes en paralelo: una sola en vuelo.
    let p = artistInflight.get(key);
    if (!p) {
      p = fetchArtistInfo(raw, locale, family).finally(() => artistInflight.delete(key));
      artistInflight.set(key, p);
    }
    const data = await p;
    if (artistCache.size >= ARTIST_CACHE_MAX) {
      const oldest = artistCache.keys().next().value;
      artistCache.delete(oldest);
    }
    artistCache.set(key, { data, ts: Date.now() });
    send(data);
  } catch (e) {
    console.error("[artist]", e.message);
    res.json({ name: raw, found: false });
  }
});

// Preview de 30 s: la URL de Deezer viene firmada y vence en ~15 min, así que
// la ficha guarda el id del tema y el <audio> pide acá una URL fresca (302).
const previewCache = new Map();   // track id → { url, exp }
app.get("/api/preview/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!/^\d{1,12}$/.test(id)) return res.status(400).json({ error: "Invalid id" });
  const hit = previewCache.get(id);
  if (hit && Date.now() < hit.exp) return res.redirect(302, hit.url);
  try {
    const r = await fetchSafe(`https://api.deezer.com/track/${id}`, {}, 6000);
    const t = r.ok ? JSON.parse(await safeText(r)) : null;
    if (!t?.preview) return res.status(404).json({ error: "No preview" });
    const exp = Number((decodeURIComponent(t.preview).match(/exp=(\d+)/) || [])[1]) * 1000 || Date.now() + 10 * 60_000;
    if (previewCache.size >= 500) previewCache.delete(previewCache.keys().next().value);
    previewCache.set(id, { url: t.preview, exp: exp - 60_000 });
    res.set("Cache-Control", "no-store");
    res.redirect(302, t.preview);
  } catch (e) {
    console.error("[preview]", e.message);
    res.status(502).json({ error: "Preview failed" });
  }
});

// ─────────────────────────────────────────────
//  Foto de artista como fallback de flyer (campo `artistImage` en /api/events)
// ─────────────────────────────────────────────
// Solo Deezer: cubre bien DJs/electrónica, una request por artista y foto
// cuadrada grande. Match EXACTO de nombre normalizado — para una imagen
// visible, un homónimo equivocado es peor que el póster tipográfico.
const artistImageCache = new Map();   // nombre normalizado → { image, ts }
const artistImageInflight = new Map();   // nombre normalizado → Promise en curso
const ARTIST_IMAGE_TTL = 7 * 24 * 60 * 60 * 1000;
const ARTIST_IMAGE_CACHE_MAX = 600;
const ARTIST_IMAGE_CONCURRENCY = 5;
// Primer build del feed: cuánto esperamos las fotos antes de responder.
// Lo que no llegó sigue completándose en background sobre el array cacheado.
const ARTIST_IMAGE_BUDGET_MS = 3500;

// Entradas ya pasadas por normalizeArtistName (minúsculas, sin diacríticos ni
// espacios/puntuación).
const TRIVIAL_HEADLINERS = new Set(["tba", "tbd", "tbc", "b2b", "masaconfirmar", "lineup", "variosartistas", "djset"]);

// Candidatos a "cara del evento", en orden: primero el artista mencionado en
// el nombre del evento (ese es el headliner real aunque no sea artists[0]),
// después el resto del lineup. La etiqueta del front nombra al elegido, así
// que cualquiera del lineup es un fallback honesto.
function pickHeadliners(ev) {
  const valid = [];
  for (const a of ev.artists || []) {
    const clean = (a || "").trim();
    const norm = normalizeArtistName(clean);
    if (norm.length < 2 || norm.length > 50 || TRIVIAL_HEADLINERS.has(norm)) continue;
    valid.push({ clean, norm });
  }
  if (valid.length === 0) return [];
  const evName = normalizeArtistName(ev.name || "");
  for (const a of valid) a.named = evName.includes(a.norm) ? 1 : 0;
  valid.sort((a, b) => b.named - a.named);
  return valid.map(a => a.clean);
}

// Cache de BYTES de las fotos: el CDN de Deezer banea IPs que lo golpean
// seguido (nos pasó en dev), así que cada foto se le pide UNA vez por TTL y
// después se sirve desde acá — el backfill valida y el proxy sirve del mismo
// cache sin volver al CDN.
const artistImageBytes = new Map();   // cdn url → { buf, type, ts } | { placeholder:true, ts }
const ARTIST_IMAGE_BYTES_MAX = 200;   // ~100KB c/u → tope ~20MB
// Cuando el CDN nos banea (403/429) seguir pegándole alarga el ban: se pausa
// un rato y los misses fallan rápido (el front cae a inicial / póster).
const ARTIST_CDN_PAUSE_MS = 30 * 60 * 1000;
let artistCdnPausedUntil = 0;

const artistImageHashes = new Map();   // md5 de bytes → primera cdn url vista
const genericArtistHashes = new Set();  // md5 vistos bajo 2+ artistas = avatar genérico

// Las fotos también van a disco: con el cache solo en memoria, cada reinicio
// o deploy volvía a pedirle todas las fotos al CDN de Deezer, que banea la
// IP por volumen (nos pasó en sept 2026 y el line-up quedó sin fotos).
const ARTIST_IMG_DIR = join(SNAPSHOT_DIR, "artist-img");
const artistImgFile = (cdnUrl) => join(ARTIST_IMG_DIR, crypto.createHash("md5").update(cdnUrl).digest("hex"));
try { mkdirSync(ARTIST_IMG_DIR, { recursive: true }); } catch {}
async function readArtistImageFromDisk(cdnUrl) {
  const f = artistImgFile(cdnUrl);
  try { await readFile(f + ".none"); return { placeholder: true, ts: Date.now() }; } catch {}
  try { return { buf: await readFile(f + ".jpg"), type: "image/jpeg", ts: Date.now() }; } catch {}
  return null;
}
function writeArtistImageToDisk(cdnUrl, entry) {
  const f = artistImgFile(cdnUrl);
  (entry.placeholder ? writeFile(f + ".none", "") : writeFile(f + ".jpg", entry.buf))
    .catch((e) => console.warn("[artist-image] disco:", e.message));
}
// Entrada en el cache de bytes con tope (LRU por orden de inserción).
function setArtistImageBytes(cdnUrl, entry) {
  artistImageBytes.delete(cdnUrl);
  if (artistImageBytes.size >= ARTIST_IMAGE_BYTES_MAX) artistImageBytes.delete(artistImageBytes.keys().next().value);
  artistImageBytes.set(cdnUrl, entry);
}

async function fetchArtistImageBytes(cdnUrl) {
  const hit = artistImageBytes.get(cdnUrl);
  if (hit && Date.now() - hit.ts < ARTIST_IMAGE_TTL) {
    setArtistImageBytes(cdnUrl, hit);   // bump LRU: las fotos calientes no se evictan
    return hit;
  }
  const disk = await readArtistImageFromDisk(cdnUrl);
  if (disk) { setArtistImageBytes(cdnUrl, disk); return disk; }
  if (Date.now() < artistCdnPausedUntil) throw new Error("CDN paused");
  const r = await fetchSafe(cdnUrl, {}, 8000);
  if (!r.ok) {
    if (r.status === 403 || r.status === 429) artistCdnPausedUntil = Date.now() + ARTIST_CDN_PAUSE_MS;
    throw new Error(`CDN ${r.status}`);
  }
  let entry;
  // El CDN redirige al avatar genérico cuando el artista no tiene foto real.
  if (isDeezerPlaceholderUrl(r.url || "")) {
    try { r.body?.cancel?.(); } catch {}
    entry = { placeholder: true, ts: Date.now() };
  } else {
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) throw new Error("Too large");
    // Avatar genérico con URL "real": los mismos bytes bajo URLs de dos
    // artistas distintos no son la foto de ninguno de los dos.
    const hash = crypto.createHash("md5").update(buf).digest("hex");
    const firstUrl = artistImageHashes.get(hash);
    if (firstUrl && firstUrl !== cdnUrl) {
      genericArtistHashes.add(hash);
      const first = artistImageBytes.get(firstUrl);
      if (first) artistImageBytes.set(firstUrl, { placeholder: true, ts: first.ts });
      writeArtistImageToDisk(firstUrl, { placeholder: true });   // .none gana sobre el .jpg
    } else if (!firstUrl) {
      if (artistImageHashes.size >= ARTIST_IMAGE_BYTES_MAX * 2) artistImageHashes.delete(artistImageHashes.keys().next().value);
      artistImageHashes.set(hash, cdnUrl);
    }
    entry = genericArtistHashes.has(hash)
      ? { placeholder: true, ts: Date.now() }
      : { buf, type: r.headers.get("content-type") || "image/jpeg", ts: Date.now() };
  }
  setArtistImageBytes(cdnUrl, entry);
  writeArtistImageToDisk(cdnUrl, entry);
  return entry;
}

async function fetchArtistImage(name, family = "") {
  const norm = normalizeArtistName(name);
  if (!norm) return null;
  // La verificación por género depende de la familia: mismo nombre, veredictos
  // distintos para una fiesta de techno y para un recital.
  const key = DEEZER_VERIFY_FAMILIES.has(family) ? `${family}:${norm}` : norm;
  const hit = artistImageCache.get(key);
  if (hit && Date.now() - hit.ts < ARTIST_IMAGE_TTL) return hit.image;
  // Dedup de requests concurrentes: el mismo DJ suele headlinear varios
  // eventos candidatos a la vez y no queremos golpear Deezer/CDN por cada uno.
  const inflight = artistImageInflight.get(key);
  if (inflight) return inflight;
  const p = resolveArtistImage(name, norm, family, key).finally(() => artistImageInflight.delete(key));
  artistImageInflight.set(key, p);
  return p;
}

async function resolveArtistImage(name, norm, family, key) {
  // Un null solo se cachea si es definitivo (sin match o placeholder); las
  // fallas transitorias (cuota de Deezer, CDN caído) se reintentan después.
  let image = null;
  let definitive = false;
  try {
    const list = await deezerSearchArtist(name);
    if (list) {
      definitive = true;
      const exact = list.find(a => normalizeArtistName(a.name) === norm);
      const match = exact && (await deezerVerified(exact, family)) ? exact : null;
      const pic = deezerPickPicture(match);
      if (pic) {
        // Bajar los bytes valida (descarta el placeholder tras redirect) y
        // deja la foto lista en cache para que el proxy no re-toque el CDN.
        const bytes = await fetchArtistImageBytes(pic);
        if (!bytes.placeholder) image = sanitizeUrl(pic);
      }
    }
  } catch { definitive = false; }

  if (definitive) {
    if (artistImageCache.size >= ARTIST_IMAGE_CACHE_MAX) {
      const oldest = artistImageCache.keys().next().value;
      artistImageCache.delete(oldest);
    }
    artistImageCache.set(key, { image, ts: Date.now() });
  }
  return image;
}

// El CDN de Deezer devuelve 403 a hotlinks cross-site del browser (Sec-Fetch),
// así que la foto se sirve proxeada por acá. URLs content-hashed → immutable.
app.get("/api/artist-image", async (req, res) => {
  const raw = (req.query.u || "").toString();
  let url;
  try { url = new URL(raw); } catch { return res.status(400).json({ error: "Invalid url" }); }
  if (url.protocol !== "https:" || url.hostname !== "cdn-images.dzcdn.net") {
    return res.status(400).json({ error: "Host not allowed" });
  }
  try {
    // Normalmente ya está en cache (el backfill bajó los bytes al validar);
    // el CDN solo se toca en un miss real.
    const bytes = await fetchArtistImageBytes(url.toString());
    if (bytes.placeholder) return res.status(404).json({ error: "Placeholder" });
    res.set("Content-Type", bytes.type);
    res.set("Cache-Control", "public, max-age=604800, immutable");
    res.send(bytes.buf);
  } catch (e) {
    console.error("[artist-image]", e.message);
    res.status(502).json({ error: "Fetch failed" });
  }
});

// Muta los eventos in place (son los mismos objetos que quedan en la cache
// del feed, así los requests siguientes ya ven las fotos resueltas).
async function enrichArtistImages(events) {
  const candidates = events
    .filter(ev => !ev.image && ev.family !== "festival")
    .map(ev => ({ ev, heads: pickHeadliners(ev).slice(0, 3) }))
    .filter(c => c.heads.length > 0);
  if (candidates.length === 0) return;
  let found = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < candidates.length) {
      const { ev, heads } = candidates[idx++];
      for (const who of heads) {
        const img = await fetchArtistImage(who, ev.family);
        if (img) {
          ev.artistImage = `/api/artist-image?u=${encodeURIComponent(img)}`;
          ev.artistImageName = who;   // la etiqueta del front debe nombrar a quien sale en la foto
          found++;
          break;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: ARTIST_IMAGE_CONCURRENCY }, worker));
  console.log(`[events] Artist images: ${found}/${candidates.length} sin flyer resueltos vía Deezer`);
}
  return { enrichArtistImages, ARTIST_IMAGE_BUDGET_MS };
}

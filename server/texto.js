// Texto de los feeds: entidades HTML, títulos limpios (sin la marca del medio),
// fechas relativas, la imagen de cada ítem y el último dato bueno por fuente.
// Separado de server.js en oct 2026.

import { XMLParser } from "fast-xml-parser";
import { escRe, stripTemplateTokens } from "../lib/content-rules.js";

export const xmlParser = new XMLParser({
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
  .map(escRe)
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
  // Latin-1 acentuado. Estaban sueltas dentro de htmlToText y se perdieron al
  // unificar los decodificadores; los feeds en español las usan todo el tiempo.
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Uuml: "Ü",
  ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç",
  agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù",
  acirc: "â", ecirc: "ê", icirc: "î", ocirc: "ô", ucirc: "û",
  auml: "ä", euml: "ë", ouml: "ö", Auml: "Ä", Ouml: "Ö",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  aring: "å", oslash: "ø", szlig: "ß", aelig: "æ",
  iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", sect: "§", para: "¶",
  frac12: "½", frac14: "¼", sup2: "²", sup3: "³", acute: "´",
};
// Una pasada de decodificación. No se usa directamente: la envuelve
// decodeHtmlEntities, que repite hasta estabilizar.
function decodeEntitiesOnce(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      // fromCodePoint tira RangeError si n > 0x10FFFF: acotamos al rango válido
      // Unicode o devolvemos la entidad literal para no abortar el parse del feed.
      return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : _;
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const c = parseInt(n, 10);
      return c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : _;
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

// Varios feeds mandan el texto doble-codificado ("&amp;#8216;"). Con una sola
// pasada quedaba "&#8216;" literal en pantalla: el paso numérico corre antes
// que el de nombres, así que cuando "&amp;" recién se convierte en "&" ya no
// hay quien mire el "&#8216;" que acaba de aparecer. Se repite hasta que el
// texto no cambia, con tope de pasadas para no iterar de más ante una cadena
// armada a propósito.
const ENTITY_DECODE_MAX_PASSES = 3;
export function decodeHtmlEntities(s) {
  let t = String(s);
  for (let i = 0; i < ENTITY_DECODE_MAX_PASSES; i++) {
    const next = decodeEntitiesOnce(t);
    if (next === t) break;
    t = next;
  }
  return t;
}

// Limpia un título RSS: decodifica entidades, stripea tags, quita prefijo/sufijo
// de fuente, colapsa whitespace y trunca. El orden importa: decodificar PRIMERO
// para que `&lt;b&gt;` se convierta en `<b>` y la pasada de strip lo elimine.
export function cleanNewsTitle(raw) {
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
  // Plantillas sin completar del CMS de origen ("…del mercado [FECHA]").
  t = stripTemplateTokens(t);
  t = t.replace(/\s{2,}/g, " ").trim();
  return t.slice(0, 140);
}

// Common timezone abbreviations Node's Date parser doesn't accept (BST, EDT, etc.)
const TZ_OFFSETS = {
  BST:"+0100", GMT:"+0000", UTC:"+0000",
  EST:"-0500", EDT:"-0400", CST:"-0600", CDT:"-0500", MST:"-0700", MDT:"-0600", PST:"-0800", PDT:"-0700",
  CET:"+0100", CEST:"+0200", AEST:"+1000", AEDT:"+1100", JST:"+0900",
};
export function normalizeDateString(s) {
  if (!s) return s;
  return String(s).replace(/\b([A-Z]{2,5})\b\s*$/, (m, abbr) => TZ_OFFSETS[abbr] || m);
}

export function relativeTime(dateStr) {
  if (!dateStr) return "";
  const ms = new Date(normalizeDateString(dateStr)).getTime();
  if (isNaN(ms)) return "";
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 0) return "now";
  if (mins < 60) return mins + "m";
  if (mins < 1440) return Math.floor(mins / 60) + "h";
  return Math.floor(mins / 1440) + "d";
}

export function timeToMins(t) {
  if (!t) return 99999;
  const n = parseInt(t) || 99999;
  if (t.endsWith("m")) return n;
  if (t.endsWith("h")) return n * 60;
  if (t.endsWith("d")) return n * 1440;
  return 99999;
}

export function sanitizeUrl(url) {
  const str = decodeHtmlEntities(String(url || "").trim());
  if (str.startsWith("https://") || str.startsWith("http://")) return str;
  return "";
}

// Strip HTML, decode named entities, collapse whitespace.
// Convierte HTML en texto plano. La decodificación de entidades la delega en
// decodeHtmlEntities: antes tenía su propia tabla hardcodeada que no cubría las
// entidades hex más allá de &#x27;, y por eso las comillas tipográficas
// (&#x2019;, &#x201C;) salían literales en las descripciones de noticias.
export function htmlToText(s) {
  if (!s) return "";
  return decodeHtmlEntities(
    String(s)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
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

export function pickItemImage(item, descStr) {
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

// Per-source last-good cache: si una fuente devuelve 0 ítems en un ciclo
// (caída temporal, rate-limit, schema change), reutilizamos sus últimos ítems
// buenos en lugar de borrarlos del feed durante 30min. Tiene techo: si la
// fuente sigue caída, eventualmente sus ítems caerán fuera del cap de edad.
const bassNewsLastGood = new Map(); // slug → { items, ts }
const BASS_NEWS_LAST_GOOD_MAX_AGE_MS = 24 * 60 * 60 * 1000; // descartar fallback si lleva +24h sin éxito

export async function fetchSourceWithFallback(slug, fetcher, label = "bass-news") {
  let items = [];
  try { items = await fetcher(); } catch (e) {
    console.error(`[${label}] ${slug}: fetch threw — ${e.message}`);
  }
  if (Array.isArray(items) && items.length > 0) {
    bassNewsLastGood.set(slug, { items, ts: Date.now() });
    return items;
  }
  const last = bassNewsLastGood.get(slug);
  if (last && (Date.now() - last.ts) < BASS_NEWS_LAST_GOOD_MAX_AGE_MS) {
    const ageMin = Math.round((Date.now() - last.ts) / 60_000);
    console.log(`[${label}] ${slug}: 0 ítems frescos, reutilizando últimos buenos (${last.items.length} ítems, hace ${ageMin}m)`);
    return last.items;
  }
  return [];
}

// Recalcula time/_mins desde _pubDate. Necesario para fallbacks: ítems
// cacheados pueden tener varias horas y la edad relativa debe reflejar ahora.
export function refreshItemAges(items) {
  return items.map((item) => {
    if (!item._pubDate) return item;
    const rel = relativeTime(item._pubDate);
    if (!rel) return item;
    return { ...item, time: rel, _mins: timeToMins(rel) };
  });
}

export function normalizeArtistName(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

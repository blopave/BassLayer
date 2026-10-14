// Bass: las fuentes de la agenda — QuéHacemos, Venti, Buenos Aliens y RA (GraphQL y página).
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`;
// devuelve los lectores de cada fuente que arma buildEvents.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NOT_A_SHOW_TITLE, artistasDelTitulo, esDeLaEscena } from "../lib/content-rules.js";
import { detectCity, enCABA } from "../lib/places.js";
import { decodeHtmlEntities, sanitizeUrl } from "./texto.js";

export function montarAgendaFuentes(app, d) {
  const { BA_MONTHS, BROWSER_HEADERS, MONTHS_ES, SNAPSHOT_DIR, VENUE_TBA, cache, detectGenre, fetchSafe, inferBaMonth, safeText, saveSnapshot, withCity } = d;

// ─────────────────────────────────────────────
//  QuéHacemos — agenda multi-género de Argentina (Fechitas API, sin key)
//  GET /api/v1/events?date_from&date_to&limit(<=1000). offset/category/city
//  se ignoran → filtramos música + provincia client-side. Paginamos por
//  cursor de fecha porque una ventana ancha satura con el día más cercano.
// ─────────────────────────────────────────────

// Con la barra final: sin ella la API redirige https → http → https (sept
// 2026) y el salto por http a veces falla, dejando la agenda sin QuéHacemos.
const QH_API = "https://api.quehacemos.com.ar/api/v1/events/";
// "fiesta" excluido a propósito: mezcla fiestas electrónicas (ya cubiertas por
// RA/BA/electronica) con eventos privados (cumpleaños, "sweet 16") = ruido.
const QH_MUSIC_TYPES = new Set(["recital", "electronica", "festival", "cuarteto"]);
const QH_PROVINCES = new Set(["Buenos Aires"]);   // foco audiencia; ampliable
const QH_WINDOW_DAYS = 75;
const QH_MAX_PAGES = 8;
// Tope DESPUÉS del filtro de escena (oct 2026): antes cortaba los 80 primeros
// de toda la cartelera musical y, con ~950 en 3 semanas, la agenda perdía todo
// lo de QuéHacemos después del 3.er día (y con eso, los de lunes a jueves).
const QH_MAX_EVENTS = 150;

// ── Filtro anti-no-musical (QuéHacemos) ──
// El `event_type` de la fuente no es confiable: obras de teatro, musicales,
// stand up y cine entran tipeados como "recital" o "festival". Bass es agenda
// musical, así que se descartan con dos señales complementarias:
//   1. léxico escénico en título+descripción, contrapesado por léxico musical;
//   2. salas exclusivamente teatrales sin ninguna señal musical.
// Ninguna sola alcanza: hay obras con descripción larga y cero léxico escénico
// (se cazan por sala) y música en salas teatrales (sobrevive por léxico musical).

const NON_MUSIC_MARKERS = [
  [2, /\bobra de teatro\b/i],
  [2, /\bdramaturg(ia|o|a)\b/i],
  [2, /\belenco\b/i],
  [2, /\bunipersonal(es)?\b/i],
  [2, /\bstand[\s-]?up\b/i],
  [2, /\bmon[oó]logo\b/i],
  [2, /\bhumorista\b/i],
  [2, /\bteatro (musical|independiente|off)\b/i],
  [2, /\bteatralidad\b/i],
  [2, /\bversi[oó]n teatral\b/i],
  [2, /\b[eé]xito cinematogr[aá]fic[oa]\b/i],
  [2, /\bllega al teatro\b/i],
  [2, /\bobras cortas\b/i],
  [2, /\bel musical\b/i],
  [2, /\bcomedia (musical|teatral|dram[aá]tica)\b/i],
  [2, /\b(cortometraje|largometraje|pel[ií]cula|documental)\b/i],
  [2, /\b(proyecci[oó]n|preestreno)\b/i],
  [2, /\b(exposici[oó]n|muestra de arte|vernissage)\b/i],
  [2, /\b(conferencia|seminario|taller|masterclass|charla)\b/i],
  [2, /\b(puro humor|show de humor|noche de humor)\b/i],
  [1, /\bpuesta en escena\b/i],
  [1, /\b(la|una|esta|su) obra\b/i],
  [1, /\bdirigid[oa] por\b/i],
  [1, /\bdirecci[oó]n (art[ií]stica|general|teatral)\b/i],
  [1, /\bescrita? por\b/i],
  [1, /\b(actores|actrices|actriz)\b/i],
  [1, /\bprotagoniz(a|an|ada|ado)\b/i],
  [1, /\bespect[aá]culo teatral\b/i],
];

const MUSIC_MARKERS = [
  [2, /\bm[uú]sica en vivo\b/i],
  [2, /\b(recital|concierto)\b/i],
  [2, /\bpresenta su (nuevo |primer |segundo )?(disco|[aá]lbum|ep)\b/i],
  [2, /\bnuevo (disco|[aá]lbum)\b/i],
  [2, /\b(dj|dj set|b2b|line[\s-]?up|after|rave)\b/i],
  [2, /\b(su|la) gira\b|\bgira \d{4}\b|\bgira (nacional|mundial|latinoamericana|argentina)\b/i],
  [2, /\b(canciones|cancionero|repertorio|setlist)\b/i],
  [2, /\b(la|su|una) banda\b/i],
  [2, /\b(tributo|homenaje)\b/i],
  [1, /\b(rock|pop|jazz|blues|cumbia|tango|folclore|folklore|reggae|ska|metal|punk|indie|trap|reggaet[oó]n|hip[\s-]?hop|electr[oó]nica|techno|house|cuarteto|sinfon)\b/i],
  [1, /\b(cantante|m[uú]sico|guitarra|bater[ií]a|bajo|vocalista|orquesta|cuarteto|d[uú]o|tr[ií]o)\b/i],
];

// En una sala teatral, "recital"/"concierto" se usan sueltos para cualquier
// espectáculo ("Puro Cuento es un recital minimalista"), así que ahí no cuentan
// como prueba de música: hace falta una señal más específica.
const MUSIC_MARKERS_STRICT = MUSIC_MARKERS.filter(([, re]) => !/recital/.test(String(re)));

// Salas de teatro puro de CABA/GBA. Deliberadamente NO incluye salas mixtas
// (Gran Rex, Ópera, Coliseo, Broadway, Vorterix) donde el recital es la norma.
const THEATER_VENUES = [
  "multitabaris", "multiteatro", "paseo la plaza", "picadero", "el nacional",
  "lola membrives", "metropolitan", "teatro liceo", "regio", "camarín de las musas",
  "camarin de las musas", "la carpintería", "la carpinteria", "timbre 4", "maipo",
  "chacarerean", "politeama", "teatro apolo", "astral", "método kairós", "metodo kairos",
  "teatro del pueblo", "border", "el extranjero",
];

// Salas de teatro puro cuyo nombre incluye "club"/"bar" (Bululú, club de
// comedia) o que no estaban en la lista: se chequean ANTES de las pistas de
// sala musical, siempre que no haya ninguna señal musical específica.
const PURE_THEATER_VENUES = [
  "el crisol", "la maza teatro", "bululú", "bululu", "el portón de sánchez", "el porton de sanchez",
  "ítaca, complejo teatral", "itaca, complejo teatral", "el taller teatro", "sala teatral inda ledesma",
];

// Exclusiones puntuales revisadas a mano (sept 2026): obras cuya descripción
// completa trae alguna palabra que el filtro lee como música. Título
// normalizado (qhNormTitle). Mantener corta: si crece, falta una regla.
const QH_MANUAL_EXCLUDE = new Set(["problema 1", "microdosis de sexo en savia"]);

// Salas de música que viven dentro de un complejo teatral (Cervelar y The
// Cavern en Paseo La Plaza) o cuyo nombre ya declara que son sala de shows.
// Anulan el match por sala teatral: ahí sí hay recitales.
const MUSIC_VENUE_HINTS = /\b(bar|club|pub|live|caver|cavern|cervelar|boliche|disco|arena|estadio)\b/i;

// Tipos que la fuente sí clasifica bien: si un título aparece además bajo uno
// de estos, el "recital" es la ficha duplicada del mismo show no musical.
// "teatro" queda afuera a propósito: la fuente lo usa para cualquier cosa que
// pase en una sala, y arrastraría recitales legítimos (p. ej. Sandra Mihanovich).
const QH_NON_MUSIC_TYPES = new Set(["cine", "stand up", "charla", "arte", "expo", "deporte", "gastronomia"]);

const qhStripDesc = (s) =>
  String(s || "").replace(/&lt;\|&gt;/g, " ").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ");
const qhNormTitle = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const markerScore = (markers, t) => markers.reduce((n, [w, re]) => (re.test(t) ? n + w : n), 0);

// Índice de títulos publicados por la fuente bajo un tipo no musical.
function qhNonMusicTitles(events) {
  const out = new Set();
  for (const e of events) {
    if (!QH_NON_MUSIC_TYPES.has(e.event_type)) continue;
    const n = qhNormTitle(e.title);
    if (n.length >= 14) out.add(n);   // títulos cortos generan falsos positivos
  }
  return out;
}

function isNonMusicalQHEvent(e, nonMusicTitles) {
  // "cuarteto" es el único event_type con nombre de género: la fuente no lo usa
  // para teatro, y su descripción a veces pertenece a otro show (bug de origen).
  if (e.event_type === "cuarteto") return false;

  if (NOT_A_SHOW_TITLE.test(e.title || "")) return true;
  if (QH_MANUAL_EXCLUDE.has(qhNormTitle(e.title))) return true;

  if (nonMusicTitles && nonMusicTitles.size) {
    const n = qhNormTitle(e.title);
    for (const t of nonMusicTitles) {
      if (t === n || n.includes(t) || (n.length >= 14 && t.includes(n))) return true;
    }
  }

  const text = `${e.title || ""} ${qhStripDesc(e.description)}`;
  const nonMusic = markerScore(NON_MUSIC_MARKERS, text);
  const music = markerScore(MUSIC_MARKERS, text);
  if (nonMusic >= 2 && nonMusic > music) return true;

  const musicStrict = markerScore(MUSIC_MARKERS_STRICT, text);
  const venue = (e.venue || "").toLowerCase();
  if (musicStrict === 0 && !MUSIC_VENUE_HINTS.test(venue) && THEATER_VENUES.some(v => venue.includes(v))) return true;
  if (musicStrict === 0 && PURE_THEATER_VENUES.some(v => venue.includes(v))) return true;

  return false;
}

// Descarta la descripción cuando no aporta nada sobre el título. La fuente
// autogenera muchas con la plantilla "{título} en {venue}" (48 de 76 medidas):
// mostrarlas hacía que el venue apareciera cuatro veces en la misma ficha.
function qhDescriptionIsRedundant(desc, title) {
  if (!desc || !title) return false;
  const norm = (x) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const d = norm(desc), t = norm(title);
  if (!t) return false;
  // Plantillas de ticketeras que sólo repiten el nombre del evento.
  if (/^evento (en|disponible en)\b/.test(d)) return true;
  if (/\bevento disponible en\b/.test(d) && d.length < t.length + 40) return true;
  // "TÍTULO en VENUE" y variantes: arranca igual y casi no agrega texto.
  return d.startsWith(t.slice(0, 40)) && d.length < t.length * 1.6 + 30;
}

function qhCleanDescription(desc, title) {
  if (!desc) return null;
  if (qhDescriptionIsRedundant(desc, title)) return null;
  // El separador propio de la fuente ("&lt;|&gt;") y las entidades sueltas se
  // resuelven acá: es el único lugar por el que pasa la descripción antes de
  // llegar a la ficha del evento.
  let t = decodeHtmlEntities(String(desc)).replace(/\s*<\|>\s*/g, " ").replace(/\s+/g, " ");
  const cut = t.search(/Este evento requiere|Descarga la aplicaci[oó]n|Validaci[oó]n por|No hay medios de pago|CUIT|Smart Tickets|Al realizar la compra|Recuerde no incluir/i);
  if (cut > 40) t = t.slice(0, cut);
  t = t.trim();
  if (t.length > 320) { const dot = t.lastIndexOf(".", 320); t = t.slice(0, dot > 120 ? dot + 1 : 320).trim(); }
  return t || null;
}

function mapQHEvent(e) {
  const md = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(e.date || "");
  if (!md || !e.title) return null;
  const monthIdx = parseInt(md[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  const hh = md[4], mm = md[5];
  const time = (hh === "00" && mm === "00") ? "" : `${hh}:${mm}`;   // T00:00 = hora desconocida, no inventamos
  const venue = (e.venue || "TBA").slice(0, 60);
  const city = e.city || detectCity(venue, e.address || "", e.title) || "";
  const priceNum = Number(e.min_price);
  return {
    day: md[3],
    month: MONTHS_ES[monthIdx],
    name: String(e.title).slice(0, 90),
    venue,
    address: e.address || (e.city ? `${venue}, ${e.city}` : venue),
    city,
    region: "AR",
    artists: [],
    time,
    genre: "",                       // se completa en la clasificación (label de familia)
    url: sanitizeUrl(e.link || e.ticket_url),
    image: sanitizeUrl(e.image_url) || null,
    source: "quehacemos",
    event_type: e.event_type,        // insumo para classifyFamily
    ...(e.tipo_fuente ? { tipo_fuente: e.tipo_fuente } : {}),   // "otro"/"fiesta": ver esDeLaEscena
    description: qhCleanDescription(e.description, e.title),
    ticket_price: (isFinite(priceNum) && priceNum > 0) ? priceNum : null,
  };
}

async function fetchQueHacemos() {
  try {
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    const now = new Date();
    const dateTo = new Date(now.getTime() + QH_WINDOW_DAYS * 86400000);
    const dateToStr = `${dateTo.getFullYear()}-${pad(dateTo.getMonth() + 1)}-${pad(dateTo.getDate())}T23:59:59`;

    const byId = new Map();
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());   // hoy 00:00 local
    for (let page = 0; page < QH_MAX_PAGES; page++) {
      const url = `${QH_API}?date_from=${encodeURIComponent(iso(cursor))}&date_to=${encodeURIComponent(dateToStr)}&limit=1000`;
      const r = await fetchSafe(url, { headers: { ...BROWSER_HEADERS, Accept: "application/json" } }, 12000);
      if (!r.ok) { console.error(`[events] QuéHacemos API ${r.status}`); break; }
      const arr = JSON.parse(await safeText(r, 5 * 1024 * 1024));
      if (!Array.isArray(arr) || arr.length === 0) break;
      let maxDate = cursor;
      for (const e of arr) {
        if (e.id != null) byId.set(e.id, e);
        const d = new Date(e.date);
        if (!isNaN(d) && d > maxDate) maxDate = d;
      }
      if (arr.length < 1000) break;                       // no truncado → cubrimos toda la ventana
      const next = new Date(maxDate.getTime() + 1000);    // avanzar el cursor de fecha
      cursor = (next <= cursor) ? new Date(cursor.getTime() + 86400000) : next;   // día saturado → forzar +1d
      if (cursor > dateTo) break;
    }

    const mapped = [];
    let skippedNonMusical = 0;
    const nonMusicTitles = qhNonMusicTitles(byId.values());
    for (const e of byId.values()) {
      // "otro" y "fiesta" entran como electrónica; esDeLaEscena les exige
      // vocabulario fuerte por su tipo original (tipo_fuente).
      const tipo = QH_MUSIC_TYPES.has(e.event_type) ? e.event_type
        : e.event_type === "otro" || e.event_type === "fiesta" ? "electronica" : null;
      if (!tipo) continue;
      if (QH_PROVINCES.size && !QH_PROVINCES.has(e.province)) continue;
      if (isNonMusicalQHEvent(e, nonMusicTitles)) { skippedNonMusical++; continue; }
      const ev = mapQHEvent({ ...e, event_type: tipo, tipo_fuente: tipo !== e.event_type ? e.event_type : undefined });
      // Solo la escena llega a la agenda (sceneOnly lo vuelve a exigir con la familia):
      // filtrar acá deja el tope para lo que importa.
      if (!ev || !esDeLaEscena(ev)) continue;
      mapped.push({ d: e.date || "", ev });
    }
    if (skippedNonMusical > 0) console.log(`[events] QuéHacemos: ${skippedNonMusical} eventos no musicales descartados`);
    mapped.sort((a, b) => a.d.localeCompare(b.d));
    return mapped.slice(0, QH_MAX_EVENTS).map((x) => x.ev);
  } catch (e) {
    console.error("[events] QuéHacemos error:", e.message);
    return [];
  }
}

// ── Venti (oct 2026): boletera con JSON público ──
// robots.txt permite /api/event/* y pide Crawl-delay 10. La búsqueda vacía
// devuelve todo (≈14 páginas de 25, por fecha) con descripción y categoría.
// Aporta fiestas de semana que RA publica tarde y que QuéHacemos trae sin datos
// (Not Welcome, jueves en Tokyo Club). Se lee en segundo plano cada 6 h con 10 s
// entre pedidos y la build usa el último lote (el crudo se guarda en disco, así
// las reglas nuevas se aplican sin volver a pedir).
const VENTI_API = "https://venti.com.ar/api/event/search?searchQuery=";
const VENTI_TTL = 6 * 60 * 60_000, VENTI_DELAY = 10_500, VENTI_MAX_PAGES = 20;
let venti = { ts: 0, raw: [] }, ventiLoading = false, ventiMapeado = { ts: -1, list: [] };
// El último lote, con el mismo formato que los snapshots ({ ts, data }).
try {
  const f = join(SNAPSHOT_DIR, "venti.json");
  // Sin eventos (o un archivo de otro formato) cuenta como vacío: se vuelve a leer.
  if (existsSync(f)) { const { ts, data } = JSON.parse(readFileSync(f, "utf8")); venti = Array.isArray(data) && data.length ? { ts, raw: data } : { ts: 0, raw: [] }; }
} catch (e) { console.warn("[cache] snapshot venti:", e.message); }

const BA_PARTES = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function mapVenti(e) {
  // Solo fiestas: los "conciertos" de Venti son casi todos bandas.
  if (e?.category !== "party" || e?.venue?.city?.name !== "Buenos Aires" || !e.name || !e.startDate) return null;
  const p = Object.fromEntries(BA_PARTES.formatToParts(new Date(e.startDate)).map((x) => [x.type, x.value]));
  if (!p.year) return null;
  const venue = String(e.venue.placeName || e.placeName || "").trim().slice(0, 60) || "TBA";
  const address = [e.venue.placeName, e.venue.readableAddress].filter(Boolean).join(", ");
  const ev = {
    day: p.day, month: MONTHS_ES[+p.month - 1], name: String(e.name).replace(/\s+/g, " ").trim().slice(0, 90),
    venue, address, city: detectCity(venue, address, e.name) || (enCABA(e.venue.latitude, e.venue.longitude) ? "CABA" : ""), region: "AR", artists: [],
    time: `${p.hour}:${p.minute}`, genre: "", url: `https://venti.com.ar/evento/${encodeURIComponent(e.urlName || "")}`,
    image: sanitizeUrl(e.bannerImg || e.promoImg) || null, source: "venti",
    description: String(e.description || "").replace(/\s+/g, " ").trim().slice(0, 600),
  };
  // Las mismas reglas de escena que QuéHacemos (lib/content-rules.js).
  return esDeLaEscena(ev) ? ev : null;
}

async function refreshVenti() {
  if (ventiLoading) return;
  ventiLoading = true;
  try {
    const raw = [];
    for (let page = 1; page <= VENTI_MAX_PAGES; page++) {
      const r = await fetchSafe(`${VENTI_API}&page=${page}`, { headers: { "User-Agent": "BassLayer/1.0 (+https://basslayer.io)", Accept: "application/json" } }, 15000);
      if (!r.ok) { console.error(`[events] Venti ${r.status}`); break; }
      const d = JSON.parse(await safeText(r, 3 * 1024 * 1024));
      // Solo lo que puede entrar (fiestas en Buenos Aires), con la descripción acotada.
      for (const e of d.events || []) if (e.category === "party" && e.venue?.city?.name === "Buenos Aires") raw.push({ name: e.name, startDate: e.startDate, category: e.category, description: String(e.description || "").slice(0, 1000), urlName: e.urlName, bannerImg: e.bannerImg, promoImg: e.promoImg, placeName: e.placeName, venue: e.venue && { placeName: e.venue.placeName, readableAddress: e.venue.readableAddress, latitude: e.venue.latitude, longitude: e.venue.longitude, city: e.venue.city && { name: e.venue.city.name } } });
      if (page >= (d.totalPages || 1)) break;
      await new Promise((res) => setTimeout(res, VENTI_DELAY));
    }
    if (raw.length) {
      venti = { ts: Date.now(), raw };
      saveSnapshot("venti", raw);
      cache.events.ts = 0;   // la próxima consulta rearma la agenda con lo nuevo
      console.log(`[events] Venti: ${raw.length} leídos`);
    }
  } catch (e) {
    console.error("[events] Venti error:", e.message);
  } finally {
    ventiLoading = false;
  }
}

// Lo que haya ya (sin esperar); si está viejo, se renueva en segundo plano.
function ventiEvents() {
  if (Date.now() - (venti.ts || 0) > VENTI_TTL) refreshVenti();
  // Se mapea una vez por lote, no en cada build.
  if (ventiMapeado.ts !== venti.ts) ventiMapeado = { ts: venti.ts, list: (venti.raw || []).map(mapVenti).filter(Boolean) };
  return ventiMapeado.list;
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
          new RegExp(`(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\\s+(\\d{1,2})\\s+(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\\s+\\d{1,2}\\s+(${BA_MONTHS})\\b`, "i")
        );
        if (multiDayMatch) {
          day = multiDayMatch[1].padStart(2, "0");
          month = multiDayMatch[2].charAt(0).toUpperCase() + multiDayMatch[2].slice(1).toLowerCase();
          dateLineIdx = j;
          continue;
        }
        // Standard single-day: "SAB 11 ABR". El mes tiene que ser un mes: las
        // fiestas de día vienen "SAB 03 18hs" (sin mes) y antes "18h" quedaba
        // como mes → el evento no tenía fecha (oct 2026).
        const dateMatch = prevLines[j].match(new RegExp(`(?:VIE|SAB|DOM|LUN|MAR|MIE|JUE)\\s+(\\d{1,2})\\s+(${BA_MONTHS})\\b`, "i"));
        if (dateMatch && !DAY_NAMES.test(dateMatch[2])) {
          day = dateMatch[1].padStart(2, "0");
          month = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1).toLowerCase();
          dateLineIdx = j;
          continue;
        }
        // Sin mes ("SAB 03 18hs"): la próxima fecha con ese día, SOLO si el día
        // de la semana coincide (SAB 03 → sábado 3). Si no coincide, se descarta.
        const bare = prevLines[j].match(/^(VIE|SAB|DOM|LUN|MAR|MIE|JUE)\s+(\d{1,2})(?:\s+\d{1,2}(?::\d{2})?\s*hs?\.?)?\s*$/i);
        if (bare && !month) {
          const inferred = inferBaMonth(bare[1], Number(bare[2]));
          if (inferred) { day = bare[2].padStart(2, "0"); month = inferred; dateLineIdx = j; }
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
        ...withCity(venue, fullAddress, eventName),
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
// Áreas RA verificadas en vivo contra la GraphQL (2026-07-29). Cada evento
// hereda `region` (AR | LatAm | World) para poder filtrar sin diluir el foco
// local: el feed arranca en AR y el usuario opta a LatAm/World.
//   - AR usa el área 45 ("toda Argentina") en vez de 395 (solo Buenos Aires):
//     cubre CABA + Córdoba/Rosario/etc. La ciudad real la infiere detectCity
//     del area.name que devuelve RA. Córdoba/Rosario NO existen como áreas RA.
//   - LatAm/World: RA no expone la ciudad de forma fiable para detectCity
//     (defaultearía a CABA), así que la fijamos explícita desde `city`.
// `cap` limita cuántos eventos aporta cada ciudad para que los hubs grandes
// (Berlín, Londres) no tapen al resto; AR va sin tope.
const RA_AREAS = [
  { id: 45,  region: "AR" },
  { id: 400, region: "LatAm", city: "São Paulo",        cap: 40 },
  { id: 401, region: "LatAm", city: "Río de Janeiro",   cap: 40 },
  { id: 385, region: "LatAm", city: "Santiago",         cap: 40 },
  { id: 373, region: "LatAm", city: "Bogotá",           cap: 40 },
  { id: 374, region: "LatAm", city: "Medellín",         cap: 40 },
  { id: 399, region: "LatAm", city: "Ciudad de México", cap: 40 },
  { id: 384, region: "LatAm", city: "Montevideo",       cap: 40 },
  { id: 34,  region: "World", city: "Berlín",           cap: 25 },
  { id: 13,  region: "World", city: "Londres",          cap: 25 },
  { id: 29,  region: "World", city: "Ámsterdam",        cap: 25 },
  { id: 20,  region: "World", city: "Barcelona",        cap: 25 },
  { id: 25,  region: "World", city: "Ibiza",            cap: 25 },
  { id: 8,   region: "World", city: "Nueva York",       cap: 25 },
  { id: 19,  region: "World", city: "Detroit",          cap: 25 },
  { id: 523, region: "World", city: "Tulum",            cap: 25 },
];
// RA dropped sortOrder/sortField args and moved flyer URLs from `flyerFront` (now always null)
// to `images[]` with `type: "FLYERFRONT"`. Filter syntax also changed: `areas:{eq:N}` returns 0,
// must use `areas:{any:[N]}`.
const RA_QUERY = `query GET_DEFAULT_EVENTS_LISTING($filters:FilterInputDtoInput,$pageSize:Int,$page:Int){eventListings(filters:$filters,pageSize:$pageSize,page:$page){data{event{id title date startTime endTime contentUrl images{filename type} venue{name area{name}}artists{name}}}totalResults}}`;

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

function formatRAEvent(ev, areaMeta = { region: "AR" }) {
  const date = new Date(ev.date);
  // RA desambigua homónimos con " (2)": en pantalla es ruido y rompe el cruce entre fuentes.
  const venueName = (ev.venue?.name || "TBA").slice(0, 50);
  const artists = (ev.artists || []).map(a => String(a.name || "").replace(/\s*\(\d+\)$/, ""));
  // Los eventos que RA recibe de ALLMusicParties ("TBA - AMK Club") llegan sin
  // line-up y con los artistas en el título ("Nick Warren + Kevin Di Serna"):
  // se leen de ahí, así el line-up se ve y el cruce entre fuentes los encuentra.
  if (!artists.length && VENUE_TBA.test(venueName)) artists.push(...artistasDelTitulo(ev.title));
  const areaName = ev.venue?.area?.name || "";
  const genre = detectGenre((ev.title || "") + " " + artists.join(" "));
  const fullAddress = areaName ? `${venueName}, ${areaName}` : venueName;
  // Cada área foránea trae su ciudad fija en areaMeta.city; solo el área AR
  // ("todo el país", sin city) la infiere detectCity del area.name
  // (CABA/Córdoba/etc.). Clavamos en la presencia de city, no en la etiqueta
  // de región, para no acoplar la resolución al taxonomía de región.
  const { city, cityGuessed } = areaMeta.city ? { city: areaMeta.city } : withCity(venueName, fullAddress, ev.title || "");
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: MONTHS_ES[date.getMonth()],
    name: (ev.title || "Event").slice(0, 60),
    venue: venueName,
    address: fullAddress,
    city,
    ...(cityGuessed && { cityGuessed }),
    region: areaMeta.region,
    artists,
    time: extractRATime(ev.startTime),
    genre,
    url: ev.contentUrl ? `https://ra.co${ev.contentUrl}` : "",
    image: pickRAFlyer(ev.images) || ev.flyerFront || null,
    source: "ra",
  };
}

async function fetchRAGraphQL(area) {
  const today = new Date().toISOString().split("T")[0];
  // Ventana de 60 días, de a 100 por página. Argentina ya pasa los 100 (oct
  // 2026: 106) y con una sola página se perdían los más lejanos: si RA dice que
  // hay más, se pide la siguiente (hasta 3). Las áreas con tope no lo necesitan.
  const windowEnd = new Date(Date.now() + 60*86400000).toISOString().split("T")[0];
  const page = async (n) => {
    const r = await fetchSafe(RA_GRAPHQL, {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "Content-Type":"application/json", Referer:"https://ra.co/events", Origin:"https://ra.co", Accept:"application/json" },
      body: JSON.stringify({ query: RA_QUERY, variables: { filters: { areas:{any:[area.id]}, listingDate:{gte:today,lte:windowEnd} }, pageSize:100, page:n } }),
    }, 12000);
    if (!r.ok) return null;
    return JSON.parse(await safeText(r))?.data?.eventListings || null;
  };
  try {
    const first = await page(1);
    if (!first) return [];
    let listings = first.data || [];
    for (let n = 2; !area.cap && n <= 3 && listings.length < (first.totalResults || 0); n++) {
      const more = (await page(n).catch(() => null))?.data || [];
      if (!more.length) break;
      listings = listings.concat(more);
    }
    if (area.cap) listings = listings.slice(0, area.cap);
    return listings.map(l => formatRAEvent(l.event, area));
  } catch (e) {
    console.error(`[events] RA GraphQL (${area.id}):`, e.message);
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

  // Para el arranque (venti cambia: se pasa la función, no el valor).
  const refrescarVentiSiViejo = () => { if (Date.now() - (venti.ts || 0) > VENTI_TTL) refreshVenti(); };

  return { qhNormTitle, fetchQueHacemos, fetchBuenosAliens, fetchRAGraphQL, fetchRAHtml, RA_AREAS, ventiEvents, refrescarVentiSiViejo };
}

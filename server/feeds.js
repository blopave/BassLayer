// Lo que se comparte y se suscribe: imágenes OG, calendario .ics, RSS de la agenda y sitemap.
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`;
// devuelve los armadores que también usa el prerender.

import { generateEventOG, generateEventStory, generateFestivalOG, generateNewsOG, generateSemanaOG } from "../og.js";
import { slugify } from "../lib/slug.js";

export function montarFeeds(app, d) {
  const { GENRE_LIST, MONTH_MAP, PROD_ORIGIN, cached, eventSlug, festivalSlug, festivalStatus, findEventBySlug, findFestivalBySlug, findNewsBySlug, genreSlug, loadFestivals, loadGuias, semanaData } = d;

// OG image dinámica — generada con satori + resvg-js, cacheada 1-24h.
// Las rutas devuelven PNG 1200×630 branded por evento / festival / noticia.
//
// Cache LRU acotado en memoria: la generación (satori+resvg) es CPU-bound, así
// que guardamos el PNG ya renderizado por slug para no re-generar en cada hit
// (defensa contra el amplification/DoS descrito arriba). Bounded → sin fuga.
const OG_CACHE_MAX = 200;
const ogCache = new Map(); // key -> { buf, exp }
function ogCacheGet(key) {
  const e = ogCache.get(key);
  if (!e) return null;
  if (e.exp < Date.now()) { ogCache.delete(key); return null; }
  ogCache.delete(key); ogCache.set(key, e); // bump LRU
  return e.buf;
}
function ogCacheSet(key, buf, ttlMs) {
  if (ogCache.size >= OG_CACHE_MAX) ogCache.delete(ogCache.keys().next().value);
  ogCache.set(key, { buf, exp: Date.now() + ttlMs });
}

app.get("/og/semana.png", async (req, res) => {
  try {
    const S = await semanaData();
    const key = `semana:${S.semana.anio}-${S.semana.numero}:${S.noche.fiestas}:${S.mercado.btc ? S.mercado.btc.cambio7d.toFixed(1) : ""}`;
    let png = ogCacheGet(key);
    if (!png) { png = await generateSemanaOG(S); ogCacheSet(key, png, 3600_000); }
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.send(png);
  } catch (e) {
    console.error("[og/semana] error:", e.message);
    res.status(500).end();
  }
});

app.get("/og/event/:slug.png", async (req, res) => {
  try {
    const key = `event:${req.params.slug}`;
    let png = ogCacheGet(key);
    if (!png) {
      const ev = findEventBySlug(req.params.slug);
      if (!ev) return res.status(404).end();
      png = await generateEventOG(ev);
      ogCacheSet(key, png, 3600_000);
    }
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.send(png);
  } catch (e) {
    console.error("[og/event] error:", e.message);
    res.status(500).end();
  }
});

// ─── ICS + RSS: la agenda como feed suscribible ───────────────
// Un solo serializador alimenta el .ics por evento (modal), el calendario
// suscribible /agenda.ics (webcal) y el RSS. BA no tiene DST desde 2009:
// offset fijo -03, así que el VTIMEZONE es un bloque estático.

// Fecha wall-time BA del evento desde day/month/time (strings). El año sale
// de la misma heurística que el JSON-LD: >30 días en el pasado → año próximo.
function icsDateParts(ev) {
  const mo = MONTH_MAP[ev.month?.toLowerCase()] ?? -1;
  const d = parseInt(ev.day);
  if (mo < 0 || !d) return null;
  const probe = new Date(new Date().getFullYear(), mo, d);
  if (probe < new Date() - 30 * 86400000) probe.setFullYear(probe.getFullYear() + 1);
  const tm = /^(\d{1,2}):(\d{2})/.exec(ev.time || "");
  return {
    y: probe.getFullYear(), mo: mo + 1, d,
    hh: tm ? +tm[1] : null, mm: tm ? +tm[2] : null,
    sort: probe.getTime(),
  };
}

const escICS = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Folding RFC 5545: líneas de máx. 75 octetos, continuación con espacio.
const foldICS = (line) => {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
};

const ICS_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Argentina/Buenos_Aires",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0300",
  "TZNAME:-03",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function eventsToICS(events, calName) {
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BassLayer//Agenda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldICS(`X-WR-CALNAME:${escICS(calName)}`),
    "X-WR-TIMEZONE:America/Argentina/Buenos_Aires",
    ICS_VTIMEZONE,
  ];
  for (const ev of events) {
    const p = icsDateParts(ev);
    if (!p) continue;
    const slug = eventSlug(ev);
    const url = `${PROD_ORIGIN}/eventos/${slug}`;
    const artists = (ev.artists || []).filter((a) => a && a !== "TBA").slice(0, 6).join(", ");
    lines.push("BEGIN:VEVENT");
    lines.push(foldICS(`UID:${slug}@basslayer.io`));
    lines.push(`DTSTAMP:${dtstamp}`);
    if (p.hh != null) {
      const start = `${p.y}${pad(p.mo)}${pad(p.d)}T${pad(p.hh)}${pad(p.mm)}00`;
      // +5h de fiesta; si cruza medianoche el TZID lo resuelve el calendario.
      const endDate = new Date(p.y, p.mo - 1, p.d, p.hh + 5, p.mm);
      const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
      lines.push(`DTSTART;TZID=America/Argentina/Buenos_Aires:${start}`);
      lines.push(`DTEND;TZID=America/Argentina/Buenos_Aires:${end}`);
    } else {
      const next = new Date(p.y, p.mo - 1, p.d + 1);
      lines.push(`DTSTART;VALUE=DATE:${p.y}${pad(p.mo)}${pad(p.d)}`);
      lines.push(`DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`);
    }
    lines.push(foldICS(`SUMMARY:${escICS(ev.name)}`));
    const loc = [ev.venue, ev.city].filter(Boolean).join(", ");
    if (loc) lines.push(foldICS(`LOCATION:${escICS(loc)}`));
    lines.push(foldICS(`DESCRIPTION:${escICS([artists, url].filter(Boolean).join("\n"))}`));
    lines.push(foldICS(`URL:${url}`));
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// JSON-LD MusicEvent — builder único para el ItemList del prerender y la
// ficha de evento. startDate/endDate con hora y offset -03:00 explícito:
// "timezone mal seteado" y "sin offers" son de los errores que más
// descalifican del carrusel de Google Events.
function musicEventSchema(ev, extra = {}) {
  const p = icsDateParts(ev);
  const pad = (n) => String(n).padStart(2, "0");
  const schema = {
    "@type": "MusicEvent",
    "name": ev.name,
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": {
      "@type": "Place",
      "name": ev.venue || "Buenos Aires",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": ev.city || "Buenos Aires",
        "addressRegion": "CABA",
        "addressCountry": "AR",
      },
    },
    "performer": (ev.artists || []).filter((a) => a && a !== "TBA").slice(0, 5).map((a) => ({ "@type": "PerformingGroup", "name": a })),
    "organizer": { "@type": "Organization", "name": ev.venue || "BassLayer" },
    ...extra,
  };
  if (p) {
    const d = `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
    if (p.hh != null) {
      schema.startDate = `${d}T${pad(p.hh)}:${pad(p.mm)}:00-03:00`;
      const end = new Date(p.y, p.mo - 1, p.d, p.hh + 5, p.mm);
      schema.endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}:00-03:00`;
    } else {
      schema.startDate = d;
    }
  }
  const images = [ev.image, `${PROD_ORIGIN}/og/event/${eventSlug(ev)}.png`].filter(Boolean);
  if (images.length) schema.image = images;
  if (ev.url) {
    schema.offers = {
      "@type": "Offer",
      "url": ev.url,
      "availability": "https://schema.org/InStock",
      ...(Number(ev.ticket_price) > 0 ? { "price": Number(ev.ticket_price), "priceCurrency": "ARS" } : {}),
    };
  }
  return schema;
}

// Eventos AR próximos, ordenados — base de agenda.ics y feed.xml.
function upcomingAREvents(family, cap = 120) {
  const events = (cached("events") || []).filter((e) => (e.region || "AR") === "AR");
  const cutoff = Date.now() - 86400000;
  return events
    .map((ev) => ({ ev, p: icsDateParts(ev) }))
    .filter((x) => x.p && x.p.sort > cutoff && (!family || x.ev.family === family))
    .sort((a, b) => a.p.sort - b.p.sort)
    .slice(0, cap)
    .map((x) => x.ev);
}

// .ics de UN evento — el modal lo linkea: text/calendar hace que iOS lo abra
// en Calendario directo, sin danza de descargas.
app.get("/api/ics/:slug.ics", (req, res) => {
  const ev = findEventBySlug(req.params.slug);
  if (!ev) return res.status(404).end();
  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.set("Content-Disposition", `inline; filename="basslayer-evento.ics"`);
  res.send(eventsToICS([ev], "BassLayer"));
});

// Calendario suscribible (webcal://basslayer.io/agenda.ics[?family=club]).
app.get("/agenda.ics", (req, res) => {
  const family = ["club", "live", "festival", "urbano", "raiz"].includes(req.query.family) ? req.query.family : null;
  const name = family ? `BassLayer — Agenda ${family}` : "BassLayer — Agenda BA";
  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(eventsToICS(upcomingAREvents(family), name));
});

// RSS de la agenda — mismo dataset, para lectores y agregadores.
app.get("/feed.xml", (req, res) => {
  const escXml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const items = upcomingAREvents(null, 50).map((ev) => {
    const url = `${PROD_ORIGIN}/eventos/${eventSlug(ev)}`;
    const artists = (ev.artists || []).filter((a) => a && a !== "TBA").slice(0, 5).join(", ");
    const desc = [`${ev.day} ${ev.month}${ev.time ? ` · ${ev.time}` : ""}`, [ev.venue, ev.city].filter(Boolean).join(", "), artists].filter(Boolean).join(" — ");
    return `<item><title>${escXml(ev.name)}</title><link>${escXml(url)}</link><guid isPermaLink="true">${escXml(url)}</guid><description>${escXml(desc)}</description></item>`;
  }).join("");
  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=1800");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>BassLayer — Agenda BA</title><link>${PROD_ORIGIN}/</link><description>Eventos de música electrónica y más en Buenos Aires</description><language>es-AR</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</channel></rss>`);
});

// Story-card 1080×1920 para el share del cliente (stories IG / estados WA).
app.get("/og/story/event/:slug.png", async (req, res) => {
  try {
    const key = `story:${req.params.slug}`;
    let png = ogCacheGet(key);
    if (!png) {
      const ev = findEventBySlug(req.params.slug);
      if (!ev) return res.status(404).end();
      png = await generateEventStory(ev);
      ogCacheSet(key, png, 3600_000);
    }
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.send(png);
  } catch (e) {
    console.error("[og/story] error:", e.message);
    res.status(500).end();
  }
});

app.get("/og/festival/:slug.png", async (req, res) => {
  try {
    const key = `festival:${req.params.slug}`;
    let png = ogCacheGet(key);
    if (!png) {
      const f = findFestivalBySlug(req.params.slug);
      if (!f) return res.status(404).end();
      png = await generateFestivalOG(f);
      ogCacheSet(key, png, 86400_000);
    }
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
    const key = `news:${req.params.slug}`;
    let png = ogCacheGet(key);
    if (!png) {
      const n = findNewsBySlug(req.params.slug);
      if (!n) return res.status(404).end();
      png = await generateNewsOG(n);
      ogCacheSet(key, png, 3600_000);
    }
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
        { hreflang: "x-default", href: `${PROD_ORIGIN}/` },
      ],
    },
  ];

  // Páginas temporales — cambian a diario de verdad; lastmod=today es honesto
  // acá y solo acá (Google usa lastmod para programar recrawl).
  urls.push({ loc: `${PROD_ORIGIN}/layer`, lastmod: today, changefreq: "hourly", priority: "0.9" });
  for (const p of ["agenda", "noticias", "festivales"]) urls.push({ loc: `${PROD_ORIGIN}/${p}`, lastmod: today, changefreq: "daily", priority: "0.9" });
  urls.push({ loc: `${PROD_ORIGIN}/eventos/hoy`, lastmod: today, changefreq: "daily", priority: "0.9" });
  urls.push({ loc: `${PROD_ORIGIN}/eventos/este-finde`, lastmod: today, changefreq: "daily", priority: "0.9" });

  // Eventos — sin lastmod: no versionamos la data por evento y un lastmod
  // inventado entrena a Google a ignorar la señal en todo el sitio.
  const events = cached("events") || [];
  const seen = new Set();
  for (const ev of events) {
    const slug = eventSlug(ev);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    urls.push({
      loc: `${PROD_ORIGIN}/eventos/${slug}`,
      changefreq: "weekly",
      priority: "0.8",
    });
  }

  // Venues con 3+ fechas próximas — "crobar eventos" y compañía.
  const venueCounts = {};
  for (const ev of events) {
    if (!ev.venue) continue;
    const vs = slugify(ev.venue);
    if (vs) venueCounts[vs] = (venueCounts[vs] || 0) + 1;
  }
  for (const [vs, n] of Object.entries(venueCounts)) {
    if (n < 3) continue;
    urls.push({ loc: `${PROD_ORIGIN}/eventos/venue/${vs}`, lastmod: today, changefreq: "daily", priority: "0.7" });
  }

  // Hubs por familia (club/live/festival/urbano/raiz) — sólo las que tienen al
  // menos 1 evento en caché. Una URL limpia por familia (sin duplicados).
  const familyCounts = {};
  for (const ev of events) {
    if (ev.family) familyCounts[ev.family] = (familyCounts[ev.family] || 0) + 1;
  }
  for (const family of GENRE_LIST) {
    if (!familyCounts[family]) continue;
    urls.push({
      loc: `${PROD_ORIGIN}/eventos/genero/${genreSlug(family)}`,
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
    if (u.lastmod) xml.push(`    <lastmod>${u.lastmod}</lastmod>`);
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
  return { icsDateParts, musicEventSchema };
}

// Client-side meta helpers — en producción el server ya prerenderiza title y
// meta para /eventos/[slug], pero al navegar dentro de la SPA (abrir un modal,
// cambiar de ruta con history.pushState) el HTML no se re-emite. Estos helpers
// mantienen sincronizado document.title y las meta OG con la vista actual.

const ORIGIN = "https://basslayer.io";

let defaults = null;

function snapshotDefaults() {
  if (defaults) return defaults;
  defaults = {
    title: document.title,
    description: getMeta("name", "description")?.content || "",
    ogTitle: getMeta("property", "og:title")?.content || "",
    ogDescription: getMeta("property", "og:description")?.content || "",
    ogUrl: getMeta("property", "og:url")?.content || `${ORIGIN}/`,
    twTitle: getMeta("name", "twitter:title")?.content || "",
    twDescription: getMeta("name", "twitter:description")?.content || "",
    canonical: document.querySelector('link[rel="canonical"]')?.href || `${ORIGIN}/`,
  };
  return defaults;
}

function getMeta(attr, name) {
  return document.querySelector(`meta[${attr}="${name}"]`);
}

function setMeta(attr, name, value) {
  let el = getMeta(attr, name);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// Formato pedido por la auditoría:
// title: {Artista} en {Venue} · {DD mes} | BassLayer
// desc:  {Artista} se presenta en {Venue}, {Ciudad}, el {fecha} a las {hora}. Género: {G}. Entradas e info en BassLayer.
export function buildEventMeta(ev, slug) {
  if (!ev) return null;
  const artists = (ev.artists || []).filter((a) => a && a !== "TBA");
  const headliner = artists[0] || ev.name;
  const venue = ev.venue || "Buenos Aires";
  const city = ev.city || "Buenos Aires";
  const time = ev.time ? ` a las ${ev.time}` : "";
  const genre = ev.genre ? ` Género: ${ev.genre}.` : "";

  const title = `${headliner}${ev.venue ? ` en ${ev.venue}` : ""} · ${ev.day} ${ev.month} | BassLayer`;
  const description = `${headliner} se presenta en ${venue}, ${city}, el ${ev.day} de ${ev.month}${time}.${genre} Entradas e info en BassLayer.`;
  const url = slug ? `${ORIGIN}/eventos/${slug}` : `${ORIGIN}/`;
  return { title, description, url };
}

export function applyEventMeta(ev, slug) {
  snapshotDefaults();
  const meta = buildEventMeta(ev, slug);
  if (!meta) return;
  document.title = meta.title;
  setMeta("name", "description", meta.description);
  setMeta("property", "og:title", meta.title);
  setMeta("property", "og:description", meta.description);
  setMeta("property", "og:url", meta.url);
  setMeta("name", "twitter:title", meta.title);
  setMeta("name", "twitter:description", meta.description);
  setCanonical(meta.url);
}

export function resetMeta() {
  const d = snapshotDefaults();
  document.title = d.title;
  if (d.description) setMeta("name", "description", d.description);
  if (d.ogTitle) setMeta("property", "og:title", d.ogTitle);
  if (d.ogDescription) setMeta("property", "og:description", d.ogDescription);
  if (d.ogUrl) setMeta("property", "og:url", d.ogUrl);
  if (d.twTitle) setMeta("name", "twitter:title", d.twTitle);
  if (d.twDescription) setMeta("name", "twitter:description", d.twDescription);
  if (d.canonical) setCanonical(d.canonical);
}

// JSON-LD MusicEvent — inyectado como <script id="bl-event-jsonld"> que se
// reemplaza / remueve al cerrar el modal. El server ya emite JSON-LD en /eventos/[slug],
// esto cubre navegación client-side (abrir un modal desde el feed).
const JSONLD_ID = "bl-event-jsonld";

const MONTH_MAP = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };

function eventIsoStart(ev) {
  const m = MONTH_MAP[ev.month?.toLowerCase()];
  if (m === undefined || !ev.day) return null;
  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (ev.time || "23:00").split(":").map(Number);
  const d = new Date(year, m, parseInt(ev.day, 10), h || 23, min || 0);
  if (d < now - 30 * 86400000) d.setFullYear(year + 1);
  // Argentina UTC-3 offset fijo (no aplica DST)
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00-03:00`;
}

export function buildEventJsonLd(ev, slug) {
  if (!ev) return null;
  const startDate = eventIsoStart(ev);
  const artists = (ev.artists || []).filter((a) => a && a !== "TBA");
  const url = slug ? `${ORIGIN}/eventos/${slug}` : ORIGIN;

  const data = {
    "@context": "https://schema.org",
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
        "addressCountry": "AR",
      },
    },
    "performer": artists.map((a) => ({ "@type": "MusicGroup", "name": a })),
    "organizer": { "@type": "Organization", "name": "BassLayer", "url": ORIGIN },
    "url": url,
  };
  if (startDate) data.startDate = startDate;
  if (ev.image) data.image = [ev.image];
  if (ev.url) {
    data.offers = {
      "@type": "Offer",
      "url": ev.url,
      "availability": "https://schema.org/InStock",
    };
  }
  return data;
}

export function applyEventJsonLd(ev, slug) {
  const data = buildEventJsonLd(ev, slug);
  if (!data) return;
  removeEventJsonLd();
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = JSONLD_ID;
  script.textContent = JSON.stringify(data).replace(/<\//g, "<\\/");
  document.head.appendChild(script);
}

export function removeEventJsonLd() {
  const el = document.getElementById(JSONLD_ID);
  if (el) el.remove();
}

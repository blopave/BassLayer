// ═══════════════════════════════════════════════════════
//  OG image generator — dinámico por evento / festival / noticia
//  satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG)
//  Resultado: 1200×630 PNG branded por pieza de contenido
// ═══════════════════════════════════════════════════════

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Fuentes ───────────────────────────────────
// Cargamos Inter Regular + Bold del paquete @fontsource/inter (woff, latin).
// Satori soporta TTF/OTF/WOFF (no WOFF2). Lo hacemos al startup, no per-request.
const FONT_BASE = join(__dirname, "node_modules/@fontsource/inter/files");
const interRegular = readFileSync(join(FONT_BASE, "inter-latin-400-normal.woff"));
const interBold = readFileSync(join(FONT_BASE, "inter-latin-700-normal.woff"));

const FONTS = [
  { name: "Inter", data: interRegular, weight: 400, style: "normal" },
  { name: "Inter", data: interBold, weight: 700, style: "normal" },
];

// ── Color tokens (alineados a la identidad del sitio) ──
const C = {
  bg: "#0a0a0a",
  bgGradient: "linear-gradient(135deg, #0a0a0a 0%, #131316 100%)",
  ink: "#f5f5f0",
  inkSoft: "#a0a0a0",
  inkMuted: "#666",
  accentBass: "#e6c896",      // crema cálida — Bass
  accentLayer: "#7ec8ff",     // celeste técnico — Layer
  divider: "#222",
  pillBg: "#1a1a1a",
  pillBorder: "#2a2a2a",
};

// ── Cache de imágenes remotas (flyers, logos) ─────
// Las imágenes externas (RA, Wikipedia, source CDNs) las traemos una vez y
// las guardamos como data URI para Satori. TTL alineado a la vida del OG.
const imageCache = new Map(); // url → { dataUri, ts }
const IMAGE_CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchImageAsDataUri(url, timeoutMs = 3000) {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached && Date.now() - cached.ts < IMAGE_CACHE_TTL) return cached.dataUri;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/jpeg";
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
    imageCache.set(url, { dataUri, ts: Date.now() });
    if (imageCache.size > 200) {
      // LRU básico: tirar el más viejo cuando excede 200
      const oldest = [...imageCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      imageCache.delete(oldest[0]);
    }
    return dataUri;
  } catch {
    return null;
  }
}

// ── Cache del PNG final ──────────────────────
const ogCache = new Map(); // key → { buffer, ts }
const OG_CACHE_TTL = {
  event: 60 * 60 * 1000,        // 1h
  festival: 24 * 60 * 60 * 1000, // 24h
  news: 60 * 60 * 1000,         // 1h
};
function cacheGet(key) {
  const e = ogCache.get(key);
  if (!e) return null;
  return e;
}
function cacheSet(key, buffer, ttl) {
  ogCache.set(key, { buffer, ts: Date.now(), ttl });
  if (ogCache.size > 500) {
    const oldest = [...ogCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    ogCache.delete(oldest[0]);
  }
}
function cacheValid(entry) {
  if (!entry) return false;
  return Date.now() - entry.ts < entry.ttl;
}

// ── Helpers de construcción de nodos (sin JSX) ──
// Satori acepta el formato que produce React.createElement / JSX. Como el resto
// del server no usa JSX, escribimos los nodos como literales — más explícito.
// Gotcha: Satori v0.26 interpreta `props.children: []` como "tiene hijos" y
// pide display:flex aún cuando el array está vacío. Filtramos nulls y omitimos
// la key children cuando no hay hijos.
const el = (type, props, ...children) => {
  const node = { type, key: null, props: { ...props } };
  const filtered = children.filter(c => c != null && c !== false);
  if (filtered.length === 1) node.props.children = filtered[0];
  else if (filtered.length > 1) node.props.children = filtered;
  return node;
};

// ── Brand header común a todos los templates ──
function brandHeader(label) {
  return el("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      fontSize: "20px",
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: C.ink,
    },
  },
    el("span", { style: { fontStyle: "italic", letterSpacing: "-0.01em" } }, "Bass"),
    el("span", { style: { color: C.accentLayer, fontWeight: 400, letterSpacing: "0.12em" } }, "LAYER"),
    el("span", { style: { color: C.divider, margin: "0 4px" } }, "·"),
    el("span", { style: { color: C.inkSoft, fontWeight: 400, fontSize: "16px", letterSpacing: "0.18em" } }, label),
  );
}

// ── Template: EVENTO ──────────────────────────
async function eventTemplate(event) {
  const flyer = event.image ? await fetchImageAsDataUri(event.image) : null;
  const artists = (event.artists || []).filter(a => a && a !== "TBA").slice(0, 3).join(" · ");

  const leftCol = el("div", {
    style: {
      width: flyer ? "560px" : "100%",
      height: "100%",
      padding: "56px 64px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      background: C.bgGradient,
    },
  },
    brandHeader("Buenos Aires"),
    el("div", { style: { display: "flex", flexDirection: "column", gap: "20px" } },
      el("div", {
        style: {
          fontSize: flyer ? "54px" : "72px",
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: C.ink,
        },
      }, event.name),
      el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
        el("div", { style: { fontSize: "26px", color: C.accentBass, fontWeight: 700, letterSpacing: "0.01em" } },
          `${event.day} ${event.month}${event.venue ? ` · ${event.venue}` : ""}`),
        artists
          ? el("div", { style: { fontSize: "20px", color: C.inkSoft, fontWeight: 400 } }, artists)
          : null,
      ),
    ),
    el("div", { style: { display: "flex", gap: "12px", alignItems: "center" } },
      event.genre
        ? el("div", {
            style: {
              padding: "8px 18px",
              background: C.pillBg,
              border: `1px solid ${C.pillBorder}`,
              borderRadius: "999px",
              fontSize: "16px",
              color: C.accentLayer,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            },
          }, event.genre)
        : null,
      el("div", { style: { fontSize: "16px", color: C.inkMuted, letterSpacing: "0.08em", textTransform: "uppercase" } },
        "basslayer.app"),
    ),
  );

  if (!flyer) {
    return el("div", {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        background: C.bg,
        color: C.ink,
        fontFamily: "Inter",
      },
    }, leftCol);
  }

  const rightCol = el("div", {
    style: {
      width: "640px",
      height: "100%",
      position: "relative",
      display: "flex",
      overflow: "hidden",
    },
  },
    el("img", {
      src: flyer,
      width: 640,
      height: 630,
      style: { width: "640px", height: "630px", objectFit: "cover" },
    }),
    // Vignette derecho a izquierda para integrar con la columna negra
    el("div", {
      style: {
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "linear-gradient(90deg, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0) 30%)",
      },
    }),
  );

  return el("div", {
    style: {
      width: "1200px",
      height: "630px",
      display: "flex",
      background: C.bg,
      color: C.ink,
      fontFamily: "Inter",
    },
  }, leftCol, rightCol);
}

// ── Template: FESTIVAL ─────────────────────────
async function festivalTemplate(festival) {
  const logo = festival.image ? await fetchImageAsDataUri(festival.image) : null;
  const dates = formatFestivalDates(festival.dates_start, festival.dates_end);
  const location = [festival.city, festival.country].filter(Boolean).join(", ");
  const tags = Array.isArray(festival.tags) ? festival.tags.slice(0, 4) : [];

  return el("div", {
    style: {
      width: "1200px",
      height: "630px",
      display: "flex",
      flexDirection: "column",
      padding: "56px 72px",
      background: C.bgGradient,
      color: C.ink,
      fontFamily: "Inter",
      justifyContent: "space-between",
    },
  },
    brandHeader("Festival"),
    el("div", { style: { display: "flex", alignItems: "center", gap: "48px" } },
      logo
        ? el("div", {
            style: {
              width: "200px",
              height: "200px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "16px",
              padding: "20px",
              flexShrink: 0,
            },
          },
          el("img", {
            src: logo,
            width: 160,
            height: 160,
            style: { width: "160px", height: "160px", objectFit: "contain" },
          }))
        : null,
      el("div", { style: { display: "flex", flexDirection: "column", gap: "20px", flex: 1 } },
        el("div", {
          style: {
            fontSize: "72px",
            fontWeight: 700,
            lineHeight: 1.0,
            letterSpacing: "-0.025em",
            color: C.ink,
          },
        }, festival.name),
        el("div", { style: { fontSize: "26px", color: C.accentBass, fontWeight: 700 } }, dates),
        location
          ? el("div", { style: { fontSize: "22px", color: C.inkSoft, fontWeight: 400 } }, location)
          : null,
      ),
    ),
    el("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
      ...tags.map(t => el("div", {
        style: {
          padding: "8px 16px",
          background: C.pillBg,
          border: `1px solid ${C.pillBorder}`,
          borderRadius: "999px",
          fontSize: "15px",
          color: C.accentLayer,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        },
      }, t)),
      el("div", {
        style: {
          fontSize: "15px",
          color: C.inkMuted,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginLeft: "auto",
        },
      }, "basslayer.app"),
    ),
  );
}

function formatFestivalDates(start, end) {
  if (!start) return "Fecha por confirmar";
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const s = new Date(start);
  if (!end || end === start) return `${s.getUTCDate()} ${months[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  const e = new Date(end);
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${months[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  }
  return `${s.getUTCDate()} ${months[s.getUTCMonth()]} – ${e.getUTCDate()} ${months[e.getUTCMonth()]} ${s.getUTCFullYear()}`;
}

// ── Template: NOTICIA ──────────────────────────
async function newsTemplate(news) {
  const img = news.image ? await fetchImageAsDataUri(news.image) : null;
  const source = news.source || "Fuente externa";

  const leftCol = el("div", {
    style: {
      width: img ? "640px" : "100%",
      height: "100%",
      padding: "56px 64px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      background: C.bgGradient,
    },
  },
    brandHeader("Noticia"),
    el("div", { style: { display: "flex", flexDirection: "column", gap: "20px" } },
      el("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: "16px",
          color: C.accentLayer,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        },
      },
        el("div", {
          style: {
            padding: "6px 14px",
            background: C.pillBg,
            border: `1px solid ${C.pillBorder}`,
            borderRadius: "999px",
          },
        }, source),
        news.tag ? el("span", { style: { color: C.inkSoft } }, news.tag) : null,
      ),
      el("div", {
        style: {
          fontSize: img ? "44px" : "60px",
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          color: C.ink,
        },
      }, String(news.title || "").slice(0, 160)),
    ),
    el("div", {
      style: {
        fontSize: "16px",
        color: C.inkMuted,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      },
    }, "basslayer.app · curado"),
  );

  if (!img) {
    return el("div", {
      style: { width: "1200px", height: "630px", display: "flex", background: C.bg, color: C.ink, fontFamily: "Inter" },
    }, leftCol);
  }

  const rightCol = el("div", {
    style: { width: "560px", height: "100%", position: "relative", display: "flex", overflow: "hidden" },
  },
    el("img", {
      src: img,
      width: 560,
      height: 630,
      style: { width: "560px", height: "630px", objectFit: "cover" },
    }),
    el("div", {
      style: {
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "linear-gradient(90deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0) 35%)",
      },
    }),
  );

  return el("div", {
    style: { width: "1200px", height: "630px", display: "flex", background: C.bg, color: C.ink, fontFamily: "Inter" },
  }, leftCol, rightCol);
}

// ── Render principal: node → SVG (satori) → PNG (resvg) ──
async function renderToPng(node) {
  const svg = await satori(node, {
    width: 1200,
    height: 630,
    fonts: FONTS,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  return resvg.render().asPng();
}

// ── API pública ────────────────────────────────
export async function generateEventOG(event) {
  const key = `event:${event.day || ""}-${event.month || ""}-${event.name || ""}-${event.image || ""}`;
  const cached = cacheGet(key);
  if (cacheValid(cached)) return cached.buffer;
  const node = await eventTemplate(event);
  const png = await renderToPng(node);
  cacheSet(key, png, OG_CACHE_TTL.event);
  return png;
}

export async function generateFestivalOG(festival) {
  const key = `festival:${festival.id || festival.name}`;
  const cached = cacheGet(key);
  if (cacheValid(cached)) return cached.buffer;
  const node = await festivalTemplate(festival);
  const png = await renderToPng(node);
  cacheSet(key, png, OG_CACHE_TTL.festival);
  return png;
}

export async function generateNewsOG(news) {
  const key = `news:${news.url || news.title}`;
  const cached = cacheGet(key);
  if (cacheValid(cached)) return cached.buffer;
  const node = await newsTemplate(news);
  const png = await renderToPng(node);
  cacheSet(key, png, OG_CACHE_TTL.news);
  return png;
}

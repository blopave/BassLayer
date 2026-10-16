// Montos compactos en USD (volúmenes de Polymarket), en el idioma de quien lee:
// US$ 950 · US$ 42 mil · US$ 1,3 millones / $950 · $42K · $1.3M.
export function formatUsdCompact(n, locale = "es") {
  const v = Math.abs(n || 0), en = locale === "en";
  if (v < 1e3) return `${en ? "$" : "US$ "}${Math.round(v)}`;
  if (v < 1e6) return en ? `$${Math.round(v / 1e3)}K` : `US$ ${Math.round(v / 1e3)} mil`;
  if (v < 1e9) return en ? `$${fmtNum(v / 1e6, "en", 1)}M` : `US$ ${fmtNum(v / 1e6, "es", 1)} millones`;
  return en ? `$${fmtNum(v / 1e9, "en", 1)}B` : `US$ ${fmtNum(v / 1e9, "es", 1)} mil millones`;
}

// Capitalización de mercado compacta: $2.90T · $1694.1B → $1.69T · $512M.
// Una sola fuente para el terminal de Layer y el modal de precio.
export function formatMarketCap(n) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

// "A · B": pega el separador a la palabra anterior (espacio no separable) para
// que un título que parte en dos líneas no arranque la segunda con "·". Solo
// al mostrar: el dato queda limpio para búsqueda, SEO, .ics y compartir.
export function noOrphanSep(name) {
  return String(name || "").replace(/ · /g, "\u00A0· ");
}

// Venue limpio: sin el prefijo "TBA - " de RA y recortado antes de la coma
// ("Grand Hall, La Plata" → "Grand Hall"). Ticker y "De gira".
export function cleanVenue(v) {
  if (!v) return "";
  // Buenos Aliens escribe "fiesta @ lugar" ("2GTHR @ Morocco"): el lugar es lo
  // que va después del @ (en el ticker quedaba "… @ 2GTHR @ Morocco", oct 2026).
  return String(v).replace(/^\s*(tba|tbd|tbc)\s*[-:|–—]\s*/i, "").split("@").pop().split(",")[0].trim();
}

// Números en el formato de quien lee (oct 2026): coma decimal y punto de miles
// en castellano (1.847,15), al revés en inglés. Un formateador por combinación.
const NF = {};
export const fmtNum = (n, locale = "es", d = 2) =>
  (NF[locale + d] ||= new Intl.NumberFormat(locale === "en" ? "en-US" : "es-AR", { minimumFractionDigits: d, maximumFractionDigits: d })).format(n);
// Variación con signo: +2,3% / −7,4% (la semana, el ticker, las cotizaciones).
export const formatPct = (v, locale = "es", d = 1) => (v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : "−"}${fmtNum(Math.abs(v), locale, d)}%`);

// Edad de una nota a partir del "time" del feed ("12m", "3h", "2d").
export const minsDeNota = (time) => { const n = parseInt(time, 10) || 0; return /m$/.test(time) ? n : /h$/.test(time) ? n * 60 : /d$/.test(time) ? n * 1440 : 0; };
export function haceCuanto(time, t) {
  const m = minsDeNota(time);
  return m < 60 ? t("news.agoMin", { n: Math.max(1, m) }) : m < 1440 ? t("news.agoH", { n: Math.round(m / 60) }) : t("news.agoD", { n: Math.round(m / 1440) });
}

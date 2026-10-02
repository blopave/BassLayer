// Capitalización de mercado compacta: $2.90T · $1694.1B → $1.69T · $512M.
// Una sola fuente para el terminal de Layer y el modal de precio.
// Montos compactos en USD con escalón K (volúmenes de Polymarket): $950 · $42K · $1.3M · $2.1B.
export function formatUsdCompact(n) {
  const v = Math.abs(n || 0);
  if (v < 1e3) return `$${Math.round(v)}`;
  if (v < 1e6) return `$${(v / 1e3).toFixed(0)}K`;
  if (v < 1e9) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${(v / 1e9).toFixed(1)}B`;
}

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

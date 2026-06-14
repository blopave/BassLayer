// Slug helpers — deben producir el mismo output que server.js para que las URLs
// /eventos/[slug] funcionen en deep link tanto del lado server (prerender) como
// del lado cliente (modal open).

export function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function eventSlug(ev) {
  if (!ev || !ev.name) return "";
  const namePart = slugify(ev.name);
  const datePart = slugify(`${ev.day || ""}-${ev.month || ""}`);
  return [namePart, datePart].filter(Boolean).join("-");
}

// Hash determinista corto para garantizar unicidad cuando hay títulos repetidos
// entre fuentes (frecuente en agregadores RSS).
function hash6(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}

export function newsSlug(n) {
  if (!n || !n.title) return "";
  const titlePart = slugify(n.title).slice(0, 60);
  const idPart = n.url ? hash6(n.url) : hash6(n.title + (n.source || ""));
  return [titlePart, idPart].filter(Boolean).join("-");
}

// Los festivales tienen un id curado en data/festivals.json (ej.
// "lollapalooza-ar-2026") que ya es slug-shaped. Usamos eso directamente.
export function festivalSlug(f) {
  if (!f) return "";
  return f.id || slugify(f.name);
}

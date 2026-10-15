// Las direcciones del sitio (/eventos/<slug>, /noticias/<slug>, /festivales/<slug>,
// /eventos/genero/<familia>), compartidas por el server (prerender, sitemap,
// .ics) y el cliente (abrir el modal desde la URL). Una sola copia: cuando eran
// dos, divergieron ("Geøvhän" daba un slug en cada lado).
export function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Mn}/gu, "")
    .toLowerCase()
    // Letras que NFD no descompone: sin esto "Geøvhän" daba "ge-vhan".
    .replace(/[øœæßłđþðı]/g, (c) => ({ ø: "o", œ: "oe", æ: "ae", ß: "ss", ł: "l", đ: "d", þ: "th", ð: "d", ı: "i" })[c])
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

// Hash determinístico (slugs de noticias, variantes de póster). No cambiar la
// fórmula: alimenta URLs ya publicadas.
export function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const hash6 = (s) => hashStr(s).toString(36).slice(0, 6);

export function newsSlug(n) {
  if (!n || !n.title) return "";
  const titlePart = slugify(n.title).slice(0, 60);
  const idPart = n.url ? hash6(n.url) : hash6(n.title + (n.source || ""));
  return [titlePart, idPart].filter(Boolean).join("-");
}

// Los festivales tienen un id curado en data/festivals.json, ya con forma de slug.
export function festivalSlug(f) {
  if (!f) return "";
  return f.id || slugify(f.name);
}

// Familias: el filtro usa la key de familia (club/live/festival/urbano/raiz),
// ya slug-safe; /eventos/genero/{familia} la usa directo.
export const GENRE_LIST = ["club", "live", "festival", "urbano", "raiz"];
const FAMILY_SET = new Set(GENRE_LIST);
// Compat SEO: URLs viejas de subgénero electrónico → familia "club".
const LEGACY_SLUG_TO_FAMILY = {
  "techno": "club", "house": "club", "deep-house": "club", "tech-house": "club",
  "progressive": "club", "melodic": "club", "minimal": "club", "drum-and-bass": "club",
  "trance": "club", "disco": "club", "ambient": "club", "electronic": "club",
};
export function genreSlug(filter) {
  if (!filter || filter === "All") return "";
  return slugify(filter);
}
export function genreFromSlug(slug) {
  if (!slug) return null;
  if (FAMILY_SET.has(slug)) return slug;
  return LEGACY_SLUG_TO_FAMILY[slug] || null;
}

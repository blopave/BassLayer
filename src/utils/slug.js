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

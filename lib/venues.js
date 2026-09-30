// Clave de un venue para cruzar eventos con su ubicación (data/venues-geo.json).
// La usan el server (adjunta `geo` a cada evento) y scripts/geocode-venues.mjs.
export const venueKey = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

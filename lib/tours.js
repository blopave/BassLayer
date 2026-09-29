// "De gira" (sept 2026): shows del AMBA cuyo line-up toca afuera dentro de
// ±45 días. Una sola función para el front (OnTour) y el smoke, que así
// verifica exactamente lo mismo que se muestra. Todo sale de fechas
// publicadas por nuestras fuentes: no se infiere nacionalidad ni se inventan
// paradas. dateOf y clean los pasa el que llama (fecha del evento y filtro
// de line-up: "TBA", "Main Stage" no son artistas).

export const TOUR_WINDOW_DAYS = 45;
export const normName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export function computeTours(events, { dateOf, clean, now = Date.now() - 6 * 3600000 }) {
  const abroad = new Map();
  for (const ev of events) {
    if (ev.region === "AR") continue;
    const date = dateOf(ev);
    if (!date) continue;
    for (const a of clean(ev.artists)) {
      const n = normName(a);
      if (n.length < 4) continue;
      if (!abroad.has(n)) abroad.set(n, []);
      abroad.get(n).push({ city: ev.city, date });
    }
  }
  const tours = [];
  for (const ev of events) {
    if (ev.area !== "amba") continue;
    const date = dateOf(ev);
    if (!date || date.getTime() < now) continue;
    const on = clean(ev.artists).filter((a) => abroad.has(normName(a)));
    const near = on.flatMap((a) => abroad.get(normName(a)))
      .filter((s) => Math.abs(s.date - date) <= TOUR_WINDOW_DAYS * 86400000);
    if (!near.length) continue;
    const stops = [...new Map(near.map((s) => [`${s.city}|${s.date.toDateString()}`, s])).values()]
      .sort((a, b) => a.date - b.date).slice(0, 3);
    tours.push({ ev, date, on, stops });
  }
  return tours.sort((a, b) => a.date - b.date);
}

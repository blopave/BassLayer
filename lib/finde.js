// "El finde en tu calendario" (oct 2026, Pablo eligió la B): los elegidos de
// viernes a domingo en AMBA. Lo usan el cliente (la franja de la Agenda) y el
// server (/finde.ics, el calendario suscribible que se renueva solo), así que
// los dos eligen exactamente lo mismo. Todo en hora de Buenos Aires (UTC−3, sin
// horario de verano), sin depender de la zona del server ni del navegador.
const MESES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
const BA = 3 * 36e5;   // BA = UTC − 3 h
const DAY = 864e5;

// Inicio del evento como epoch (ms). Sin hora, 23:00. Si la fecha quedó más de
// 30 días atrás, es del año que viene.
export function eventEpoch(ev, now = Date.now()) {
  const m = MESES[String(ev.month || "").toLowerCase().slice(0, 3)];
  const d = parseInt(ev.day, 10);
  if (m === undefined || !d) return null;
  const [h, min] = String(ev.time || "23:00").split(":").map(Number);
  const y = new Date(now - BA).getUTCFullYear();
  let t = Date.UTC(y, m, d, h || 0, min || 0) + BA;
  if (t < now - 30 * DAY) t = Date.UTC(y + 1, m, d, h || 0, min || 0) + BA;
  return t;
}

// El finde que corre o el que viene: viernes 00:00 → lunes 07:00 (la noche del
// domingo termina a la mañana). Desde el domingo al mediodía ya es el próximo.
export function weekendWindow(now = Date.now()) {
  const ba = new Date(now - BA);                 // reloj de BA leído con getters UTC
  const night = new Date(ba.getTime() - 7 * 36e5);
  const dow = night.getUTCDay();
  const offset = dow === 5 ? 0 : dow === 6 ? -1 : dow === 0 ? (ba.getUTCHours() >= 12 ? 5 : -2) : 5 - dow;
  const fri = Date.UTC(night.getUTCFullYear(), night.getUTCMonth(), night.getUTCDate() + offset) + BA;
  return { fri, mon: fri + 3 * DAY + 7 * 36e5 };
}

// Hasta dos por noche: destacados primero, después los de line-up más largo y
// con flyer. Solo AMBA (la superficie de BassLayer).
export function findePicks(events, now = Date.now(), perDay = 2) {
  const { fri, mon } = weekendWindow(now);
  const byDay = new Map();
  for (const ev of events || []) {
    if (ev.area !== "amba") continue;
    const t = eventEpoch(ev, now);
    if (t == null || t < fri || t >= mon) continue;
    const k = `${ev.day}-${ev.month}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(ev);
  }
  const score = (e) => (e.featured ? 100 : 0) + Math.min((e.artists || []).length, 6) * 5 + (e.image ? 3 : 0);
  return [...byDay.values()]
    .flatMap((d) => [...d].sort((a, b) => score(b) - score(a)).slice(0, perDay))
    .sort((a, b) => eventEpoch(a, now) - eventEpoch(b, now));
}

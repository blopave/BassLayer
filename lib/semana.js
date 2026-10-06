// El resumen de la semana (oct 2026): la otra pieza de "volver sin cuentas",
// junto al calendario del finde. Un link fijo (/semana) que cada lunes cuenta
// la semana en dos frecuencias: lo que viene en la noche (las fiestas de lunes
// a domingo en el AMBA) y lo que hizo el mercado en los últimos 7 días.
//
// Función pura: recibe los datos que ya tiene el server y devuelve el resumen.
// Todo sale de fuentes del sitio; lo que no está (p. ej. noticias de toda la
// semana: los feeds cubren ~1 día) no se inventa.
import { eventEpoch, findePicks } from "./finde.js";
import { computeTours } from "./tours.js";
import { cleanLineup } from "./content-rules.js";
import { textIsAmba } from "./places.js";

const BA = 3 * 36e5;
const DAY = 864e5;
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// La semana que corre: lunes 07:00 → lunes 07:00 (hora de BA). La noche del
// domingo termina el lunes a la mañana, así que hasta las 7 sigue la anterior.
export function semanaVentana(now = Date.now()) {
  const ba = new Date(now - BA - 7 * 36e5);
  const dow = ba.getUTCDay() || 7;   // 1 = lunes … 7 = domingo
  const lunes = Date.UTC(ba.getUTCFullYear(), ba.getUTCMonth(), ba.getUTCDate() - (dow - 1)) + BA;
  return { desde: lunes + 7 * 36e5, hasta: lunes + 7 * DAY + 7 * 36e5, lunes };
}

// Semana ISO (lunes a domingo): el número de la edición.
export function semanaISO(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { anio: t.getUTCFullYear(), semana: Math.ceil(((t - y0) / 864e5 + 1) / 7) };
}

const ymd = (t) => new Date(t - BA).toISOString().slice(0, 10);
const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);

export function armarSemana({ events = [], prices = [], festivals = [], cryptoEvents = [], salas = [], now = Date.now() }) {
  const { desde, hasta, lunes } = semanaVentana(now);
  const numero = semanaISO(new Date(lunes + 12 * 36e5));
  const amba = events.filter((e) => e.area === "amba");

  // La noche: las fiestas que quedan de la semana, día por día (desde ahora).
  const inicio = Math.max(desde, now - 7 * 36e5);
  const conFecha = amba.map((e) => ({ e, t: eventEpoch(e, now) })).filter(({ t }) => t != null && t >= inicio && t < hasta);
  // Cada fiesta cuenta en la fecha que anuncia (la misma que la Agenda), no en
  // "la noche" de corte a las 7: si no, el sábado y el domingo no coincidían.
  const porDia = [];
  for (let d = 0; d < 7; d++) {
    const dia0 = lunes + d * DAY + 7 * 36e5, dia1 = dia0 + DAY;
    const fecha = ymd(dia0 + 12 * 36e5);
    const del = conFecha.filter(({ t }) => ymd(t) === fecha).map(({ e }) => e);
    if (dia1 <= inicio) continue;
    const top = [...del].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.artists || []).length - (a.artists || []).length)[0];
    porDia.push({ fecha, dia: DIAS[new Date(dia0 - BA + 12 * 36e5).getUTCDay()], fiestas: del.length, destacada: top ? resumirEvento(top) : null });
  }
  const fiestas = porDia.reduce((n, d) => n + d.fiestas, 0);

  // El finde (los elegidos, la misma regla que el calendario suscribible).
  const finde = findePicks(events, now).map(resumirEvento);

  // De gira: artistas que pasan por Buenos Aires esta semana y tocan afuera antes o después.
  const tours = computeTours(events, { dateOf: (ev) => { const t = eventEpoch(ev, now); return t == null ? null : new Date(t); }, clean: cleanLineup, now: now - 6 * 36e5 })
    .filter((t) => t.date.getTime() >= inicio && t.date.getTime() < hasta)
    .slice(0, 4)
    .map((t) => ({ artista: t.on[0], evento: resumirEvento(t.ev), ciudades: [...new Set(t.stops.map((s) => s.city).filter(Boolean))] }));

  // Festivales que empiezan en los próximos 45 días (Buenos Aires primero).
  const lim = ymd(now + 45 * DAY), hoy = ymd(now);
  const festivales = festivals
    .filter((f) => f.dates_start && f.dates_start >= hoy && f.dates_start <= lim)
    .sort((a, b) => ((b.region === "BA") - (a.region === "BA")) || a.dates_start.localeCompare(b.dates_start))
    .slice(0, 3)
    .map((f) => ({ nombre: f.name, ciudad: f.city, desde: f.dates_start, hasta: f.dates_end || f.dates_start, slug: f.id }));

  // Salas: los shows de la semana en las salas grandes (no electrónica: es la pestaña Salas).
  const salasSemana = salas
    .filter((s) => s.date >= ymd(inicio) && s.date < ymd(hasta))
    .slice(0, 40);
  const grandes = ["movistar-arena", "teatro-gran-rex", "teatro-opera", "c-art-media"];
  const enSalas = salasSemana.filter((s) => grandes.includes(s.sala)).slice(0, 4).map((s) => ({ titulo: s.title, sala: s.salaName, fecha: s.date, hora: s.time || "", url: s.url || "" }));

  // El mercado: cómo cerró cada activo en los últimos 7 días (serie horaria de 168 puntos).
  const activos = prices
    .filter((p) => Array.isArray(p.sparkline) && p.sparkline.length >= 24)
    .map((p) => {
      const s = p.sparkline, ult = s[s.length - 1];
      const paso = Math.max(1, Math.floor(s.length / 28));
      return { sym: p.sym, nombre: p.name, usd: p.usd ?? ult, cambio7d: pct(ult, s[0]), serie: s.filter((_, i) => i % paso === 0).concat(ult) };
    });
  const orden = [...activos].sort((a, b) => b.cambio7d - a.cambio7d);
  const btc = activos.find((a) => a.sym === "BTC") || null;

  // Eventos cripto de la semana (los de Buenos Aires primero).
  const eventosCripto = cryptoEvents
    .filter((e) => e.date && e.date >= ymd(inicio) && e.date < ymd(hasta))
    .sort((a, b) => (textIsAmba(b.location || "") - textIsAmba(a.location || "")) || a.date.localeCompare(b.date))
    .slice(0, 4)
    .map((e) => ({ titulo: e.title, lugar: e.location || "", fecha: e.date, url: e.url || "", enBA: textIsAmba(e.location || "") }));

  return {
    semana: { anio: numero.anio, numero: numero.semana, desde: ymd(desde + 12 * 36e5), hasta: ymd(hasta - DAY) },
    noche: { fiestas, porDia, finde, gira: tours, festivales, salas: enSalas },
    mercado: { btc, activos, mejor: orden[0] || null, peor: orden[orden.length - 1] || null, eventos: eventosCripto },
    generado: new Date(now).toISOString(),
  };
}

function resumirEvento(e) {
  return { nombre: e.name, venue: e.venue, dia: e.day, mes: e.month, hora: e.time || "", artistas: cleanLineup(e.artists).slice(0, 4), imagen: e.image || "", imagenArtista: e.artistImage || "", familia: e.family || "", destacado: !!e.featured };
}

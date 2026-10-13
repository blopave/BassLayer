// Ciclos fijos de la semana (oct 2026): data/recurrentes.json, curado a mano.
// No se inventan fechas: el ciclo se muestra como "todos los martes" y, si una
// fuente ya publicó la fecha concreta (RA, QuéHacemos…), se enlaza esa.
// Lo compartido entre server y check:content.

export const CICLO_OCULTO_DIAS = 60;   // sin re-verificar más que esto, el server no lo muestra
export const CICLO_AVISO_DIAS = 45;    // check:content avisa antes, para re-verificar a tiempo

const DIA = 86400000;
const MESES = { Ene: 0, Feb: 1, Mar: 2, Abr: 3, May: 4, Jun: 5, Jul: 6, Ago: 7, Sep: 8, Oct: 9, Nov: 10, Dic: 11 };
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const edadDias = (iso, now) => (now - Date.parse(`${iso}T12:00:00-03:00`)) / DIA;

// Fecha de un evento de la agenda ({ day, month: "Oct" }) en ms, al mediodía de BA.
function fechaEvento(ev, now) {
  if (!(ev?.month in MESES)) return NaN;
  const y = new Date(now).getFullYear();
  let t = Date.parse(`${y}-${String(MESES[ev.month] + 1).padStart(2, "0")}-${String(ev.day).padStart(2, "0")}T12:00:00-03:00`);
  if (t < now - 180 * DIA) t += 365 * DIA;   // enero visto desde diciembre
  return t;
}

// La próxima fecha real del ciclo en la agenda: nombre que coincide con el
// patrón y en el mismo venue (o con el nombre del venue en el título).
export function proximaFecha(ciclo, events, now = Date.now()) {
  const re = new RegExp(ciclo.patron, "i"), venue = norm(ciclo.venue);
  const hoy = now - DIA / 2;
  const hits = (events || [])
    .filter((ev) => re.test(ev.name || "") && (norm(ev.venue).includes(venue) || norm(ev.name).includes(venue)))
    .map((ev) => ({ ev, t: fechaEvento(ev, now) }))
    .filter((x) => x.t >= hoy)
    .sort((a, b) => a.t - b.t);
  if (!hits.length) return null;
  const { ev } = hits[0];
  return { day: ev.day, month: ev.month, time: ev.time || "", name: ev.name, url: ev.url || "" };
}

export function ciclosVigentes(data, events, now = Date.now()) {
  return (data?.ciclos || [])
    .filter((c) => c.verificado && edadDias(c.verificado, now) <= CICLO_OCULTO_DIAS)
    .map(({ id, nombre, dia, frecuencia, hora, venue, direccion, estilo, link, nota }) => {
      const c = { id, nombre, dia, frecuencia, hora, venue, direccion, estilo, link, ...(nota && { nota }) };
      return { ...c, proxima: proximaFecha({ ...c, patron: data.ciclos.find((x) => x.id === id).patron }, events, now) };
    })
    .sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7));   // de lunes a domingo
}

// Las reglas del archivo: 2 fuentes de sitios distintos, verificación al día,
// día y patrón válidos, links https. Devuelve la lista de problemas.
export function validarCiclos(data, now = Date.now()) {
  const out = [];
  for (const c of data?.ciclos || []) {
    const n = c.nombre || c.id || "?";
    const hosts = new Set((c.fuentes || []).map((f) => { try { return new URL(f.url).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean));
    if (hosts.size < 2) out.push(`${n}: necesita 2 fuentes de sitios distintos (tiene ${hosts.size})`);
    if (!(Number.isInteger(c.dia) && c.dia >= 0 && c.dia <= 6)) out.push(`${n}: día inválido`);
    try { new RegExp(c.patron, "i"); if (!c.patron) throw 0; } catch { out.push(`${n}: patrón inválido`); }
    if (!/^https:\/\//.test(c.link || "")) out.push(`${n}: link sin https`);
    const edad = c.verificado ? edadDias(c.verificado, now) : Infinity;
    if (edad > CICLO_AVISO_DIAS) out.push(`${n}: verificado hace ${Math.round(edad)} días; re-verificar (a los ${CICLO_OCULTO_DIAS} se oculta)`);
  }
  return out;
}

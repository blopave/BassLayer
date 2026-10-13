// Ciclos fijos de la semana (oct 2026): data/recurrentes.json, curado a mano.
// No se inventan fechas: el ciclo se muestra como "todos los martes" y, el día
// en que una fuente ya publicó la fecha concreta, se ve el evento real.
// Lo compartido entre server y check:content.

import { eventEpoch } from "./finde.js";
import { normPlace } from "./places.js";

export const CICLO_OCULTO_DIAS = 60;   // sin re-verificar más que esto, el server no lo muestra
export const CICLO_AVISO_DIAS = 45;    // check:content avisa antes, para re-verificar a tiempo

const DIA = 86400000;
const BA = 3 * 36e5;
const edadDias = (iso, now) => (now - Date.parse(`${iso}T12:00:00-03:00`)) / DIA;
const isoBA = (t) => new Date(t - BA).toISOString().slice(0, 10);

// Los días (YYYY-MM-DD, hora de BA) en que la agenda ya tiene la fecha real del
// ciclo: nombre con el patrón y el venue en el venue o en el título. La Agenda
// no pone la fila de "todos los martes" esos días.
function publicadas(ciclo, re, events, now) {
  const venue = normPlace(ciclo.venue);
  const out = new Set();
  for (const ev of events || []) {
    if (!re.test(ev.name || "") || !(normPlace(ev.venue).includes(venue) || normPlace(ev.name).includes(venue))) continue;
    const t = eventEpoch(ev, now);
    if (t != null && t >= now - DIA) out.add(isoBA(t));
  }
  return [...out].sort();
}

export function ciclosVigentes(data, events, now = Date.now()) {
  return (data?.ciclos || [])
    .filter((c) => c.verificado && edadDias(c.verificado, now) <= CICLO_OCULTO_DIAS)
    .map(({ patron, fuentes, verificado, desde, ...c }) => ({ ...c, publicadas: publicadas(c, new RegExp(patron, "i"), events, now) }))
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

// Notas por día (Noticias de Bass, Noticias y Finanzas de Layer): el "time"
// del feed ("12m", "3h", "2d") dice hace cuánto salió; se agrupan en días con
// el rótulo de la Agenda ("Hoy", "Ayer", "miércoles") y la fecha.
import { DAYS_LONG, MONTHS_ABBR } from "../i18n/strings";
import { minsDeNota } from "./format";

export function notasPorDia(list, t, locale) {
  const out = [], hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  // De la más nueva a la más vieja: los medios no siempre llegan en orden y un
  // mismo día no puede partirse en dos rótulos.
  const orden = [...list].sort((a, b) => minsDeNota(a.time) - minsDeNota(b.time));
  for (const n of orden) {
    const d = new Date(Date.now() - minsDeNota(n.time) * 60000);
    const k = Math.round((hoy - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!out.length || out[out.length - 1].key !== key) {
      const label = k <= 0 ? t("day.today") : k === 1 ? t("day.yesterday") : (DAYS_LONG[locale] || DAYS_LONG.es)[d.getDay()];
      out.push({ key, label, fecha: `${d.getDate()} ${(MONTHS_ABBR[locale] || MONTHS_ABBR.es)[d.getMonth()]}`, items: [] });
    }
    out[out.length - 1].items.push(n);
  }
  return out;
}

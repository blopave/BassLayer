import { useEffect, useMemo, useState } from "react";
import { BlThumb } from "./BlThumb";
import { useLocale } from "../hooks/useLocale";
import { eventSlug } from "../utils/slug";
import { api, shared } from "../utils/api";
import { formatPct } from "../utils/format";
import { findePicks, weekendWindow } from "../../lib/finde.js";
import { semanaISO, semanaVentana } from "../../lib/semana.js";

// "El finde en tu calendario" (oct 2026, Pablo eligió la B): volver sin
// cuentas. Los elegidos de viernes a domingo (lib/finde.js, los mismos que
// sirve /finde.ics) y un solo botón para suscribirse: el calendario de la
// persona se renueva solo cada semana y cada evento linkea a BassLayer.
const FEED = "basslayer.io/finde.ics";
// Google Calendar en Android no abre webcal://: se le pasa el feed por cid.
const subscribeUrl = () => (/android/i.test(navigator.userAgent)
  ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${FEED}`)}`
  : `webcal://${FEED}`);

export function Finde({ events, onSelect }) {
  const { t, locale } = useLocale();
  const picks = useMemo(() => findePicks(events), [events]);
  const range = useMemo(() => {
    const { fri, mon } = weekendWindow();
    const opt = { weekday: "short", day: "numeric", timeZone: "America/Argentina/Buenos_Aires" };
    const f = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-AR", opt);
    const m = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-AR", { month: "short", timeZone: "America/Argentina/Buenos_Aires" });
    return `${f.format(fri)} — ${f.format(mon - 864e5)} ${m.format(mon - 864e5)}`.replace(/\./g, "");
  }, [locale]);
  if (!picks.length) return null;
  return (
    <section className="bl-finde" aria-label={t("finde.title")}>
      <h2 className="bl-day-header"><span className="bl-day-label">{t("finde.title")}</span><span className="bl-day-date">{range}</span><span className="bl-day-line" aria-hidden="true" /></h2>
      <div className="bl-finde-row">
        <div className="bl-finde-thumbs">
          {picks.slice(0, 4).map((ev) => (
            <button type="button" key={eventSlug(ev)} className="bl-finde-thumb" onClick={() => onSelect(ev)} aria-label={ev.name}>
              <BlThumb image={ev.image} artistImage={ev.artistImage} poster={{ text: (ev.artists && ev.artists[0]) || ev.name, family: ev.family }} />
            </button>
          ))}
        </div>
        <p className="bl-finde-copy"><b>{t("finde.picks", { n: picks.length })}</b> {t("finde.copy")}</p>
        <a className="bl-finde-btn" href={subscribeUrl()}>{t("finde.subscribe")}</a>
      </div>
    </section>
  );
}

// La línea de la semana (oct 2026): debajo del finde, discreta, lleva al
// resumen semanal (/semana). El número de la semana sale del reloj y ocupa su
// lugar desde el primer render; las cifras llegan después sin mover la Agenda
// (si aparecía de golpe, el salto a un día quedaba corrido).
export function SemanaLinea() {
  const { t } = useLocale();
  const [S, setS] = useState(null);
  const numero = useMemo(() => semanaISO(new Date(semanaVentana().lunes + 12 * 36e5)).semana, []);
  useEffect(() => { shared("semana", api.semana, 600_000).then(setS).catch(() => {}); }, []);
  const b = S?.mercado.btc;
  return (
    <a className="bl-sem-line" href="/semana">
      <b>{t("semana.line", { n: numero })}</b>
      <span className="go" aria-hidden="true">→</span>
      <span className="st">{S && <>{t("semana.parties", { n: S.noche.fiestas })}{b && <> {t("semana.andBtc")} <span className="y">{formatPct(b.cambio7d)}</span></>}</>}</span>
    </a>
  );
}

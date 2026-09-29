import { useMemo, useState } from "react";
import { BlThumb } from "./BlThumb";
import { useLocale } from "../hooks/useLocale";
import { DAYS_LONG, MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { noOrphanSep } from "../utils/format";

// "De gira" (sept 2026): BassLayer es de Buenos Aires y lo del exterior no se
// lista en la agenda; entra acá, como la ruta de artistas que pasan por la
// ciudad. Un show AMBA aparece si alguien de su line-up toca afuera dentro de
// ±45 días. Todo sale de fechas publicadas en nuestras fuentes (RA, Buenos
// Aliens, QuéHacemos): no se infiere nacionalidad ni se inventan paradas.

const WINDOW_DAYS = 45;
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

function useTours(events) {
  return useMemo(() => {
    const byArtist = new Map();
    for (const ev of events) {
      if (ev.region === "AR") continue;
      const date = getEventDate(ev);
      if (!date) continue;
      for (const a of ev.artists || []) {
        const n = norm(a);
        if (n.length < 4) continue;
        if (!byArtist.has(n)) byArtist.set(n, []);
        byArtist.get(n).push({ city: ev.city, date });
      }
    }
    const now = Date.now() - 6 * 3600000;
    const tours = [];
    for (const ev of events) {
      if (ev.area !== "amba") continue;
      const date = getEventDate(ev);
      if (!date || date.getTime() < now) continue;
      const on = (ev.artists || []).filter((a) => byArtist.has(norm(a)));
      if (!on.length) continue;
      const near = on.flatMap((a) => byArtist.get(norm(a)))
        .filter((s) => Math.abs(s.date - date) <= WINDOW_DAYS * 86400000);
      if (!near.length) continue;
      const stops = [...new Map(near.map((s) => [`${s.city}|${s.date.toDateString()}`, s])).values()]
        .sort((a, b) => a.date - b.date).slice(0, 3);
      tours.push({ ev, date, on, stops });
    }
    return tours.sort((a, b) => a.date - b.date);
  }, [events]);
}

function Route({ tour, t, M }) {
  const short = (d) => `${d.getDate()} ${M[d.getMonth()].toLowerCase()}`;
  const pts = [...tour.stops.map((s) => ({ ...s, here: false })), { city: t("tour.here"), date: tour.date, here: true }]
    .sort((a, b) => a.date - b.date);
  return (
    <span className="bl-tour-route" aria-label={t("tour.routeAria")}>
      {pts.map((p, i) => (
        <span key={`${p.city}-${i}`} className={`bl-tour-stop${p.here ? " is-here" : ""}`}>
          {i > 0 && <span className="bl-tour-ln" aria-hidden="true" />}
          <span className="bl-tour-dot" aria-hidden="true" />
          {p.city} {short(p.date)}
        </span>
      ))}
    </span>
  );
}

export function OnTour({ events, onSelect }) {
  const { t, locale } = useLocale();
  const tours = useTours(events);
  const [all, setAll] = useState(false);
  if (!tours.length) return null;
  const dayNames = DAYS_LONG[locale] || DAYS_LONG.es;
  const M = MONTHS_ABBR[locale] || MONTHS_ABBR.es;
  const venue = (ev) => String(ev.venue || "").replace(/^(tba|tbd|tbc)\s*[-:|–—]\s*/i, "").split(",")[0];
  const who = (tour) => tour.on.length > 2 ? `${tour.on.slice(0, 2).join(" · ")}` : tour.on.join(" · ");

  return (
    <section className="bl-hero bl-tour" aria-label={t("tour.title")}>
      <div className="bl-hero-head">
        <h2 className="bl-hero-title bl-bass-t-stamp">{t("tour.title")}</h2>
        <span className="bl-tour-sub">{t("tour.sub")}</span>
        {tours.length > 3 && (
          <button type="button" className="bl-tour-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("tour.less") : t("tour.all", { n: tours.length })}
          </button>
        )}
      </div>
      <div className={all ? "bl-tour-list" : "bl-tour-row"}>
        {(all ? tours : tours.slice(0, 8)).map((tour) => {
          const { ev, date } = tour;
          return (
            <button type="button" className="bl-tour-card" key={`${ev.day}-${ev.month}-${ev.venue}-${ev.name}`} onClick={() => onSelect(ev)}
              aria-label={`${tour.on.join(", ")} — ${venue(ev)}, ${dayNames[date.getDay()]} ${date.getDate()}`}>
              <BlThumb image={ev.image} artistImage={ev.artistImage} artistImageName={ev.artistImageName}
                poster={{ text: tour.on[0], family: ev.family }} width={320} />
              <span className="bl-tour-body">
                <span className="bl-tour-who">{noOrphanSep(who(tour))}{tour.on.length > 2 && <small>{t("tour.more", { n: tour.on.length - 2 })}</small>}</span>
                <span className="bl-tour-meta bl-bass-t-label"><b>{(dayNames[date.getDay()] || "").slice(0, 3)} {date.getDate()} {M[date.getMonth()]}</b> · {venue(ev)}</span>
                <Route tour={tour} t={t} M={M} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useMemo, useState } from "react";
import { ScrollRow } from "./ScrollRow";
import { BlThumb } from "./BlThumb";
import { useLocale } from "../hooks/useLocale";
import { DAYS_LONG, MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { cleanArtists } from "../utils/artists";
import { cleanVenue } from "../utils/format";
import { computeTours } from "../../lib/tours.js";
import { noOrphanSep } from "../utils/format";

// "De gira" (sept 2026): BassLayer es de Buenos Aires y lo del exterior no se
// lista en la agenda; entra acá, como la ruta de artistas que pasan por la
// ciudad. El cálculo vive en lib/tours.js (lo comparte el smoke).

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

// `compact`: tarjetas bajas (foto chica al costado) para ir arriba de la agenda
// sin taparla: "De gira" a la vista y la primera fiesta en la misma pantalla.
// Fila con desplazamiento visible (flechas y bordes); "ver las N" la abre en grilla.
function TourWrap({ all, children }) {
  return all ? <div className="bl-tour-list">{children}</div> : <ScrollRow className="bl-tour-row">{children}</ScrollRow>;
}

export function OnTour({ events, onSelect, compact = false }) {
  const { t, locale } = useLocale();
  const tours = useMemo(() => computeTours(events, { dateOf: getEventDate, clean: cleanArtists }), [events]);
  const [all, setAll] = useState(false);
  if (!tours.length) return null;
  const dayNames = DAYS_LONG[locale] || DAYS_LONG.es;
  const M = MONTHS_ABBR[locale] || MONTHS_ABBR.es;
  const venue = (ev) => cleanVenue(ev.venue);

  return (
    <section className={`bl-hero bl-tour${compact ? " is-compact" : ""}`} aria-label={t("tour.title")}>
      <div className="bl-hero-head">
        <h2 className="bl-hero-title bl-bass-t-stamp">{t("tour.title")}</h2>
        <span className="bl-tour-sub">{t("tour.sub")}</span>
        {tours.length > 3 && (
          <button type="button" className="bl-tour-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("tour.less") : t("tour.all", { n: tours.length })}
          </button>
        )}
      </div>
      <TourWrap all={all}>
        {(all ? tours : tours.slice(0, 8)).map((tour) => {
          const { ev, date } = tour;
          return (
            <button type="button" className="bl-tour-card" key={`${ev.day}-${ev.month}-${ev.venue}-${ev.name}`} onClick={() => onSelect(ev)}
              aria-label={`${tour.on.join(", ")} — ${venue(ev)}, ${dayNames[date.getDay()]} ${date.getDate()}`}>
              <BlThumb image={ev.image} artistImage={ev.artistImage} artistImageName={ev.artistImageName}
                poster={{ text: tour.on[0], family: ev.family }} width={320} />
              <span className="bl-tour-body">
                <span className="bl-tour-who">{noOrphanSep(tour.on.slice(0, 2).join(" · "))}{tour.on.length > 2 && <small>{t("tour.more", { n: tour.on.length - 2 })}</small>}</span>
                <span className="bl-tour-meta bl-bass-t-label"><b>{(dayNames[date.getDay()] || "").slice(0, 3)} {date.getDate()} {M[date.getMonth()]}</b> · {venue(ev)}</span>
                <Route tour={tour} t={t} M={M} />
              </span>
            </button>
          );
        })}
      </TourWrap>
    </section>
  );
}

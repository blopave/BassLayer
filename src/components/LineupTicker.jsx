import { useMemo, useState, useEffect } from "react";
import { useLocale } from "../hooks/useLocale";
import { DAYS_LONG, getEventDate } from "../i18n/strings";

// Marquesina de line-ups — hermano del PriceTicker de Layer.
// Barre los artistas que tocan en los próximos días (venue + badge vivo),
// clickable → abre el evento. Motivo Bass: ecualizador en vez de sparkline.

// Artistas reales del line-up — descarta placeholders (TBA / "ARTISTS TBA").
// La marquesina es artist-first: si no hay line-up real, el evento no entra.
function realArtists(ev) {
  return (ev.artists || []).filter((a) => a && !/^\s*(artists\s+)?tba\s*$/i.test(a));
}

// Venue limpio — saca prefijos "TBA - " y recorta a lo esencial (antes de la coma).
function cleanVenue(v) {
  if (!v) return "";
  return v.replace(/^\s*tba\s*[-–]\s*/i, "").split(",")[0].trim();
}

// Badge de tiempo del evento. Depende de "ahora", por eso se calcula en render
// (no en el memo): así el tick de cada minuto refresca los countdown "en Xh/Xm".
function dayBadge(d, now, t, dayNames) {
  const today = new Date(now);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const evDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((evDay - t0) / 86400000);
  if (diffDays === 0) {
    const ms = d - now;
    if (ms <= 0) return { text: t("day.today"), live: true };
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return { text: hrs > 0 ? `en ${hrs}h` : `en ${mins}m`, live: true };
  }
  if (diffDays === 1) return { text: t("day.tomorrow"), live: false };
  return { text: dayNames[evDay.getDay()].slice(0, 3).toUpperCase(), live: false };
}

function Equalizer() {
  // 4 barras con fase distinta — energía viva incluso cuando el scroll pausa.
  return (
    <span className="bl-lineup-eq" aria-hidden="true">
      <span /><span /><span /><span />
    </span>
  );
}

export function LineupTicker({ events, onSelect, region = "AR" }) {
  const { t, locale } = useLocale();
  const dayNames = DAYS_LONG[locale] || DAYS_LONG.es;

  // Countdown vivo: re-render cada minuto para refrescar los badges "en Xh/Xm".
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  // Datos memoizados: región → artist-first → ventana → orden → cap. El badge NO
  // va acá (depende de "ahora"); se resuelve en render para que el tick lo mantenga vivo.
  const items = useMemo(() => {
    if (!events?.length) return [];
    const now = Date.now();
    const horizon = now + 21 * 86400000; // próximas ~3 semanas (combustible artist-first)

    return events
      .filter((ev) => (ev.region || "AR") === region)
      .map((ev) => ({ ev, date: getEventDate(ev), artists: realArtists(ev) }))
      // Artist-first: solo entra lo que tiene line-up real y cae en la ventana.
      .filter((x) => x.artists.length > 0 && x.date && x.date.getTime() >= now - 3600000 && x.date.getTime() <= horizon)
      // Por día ascendente; dentro del mismo día, featured primero y luego por hora.
      .sort((a, b) => {
        const dayA = Math.floor(a.date / 86400000), dayB = Math.floor(b.date / 86400000);
        if (dayA !== dayB) return a.date - b.date;
        return (Number(!!b.ev.featured) - Number(!!a.ev.featured)) || (a.date - b.date);
      })
      .slice(0, 18)
      .map((x) => ({ ev: x.ev, label: x.artists.slice(0, 2).join(", "), venue: cleanVenue(x.ev.venue), date: x.date }));
  }, [events, region]);

  if (items.length < 3) return null;

  const now = Date.now();
  const renderItem = (it, suffix) => {
    const badge = dayBadge(it.date, now, t, dayNames);
    return (
      <div
        className="bl-lineup-item"
        key={`${it.ev.day}-${it.ev.month}-${it.ev.venue}-${it.label}-${suffix}`}
        onClick={() => onSelect?.(it.ev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onSelect?.(it.ev)}
      >
        <Equalizer />
        <span className="bl-lineup-act">{it.label}</span>
        <span className="bl-lineup-at">@</span>
        <span className="bl-lineup-venue">{it.venue}</span>
        <span className={`bl-lineup-when${badge.live ? " is-live" : ""}`}>{badge.text}</span>
      </div>
    );
  };

  return (
    <div className="bl-lineup-bar" role="marquee" aria-label={t("lineup.aria")}>
      <div className="bl-lineup-sign" aria-hidden="true">
        <span className="bl-lineup-dot" />
        <span className="bl-lineup-sign-label">{t("lineup.live")}</span>
      </div>
      <div className="bl-lineup-viewport">
        <div className="bl-lineup-track">
          {items.map((it) => renderItem(it, "a"))}
          {items.map((it) => renderItem(it, "b"))}
        </div>
      </div>
    </div>
  );
}

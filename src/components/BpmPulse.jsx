import { useMemo } from "react";
import { useLocale } from "../hooks/useLocale";
import { DAYS_LONG, getEventDate } from "../i18n/strings";

function isThisWeek(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return eventDate >= today && eventDate < weekEnd;
}

export function BpmPulse({ events, onSelectEvent }) {
  const { t, locale } = useLocale();
  const venues = useMemo(() => {
    if (!events || events.length === 0) return [];

    const thisWeek = events.filter(e => isThisWeek(getEventDate(e)));
    if (thisWeek.length === 0) return [];

    // Group by venue, count events, get next event date
    const venueMap = {};
    thisWeek.forEach(e => {
      if (!e.venue) return;
      if (!venueMap[e.venue]) venueMap[e.venue] = { name: e.venue, count: 0, nextEvent: null, genre: null };
      venueMap[e.venue].count++;
      const d = getEventDate(e);
      if (d && (!venueMap[e.venue].nextEvent || d < venueMap[e.venue].nextEvent)) {
        venueMap[e.venue].nextEvent = d;
        venueMap[e.venue].genre = e.genre;
      }
    });

    return Object.values(venueMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [events]);

  if (venues.length === 0) return null;

  const totalThisWeek = events.filter(e => isThisWeek(getEventDate(e))).length;

  function getNextLabel(d) {
    if (!d) return "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const evDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((evDay - today) / 86400000);
    if (diff === 0) return t("common.today");
    if (diff === 1) return t("common.tomorrow");
    return (DAYS_LONG[locale] || DAYS_LONG.es)[evDay.getDay()].slice(0, 3);
  }

  return (
    <div className="bl-pulse">
      <div className="bl-pulse-header">
        <span className="bl-pulse-label">{t("pulse.thisWeek")}</span>
        <span className="bl-pulse-count">{t("pulse.events", { n: totalThisWeek })}</span>
      </div>
      <div className="bl-pulse-scroll">
        {venues.map((v) => (
          <button
            key={v.name}
            className="bl-pulse-chip"
            onClick={() => {
              // Find first event of this venue this week and select it
              const ev = events.find(e => e.venue === v.name && isThisWeek(getEventDate(e)));
              if (ev) onSelectEvent?.(ev);
            }}
          >
            <span className="bl-pulse-chip-name">{v.name}</span>
            <span className="bl-pulse-chip-meta">
              <span className="bl-pulse-chip-count">{v.count}</span>
              <span className="bl-pulse-chip-dot">&middot;</span>
              <span className="bl-pulse-chip-next">{getNextLabel(v.nextEvent)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

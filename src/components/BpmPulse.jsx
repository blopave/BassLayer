import { useMemo } from "react";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

function getEventDate(ev) {
  const m = MONTHS_MAP[ev.month?.toLowerCase()];
  if (m === undefined) return null;
  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (ev.time || "23:00").split(":").map(Number);
  const d = new Date(year, m, parseInt(ev.day), h || 23, min || 0);
  if (d < now - 30 * 86400000) d.setFullYear(year + 1);
  return d;
}

function isThisWeek(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return eventDate >= today && eventDate < weekEnd;
}

export function BpmPulse({ events, onSelectEvent }) {
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
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Mañana";
    return ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][evDay.getDay()];
  }

  return (
    <div className="bl-pulse">
      <div className="bl-pulse-header">
        <span className="bl-pulse-label">Esta semana</span>
        <span className="bl-pulse-count">{totalThisWeek} eventos</span>
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

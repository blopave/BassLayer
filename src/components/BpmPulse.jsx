import { useMemo, useState } from "react";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };
const DAY_NAMES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

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

function formatDay(ev) {
  const d = getEventDate(ev);
  if (!d) return ev.day + " " + ev.month;
  return DAY_NAMES[d.getDay()] + " " + ev.day + "/" + (d.getMonth() + 1);
}

export function BpmPulse({ events, onSelectEvent }) {
  const [expandedVenue, setExpandedVenue] = useState(null);

  const stats = useMemo(() => {
    if (!events || events.length === 0) return null;

    const thisWeek = events.filter(e => isThisWeek(getEventDate(e)));
    if (thisWeek.length === 0) return null;

    // Venue ranking
    const venueCounts = {};
    const venueEvents = {};
    thisWeek.forEach(e => {
      if (e.venue) {
        venueCounts[e.venue] = (venueCounts[e.venue] || 0) + 1;
        if (!venueEvents[e.venue]) venueEvents[e.venue] = [];
        venueEvents[e.venue].push(e);
      }
    });
    const topVenues = Object.entries(venueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxVenueCount = topVenues.length > 0 ? topVenues[0][1] : 1;

    return {
      thisWeek: thisWeek.length,
      topVenues,
      maxVenueCount,
      venueEvents,
    };
  }, [events]);

  if (!stats) return null;

  const toggleVenue = (venue) => {
    setExpandedVenue(prev => prev === venue ? null : venue);
  };

  return (
    <div className="bl-bpm-pulse">
      <div className="bl-bpm-header">
        <div className="bl-bpm-title">Venues mas activos</div>
        <div className="bl-bpm-subtitle">Esta semana · {stats.thisWeek} eventos</div>
      </div>

      <div className="bl-venues-ranking">
        {stats.topVenues.map(([venue, count], idx) => (
          <div key={venue} className="bl-venue-group">
            <div
              className={`bl-venue-row bl-venue-row-clickable${expandedVenue === venue ? " active" : ""}`}
              onClick={() => toggleVenue(venue)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && toggleVenue(venue)}
            >
              <span className="bl-venue-rank">{idx + 1}</span>
              <div className="bl-venue-info">
                <span className="bl-venue-name">{venue}</span>
                <div className="bl-venue-bar-bg">
                  <div
                    className="bl-venue-bar"
                    style={{ width: `${(count / stats.maxVenueCount) * 100}%` }}
                  />
                </div>
              </div>
              <span className="bl-venue-count">{count} {count === 1 ? "evento" : "eventos"}</span>
              <span className={`bl-venue-chevron${expandedVenue === venue ? " open" : ""}`}>
                <svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              </span>
            </div>

            {expandedVenue === venue && stats.venueEvents[venue] && (
              <div className="bl-venue-events">
                {stats.venueEvents[venue]
                  .sort((a, b) => (getEventDate(a) || 0) - (getEventDate(b) || 0))
                  .map((ev, i) => (
                  <div
                    key={i}
                    className="bl-venue-event-item"
                    onClick={() => onSelectEvent?.(ev)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onSelectEvent?.(ev)}
                  >
                    <span className="bl-venue-event-date">{formatDay(ev)}</span>
                    <span className="bl-venue-event-name">{ev.name}</span>
                    <span className="bl-venue-event-time">{ev.time} hs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

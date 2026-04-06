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

function isTonight(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowEnd = new Date(todayStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(8, 0, 0, 0); // events end around 8am next day
  return eventDate >= todayStart && eventDate <= tomorrowEnd;
}

function isThisWeek(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return eventDate >= today && eventDate < weekEnd;
}

export function BpmPulse({ events }) {
  const stats = useMemo(() => {
    if (!events || events.length === 0) return null;

    const thisWeek = events.filter(e => isThisWeek(getEventDate(e)));
    if (thisWeek.length === 0) return null;

    // Venue ranking
    const venueCounts = {};
    thisWeek.forEach(e => {
      if (e.venue) venueCounts[e.venue] = (venueCounts[e.venue] || 0) + 1;
    });
    const topVenues = Object.entries(venueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxVenueCount = topVenues.length > 0 ? topVenues[0][1] : 1;

    return {
      thisWeek: thisWeek.length,
      topVenues,
      maxVenueCount,
    };
  }, [events]);

  if (!stats) return null;

  return (
    <div className="bl-bpm-pulse">
      <div className="bl-bpm-header">
        <div className="bl-bpm-title">Venues más activos</div>
        <div className="bl-bpm-subtitle">Esta semana · {stats.thisWeek} eventos</div>
      </div>

      <div className="bl-venues-ranking">
        {stats.topVenues.map(([venue, count], idx) => (
          <div className="bl-venue-row" key={venue}>
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
          </div>
        ))}
      </div>
    </div>
  );
}

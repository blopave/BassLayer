import { useEffect, useMemo } from "react";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };
const DAY_NAMES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function getEventDate(ev) {
  const m = MONTHS_MAP[ev.month?.toLowerCase()];
  if (m === undefined) return null;
  const d = parseInt(ev.day);
  if (isNaN(d)) return null;
  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (ev.time || "23:00").split(":").map(Number);
  const date = new Date(year, m, d, h || 23, min || 0);
  if (date < now - 30 * 86400000) date.setFullYear(year + 1);
  return date;
}

function isThisWeekend(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();
  let fridayOffset;
  if (dow === 5) fridayOffset = 0;
  else if (dow === 6) fridayOffset = -1;
  else if (dow === 0) fridayOffset = -2;
  else fridayOffset = 5 - dow;
  const friday = new Date(today);
  friday.setDate(friday.getDate() + fridayOffset);
  const monday = new Date(friday);
  monday.setDate(monday.getDate() + 3);
  const evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  return evDay >= friday && evDay < monday;
}

function formatArtists(artists) {
  const clean = (artists || []).filter(a => a && a !== "TBA" && !a.match(/^(b2b|más a confirmar)/i));
  if (clean.length === 0) return null;
  if (clean.length <= 3) return clean.join(", ");
  return clean.slice(0, 3).join(", ") + ` +${clean.length - 3}`;
}

export function WeekendPicker({ events, onClose, onSelect }) {
  const grouped = useMemo(() => {
    const weekend = events
      .filter(e => isThisWeekend(getEventDate(e)))
      .sort((a, b) => (getEventDate(a) || 0) - (getEventDate(b) || 0));

    // Group by day
    const days = [];
    let currentDay = null;
    for (const ev of weekend) {
      const d = getEventDate(ev);
      const dayKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "unknown";
      const label = d ? `${DAY_NAMES[d.getDay()]} ${ev.day} ${ev.month}` : `${ev.day} ${ev.month}`;
      if (dayKey !== currentDay) {
        days.push({ label, events: [ev] });
        currentDay = dayKey;
      } else {
        days[days.length - 1].events.push(ev);
      }
    }
    return days;
  }, [events]);

  const total = grouped.reduce((sum, g) => sum + g.events.length, 0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (total === 0) {
    return (
      <div className="bl-wp-overlay" onClick={onClose}>
        <div className="bl-wp-panel" onClick={e => e.stopPropagation()}>
          <div className="bl-wp-panel-header">
            <div className="bl-wp-panel-title">Este finde</div>
            <button className="bl-wp-close" onClick={onClose}>&times;</button>
          </div>
          <div className="bl-wp-empty-msg">No hay eventos este finde</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bl-wp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bl-wp-panel" onClick={e => e.stopPropagation()}>
        <div className="bl-wp-panel-header">
          <div>
            <div className="bl-wp-panel-title">Este finde</div>
            <div className="bl-wp-panel-count">{total} evento{total !== 1 ? "s" : ""}</div>
          </div>
          <button className="bl-wp-close" onClick={onClose}>&times;</button>
        </div>

        <div className="bl-wp-panel-body">
          {grouped.map((group, gi) => (
            <div key={gi} className="bl-wp-day-group">
              <div className="bl-wp-day-label">{group.label}</div>
              {group.events.map((ev, ei) => {
                const artistStr = formatArtists(ev.artists);
                return (
                  <div
                    key={ei}
                    className="bl-wp-event-row"
                    onClick={() => { onClose(); onSelect?.(ev); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && (onClose(), onSelect?.(ev))}
                  >
                    <div className="bl-wp-ev-time">{ev.time || "--:--"}</div>
                    <div className="bl-wp-ev-body">
                      <div className="bl-wp-ev-name">{ev.name}</div>
                      {artistStr && <div className="bl-wp-ev-artists">{artistStr}</div>}
                      <div className="bl-wp-ev-meta">
                        <span className="bl-wp-ev-venue">{ev.venue}</span>
                        {ev.genre && <span className="bl-wp-ev-genre">{ev.genre}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

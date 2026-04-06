import { useState, useEffect, useMemo } from "react";
import { FilterBar } from "./FilterBar";
import { SearchBar } from "./SearchBar";
import { EventSkeleton } from "./SkeletonLoader";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { BpmPulse } from "./BpmPulse";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };
const DAY_NAMES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

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

function useCountdown(targetDate) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!targetDate) return;
    function update() {
      const diff = targetDate - Date.now();
      if (diff <= 0) { setText("Ahora"); return; }
      const days = Math.floor(diff / 86400000);
      const hrs = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (days > 0) setText(`en ${days}d ${hrs}h`);
      else if (hrs > 0) setText(`en ${hrs}h ${mins}m`);
      else setText(`en ${mins}m`);
    }
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [targetDate]);
  return text;
}

function formatArtists(artists) {
  if (!artists || artists.length === 0) return null;
  const clean = artists.filter(a => a && a !== "TBA" && !a.match(/^(b2b|más a confirmar)/i));
  if (clean.length === 0) return null;
  if (clean.length <= 3) return clean.join(", ");
  return clean.slice(0, 3).join(", ") + ` +${clean.length - 3}`;
}

function EventCountdown({ event }) {
  const eventDate = getEventDate(event);
  const countdown = useCountdown(eventDate);
  if (!countdown) return null;
  return <span className="bl-ev-countdown">{countdown}</span>;
}

function getDayLabel(eventDate) {
  if (!eventDate) return "Próximamente";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const diff = Math.round((evDay - today) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  const dayName = DAY_NAMES[evDay.getDay()];
  const dd = String(evDay.getDate()).padStart(2, "0");
  const mm = String(evDay.getMonth() + 1).padStart(2, "0");
  return `${dayName} ${dd}/${mm}`;
}

function isThisWeekend(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay(); // 0=Sun
  // Find next Friday (or today if it's Fri/Sat/Sun)
  let fridayOffset;
  if (dow === 5) fridayOffset = 0;      // Friday
  else if (dow === 6) fridayOffset = -1; // Saturday → go back to Friday
  else if (dow === 0) fridayOffset = -2; // Sunday → go back to Friday
  else fridayOffset = 5 - dow;           // Mon-Thu → forward to Friday
  const friday = new Date(today);
  friday.setDate(friday.getDate() + fridayOffset);
  const monday = new Date(friday);
  monday.setDate(monday.getDate() + 3); // Monday after weekend
  const evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  return evDay >= friday && evDay < monday;
}

export function BassFeed({ events, loading, error, onRetry, filter, onFilter, onSelect, search, onSearch, onOpenPicker }) {
  const genres = ["All", "Techno", "House", "Deep House", "Tech House", "Progressive", "Melodic", "Minimal", "Trance", "Festival", "Electronic"];
  const [cityFilter, setCityFilter] = useState("Todas");
  const [esteFinde, setEsteFinde] = useState(false);

  // Detect available cities from events
  const cities = useMemo(() => {
    const set = new Set(events.map(e => e.city).filter(Boolean));
    return ["Todas", ...Array.from(set).sort()];
  }, [events]);

  let filtered = events;
  if (filter !== "All") {
    filtered = filtered.filter((e) => e.genre === filter);
  }
  if (cityFilter !== "Todas") {
    filtered = filtered.filter((e) => e.city === cityFilter);
  }
  if (esteFinde) {
    filtered = filtered.filter((e) => isThisWeekend(getEventDate(e)));
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((e) =>
      (e.name || "").toLowerCase().includes(q) ||
      (e.venue || "").toLowerCase().includes(q) ||
      (e.artists || []).some((a) => (a || "").toLowerCase().includes(q))
    );
  }

  // Group events by day
  const grouped = useMemo(() => {
    const groups = [];
    let currentLabel = null;
    for (const ev of filtered) {
      const label = getDayLabel(getEventDate(ev));
      if (label !== currentLabel) {
        groups.push({ type: "header", label });
        currentLabel = label;
      }
      groups.push({ type: "event", data: ev });
    }
    return groups;
  }, [filtered]);

  const listRef = useScrollReveal(loading);

  function emptyMessage() {
    if (search) {
      return <><span className="bl-empty-icon" aria-hidden="true">{"\uD83D\uDD0D"}</span>No encontramos nada para &ldquo;{search}&rdquo;. Prob&aacute; con otro t&eacute;rmino.</>;
    }
    if (esteFinde) {
      return <><span className="bl-empty-icon" aria-hidden="true">{"\uD83C\uDF1F"}</span>Sin eventos este finde. Prob&aacute; quitando el filtro.</>;
    }
    return <><span className="bl-empty-icon" aria-hidden="true">{"\uD83C\uDFB6"}</span>Sin eventos para este filtro. Prob&aacute; con otro o volv&eacute; pronto.</>;
  }

  let itemIdx = 0;

  return (
    <>
      <BpmPulse events={events} onSelectEvent={onSelect} />
      <div className="bl-weekend-picker-trigger">
        <button className="bl-wp-trigger-btn" onClick={onOpenPicker}>
          A que voy este finde?
          <span className="bl-wp-trigger-arrow">&rarr;</span>
        </button>
      </div>
      <FilterBar items={genres} active={filter} onChange={onFilter} className="bass-filters" />
      <div className="bl-sub-filters">
        {cities.length > 2 && (
          <div className="bl-city-filter">
            {cities.map((c) => (
              <button key={c} className={`bl-city-chip${cityFilter === c ? " active" : ""}`} onClick={() => setCityFilter(c)}>{c}</button>
            ))}
          </div>
        )}
        <button className={`bl-finde-btn${esteFinde ? " active" : ""}`} onClick={() => setEsteFinde(!esteFinde)}>
          Este finde
        </button>
      </div>
      <SearchBar value={search} onChange={onSearch} />
      {loading ? <EventSkeleton />
        : error ? <div className="bl-ev-list"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>{error}</div></div>
        : filtered.length === 0 ? <div className="bl-ev-list"><div className="bl-empty">{emptyMessage()}</div></div>
        : <div className="bl-ev-list" role="feed" aria-label="Eventos de m&uacute;sica electr&oacute;nica" ref={listRef}>
            {grouped.map((item, gIdx) => {
              if (item.type === "header") {
                return (
                  <div className="bl-day-header bl-reveal" key={`h-${item.label}`} style={{ transitionDelay: `${Math.min(gIdx * 0.02, 0.15)}s` }}>
                    <span className="bl-day-label">{item.label}</span>
                    <span className="bl-day-line" aria-hidden="true" />
                  </div>
                );
              }
              const ev = item.data;
              const idx = itemIdx++;
              const artistStr = formatArtists(ev.artists);
              return (
                <article
                  className="bl-ev-item bl-reveal"
                  key={`${ev.day}-${ev.month}-${ev.venue}-${ev.name}`}
                  onClick={() => onSelect(ev)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(ev)}
                  style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${ev.name} - ${ev.day} ${ev.month} en ${ev.venue}`}
                >
                  <div className="bl-ev-date">
                    <div className="bl-ev-date-d">{ev.day}</div>
                    <div className="bl-ev-date-m">{ev.month}</div>
                  </div>
                  <div className="bl-ev-sep" aria-hidden="true" />
                  <div className="bl-ev-body">
                    <div className="bl-ev-name">{ev.name}</div>
                    {artistStr && <div className="bl-ev-artists">{artistStr}</div>}
                    <div className="bl-ev-meta-row">
                      <span className="bl-ev-venue-inline">{ev.venue}</span>
                      <span className="bl-ev-meta-dot" aria-hidden="true">&middot;</span>
                      <span className="bl-ev-time-inline">{ev.time} hs</span>
                    </div>
                  </div>
                  <div className="bl-ev-end">
                    <span className="bl-ev-genre-badge">{ev.genre}</span>
                    <EventCountdown event={ev} />
                  </div>
                </article>
              );
            })}
          </div>}
    </>
  );
}

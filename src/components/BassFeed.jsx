import { useEffect, useRef, useState } from "react";
import { FilterBar } from "./FilterBar";
import { SearchBar } from "./SearchBar";
import { EventSkeleton } from "./SkeletonLoader";

function useScrollReveal(deps) {
  const containerRef = useRef(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = container.querySelectorAll(".bl-reveal");
    if (!items.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -20px 0px" });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, deps);
  return containerRef;
}

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

function getEventDate(ev) {
  const m = MONTHS_MAP[ev.month?.toLowerCase()];
  if (m === undefined) return null;
  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (ev.time || "23:00").split(":").map(Number);
  const d = new Date(year, m, parseInt(ev.day), h || 23, min || 0);
  // If event date is way in the past, it might be next year
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

function FeaturedHero({ event, onSelect }) {
  const eventDate = getEventDate(event);
  const countdown = useCountdown(eventDate);

  return (
    <div className="bl-featured-hero bl-reveal" onClick={() => onSelect(event)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect(event)}>
      <div className="bl-featured-badge">Pr\u00f3ximo evento</div>
      <div className="bl-featured-content">
        <div className="bl-featured-date">
          <div className="bl-featured-date-d">{event.day}</div>
          <div className="bl-featured-date-m">{event.month}</div>
        </div>
        <div className="bl-featured-info">
          <div className="bl-featured-name">{event.name}</div>
          <div className="bl-featured-detail">{event.detail}</div>
          <div className="bl-featured-meta">
            <span className="bl-featured-venue">{event.venue}</span>
            <span className="bl-featured-sep">\u00b7</span>
            <span className="bl-featured-time">{event.time} hs</span>
          </div>
        </div>
        {countdown && <div className="bl-featured-countdown">{countdown}</div>}
      </div>
      <div className="bl-featured-arrow">\u2192</div>
    </div>
  );
}

function EventCountdown({ event }) {
  const eventDate = getEventDate(event);
  const countdown = useCountdown(eventDate);
  if (!countdown) return null;
  return <span className="bl-ev-countdown">{countdown}</span>;
}

export function BassFeed({ events, loading, error, onRetry, filter, onFilter, onSelect, search, onSearch, isFavorite }) {
  const genres = ["All", "\u2605 Saved", "Techno", "House", "Deep House", "Tech House", "Progressive", "Melodic", "Minimal", "Festival", "Electronic"];

  let filtered = events;
  if (filter === "\u2605 Saved") {
    filtered = events.filter((e) => isFavorite(e));
  } else if (filter !== "All") {
    filtered = events.filter((e) => e.genre === filter);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.venue.toLowerCase().includes(q) ||
      (e.artists || []).some((a) => a.toLowerCase().includes(q)) ||
      (e.detail || "").toLowerCase().includes(q)
    );
  }

  const listRef = useScrollReveal([filtered, loading]);

  const listEvents = filtered;

  function emptyMessage() {
    if (filter === "\u2605 Saved") {
      return <><span className="bl-empty-icon">{"\u2606"}</span>Todav\u00eda no guardaste eventos. Toc\u00e1 {"\u2606"} en cualquier evento.</>;
    }
    if (search) {
      return <><span className="bl-empty-icon">{"\uD83D\uDD0D"}</span>No encontramos nada para &ldquo;{search}&rdquo;. Prob\u00e1 con otro t\u00e9rmino.</>;
    }
    return <><span className="bl-empty-icon">{"\uD83C\uDFB6"}</span>Sin eventos para este filtro. Prob\u00e1 con otro o volv\u00e9 pronto.</>;
  }

  return (
    <>
      <FilterBar items={genres} active={filter} onChange={onFilter} className="bass-filters" />
      <SearchBar value={search} onChange={onSearch} />
      {loading ? <EventSkeleton />
        : error ? <div className="bl-ev-list"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>{error}</div></div>
        : filtered.length === 0 ? <div className="bl-ev-list"><div className="bl-empty">{emptyMessage()}</div></div>
        : <div className="bl-ev-list" role="feed" aria-label="Eventos de m\u00fasica electr\u00f3nica" ref={listRef}>
            {listEvents.map((item, idx) => (
              <article
                className={`bl-ev-item bl-reveal${item.featured ? " bl-ev-item-featured" : ""}`}
                key={`${item.day}-${item.month}-${item.venue}-${item.name}`}
                onClick={() => onSelect(item)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
                style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
                tabIndex={0}
                role="button"
                aria-label={`${item.name} - ${item.day} ${item.month} en ${item.venue}`}
              >
                <div className="bl-ev-date">
                  <div className="bl-ev-date-d">{item.day}</div>
                  <div className="bl-ev-date-m">{item.month}</div>
                </div>
                <div className="bl-ev-sep" aria-hidden="true" />
                <div className="bl-ev-body">
                  <div className="bl-ev-name">{item.name}</div>
                  <div className="bl-ev-detail">{item.detail}</div>
                </div>
                <span className="bl-ev-genre">{item.genre}</span>
                <EventCountdown event={item} />
                <div className="bl-ev-right">
                  <div className="bl-ev-time">{item.time}</div>
                  <div className="bl-ev-venue">{item.venue}</div>
                </div>
              </article>
            ))}
          </div>}
    </>
  );
}

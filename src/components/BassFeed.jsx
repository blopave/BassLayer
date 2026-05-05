import { useState, useEffect, useMemo, useRef } from "react";
import { FilterBar } from "./FilterBar";
import { SearchBar } from "./SearchBar";
import { EventSkeleton, NewsSkeleton } from "./SkeletonLoader";
import { BlThumb } from "./BlThumb";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";
import { api } from "../utils/api";

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

export function BassFeed({ events, loading, error, onRetry, filter, onFilter, onSelect, search, onSearch, onOpenPicker, onSelectNews, onSelectFestival }) {
  const { t } = useLocale();
  const genres = ["All", "Techno", "House", "Deep House", "Tech House", "Progressive", "Melodic", "Minimal", "Trance", "Festival", "Electronic"];
  const [cityFilter, setCityFilter] = useState("Todas");
  const [esteFinde, setEsteFinde] = useState(false);
  const [section, setSection] = useState("eventos"); // "eventos" | "noticias" | "festivales"

  // Bass news — lazy loaded on first toggle to "noticias"
  const [bassNews, setBassNews] = useState([]);
  const [bassNewsLoading, setBassNewsLoading] = useState(false);
  const [bassNewsError, setBassNewsError] = useState(null);
  const newsLoadedRef = useRef(false);

  const loadBassNews = () => {
    setBassNewsLoading(true);
    setBassNewsError(null);
    api.bassNews()
      .then((items) => { setBassNews(items || []); })
      .catch(() => setBassNewsError(t("feed.bassNewsLoadError")))
      .finally(() => setBassNewsLoading(false));
  };

  // Festivales — lazy loaded on first toggle to "festivales"
  const [festivals, setFestivals] = useState([]);
  const [festivalsLoading, setFestivalsLoading] = useState(false);
  const [festivalsError, setFestivalsError] = useState(null);
  const [festivalsRegion, setFestivalsRegion] = useState("All");
  const festivalsLoadedRef = useRef(false);

  const loadFestivals = (region = festivalsRegion) => {
    setFestivalsLoading(true);
    setFestivalsError(null);
    api.festivals(region)
      .then((items) => { setFestivals(items || []); })
      .catch(() => setFestivalsError(t("feed.festivalsLoadError")))
      .finally(() => setFestivalsLoading(false));
  };

  useEffect(() => {
    if (section === "noticias" && !newsLoadedRef.current) {
      newsLoadedRef.current = true;
      loadBassNews();
    }
    if (section === "festivales" && !festivalsLoadedRef.current) {
      festivalsLoadedRef.current = true;
      loadFestivals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Re-fetch when region filter changes
  useEffect(() => {
    if (festivalsLoadedRef.current) loadFestivals(festivalsRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [festivalsRegion]);

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

  // Pass `section` as dep so the observer re-attaches when toggling back from
  // noticias → eventos (the events list unmounts and remounts in that flow).
  const listRef = useScrollReveal(loading, section);

  function emptyMessage() {
    if (search) {
      return <><span className="bl-empty-icon" aria-hidden="true">{"\uD83D\uDD0D"}</span>{t("feed.empty.search")} &ldquo;{search}&rdquo;. {t("feed.empty.searchHint")}</>;
    }
    if (esteFinde) {
      return <><span className="bl-empty-icon" aria-hidden="true">{"\uD83C\uDF1F"}</span>{t("feed.empty.weekend")}</>;
    }
    return <><span className="bl-empty-icon" aria-hidden="true">{"\uD83C\uDFB6"}</span>{t("feed.empty.filter")}</>;
  }

  let itemIdx = 0;

  return (
    <>
      {/* Section toggle: Eventos · Noticias · Festivales */}
      <div className="bl-bass-sections">
        <button
          className={`bl-bass-section-btn${section === "eventos" ? " active" : ""}`}
          onClick={() => setSection("eventos")}
        >
          <span className="bl-bass-section-label">{t("section.events")}</span>
          <span className="bl-bass-section-count">{events.length}</span>
        </button>
        <button
          className={`bl-bass-section-btn${section === "noticias" ? " active" : ""}`}
          onClick={() => setSection("noticias")}
        >
          <span className="bl-bass-section-label">{t("section.news")}</span>
          {bassNews.length > 0 && <span className="bl-bass-section-count">{bassNews.length}</span>}
        </button>
        <button
          className={`bl-bass-section-btn${section === "festivales" ? " active" : ""}`}
          onClick={() => setSection("festivales")}
        >
          <span className="bl-bass-section-label">{t("section.festivals")}</span>
          {festivals.length > 0 && <span className="bl-bass-section-count">{festivals.length}</span>}
        </button>
      </div>

      {section === "festivales" ? (
        <FestivalsList
          festivals={festivals}
          loading={festivalsLoading}
          error={festivalsError}
          onRetry={() => loadFestivals(festivalsRegion)}
          region={festivalsRegion}
          onRegionChange={setFestivalsRegion}
          onSelect={onSelectFestival}
        />
      ) : section === "noticias" ? (
        <BassNewsList
          news={bassNews}
          loading={bassNewsLoading}
          error={bassNewsError}
          onRetry={loadBassNews}
          onSelect={onSelectNews}
        />
      ) : (
        <>
      <div className="bl-weekend-picker-trigger">
        <button className="bl-wp-trigger-btn" onClick={onOpenPicker}>
          {t("event.weekendButton")}
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
                  className={`bl-ev-item bl-reveal${ev.featured ? " bl-ev-item-featured" : ""}`}
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
                      {ev.source === "venue" && <span className="bl-ev-venue-badge">venue</span>}
                      {ev.venue_verified && <span className="bl-ev-venue-verified">&#10003;</span>}
                      <span className="bl-ev-meta-dot" aria-hidden="true">&middot;</span>
                      <span className="bl-ev-time-inline">{ev.time} hs</span>
                    </div>
                  </div>
                  <BlThumb image={ev.image} label={ev.genre} />
                  <div className="bl-ev-end">
                    <span className="bl-ev-genre-badge" title={ev.genre}>{ev.genre}</span>
                  </div>
                </article>
              );
            })}
            {filtered.length > 0 && (
              <div className="bl-end-of-set" aria-hidden="true">{t("feed.endOfSet")}</div>
            )}
          </div>}
        </>
      )}
    </>
  );
}

function BassNewsList({ news, loading, error, onRetry, onSelect }) {
  const { t } = useLocale();
  const listRef = useScrollReveal(loading);

  if (loading) return <NewsSkeleton />;
  if (error) {
    return (
      <div className="bl-feed">
        <div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>
          {error}
        </div>
      </div>
    );
  }
  if (!news || news.length === 0) {
    return (
      <div className="bl-feed">
        <div className="bl-empty">
          <span className="bl-empty-icon" aria-hidden="true">{"📰"}</span>
          {t("feed.empty.bassNews")}
        </div>
      </div>
    );
  }

  return (
    <div className="bl-bass-news-list" role="feed" aria-label="Noticias de música electrónica" ref={listRef}>
      {news.map((item, idx) => (
        <BassNewsItem
          key={`${item.source_slug || item.source}-${item.url || idx}`}
          item={item}
          idx={idx}
          onSelect={onSelect}
        />
      ))}
      <div className="bl-end-of-set" aria-hidden="true">{t("feed.endOfSet")}</div>
    </div>
  );
}

function BassNewsItem({ item, idx, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPill = !!(item.tag && item.image && !imgFailed);
  return (
    <article
      className="bl-bass-news-item bl-reveal"
      onClick={() => onSelect?.(item)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(item)}
      tabIndex={0}
      role="button"
      aria-label={`${item.title}${item.tag ? ` — ${item.tag}` : ""}`}
      style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <BlThumb image={item.image} label={item.tag} onImgFail={() => setImgFailed(true)} />
      <div className="bl-bass-news-body">
        <h3 className="bl-bass-news-title">{item.title}</h3>
        {showPill && <span className="bl-bass-news-tag-pill">{item.tag}</span>}
      </div>
    </article>
  );
}

const FESTIVAL_REGIONS = ["All", "BA", "Sudamérica", "Europa", "Norteamérica", "Asia"];
const FESTIVAL_REGION_SHORT = { "BA":"BA", "Sudamérica":"SUDAM", "Europa":"EUR", "Norteamérica":"NORTE", "Asia":"ASIA" };
const FESTIVAL_MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function festivalDay(start) {
  if (!start) return "??";
  const s = new Date(start + "T00:00:00");
  return String(s.getDate()).padStart(2, "0");
}

function festivalMonth(start) {
  if (!start) return "TBA";
  const s = new Date(start + "T00:00:00");
  return FESTIVAL_MONTHS_ES[s.getMonth()];
}

function festivalDateRange(start, end) {
  if (!start) return "—";
  const s = new Date(start + "T00:00:00");
  const e = end ? new Date(end + "T00:00:00") : null;
  if (!e || e.getTime() === s.getTime()) return `${String(s.getDate()).padStart(2,"0")} ${FESTIVAL_MONTHS_ES[s.getMonth()]}`;
  const sd = String(s.getDate()).padStart(2,"0");
  const ed = String(e.getDate()).padStart(2,"0");
  const sm = FESTIVAL_MONTHS_ES[s.getMonth()];
  const em = FESTIVAL_MONTHS_ES[e.getMonth()];
  return sm === em ? `${sd}–${ed} ${sm}` : `${sd} ${sm} → ${ed} ${em}`;
}

function FestivalsList({ festivals, loading, error, onRetry, region, onRegionChange, onSelect }) {
  const { t } = useLocale();
  const listRef = useScrollReveal(loading, region);

  return (
    <>
      <div className="bl-festival-filters">
        {FESTIVAL_REGIONS.map((r) => (
          <button
            key={r}
            className={`bl-festival-region-chip${region === r ? " active" : ""}`}
            onClick={() => onRegionChange(r)}
          >
            {r === "All" ? t("common.all") : r}
          </button>
        ))}
      </div>
      {loading ? <NewsSkeleton />
       : error ? (
         <div className="bl-feed">
           <div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>
             {error}
           </div>
         </div>
       )
       : !festivals || festivals.length === 0 ? (
         <div className="bl-feed">
           <div className="bl-empty">
             <span className="bl-empty-icon" aria-hidden="true">🎪</span>
             {t("feed.empty.festivals")}
           </div>
         </div>
       )
       : (
         <div className="bl-ev-list" role="feed" aria-label="Festivales de música electrónica" ref={listRef}>
           {festivals.map((f, idx) => (
             <FestivalItem key={f.id} f={f} idx={idx} onSelect={onSelect} />
           ))}
           <div className="bl-end-of-set" aria-hidden="true">{t("feed.endOfSet")}</div>
         </div>
       )}
    </>
  );
}

function FestivalItem({ f, idx, onSelect }) {
  return (
    <article
      className={`bl-ev-item bl-reveal${f.status === "live" ? " bl-ev-item-featured" : ""}`}
      onClick={() => onSelect?.(f)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(f)}
      tabIndex={0}
      role="button"
      aria-label={`${f.name} — ${f.city}, ${f.country}`}
      style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <div className="bl-ev-date">
        <div className="bl-ev-date-d">{festivalDay(f.dates_start)}</div>
        <div className="bl-ev-date-m">{festivalMonth(f.dates_start)}</div>
      </div>
      <div className="bl-ev-sep" aria-hidden="true" />
      <div className="bl-ev-body">
        <div className="bl-ev-name">
          {f.name}
          {f.linkStatus === "broken" && (
            <span className="bl-festival-broken-dot" title="Sitio temporalmente caído" aria-label="Sitio caído">●</span>
          )}
        </div>
        <div className="bl-ev-artists">{f.city}, {f.country}</div>
        <div className="bl-ev-meta-row">
          <span className="bl-ev-venue-inline">{festivalDateRange(f.dates_start, f.dates_end)}</span>
          {f.status === "live" && <>
            <span className="bl-ev-meta-dot" aria-hidden="true">&middot;</span>
            <span className="bl-festival-live-dot">EN CURSO</span>
          </>}
        </div>
      </div>
      <BlThumb image={f.image} label={FESTIVAL_REGION_SHORT[f.region]} />
      <div className="bl-ev-end">
        <span className="bl-ev-genre-badge" title={f.region}>{f.region}</span>
      </div>
    </article>
  );
}

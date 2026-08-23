import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FilterBar } from "./FilterBar";
import { EventSkeleton, NewsSkeleton } from "./SkeletonLoader";
import { BlThumb } from "./BlThumb";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";
import { api } from "../utils/api";
import { IG_HANDLE, IG_URL, useIsMobile } from "../utils/constants";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { DAYS_LONG, MONTHS_ABBR, monthAbbrLocale, monthLongLocale, getEventDate } from "../i18n/strings";


// Taxonomía de familias (multi-género) — reemplaza el filtro solo-electrónico.
// La familia la asigna el backend (classifyFamily). Los items son KEYS estables
// (para estado/URL); el label visible sale de i18n (family.*), EN/ES.
const FAMILY_FILTER_ITEMS = ["All", "club", "live", "festival", "urbano", "raiz"];

function EndOfSet() {
  const { t } = useLocale();
  return (
    <div className="bl-end-of-set">
      <div aria-hidden="true">{t("feed.endOfSet")}</div>
      <a
        className="bl-end-of-set-ig"
        href={IG_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Instagram — ${IG_HANDLE}`}
      >
        La agenda también en Instagram → {IG_HANDLE}
      </a>
    </div>
  );
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

function EventCountdown({ event }) {
  const eventDate = getEventDate(event);
  const countdown = useCountdown(eventDate);
  if (!countdown) return null;
  return <span className="bl-ev-countdown">{countdown}</span>;
}

function getDayLabel(eventDate, t, dayNames) {
  if (!eventDate) return t("day.upcoming");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const diff = Math.round((evDay - today) / 86400000);
  if (diff === 0) return t("day.today");
  if (diff === 1) return t("day.tomorrow");
  const dayName = dayNames[evDay.getDay()];
  const dd = String(evDay.getDate()).padStart(2, "0");
  const mm = String(evDay.getMonth() + 1).padStart(2, "0");
  return `${dayName} ${dd}/${mm}`;
}

// Fecha "hoy" en BsAs (America/Argentina/Buenos_Aires, offset fijo -03:00).
// Retorna un Date en la medianoche local del cliente que representa el YMD
// actual en BsAs — así comparaciones de igualdad por fecha son directas
// con getEventDate() (que también usa horario local del cliente).
function todayInBA() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

function isToday(eventDate) {
  if (!eventDate) return false;
  const today = todayInBA();
  return eventDate.getFullYear() === today.getFullYear()
    && eventDate.getMonth() === today.getMonth()
    && eventDate.getDate() === today.getDate();
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
  const { t, locale } = useLocale();
  const dayNames = DAYS_LONG[locale] || DAYS_LONG.es;
  const familyLabels = useMemo(() => ({
    club: t("family.club"), live: t("family.live"), festival: t("family.festival"),
    urbano: t("family.urbano"), raiz: t("family.raiz"),
  }), [t]);
  // Región: filtro primario. Arranca en Argentina para mantener el foco local
  // — la data global (RA multi-ciudad) queda a un tap sin diluir el default.
  const REGIONS = [{ label: "Argentina", code: "AR" }, { label: "LatAm", code: "LatAm" }, { label: t("region.world"), code: "World" }];
  const [regionFilter, setRegionFilter] = useState("AR");
  const [cityFilter, setCityFilter] = useState("Todas");
  const [when, setWhen] = useState("");   // "" | "hoy" | "finde" — filtro temporal
  // En mobile los tres segmentos de control se apilaban y empujaban el primer
  // evento a 548px de un viewport de 667. Pasan a un bottom sheet detrás de un
  // disparador compacto; en desktop la barra de una fila se queda como está.
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useFocusTrap(sheetOpen);
  const hoyOnly = when === "hoy";
  const esteFinde = when === "finde";
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

  // Eventos de la región activa. Festivales quedan fuera del filtro de región
  // (son curados aparte y viven en su propia sección).
  const regionEvents = useMemo(
    () => events.filter(e => (e.region || "AR") === regionFilter),
    [events, regionFilter]
  );

  // Qué regiones tienen eventos (para no mostrar chips vacíos)
  const availableRegions = useMemo(() => {
    const set = new Set(events.map(e => e.region || "AR"));
    return REGIONS.filter(r => set.has(r.code));
  }, [events]);

  // Ciudades disponibles dentro de la región activa
  const cities = useMemo(() => {
    const set = new Set(regionEvents.map(e => e.city).filter(Boolean));
    return ["Todas", ...Array.from(set).sort()];
  }, [regionEvents]);

  // Al cambiar de región, reseteamos la ciudad (una ciudad de AR no existe en Mundo)
  const changeRegion = (code) => { setRegionFilter(code); setCityFilter("Todas"); };

  // Segmento "Cuándo" — un solo estado; "explore" abre el weekend-picker.
  const onWhenChange = (v) => {
    if (v === "explore") { onOpenPicker && onOpenPicker(); return; }
    setWhen(v);
  };

  // Contexto (todo menos familia) → conteos por familia → filtrado final.
  // Memoizado: sólo recomputa cuando cambia una entrada real, no en cada render.
  const { filtered, familyCounts } = useMemo(() => {
    let ctx = regionEvents;
    if (cityFilter !== "Todas") ctx = ctx.filter((e) => e.city === cityFilter);
    if (esteFinde) ctx = ctx.filter((e) => isThisWeekend(getEventDate(e)));
    if (hoyOnly) ctx = ctx.filter((e) => isToday(getEventDate(e)));
    if (search) {
      const q = search.toLowerCase();
      ctx = ctx.filter((e) =>
        (e.name || "").toLowerCase().includes(q) ||
        (e.venue || "").toLowerCase().includes(q) ||
        (e.artists || []).some((a) => (a || "").toLowerCase().includes(q))
      );
    }
    const counts = { all: ctx.length };
    for (const e of ctx) { const f = e.family || "other"; counts[f] = (counts[f] || 0) + 1; }
    const list = filter === "All" ? ctx : ctx.filter((e) => (e.family || "") === filter);
    return { filtered: list, familyCounts: counts };
  }, [regionEvents, cityFilter, hoyOnly, esteFinde, search, filter]);

  // Group events by day, with month dividers when month changes
  const grouped = useMemo(() => {
    const groups = [];
    let currentLabel = null;
    let currentMonth = null;
    for (const ev of filtered) {
      if (currentMonth !== null && ev.month !== currentMonth) {
        groups.push({ type: "month", label: ev.month });
      }
      currentMonth = ev.month;
      const label = getDayLabel(getEventDate(ev), t, dayNames);
      if (label !== currentLabel) {
        // La fecha numérica viaja con el encabezado: al sacarla de cada fila,
        // este pasa a ser el único lugar donde se dice, y tiene que decirla.
        groups.push({ type: "header", label, day: ev.day, month: ev.month });
        currentLabel = label;
      }
      groups.push({ type: "event", data: ev });
    }
    return groups;
  }, [filtered, t, dayNames]);


  // Pass `section` as dep so the observer re-attaches when toggling back from
  // noticias → eventos (the events list unmounts and remounts in that flow).
  const listRef = useScrollReveal(loading, section);

  function emptyMessage() {
    if (search) {
      return <>{t("feed.empty.search")} &ldquo;{search}&rdquo;. {t("feed.empty.searchHint")}</>;
    }
    if (hoyOnly) {
      // Con el chip "Hoy" activo pero sin eventos: mostramos la próxima fecha
      // con eventos para que el usuario no se quede en un dead end.
      const today = todayInBA();
      const upcoming = events
        .map((ev) => ({ ev, date: getEventDate(ev) }))
        .filter((x) => x.date && x.date >= today)
        .sort((a, b) => a.date - b.date)[0];
      if (!upcoming) return <>{t("feed.empty.todayNone")}</>;
      const dayName = (dayNames[upcoming.date.getDay()] || "").slice(0, 3).toUpperCase();
      const dd = String(upcoming.date.getDate()).padStart(2, "0");
      return <>{t("feed.empty.todayNext", { day: dayName, dd })}</>;
    }
    if (esteFinde) {
      return <>{t("feed.empty.weekend")}</>;
    }
    return <>{t("feed.empty.filter")}</>;
  }

  // Segmentos de control. Se definen una sola vez y se montan en la barra de
  // desktop o dentro del bottom sheet de mobile — misma lógica, dos envases.
  const whenSeg = (
    <label className="bl-ctrl-seg" key="when">
      <span className="bl-ctrl-k">{t("filter.when")}</span>
      <select className="bl-ctrl-select" value={when} onChange={(e) => onWhenChange(e.target.value)} aria-label={t("filter.when")}>
        <option value="">{t("filter.anytime")}</option>
        <option value="hoy">{t("day.today")}</option>
        <option value="finde">{t("filter.thisWeekend")}</option>
        <option value="explore">{t("filter.exploreWeekend")}</option>
      </select>
    </label>
  );

  const whereSeg = (availableRegions.length > 1 || cities.length > 2) ? (
    <div className="bl-ctrl-seg" key="where">
      <span className="bl-ctrl-k">{t("filter.where")}</span>
      <div className="bl-ctrl-where">
        {availableRegions.length > 1 && (
          <select className="bl-ctrl-select" value={regionFilter} onChange={(e) => changeRegion(e.target.value)} aria-label={t("filter.where")}>
            {availableRegions.map((r) => (<option key={r.code} value={r.code}>{r.label}</option>))}
          </select>
        )}
        {cities.length > 2 && (
          <select className="bl-ctrl-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} aria-label={t("filter.allCities")}>
            {cities.map((c) => (<option key={c} value={c}>{c === "Todas" ? t("filter.allCities") : c}</option>))}
          </select>
        )}
      </div>
    </div>
  ) : null;

  const searchSeg = (
    <div className="bl-ctrl-seg bl-ctrl-search-seg" key="search">
      <span className="bl-ctrl-mag" aria-hidden="true">&#8981;</span>
      <input
        className="bl-ctrl-search"
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={t("filter.searchPlaceholder")}
        aria-label={t("filter.searchPlaceholder")}
      />
    </div>
  );

  // Cuántos filtros hay puestos. Va como contador en el disparador para que el
  // estado siga siendo visible con el sheet cerrado.
  const activeFilterCount = (when ? 1 : 0) + (regionFilter !== "AR" ? 1 : 0) + (cityFilter !== "Todas" ? 1 : 0);
  const clearFilters = () => { setWhen(""); changeRegion("AR"); };

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
        </button>
        <button
          className={`bl-bass-section-btn${section === "noticias" ? " active" : ""}`}
          onClick={() => setSection("noticias")}
        >
          <span className="bl-bass-section-label">{t("section.news")}</span>
        </button>
        <button
          className={`bl-bass-section-btn${section === "festivales" ? " active" : ""}`}
          onClick={() => setSection("festivales")}
        >
          <span className="bl-bass-section-label">{t("section.festivals")}</span>
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
      {/* Filtro PRIMARIO: género, con conteos por familia (transparencia) */}
      <FilterBar items={FAMILY_FILTER_ITEMS} active={filter} onChange={onFilter} className="bass-filters" labels={familyLabels} counts={familyCounts} />

      {/* Barra unificada de contexto: Cuándo · Dónde · Buscar (una sola forma) */}
      {isMobile ? (
        <>
          {/* Mobile: una sola fila. Los selectores viven en el sheet. */}
          <div className="bl-ctrl-bar bl-ctrl-bar-compact">
            {searchSeg}
            <button
              type="button"
              className={`bl-ctrl-filters-btn${activeFilterCount > 0 ? " has-filters" : ""}`}
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
            >
              {t("filter.filters")}
              {activeFilterCount > 0 && <span className="bl-ctrl-filters-count">{activeFilterCount}</span>}
            </button>
          </div>

          {/* Va por portal a <body>: el contenedor del swipe tiene transform, y un
              position:fixed adentro se posiciona contra ESE ancestro (queda de
              200% de ancho) y su z-index no compite con el de la barra de
              utilidades. Fuera del árbol transformado, las dos cosas se arreglan. */}
          {sheetOpen && createPortal(
            <div
              className="bl-sheet-overlay"
              onClick={(e) => { if (e.target === e.currentTarget) setSheetOpen(false); }}
            >
              <div className="bl-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={t("filter.sheetTitle")}>
                <div className="bl-sheet-grip" aria-hidden="true" />
                <div className="bl-sheet-head">
                  <h2 className="bl-sheet-title">{t("filter.sheetTitle")}</h2>
                  {activeFilterCount > 0 && (
                    <button type="button" className="bl-sheet-clear" onClick={clearFilters}>
                      {t("filter.clear")}
                    </button>
                  )}
                </div>
                <div className="bl-sheet-body">
                  {whenSeg}
                  {whereSeg}
                </div>
                <button type="button" className="bl-sheet-apply" onClick={() => setSheetOpen(false)}>
                  {t("filter.apply", { n: filtered.length })}
                </button>
              </div>
            </div>,
            document.body
          )}
        </>
      ) : (
        <div className="bl-ctrl-bar">
          {whenSeg}
          {whereSeg}
          {searchSeg}
        </div>
      )}

      {/* Header editorial del listado */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bl-feed-head">
          <span className="bl-feed-head-n">{filtered.length}</span>
          <span className="bl-feed-head-ctx">{t("feed.eventsWord")}{cityFilter !== "Todas" ? ` · ${cityFilter}` : ""}</span>
        </div>
      )}
      {loading ? <EventSkeleton />
        : error ? <div className="bl-ev-list"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>{error}</div></div>
        : filtered.length === 0 ? <div className="bl-ev-list"><div className="bl-empty">{emptyMessage()}</div></div>
        : <div className="bl-ev-list" role="feed" aria-label={t("section.events")} ref={listRef}>
            {grouped.map((item, gIdx) => {
              if (item.type === "month") {
                return (
                  <div className="bl-month-divider" key={`m-${item.label}-${gIdx}`} aria-hidden="true">
                    <span className="bl-month-line" />
                    <span className="bl-month-label">{monthLongLocale(item.label, locale)}</span>
                    <span className="bl-month-line" />
                  </div>
                );
              }
              if (item.type === "header") {
                return (
                  <h2 className="bl-day-header bl-reveal" key={`h-${item.label}`} style={{ transitionDelay: `${Math.min(gIdx * 0.02, 0.15)}s` }}>
                    <span className="bl-day-label">{item.label}</span>
                    <span className="bl-day-date">{item.day} {monthAbbrLocale(item.month, locale)}</span>
                    <span className="bl-day-line" aria-hidden="true" />
                  </h2>
                );
              }
              const ev = item.data;
              const idx = itemIdx++;
              // Stamp editorial: subgénero real para electrónica (Techno/House),
              // etiqueta de familia para el resto (En vivo/Urbano/Raíz/Festival).
              const stamp = ev.family === "club"
                ? (ev.genre && ev.genre !== "Electronic" ? ev.genre : null)
                : (ev.family ? t(`family.${ev.family}`) : null);
              return (
                <article
                  className="bl-ev-item bl-reveal"
                  key={`${ev.day}-${ev.month}-${ev.venue}-${ev.name}`}
                  data-genre={ev.genre}
                  data-featured={ev.featured ? "true" : undefined}
                  onClick={() => onSelect(ev)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(ev)}
                  style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${ev.name} - ${ev.day} ${ev.month} en ${ev.venue}`}
                >
                  {/* El flyer es diseño gráfico hecho para este show: va de
                      portada, no de miniatura. La fecha no se repite acá —
                      la dice el encabezado del día, una sola vez. */}
                  <BlThumb image={ev.image} />
                  <div className="bl-ev-body">
                    <div className="bl-ev-name">{ev.name}</div>
                    <div className="bl-ev-venue-line">{ev.venue}</div>
                    <div className="bl-ev-meta-row">
                      {ev.time && <span className="bl-ev-time-inline">{ev.time}</span>}
                      {stamp && (
                        <span className="bl-ev-genre-badge" title={stamp}>{stamp}</span>
                      )}
                      {ev.source === "venue" && <span className="bl-ev-venue-badge">venue</span>}
                      {ev.venue_verified && <span className="bl-ev-venue-verified">&#10003;</span>}
                    </div>
                  </div>
                </article>
              );
            })}
            {filtered.length > 0 && (
              <EndOfSet />
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
          {t("feed.empty.bassNews")}
        </div>
      </div>
    );
  }

  return (
    <div className="bl-bass-news-list" role="feed" aria-label={t("section.news")} ref={listRef}>
      {news.map((item, idx) => (
        <BassNewsItem
          key={`${item.source_slug || item.source}-${item.url || idx}`}
          item={item}
          idx={idx}
          onSelect={onSelect}
        />
      ))}
      <EndOfSet />
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
      <BlThumb image={item.image} onImgFail={() => setImgFailed(true)} />
      <div className="bl-bass-news-body">
        <h3 className="bl-bass-news-title bl-bass-t-heading">{item.title}</h3>
        {showPill && <span className="bl-bass-news-tag-pill bl-bass-t-label">{item.tag}</span>}
      </div>
    </article>
  );
}

const FESTIVAL_REGIONS = ["All", "BA", "Sudamérica", "Europa", "Norteamérica", "Asia"];
const festMonths = (locale) => MONTHS_ABBR[locale] || MONTHS_ABBR.es;

function festivalDay(start) {
  if (!start) return "??";
  const s = new Date(start + "T00:00:00");
  return String(s.getDate()).padStart(2, "0");
}

function festivalMonth(start, locale) {
  if (!start) return "TBA";
  const s = new Date(start + "T00:00:00");
  return festMonths(locale)[s.getMonth()];
}

function festivalDateRange(start, end, locale) {
  if (!start) return "—";
  const M = festMonths(locale);
  const s = new Date(start + "T00:00:00");
  const e = end ? new Date(end + "T00:00:00") : null;
  if (!e || e.getTime() === s.getTime()) return `${String(s.getDate()).padStart(2,"0")} ${M[s.getMonth()]}`;
  const sd = String(s.getDate()).padStart(2,"0");
  const ed = String(e.getDate()).padStart(2,"0");
  const sm = M[s.getMonth()];
  const em = M[e.getMonth()];
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
             {t("feed.empty.festivals")}
           </div>
         </div>
       )
       : (
         <div className="bl-ev-list" role="feed" aria-label={t("section.festivals")} ref={listRef}>
           {festivals.map((f, idx) => (
             <FestivalItem key={f.id} f={f} idx={idx} onSelect={onSelect} />
           ))}
           <EndOfSet />
         </div>
       )}
    </>
  );
}

function FestivalItem({ f, idx, onSelect }) {
  const { locale } = useLocale();
  return (
    <article
      className="bl-ev-item bl-ev-item-festival bl-reveal"
      onClick={() => onSelect?.(f)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(f)}
      tabIndex={0}
      role="button"
      aria-label={`${f.name} — ${f.city}, ${f.country}`}
      style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <div className="bl-ev-date">
        <div className="bl-ev-date-d">{festivalDay(f.dates_start)}</div>
        <div className="bl-ev-date-m">{festivalMonth(f.dates_start, locale)}</div>
      </div>
      <div className="bl-ev-body">
        <div className="bl-ev-name">
          {f.name}
          {f.linkStatus === "broken" && (
            <span className="bl-festival-broken-dot" title="Sitio temporalmente caído" aria-label="Sitio caído">●</span>
          )}
        </div>
        <div className="bl-ev-artists">{f.city}, {f.country}</div>
        <div className="bl-ev-meta-row">
          <span className="bl-ev-venue-inline">{festivalDateRange(f.dates_start, f.dates_end, locale)}</span>
          {f.region && <span className="bl-ev-genre-badge" title={f.region}>{f.region}</span>}
          {f.status === "live" && <span className="bl-festival-live-dot">EN CURSO</span>}
        </div>
      </div>
      <BlThumb image={f.image} />
    </article>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslatedTitle } from "./TranslatedTitle";
import { createPortal } from "react-dom";
import { FilterBar } from "./FilterBar";
import { EventSkeleton, NewsSkeleton } from "./SkeletonLoader";
import { BlThumb } from "./BlThumb";
import { OnTour } from "./OnTour";
import { useSalas, SalaGrid, SalaHits, SalaCartelera, salaMatches, SectionHead } from "./Salas";
import { BassTrack } from "./BassTrack";
import { Finde, SemanaLinea } from "./Finde";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";
import { api, shared } from "../utils/api";
import { useIsMobile } from "../utils/constants";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { DAYS_LONG, MONTHS_ABBR, monthAbbrLocale, monthLongLocale, getEventDate, eventStamp } from "../i18n/strings";
import { useSavedEvents } from "../hooks/useSavedEvents";
import { eventSlug } from "../utils/slug";
import { noOrphanSep } from "../utils/format";

// Señalador de guardado — vive en cada card y en el modal. Para el feed con
// muchas filas conviene un componente chico: solo re-renderiza él al togglear.
export function SaveButton({ slug, className = "" }) {
  const { t } = useLocale();
  const { isSaved, toggle } = useSavedEvents();
  const on = isSaved(slug);
  return (
    <button
      type="button"
      className={`bl-save-btn${on ? " on" : ""} ${className}`}
      aria-pressed={on}
      aria-label={on ? t("saved.remove") : t("saved.add")}
      title={on ? t("saved.remove") : t("saved.add")}
      onClick={(e) => { e.stopPropagation(); toggle(slug); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path d="M6 3h12v18l-6-4.5L6 21V3z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  );
}


// Taxonomía de familias (multi-género) — reemplaza el filtro solo-electrónico.
// La familia la asigna el backend (classifyFamily). Los items son KEYS estables
// (para estado/URL); el label visible sale de i18n (family.*), EN/ES.
const FAMILY_FILTER_ITEMS = ["All", "club", "festival"];   // solo escena electrónica (oct 2026)
// Agenda (oct 2026, Pablo): "Cuándo" lo resuelve la línea de días (DayRail);
// "Hoy" / "Este finde" quedan solo para los deep links, con un chip para salir.

// Riel de días: una línea de tiempo con TODOS los días, de hoy a la última
// fiesta, agrupados por mes. Cada día con fiestas es una barra de la misma onda
// de la portada (alto = cuántas hay) y se puede tocar; los días sin fiestas son
// una marca tenue. El nombre del mes queda fijo a la izquierda al desplazar
// (arrastrar, rueda o dedo), los bordes se desvanecen si hay más, y la línea
// acompaña al día que se está leyendo.
function DayRail({ months, active, onPick, t }) {
  const ref = useRef(null), drag = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const max = Math.max(1, ...months.flatMap((m) => m.days.map((d) => d.count)));
  const measure = () => { const el = ref.current; if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 }); };
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    // Rueda vertical → desplazamiento horizontal (solo si hay para dónde ir).
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const before = el.scrollLeft; el.scrollLeft += e.deltaY;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("wheel", onWheel); window.removeEventListener("resize", measure); };
  }, [months]); // eslint-disable-line react-hooks/exhaustive-deps
  // El día que se está leyendo queda a la vista en la línea.
  useEffect(() => {
    const el = ref.current, b = el?.querySelector(`[data-rail="${active}"]`);
    if (!el || !b) return;
    const l = b.offsetLeft - el.offsetLeft, pad = 90;
    if (l < el.scrollLeft + pad || l + b.offsetWidth > el.scrollLeft + el.clientWidth - pad) el.scrollTo({ left: l - el.clientWidth / 3, behavior: "smooth" });
  }, [active]);
  // Arrastrar con el mouse (en táctil ya desplaza el dedo). Si se arrastró, el
  // soltar no cuenta como toque.
  const down = (e) => { if (e.pointerType !== "mouse") return; drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false }; };
  const move = (e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 4) { d.moved = true; ref.current.scrollLeft = d.left - dx; } };
  const up = () => { setTimeout(() => { drag.current = null; }, 0); };
  const pick = (key) => { if (!drag.current?.moved) onPick(key); };
  // La primera vez en la sesión, la línea se corre un poco y vuelve: avisa que
  // se mueve sin decirlo con texto.
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth + 8 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let seen = false; try { seen = sessionStorage.getItem("bl-rail-nudge") === "1"; } catch { /* sin storage */ }
    if (seen) return undefined;
    // Se marca como vista recién cuando se mueve (si el efecto se cancela antes, no cuenta).
    const a = setTimeout(() => { try { sessionStorage.setItem("bl-rail-nudge", "1"); } catch { /* sin storage */ } el.scrollTo({ left: el.scrollLeft + 140, behavior: "smooth" }); }, 900);
    const b = setTimeout(() => el.scrollTo({ left: 0, behavior: "smooth" }), 1700);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  // Flechas: una semana para cada lado.
  const step = (dir) => { const el = ref.current; if (el) el.scrollBy({ left: dir * 7 * 40, behavior: "smooth" }); };
  return (
    <div className="bl-day-rail-wrap">
    <button type="button" className="bl-day-rail-arrow is-prev" onClick={() => step(-1)} disabled={edge.start} aria-label={t("agenda.prevWeek")}>‹</button>
    <button type="button" className="bl-day-rail-arrow is-next" onClick={() => step(1)} disabled={edge.end} aria-label={t("agenda.nextWeek")}>›</button>
    <nav ref={ref} className={`bl-day-rail${edge.start ? "" : " fade-l"}${edge.end ? "" : " fade-r"}`} aria-label={t("agenda.daysAria")}
      onScroll={measure} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
      {months.map((m) => (
        <div className="bl-rail-seg" key={m.key}>
          <span className="bl-rail-seg-name">{m.name}</span>
          <div className="bl-rail-seg-days">
            {m.days.map((d) => (d.count
              ? (
                <button key={d.key} type="button" data-rail={d.key} className={`bl-day-rail-day${active === d.key ? " is-on" : ""}`} onClick={() => pick(d.key)} aria-label={`${d.label} ${d.day}: ${d.count}`} aria-current={active === d.key ? "true" : undefined}>
                  <span className="bl-day-rail-n">{d.count}</span>
                  <span className="bl-day-rail-bar" style={{ height: `${6 + 26 * (d.count / max)}px` }} aria-hidden="true" />
                  <span className="bl-day-rail-l">{d.short}</span>
                  <span className="bl-day-rail-d">{d.day}</span>
                </button>
              ) : (
                <span key={d.key} className="bl-day-rail-day is-empty" aria-hidden="true">
                  <span className="bl-day-rail-bar" />
                  <span className="bl-day-rail-l">{d.short}</span>
                  <span className="bl-day-rail-d">{d.day}</span>
                </span>
              )))}
          </div>
        </div>
      ))}
    </nav>
    </div>
  );
}

function EndOfSet() {
  const { t } = useLocale();
  return (
    <div className="bl-end-of-set">
      <div aria-hidden="true">{t("feed.endOfSet")}</div>
      {/* webcal: suscripción viva (iOS/macOS la abren en Calendario; Google
          Calendar la acepta como "agregar por URL"). Nadie más lo ofrece
          en la escena BA. */}
      <a className="bl-end-of-set-ig" href={`webcal://${typeof window !== "undefined" ? window.location.host : "basslayer.io"}/agenda.ics`}>
        {t("feed.subscribeCal")}
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
      // Solo data, sin palabras: legible igual en ES y EN.
      if (diff <= 0) { setText("▶"); return; }
      const days = Math.floor(diff / 86400000);
      const hrs = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (days > 0) setText(`${days}d ${hrs}h`);
      else if (hrs > 0) setText(`${hrs}h ${mins}m`);
      else setText(`${mins}m`);
    }
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [targetDate]);
  return text;
}

function EventCountdown({ date }) {
  const countdown = useCountdown(date);
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
  // Solo el nombre del día: la fecha ya la dice el encabezado al lado
  // (antes salía dos veces, "Domingo 04/10 · 04 Oct", oct 2026).
  return dayNames[evDay.getDay()];
}

// Fecha "hoy" en BsAs (America/Argentina/Buenos_Aires, offset fijo -03:00).
// Retorna un Date en la medianoche local del cliente que representa el YMD
// actual en BsAs — así comparaciones de igualdad por fecha son directas
// con getEventDate() (que también usa horario local del cliente).
// El formatter vive a nivel módulo: construir Intl.DateTimeFormat es caro y
// estos chequeos corren una vez por evento en listas de ~150.
const BA_YMD_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric", month: "2-digit", day: "2-digit",
});
// La noche (oct 2026): hasta las 7 de la mañana la fiesta de anoche sigue
// siendo "hoy" — igual que el corte de pasados del server.
const NIGHT_END_H = 7;
const nightNow = () => new Date(Date.now() - NIGHT_END_H * 36e5);
function todayInBA() {
  const parts = BA_YMD_FORMAT.formatToParts(nightNow())
    .reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

// `today`/`bounds` aceptan el valor precomputado: los filtros por lista lo
// calculan una vez y lo pasan, en vez de rehacerlo por evento.
function isToday(eventDate, today = todayInBA()) {
  if (!eventDate) return false;
  return eventDate.getFullYear() === today.getFullYear()
    && eventDate.getMonth() === today.getMonth()
    && eventDate.getDate() === today.getDate();
}

function weekendBounds() {
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
  return { friday, monday };
}

function isThisWeekend(eventDate, bounds = weekendBounds()) {
  if (!eventDate) return false;
  const evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  return evDay >= bounds.friday && evDay < bounds.monday;
}


export function BassFeed({ events, loading, error, onRetry, filter, onFilter, onSelect, search, onSearch, onOpenPicker, onSelectNews, onSelectFestival, presetWhen }) {
  const { t, locale } = useLocale();
  const dayNames = DAYS_LONG[locale] || DAYS_LONG.es;
  const familyLabels = useMemo(() => ({
    club: t("family.club"), festival: t("family.festival"),
  }), [t]);
  // Dónde: BassLayer es de Buenos Aires (Pablo, sept 2026). La agenda arranca
  // en el AMBA (CABA + GBA, campo `area` del server) y el resto del país queda
  // a un filtro. Lo del exterior no se lista: alimenta "De gira" (OnTour).
  const REGIONS = [{ label: t("region.ba"), code: "amba" }, { label: "Argentina", code: "AR" }];
  const IN_REGION = { amba: (e) => e.area === "amba", AR: (e) => (e.region || "AR") === "AR" };
  const [regionFilter, setRegionFilter] = useState("amba");
  const [cityFilter, setCityFilter] = useState("Todas");
  // "" | "hoy" | "finde" — filtro temporal; el deep link (/eventos/hoy,
  // /eventos/este-finde) lo presetea vía prop. Va por efecto y no por estado
  // inicial: el feed ya está montado cuando App resuelve el deep link (los
  // paneles viven en el DOM incluso en la vista home).
  const [when, setWhen] = useState(presetWhen || ""); // desde el deep-link en el primer paint: sin hero fantasma que después desaparece
  useEffect(() => { if (presetWhen) setWhen(presetWhen); }, [presetWhen]);
  // En mobile los tres segmentos de control se apilaban y empujaban el primer
  // evento a 548px de un viewport de 667. Pasan a un bottom sheet detrás de un
  // disparador compacto; en desktop la barra de una fila se queda como está.
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Escape, bloqueo de scroll e inert del fondo: mismo contrato que los modales.
  const sheetRef = useFocusTrap(sheetOpen, () => setSheetOpen(false));
  const whenLabels = useMemo(() => ({ hoy: t("day.today"), finde: t("filter.thisWeekend") }), [t]);
  const hoyOnly = when === "hoy";
  const esteFinde = when === "finde";
  // "track" (portada: solo el índice) | "eventos" (Agenda) | "noticias" | "festivales"
  const [section, setSection] = useState(presetWhen ? "eventos" : "track");
  // Salas (oct 2026, Pablo): una pestaña propia con la cartelera completa de
  // cada sala, de todos los estilos; la Agenda sigue siendo electrónica. La
  // sala también aparece como resultado del buscador. Cuál está abierta y
  // desde dónde se llegó (para volver).
  const salasData = useSalas();
  const [sala, setSala] = useState(null);
  const [salaFrom, setSalaFrom] = useState("eventos");
  const openSala = (slug) => {
    setSalaFrom(section); setSala(slug); setSection("sala");
    // La sala abre desde arriba: el panel conserva el scroll de la agenda.
    requestAnimationFrame(() => document.querySelector(".bl-sala")?.closest(".bl-swipe-panel")?.scrollTo({ top: 0 }));
  };
  // "Mi agenda": filtro por eventos guardados (localStorage, sin login).
  const { saved } = useSavedEvents();
  const [savedOnly, setSavedOnly] = useState(false);

  // Bass news — lazy loaded on first toggle to "noticias"
  const [bassNews, setBassNews] = useState([]);
  const [bassNewsLoading, setBassNewsLoading] = useState(false);
  const [bassNewsError, setBassNewsError] = useState(null);
  const newsLoadedRef = useRef(false);

  const loadBassNews = () => {
    setBassNewsLoading(true);
    setBassNewsError(null);
    // Mismo pedido (y caché) que la onda de la portada: no se baja dos veces.
    shared("bassNews", api.bassNews)
      .then((items) => { setBassNews(items || []); })
      .catch(() => setBassNewsError(t("feed.bassNewsLoadError")))
      .finally(() => setBassNewsLoading(false));
  };

  // Festivales — lazy loaded on first toggle to "festivales"
  const [festivals, setFestivals] = useState([]);
  const [festivalsLoading, setFestivalsLoading] = useState(false);
  const [festivalsError, setFestivalsError] = useState(null);
  const festivalsLoadedRef = useRef(false);

  const loadFestivals = () => {
    setFestivalsLoading(true);
    setFestivalsError(null);
    shared("festivals", () => api.festivals())
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


  // Eventos de la región activa. Festivales quedan fuera del filtro de región
  // (son curados aparte y viven en su propia sección).
  const regionEvents = useMemo(
    () => events.filter(IN_REGION[regionFilter]),
    [events, regionFilter]
  );

  // Qué regiones tienen eventos (para no mostrar chips vacíos)
  const availableRegions = useMemo(() => {
    return REGIONS.filter((r) => events.some(IN_REGION[r.code]));
  }, [events]);

  // Ciudades disponibles dentro de la región activa
  const cities = useMemo(() => {
    const set = new Set(regionEvents.map(e => e.city).filter(Boolean));
    return ["Todas", ...Array.from(set).sort()];
  }, [regionEvents]);

  // Al cambiar de región, reseteamos la ciudad (una ciudad de AR no existe en Mundo)
  const changeRegion = (code) => { setRegionFilter(code); setCityFilter("Todas"); };

  // Contexto (todo menos familia) → conteos por familia → filtrado final.
  // Memoizado: sólo recomputa cuando cambia una entrada real, no en cada render.
  const { filtered, familyCounts } = useMemo(() => {
    let ctx = regionEvents;
    if (savedOnly) { const set = new Set(saved); ctx = ctx.filter((e) => set.has(eventSlug(e))); }
    if (cityFilter !== "Todas") ctx = ctx.filter((e) => e.city === cityFilter);
    if (esteFinde) { const b = weekendBounds(); ctx = ctx.filter((e) => isThisWeekend(getEventDate(e), b)); }
    if (hoyOnly) { const today = todayInBA(); ctx = ctx.filter((e) => isToday(getEventDate(e), today)); }
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
    let list = filter === "All" ? ctx : ctx.filter((e) => (e.family || "") === filter);
    // Dentro de cada día, por hora como se vive una noche — la
    // madrugada (antes de las 7) va al final: 22:00 → 23:00 → 23:59 → 02:00.
    {
      const night = (e) => { const [h, m] = (e.time || "23:00").split(":").map(Number); return ((h < 7 ? h + 24 : h) * 60) + (m || 0); };
      const dayOf = (e) => { const d = getEventDate(e); return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : Infinity; };
      list = [...list].sort((a, b) => dayOf(a) - dayOf(b) || night(a) - night(b));
    }
    return { filtered: list, familyCounts: counts };
  }, [regionEvents, cityFilter, hoyOnly, esteFinde, search, filter, savedOnly, saved]);

  // Group events by day, with month dividers when month changes
  const grouped = useMemo(() => {
    const groups = [];
    let currentKey = null;
    let currentMonth = null;
    for (const ev of filtered) {
      if (currentMonth !== null && ev.month !== currentMonth) {
        groups.push({ type: "month", label: ev.month });
      }
      currentMonth = ev.month;
      const date = getEventDate(ev);
      const label = getDayLabel(date, t, dayNames);
      // Se agrupa por fecha, no por el texto: dos domingos seguidos sin nada en
      // el medio dicen lo mismo y no son el mismo día.
      const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : label;
      // Cartel: el primero de cada día o un destacado del backend; el resto
      // sigue en filas compactas. Escala como ritmo, no como decoración.
      let lead = !!ev.featured;
      if (key !== currentKey) {
        // La fecha numérica viaja con el encabezado: al sacarla de cada fila,
        // este pasa a ser el único lugar donde se dice, y tiene que decirla.
        groups.push({ type: "header", label, key, day: ev.day, month: ev.month });
        currentKey = key;
        lead = true;
      }
      groups.push({ type: "event", data: ev, lead, date });
    }
    return groups;
  }, [filtered, t, dayNames]);


  // Riel de días: el calendario entero de hoy a la última fiesta
  // de la lista, por mes, con cuántas hay cada día.
  const railMonths = useMemo(() => {
    const counts = new Map(), labels = new Map();
    let last = null;
    for (const g of grouped) {
      if (g.type === "header") { counts.set(g.key, 0); labels.set(g.key, g.label); last = g.key; }
      else if (g.type === "event" && last) counts.set(last, counts.get(last) + 1);
    }
    if (!last) return [];
    const [ly, lm, ld] = last.split("-").map(Number), end = new Date(ly, lm, ld);
    const now = new Date(), d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const shortNames = DAYS_LONG[locale] || DAYS_LONG.es, monthsAbbr = MONTHS_ABBR.es;
    const out = [];
    for (let i = 0; d <= end && i < 400; i++, d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, mk = `${d.getFullYear()}-${d.getMonth()}`;
      if (!out.length || out[out.length - 1].key !== mk) out.push({ key: mk, name: monthLongLocale(monthsAbbr[d.getMonth()], locale), days: [] });
      const label = labels.get(key) || shortNames[d.getDay()];
      const short = i === 0 ? t("day.today").slice(0, 3).toUpperCase() : i === 1 ? t("day.tomorrow").slice(0, 3).toUpperCase() : shortNames[d.getDay()].slice(0, 3).toUpperCase();
      out[out.length - 1].days.push({ key, label, short, day: d.getDate(), count: counts.get(key) || 0 });
    }
    return out;
  }, [grouped, locale, t]);
  const [railActive, setRailActive] = useState(null);
  // Mientras dura un salto, el día elegido queda marcado (si no, el
  // observador marca los que pasan por el camino).
  const railLock = useRef(0);
  useEffect(() => {
    if (section !== "eventos") return undefined;
    const heads = [...document.querySelectorAll(".bl-day-header[data-day]")];
    if (!heads.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis && Date.now() > railLock.current) setRailActive(vis.target.dataset.day);
    }, { rootMargin: `-${Math.round(railBottom())}px 0px -35% 0px` });
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [grouped, section]);
  // El salto deja el encabezado del día justo debajo del riel fijo (medido: el
  // riel y el ticker no miden lo mismo en mobile y desktop).
  const railBottom = () => (document.querySelector(".bl-day-rail")?.getBoundingClientRect().bottom || 120) + 8;
  const pickDay = (key) => {
    const h = document.querySelector(`.bl-day-header[data-day="${key}"]`);
    if (!h) return;
    setRailActive(key);
    railLock.current = Date.now() + 1400;
    let sc = h.parentElement;
    while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const go = (behavior) => {
      const delta = h.getBoundingClientRect().top - railBottom();
      if (Math.abs(delta) < 2) return;
      if (sc && sc !== document.body) sc.scrollBy({ top: delta, behavior }); else window.scrollBy({ top: delta, behavior });
    };
    go("smooth");
    // Los flyers que terminan de cargar en el camino corren la lista: al
    // llegar se corrige sin animación.
    setTimeout(() => go("auto"), 650);
    setTimeout(() => go("auto"), 1200);
  };

  // Pass `section` as dep so the observer re-attaches when toggling back from
  // noticias → eventos (the events list unmounts and remounts in that flow).
  const listRef = useScrollReveal(loading, section);

  function emptyMessage() {
    if (savedOnly) {
      return <>{t("feed.empty.saved")}</>;
    }
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
  const activeFilterCount = (when ? 1 : 0) + (regionFilter !== "amba" ? 1 : 0) + (cityFilter !== "Todas" ? 1 : 0);
  const clearFilters = () => { setWhen(""); changeRegion("amba"); };

  // Tres secciones en la portada (Pablo, sept 2026): Noticias, Agenda y
  // Festivales; Hoy, el finde, De gira y la búsqueda viven dentro de la Agenda.
  // Lo que filtra la agenda desde afuera (deep link /eventos/hoy, género,
  // venue, búsqueda) abre la Agenda.
  useEffect(() => {
    if (when || search || (filter && filter !== "All")) setSection((s) => (s === "track" ? "eventos" : s));
  }, [when, search, filter]);

  // Siempre se vuelve al track (Pablo, sept 2026: "eso no puede suceder").
  // Fuera de la portada (otra sección, filtro temporal o búsqueda) hay flecha,
  // y salir de la portada deja una entrada en el historial: el atrás del
  // navegador o el gesto del celular también vuelven a la frecuencia.
  const atPortada = section === "track";
  const scrollToTrack = useRef(false);
  const resetToTrack = () => {
    setSection("track"); setWhen(""); if (search) onSearch?.("");
    scrollToTrack.current = true;
  };
  const resetRef = useRef(resetToTrack);
  resetRef.current = resetToTrack;
  useEffect(() => {
    if (!atPortada && !window.history.state?.bassTrack) window.history.pushState({ bassTrack: 1 }, "", window.location.href);
    // Después del commit: el track recién montado ya está en el DOM.
    if (atPortada && scrollToTrack.current) { scrollToTrack.current = false; document.querySelector(".bl-btrack")?.scrollIntoView({ block: "start" }); }
  }, [atPortada]);
  useEffect(() => {
    const onPop = () => { if (!window.history.state?.bassTrack) resetRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const backToTrack = () => (window.history.state?.bassTrack ? window.history.back() : resetToTrack());

  let itemIdx = 0;

  return (
    <>
      {/* El track es el único índice de Bass (Pablo, sept 2026: "todas las
          secciones deben ir ahí"): en la portada no hay pestañas. Dentro de
          Noticias o Festivales, flecha para volver al track + pestañas, como
          dentro de una sección de Layer. */}
      {!atPortada && (
      <div className="bl-bass-sections">
        <button
          type="button"
          className="bl-layer-back bl-bass-back"
          onClick={backToTrack}
          aria-label={t("track.back")}
          title={t("track.back")}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13 8H3m4-4L3 8l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button
          className={`bl-bass-section-btn${section === "eventos" ? " active" : ""}`}
          onClick={() => setSection("eventos")}
        >
          <span className="bl-bass-section-label">{t("track.agenda")}</span>
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
        <button className={`bl-bass-section-btn${section === "salas" || section === "sala" ? " active" : ""}`} onClick={() => setSection("salas")}>
          <span className="bl-bass-section-label">{t("salas.title")}</span>
        </button>
      </div>
      )}

      {section === "sala" ? (
        <SalaCartelera data={salasData} slug={sala} onBack={() => setSection(salaFrom)} backLabel={salaFrom === "salas" ? t("salas.title") : t("track.agenda")} />
      ) : section === "salas" ? (
        <SalaGrid data={salasData} onPick={openSala} />
      ) : section === "festivales" ? (
        <FestivalsList
          festivals={festivals}
          loading={festivalsLoading}
          error={festivalsError}
          onRetry={loadFestivals}
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
      ) : section === "track" ? (
        /* Portada: la onda con las secciones hechas de onda (BassTrack). Mientras
           cargan los eventos se dibuja igual y reserva su alto (CLS). */
        <BassTrack events={regionEvents} todayKey={BA_YMD_FORMAT.format(nightNow())} onCue={setSection} />
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
          {whereSeg}
          {searchSeg}
        </div>
      )}

      {/* De gira: el mundo entra a la agenda porteña como ruta de los que pasan
          por acá. Va después de los filtros: en la Agenda, Cuándo es lo primero. */}
      {search && <SalaHits hits={salaMatches(salasData?.salas, search)} onPick={openSala} />}
      {!search && !when && !loading && regionFilter === "amba" && <OnTour events={events} onSelect={onSelect} compact />}
      {!loading && railMonths.length > 0 && <DayRail months={railMonths} active={railActive || railMonths[0].days.find((d) => d.count)?.key} onPick={pickDay} t={t} />}

      {/* Header editorial del listado. Con savedOnly activo se muestra aunque
          haya 0 resultados: el toggle tiene que seguir visible para salir. */}
      {!loading && !error && (filtered.length > 0 || savedOnly) && (
        <div className="bl-feed-head">
          <span className="bl-feed-head-n">{filtered.length}</span>
          <span className="bl-feed-head-ctx">{t("feed.eventsWord")}{cityFilter !== "Todas" ? ` · ${cityFilter}` : ""}</span>
          {when && (
            <button type="button" className="bl-when-chip bl-bass-t-label" onClick={() => setWhen("")} aria-label={`${whenLabels[when]} — ${t("filter.clear")}`}>
              {whenLabels[when]} <span aria-hidden="true">✕</span>
            </button>
          )}
          {(saved.length > 0 || savedOnly) && (
            <button
              type="button"
              className={`bl-saved-toggle bl-bass-t-label${savedOnly ? " on" : ""}`}
              onClick={() => setSavedOnly((v) => !v)}
              aria-pressed={savedOnly}
            >
              <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                <path d="M6 3h12v18l-6-4.5L6 21V3z" fill={savedOnly ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              {t("saved.label")} {saved.length}
            </button>
          )}
        </div>
      )}
      {/* El finde en tu calendario: la vuelta semanal sin cuentas (oct 2026). */}
      {!loading && !error && !search && when !== "hoy" && !savedOnly && <><Finde events={events} onSelect={onSelect} /><SemanaLinea /></>}
      {loading ? <EventSkeleton />
        : error ? <div className="bl-ev-list"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRetry())}>{error}</div></div>
        : filtered.length === 0 ? (salaMatches(salasData?.salas, search).length ? null : <div className="bl-ev-list"><div className="bl-empty">{emptyMessage()}</div></div>)
        : <div className="bl-ev-list bl-ev-wall" role="region" aria-label={t("section.events")} ref={listRef}>
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
                  <h2 className="bl-day-header bl-reveal" key={`h-${item.key}`} data-day={item.key} style={{ transitionDelay: `${Math.min(gIdx * 0.02, 0.15)}s` }}>
                    <span className="bl-day-label">{item.label}</span>
                    <span className="bl-day-date">{item.day} {monthAbbrLocale(item.month, locale)}</span>
                    <span className="bl-day-line" aria-hidden="true" />
                  </h2>
                );
              }
              const ev = item.data;
              const idx = itemIdx++;
              const isLead = item.lead;
              const stamp = eventStamp(ev, t);
              return (
                <article
                  className={`bl-ev-item bl-reveal ${isLead ? "bl-ev-lead" : "bl-ev-row"}`}
                  key={`${ev.day}-${ev.month}-${ev.venue}-${ev.name}`}
                  data-genre={ev.genre}
                  data-time={ev.time || ""}
                  data-featured={ev.featured ? "true" : undefined}
                  onClick={() => onSelect(ev)}
                  style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
                >
                  {/* Un solo control accesible por card: botón estirado (invisible,
                      focusable) que abre el modal. Así el SaveButton no queda
                      anidado dentro de otro botón (axe nested-interactive). */}
                  <button type="button" className="bl-ev-open" onClick={(e) => { e.stopPropagation(); onSelect(ev); }} aria-label={`${ev.name} - ${ev.day} ${ev.month} en ${ev.venue}`} />
                  {/* El flyer es diseño gráfico hecho para este show: va de
                      portada, no de miniatura. La fecha no se repite acá —
                      la dice el encabezado del día, una sola vez. */}
                  <BlThumb image={ev.image} artistImage={ev.artistImage} artistImageName={ev.artistImageName} poster={{ text: (ev.artists && ev.artists[0]) || ev.name, family: ev.family }} />
                  <div className="bl-ev-body">
                    <div className="bl-ev-name">{noOrphanSep(ev.name)}</div>
                    {isLead && ev.artists && ev.artists.length >= 2 && (
                      <div className="bl-ev-lineup">{ev.artists.slice(0, 4).join(" · ")}</div>
                    )}
                    <div className="bl-ev-venue-line">{ev.venue}</div>
                    <div className="bl-ev-meta-row">
                      {/* En leads la hora vive acá siempre; en filas, solo en
                          mobile (libera la columna derecha para el título). */}
                      {ev.time && <span className={`bl-ev-time-inline${isLead ? "" : " bl-ev-time-mobile"}`}>{ev.time}</span>}
                      {stamp && (
                        <span className="bl-ev-genre-badge" title={stamp}>{stamp}</span>
                      )}
                      {ev.source === "venue" && <span className="bl-ev-venue-badge">venue</span>}
                      {ev.venue_verified && <span className="bl-ev-venue-verified">&#10003;</span>}
                    </div>
                  </div>
                  {/* Fila: la hora sale del meta-row y ancla la derecha en mono,
                      lectura de tracklist. El cartel ancla el countdown. */}
                  {!isLead && ev.time && <div className="bl-ev-time-block">{ev.time}</div>}
                  {isLead && <EventCountdown date={item.date} />}
                  <SaveButton slug={eventSlug(ev)} />
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
        <div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRetry())}>
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
    <>
    <SectionHead n={news.length} word={t("feed.newsWord")} />
    <div className="bl-bass-news-list" role="region" aria-label={t("section.news")} ref={listRef}>
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
    </>
  );
}

function BassNewsItem({ item, idx, onSelect }) {
  const { locale } = useLocale();
  const tr = useTranslatedTitle(item, locale === "es");   // titulares en inglés/francés/alemán: traducidos y marcados
  const [imgFailed, setImgFailed] = useState(false);
  const showPill = !!(item.tag && item.image && !imgFailed);
  return (
    <article
      className="bl-bass-news-item bl-reveal"
      onClick={() => onSelect?.(item)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect?.(item))}
      tabIndex={0}
      role="button"
      aria-label={`${tr.title}${item.tag ? ` — ${item.tag}` : ""}`}
      style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <BlThumb image={item.image} poster={{ text: item.source || item.tag || item.title, family: "news" }} onImgFail={() => setImgFailed(true)} />
      <div className="bl-bass-news-body">
        <h3 className="bl-bass-news-title bl-bass-t-heading" lang={tr.lang}>{tr.title}</h3>
        {showPill && <span className="bl-bass-news-tag-pill bl-bass-t-label">{item.tag}</span>}
      </div>
    </article>
  );
}

const FESTIVAL_REGIONS = ["All", "BA", "Sudamérica", "Europa", "Norteamérica", "Asia"];
const festMonths = (locale) => MONTHS_ABBR[locale] || MONTHS_ABBR.es;

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

// Festivales con el lenguaje de la Agenda (oct 2026, "interiores unificados"):
// filtros de texto con conteo (solo las regiones que tienen algo), número de apertura,
// rótulos con filete y la pared de afiches con la fecha sobre el flyer.
function FestivalsList({ festivals, loading, error, onRetry, onSelect }) {
  const { t, locale } = useLocale();
  const [region, setRegion] = useState("All");
  const all = festivals || [];
  const regions = ["All", ...FESTIVAL_REGIONS.filter((r) => r !== "All" && all.some((f) => f.region === r))];
  const counts = { all: all.length, ...Object.fromEntries(regions.slice(1).map((r) => [r, all.filter((f) => f.region === r).length])) };
  const list = region === "All" ? all : all.filter((f) => f.region === region);
  const listRef = useScrollReveal(loading, region);
  if (loading) return <NewsSkeleton />;
  if (error) return <div className="bl-feed"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRetry())}>{error}</div></div>;
  if (!all.length) return <div className="bl-feed"><div className="bl-empty">{t("feed.empty.festivals")}</div></div>;
  return (
    <>
      <FilterBar items={regions} active={region} onChange={setRegion} className="bass-filters" counts={counts} />
      <SectionHead n={list.length} word={t("feed.festivalsWord")} />
      <div className="bl-ev-list bl-ev-wall bl-fest-wall" role="region" aria-label={t("section.festivals")} ref={listRef}>
        {[["BA", t("fest.inBA")], ["world", t("fest.inWorld")]].flatMap(([key, label]) => {
          const group = list.filter((f) => (f.region === "BA") === (key === "BA"));
          if (!group.length) return [];
          return [
            <h3 className="bl-day-header" key={`h-${key}`}><span className="bl-day-label">{label}</span><span className="bl-day-line" aria-hidden="true" /></h3>,
            ...group.map((f, i) => (
              <article
                key={f.id}
                className={`bl-ev-item bl-reveal ${i === 0 ? "bl-ev-lead" : "bl-ev-row"}`}
                data-time={festivalDateRange(f.dates_start, f.dates_end, locale)}
                onClick={() => onSelect?.(f)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect?.(f))}
                tabIndex={0}
                role="button"
                aria-label={`${f.name} — ${f.city}, ${f.country}`}
                style={{ cursor: "pointer", transitionDelay: `${Math.min(i * 0.04, 0.3)}s` }}
              >
                <BlThumb image={f.image} poster={{ text: f.name, family: "festival" }} />
                <div className="bl-ev-body">
                  <div className="bl-ev-name">{f.name}</div>
                  <div className="bl-ev-venue-line">{f.city}, {f.country}</div>
                  {f.status === "live" && <div className="bl-ev-meta-row"><span className="bl-festival-live-dot">EN CURSO</span></div>}
                </div>
              </article>
            )),
          ];
        })}
        <EndOfSet />
      </div>
    </>
  );
}

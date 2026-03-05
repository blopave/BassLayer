import { useState, useEffect, useRef, useCallback } from "react";
import { api, timeAgo } from "./utils/api";
import { isMobile } from "./utils/constants";
import { useHomeCanvas } from "./hooks/useHomeCanvas";
import { useFavorites } from "./hooks/useFavorites";
import { Preloader } from "./components/Preloader";
import { PriceTicker } from "./components/PriceTicker";
import { EventModal } from "./components/EventModal";
import { BassFeed } from "./components/BassFeed";
import { LayerFeed } from "./components/LayerFeed";
import { PriceModal } from "./components/PriceModal";

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("home");
  const [circleStyle, setCircleStyle] = useState({});
  const [circleExpand, setCircleExpand] = useState(false);

  // Data state
  const [prices, setPrices] = useState([]);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);
  const [newsFilter, setNewsFilter] = useState("All");
  const [newsUpdated, setNewsUpdated] = useState(0);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);
  const [eventsFilter, setEventsFilter] = useState("All");
  const [eventsUpdated, setEventsUpdated] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventsSearch, setEventsSearch] = useState("");
  const [toast, setToast] = useState("");
  const [selectedPrice, setSelectedPrice] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const newsLoadedRef = useRef(false);
  const eventsLoadedRef = useRef(false);

  // Favorites
  const { isFavorite, toggleFavorite } = useFavorites();

  // Share
  function shareEvent(ev) {
    const text = `${ev.name} \u2014 ${ev.day} ${ev.month} @ ${ev.venue}\n${ev.detail}`;
    const url = ev.url || `https://www.google.com/search?q=${encodeURIComponent(ev.name + " " + ev.venue + " Buenos Aires")}`;
    if (navigator.share) {
      navigator.share({ title: ev.name, text, url }).catch(() => {});
    } else {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`;
      window.open(waUrl, "_blank");
    }
  }

  // Home hover
  const [bassHov, setBassHov] = useState(false);
  const [layerHov, setLayerHov] = useState(false);
  const bassI = useRef(0);
  const layerI = useRef(0);
  const canvasRef = useRef(null);
  const bassLetters = useRef([]);
  const layerLetters = useRef([]);
  const tRef = useRef(0);
  const decodeTimers = useRef(Array(5).fill(0));
  const wasLayerHov = useRef(false);

  // Force re-render for "updated X ago"
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(iv); }, []);

  useHomeCanvas(canvasRef, bassI, layerI);

  // Letter animation
  useEffect(() => {
    const glyphs = "01#$\u20BF\u039E\u0394>|_\u27E8\u27E9\u221E\u2248".split("");
    let raf;
    function animate() {
      tRef.current++;
      const t = tRef.current;
      bassI.current += ((bassHov ? 1 : 0) - bassI.current) * (bassHov ? 0.12 : 0.06);
      layerI.current += ((layerHov ? 1 : 0) - layerI.current) * (layerHov ? 0.12 : 0.06);
      if (layerHov && !wasLayerHov.current) decodeTimers.current.fill(0);
      wasLayerHov.current = layerHov;

      bassLetters.current.forEach((el, i) => {
        if (!el) return;
        const bi = bassI.current;
        if (bi > 0.01) {
          const w = Math.sin(t * 0.1 + i * 1.2), y = w * 10 * bi, b = Math.round(229 + w * 26 * bi);
          el.style.transform = `translateY(${y}px) scaleY(${1 + w * 0.025 * bi})`;
          el.style.color = `rgb(${b},${b},${b})`;
          el.style.textShadow = `0 ${Math.abs(y) * 0.4}px ${8 * bi}px rgba(255,255,255,${0.04 * bi})`;
        } else { el.style.transform = ""; el.style.color = ""; el.style.textShadow = ""; }
      });

      layerLetters.current.forEach((el, i) => {
        if (!el) return;
        const li = layerI.current, orig = "Layer"[i];
        if (li > 0.01) {
          const sf = i * 14;
          decodeTimers.current[i]++;
          const dt = decodeTimers.current[i];
          if (dt < sf) {
            el.textContent = orig; el.style.opacity = 0.12 * li; el.style.color = "#444"; el.style.textShadow = "none"; el.style.transform = "";
          } else if (dt < sf + 35) {
            if ((dt - sf) % 4 === 0) el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
            el.style.opacity = (0.35 + Math.random() * 0.25) * li; el.style.color = "#777";
            el.style.transform = `translateY(${(Math.random() - 0.5) * 1.5}px)`;
            el.style.textShadow = `0 0 ${10 * li}px rgba(255,255,255,${0.05 * li})`;
          } else {
            el.textContent = orig; el.style.opacity = 1; el.style.color = "#fff"; el.style.transform = "";
            el.style.textShadow = `0 0 ${8 * li}px rgba(255,255,255,${0.04 * li})`;
            if (Math.random() < 0.006) { el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)]; el.style.opacity = 0.6; }
          }
        } else {
          el.style.transform = ""; el.style.color = ""; el.style.opacity = ""; el.style.textShadow = "";
          el.textContent = orig; decodeTimers.current[i] = 0;
        }
      });
      raf = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(raf);
  }, [bassHov, layerHov]);

  // Prices
  useEffect(() => {
    const load = () => api.prices().then(setPrices).catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Pull-to-refresh (mobile)
  const bassPanelRef = useRef(null);
  const bassPtrRef = useRef(null);
  const ptrState = useRef({ startY: 0, triggered: false });

  const onPanelTouchStart = useCallback((e) => {
    if (!isMobile || !bassPanelRef.current) return;
    if (bassPanelRef.current.scrollTop <= 0) {
      ptrState.current = { startY: e.touches[0].clientY, triggered: false };
    }
  }, []);

  const onPanelTouchMove = useCallback((e) => {
    if (!isMobile || !bassPanelRef.current || !bassPtrRef.current) return;
    if (bassPanelRef.current.scrollTop > 0) return;
    const dy = e.touches[0].clientY - ptrState.current.startY;
    if (dy > 10) {
      const h = Math.min(dy * 0.5, 60);
      bassPtrRef.current.style.height = h + "px";
      if (dy > 120 && !ptrState.current.triggered) {
        ptrState.current.triggered = true;
        bassPtrRef.current.querySelector(".bl-ptr-inner").textContent = "Soltar para actualizar";
      }
    }
  }, []);

  const onPanelTouchEnd = useCallback(() => {
    if (!bassPtrRef.current) return;
    if (ptrState.current.triggered) {
      bassPtrRef.current.querySelector(".bl-ptr-inner").innerHTML = '<span class="bl-ptr-spinner">\u21BB</span> Actualizando';
      loadEvents();
      setTimeout(() => { if (bassPtrRef.current) bassPtrRef.current.style.height = "0"; }, 1200);
    } else {
      bassPtrRef.current.style.height = "0";
    }
  }, []);

  // Navigation
  const [activePanel, setActivePanel] = useState(0);
  const touchStart = useRef({ x: 0, y: 0 });
  const touchDelta = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef(null);

  const navigateToSections = useCallback((e, startPanel = 0) => {
    if (view !== "home") return;
    setActivePanel(startPanel);
    const cx = e?.clientX || e?.touches?.[0]?.clientX || innerWidth / 2;
    const cy = e?.clientY || e?.touches?.[0]?.clientY || innerHeight / 2;
    const sz = Math.max(innerWidth, innerHeight) * 2.5;
    setCircleStyle({ width: sz, height: sz, left: cx, top: cy, background: "#1F1E1D" });
    setCircleExpand(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setCircleExpand(true)));
    setTimeout(() => {
      setView("sections");
      setTimeout(() => setCircleExpand(false), 100);
      if (!newsLoadedRef.current) { newsLoadedRef.current = true; loadNews(); }
      if (!eventsLoadedRef.current) { eventsLoadedRef.current = true; loadEvents(); }
    }, 500);
  }, [view]);

  const navigateHome = useCallback((e) => {
    if (view !== "sections") return;
    const cx = e?.clientX || e?.touches?.[0]?.clientX || innerWidth / 2;
    const cy = e?.clientY || e?.touches?.[0]?.clientY || innerHeight / 2;
    const sz = Math.max(innerWidth, innerHeight) * 2.5;
    setCircleStyle({ width: sz, height: sz, left: cx, top: cy, background: "#000" });
    setCircleExpand(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setCircleExpand(true)));
    setTimeout(() => {
      setView("home");
      setTimeout(() => setCircleExpand(false), 100);
    }, 500);
  }, [view]);

  const swipeTo = useCallback((panel) => {
    setActivePanel(panel);
    if (containerRef.current) containerRef.current.classList.remove("dragging");
  }, []);

  // Touch handlers for swipe
  const onTouchStart = useCallback((e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchDelta.current = 0;
    isDragging.current = false;
  }, []);

  const onTouchMove = useCallback((e) => {
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (!isDragging.current) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        isDragging.current = true;
        if (containerRef.current) containerRef.current.classList.add("dragging");
      } else return;
    }
    e.preventDefault();
    touchDelta.current = dx;
    if (containerRef.current) {
      const base = -(activePanel * 50);
      const pct = (dx / innerWidth) * 50;
      const clamped = Math.max(-50, Math.min(0, base + pct));
      containerRef.current.style.transform = `translateX(${clamped}%)`;
    }
  }, [activePanel]);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const threshold = innerWidth * 0.2;
    if (touchDelta.current > threshold && activePanel === 1) swipeTo(0);
    else if (touchDelta.current < -threshold && activePanel === 0) swipeTo(1);
    else swipeTo(activePanel);
    if (containerRef.current) {
      containerRef.current.classList.remove("dragging");
      containerRef.current.style.transform = "";
    }
  }, [activePanel, swipeTo]);

  // Keyboard navigation
  useEffect(() => {
    if (view !== "sections") return;
    const handler = (e) => {
      if (e.key === "ArrowLeft" && activePanel === 1) swipeTo(0);
      if (e.key === "ArrowRight" && activePanel === 0) swipeTo(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, activePanel, swipeTo]);

  // Feed loaders
  async function loadNews() {
    setNewsLoading(true); setNewsError(null);
    try {
      const items = await api.news();
      if (items.length > 0) { setNews(items); setNewsUpdated(Date.now()); }
      else setNewsError("Sin noticias. Toc\u00e1 para reintentar.");
    } catch { setNewsError("Error cargando noticias. \u00bfEst\u00e1 corriendo el backend?"); }
    finally { setNewsLoading(false); }
  }

  async function loadEvents() {
    setEventsLoading(true); setEventsError(null);
    try {
      const items = await api.events();
      if (items.length > 0) { setEvents(items); setEventsUpdated(Date.now()); }
      else setEventsError("Sin eventos. Toc\u00e1 para reintentar.");
    } catch { setEventsError("Error cargando eventos. \u00bfEst\u00e1 corriendo el backend?"); }
    finally { setEventsLoading(false); }
  }

  // Auto-refresh
  useEffect(() => {
    if (view !== "sections") return;
    const iv = setInterval(() => {
      if (newsLoadedRef.current) loadNews();
      if (eventsLoadedRef.current) loadEvents();
    }, 5 * 60_000);
    return () => clearInterval(iv);
  }, [view]);

  // Render
  const swipeTransform = `translateX(${-(activePanel * 50)}%)`;

  return (
    <div className="bl-root">
      <div className="bl-grain" aria-hidden="true" />
      {!loaded && <Preloader done={() => { setLoaded(true); if (!localStorage.getItem("bl-onboarded")) setShowOnboarding(true); }} />}

      <div className="bl-circle" aria-hidden="true">
        <div className={`bl-circle-inner${circleExpand ? " expand" : ""}`}
          style={{ width: circleStyle.width || 0, height: circleStyle.height || 0, left: circleStyle.left || 0, top: circleStyle.top || 0, background: circleStyle.background || "#1F1E1D" }} />
      </div>

      {/* HOME */}
      <div className={`bl-view bl-home-view${view === "home" ? " active" : ""}`}>
        <main className={`bl-home${layerHov ? " layer-active" : ""}`}>
          <div className="bl-scanlines" aria-hidden="true" />
          <canvas className="bl-canvas" ref={canvasRef} aria-hidden="true" />
          <div className="bl-info bl-info-tl" aria-hidden="true">BassLayer</div>
          <div className="bl-info bl-info-tr" aria-hidden="true">&mdash;&mdash; 2026</div>
          <div className="bl-info bl-info-bl" aria-hidden="true">Buenos Aires</div>
          <div className="bl-info bl-info-br" aria-hidden="true">Eleg&iacute; tu lado</div>

          <div className={`bl-word-wrap${bassHov ? " bass-hovered" : ""}${layerHov ? " layer-hovered" : ""}`}>
            <h1 className="bl-sr-only">BassLayer</h1>
            <div className="bl-word-half bl-word-bass"
              onMouseEnter={isMobile ? undefined : () => setBassHov(true)}
              onMouseLeave={isMobile ? undefined : () => setBassHov(false)}
              onClick={(e) => navigateToSections(e, 0)}
              onKeyDown={(e) => e.key === "Enter" && navigateToSections(e, 0)}
              onTouchEnd={isMobile ? (e) => { e.preventDefault(); navigateToSections(e, 0); } : undefined}
              role="button"
              tabIndex={0}
              aria-label="Ir a Bass - Eventos de m&uacute;sica electr&oacute;nica">
              {"Bass".split("").map((ch, i) => <span key={i} className="bl-letter" ref={(el) => (bassLetters.current[i] = el)} aria-hidden="true">{ch}</span>)}
            </div>
            <div className="bl-word-half bl-word-layer"
              onMouseEnter={isMobile ? undefined : () => setLayerHov(true)}
              onMouseLeave={isMobile ? undefined : () => setLayerHov(false)}
              onClick={(e) => navigateToSections(e, 1)}
              onKeyDown={(e) => e.key === "Enter" && navigateToSections(e, 1)}
              onTouchEnd={isMobile ? (e) => { e.preventDefault(); navigateToSections(e, 1); } : undefined}
              role="button"
              tabIndex={0}
              aria-label="Ir a Layer - Crypto y noticias">
              {"Layer".split("").map((ch, i) => <span key={i} className="bl-letter" ref={(el) => (layerLetters.current[i] = el)} aria-hidden="true">{ch}</span>)}
            </div>
            <div className="bl-concepts bl-concepts-bass" aria-hidden="true">
              <div className={`bl-concept-text${bassHov || isMobile ? " show" : ""}`}>Electronic music &middot; Events &middot; Clubs</div>
            </div>
            <div className="bl-concepts bl-concepts-layer" aria-hidden="true">
              <div className={`bl-concept-text${layerHov || isMobile ? " show" : ""}`}>Blockchain &middot; Crypto &middot; Markets</div>
            </div>
          </div>

          <div className="bl-choose" aria-hidden="true">
            <div className="bl-choose-text">{isMobile ? "Tap to enter" : "Hover to explore"}</div>
            <div className="bl-choose-line" />
          </div>
        </main>
      </div>

      {/* SECTIONS */}
      <div className={`bl-swipe-wrap${view === "sections" ? " active" : ""}`}>
        <nav className="bl-topbar" aria-label="Navegaci&oacute;n principal">
          <div className="bl-topbar-left">
            <button className="bl-topbar-back" onClick={navigateHome} aria-label="Volver al inicio">&larr; Home</button>
            <span className="bl-topbar-sep" aria-hidden="true">|</span>
            <div className="bl-topbar-tabs" role="tablist">
              <button className={`bl-topbar-tab${activePanel === 0 ? " active" : ""}`} onClick={() => swipeTo(0)} role="tab" aria-selected={activePanel === 0}>Bass</button>
              <span className="bl-topbar-tab-sep" aria-hidden="true">/</span>
              <button className={`bl-topbar-tab${activePanel === 1 ? " active" : ""}`} onClick={() => swipeTo(1)} role="tab" aria-selected={activePanel === 1}>Layer</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="bl-swipe-dots" aria-hidden="true">
              <div className={`bl-swipe-dot${activePanel === 0 ? " active" : ""}`} />
              <div className={`bl-swipe-dot${activePanel === 1 ? " active" : ""}`} />
            </div>
            <span className="bl-topbar-meta">
              {activePanel === 0 && eventsUpdated ? `Updated ${timeAgo(eventsUpdated)}` : ""}
              {activePanel === 1 && newsUpdated ? `Updated ${timeAgo(newsUpdated)}` : ""}
            </span>
          </div>
        </nav>

        <div
          ref={containerRef}
          className="bl-swipe-container"
          style={{ transform: swipeTransform }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Panel 0: BASS */}
          <div className="bl-swipe-panel" role="tabpanel" aria-label="Bass - Eventos" ref={bassPanelRef} onTouchStart={onPanelTouchStart} onTouchMove={onPanelTouchMove} onTouchEnd={onPanelTouchEnd}>
            <div className="bl-ptr" ref={bassPtrRef}><div className="bl-ptr-inner">{"\u2193"} Tirar para actualizar</div></div>
            <BassFeed events={events} loading={eventsLoading} error={eventsError} onRetry={loadEvents} filter={eventsFilter} onFilter={setEventsFilter} onSelect={setSelectedEvent} search={eventsSearch} onSearch={setEventsSearch} isFavorite={isFavorite} />
            <div className="bl-section-end" />
          </div>

          {/* Panel 1: LAYER */}
          <div className="bl-swipe-panel" role="tabpanel" aria-label="Layer - Crypto">
            <PriceTicker prices={prices} onSelect={setSelectedPrice} />
            <LayerFeed news={news} loading={newsLoading} error={newsError} onRetry={loadNews} filter={newsFilter} onFilter={setNewsFilter} />
            <div className="bl-section-end" />
          </div>
        </div>
      </div>

      {/* EVENT MODAL */}
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} onShare={shareEvent} />

      {/* PRICE MODAL */}
      <PriceModal price={selectedPrice} onClose={() => setSelectedPrice(null)} />

      {/* ONBOARDING */}
      {showOnboarding && (
        <div className="bl-onboarding" onClick={() => { localStorage.setItem("bl-onboarded", "1"); setShowOnboarding(false); }}>
          <div className="bl-onboarding-card" onClick={(e) => e.stopPropagation()}>
            <div className="bl-onboarding-title">Bienvenido a BassLayer</div>
            <div className="bl-onboarding-tips">
              <div className="bl-onboarding-tip">
                <span className="bl-onboarding-num">1</span>
                {isMobile ? "Toca Bass o Layer para explorar" : "Pasa el mouse sobre Bass o Layer para explorar"}
              </div>
              <div className="bl-onboarding-tip">
                <span className="bl-onboarding-num">2</span>
                Bass = eventos de musica electronica en Buenos Aires
              </div>
              <div className="bl-onboarding-tip">
                <span className="bl-onboarding-num">3</span>
                Layer = crypto, precios en vivo y noticias
              </div>
            </div>
            <button className="bl-onboarding-btn" onClick={() => { localStorage.setItem("bl-onboarded", "1"); setShowOnboarding(false); }}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* TOAST */}
      <div className={`bl-toast${toast ? " show" : ""}`} aria-live="polite">{toast}</div>
    </div>
  );
}

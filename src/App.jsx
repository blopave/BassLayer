import { useState, useEffect, useRef, useCallback } from "react";
import { api, timeAgo } from "./utils/api";
import { useIsMobile } from "./utils/constants";
import { useHomeCanvas } from "./hooks/useHomeCanvas";
import { Preloader } from "./components/Preloader";
import { PriceTicker } from "./components/PriceTicker";
import { EventModal } from "./components/EventModal";
import { BassFeed } from "./components/BassFeed";
import { LayerFeed } from "./components/LayerFeed";
import { PriceModal } from "./components/PriceModal";
import { WeekendPicker } from "./components/WeekendPicker";

export default function App() {
  const isMobile = useIsMobile();
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
  // toast removed — was unused
  const [selectedPrice, setSelectedPrice] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWeekendPicker, setShowWeekendPicker] = useState(false);
  const newsLoadedRef = useRef(false);
  const eventsLoadedRef = useRef(false);

  // Feed loaders — defined early since PTR, navigateToSections, and auto-refresh depend on them
  const loadNews = useCallback(async () => {
    setNewsLoading(true); setNewsError(null);
    try {
      const items = await api.news();
      if (items.length > 0) { setNews(items); setNewsUpdated(Date.now()); }
      else setNewsError("Sin noticias. Tocá para reintentar.");
    } catch { setNewsError("Error cargando noticias. ¿Está corriendo el backend?"); }
    finally { setNewsLoading(false); }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true); setEventsError(null);
    try {
      const items = await api.events();
      if (items.length > 0) { setEvents(items); setEventsUpdated(Date.now()); }
      else setEventsError("Sin eventos. Tocá para reintentar.");
    } catch { setEventsError("Error cargando eventos. ¿Está corriendo el backend?"); }
    finally { setEventsLoading(false); }
  }, []);


  // Share
  function shareEvent(ev) {
    const artists = (ev.artists || []).filter(a => a && a !== "TBA").slice(0, 3).join(", ");
    const text = `${ev.name} \u2014 ${ev.day} ${ev.month} @ ${ev.venue}${artists ? "\n" + artists : ""}`;
    const url = ev.url || `https://www.google.com/search?q=${encodeURIComponent(ev.name + " " + ev.venue + " Buenos Aires")}`;
    if (navigator.share) {
      navigator.share({ title: ev.name, text, url }).catch(() => {});
    } else {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`;
      window.open(waUrl, "_blank");
    }
  }

  // Day/Night mode
  const [dayMode, setDayMode] = useState(() => localStorage.getItem("bl-mode") === "day");
  const toggleMode = useCallback(() => {
    const root = document.querySelector(".bl-root");
    if (root) {
      root.classList.add("theme-transitioning");
      setTimeout(() => root.classList.remove("theme-transitioning"), 700);
    }
    setDayMode((prev) => {
      const next = !prev;
      localStorage.setItem("bl-mode", next ? "day" : "night");
      return next;
    });
  }, []);

  // BA Clock
  const [clock, setClock] = useState("");
  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  // Hero entrance / exit
  const [heroEntered, setHeroEntered] = useState(false);
  const [heroExiting, setHeroExiting] = useState(false);
  useEffect(() => { if (loaded) { const t = setTimeout(() => setHeroEntered(true), 200); return () => clearTimeout(t); } }, [loaded]);

  // Custom cursor + parallax mouse tracking
  const cursorRef = useRef(null);
  const cursorPos = useRef({ x: -100, y: -100 });
  const cursorTarget = useRef({ x: -100, y: -100 });
  const mouseNorm = useRef({ x: 0, y: 0 }); // -1 to 1 normalized
  const parallaxRefs = useRef({ tl: null, tr: null, bl: null, br: null, canvas: null });

  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (isMobile) return;
    const isInteractive = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "SELECT") return true;
      if (el.getAttribute("role") === "button" || el.getAttribute("tabindex") !== null) return true;
      return el.closest("a, button, [role='button'], [tabindex]") !== null;
    };
    const onMove = (e) => {
      cursorTarget.current = { x: e.clientX, y: e.clientY };
      mouseNorm.current = { x: (e.clientX / innerWidth - 0.5) * 2, y: (e.clientY / innerHeight - 0.5) * 2 };
      if (cursorRef.current) {
        if (isInteractive(e.target)) cursorRef.current.classList.add("active");
        else cursorRef.current.classList.remove("active");
      }
    };
    window.addEventListener("mousemove", onMove);
    const smooth = { x: 0, y: 0 };
    let raf;
    function animate() {
      // Cursor
      const p = cursorPos.current, t = cursorTarget.current;
      p.x += (t.x - p.x) * 0.15;
      p.y += (t.y - p.y) * 0.15;
      if (cursorRef.current) cursorRef.current.style.transform = `translate(${p.x}px, ${p.y}px)`;

      // Parallax — only compute on home view
      if (viewRef.current === "home") {
        smooth.x += (mouseNorm.current.x - smooth.x) * 0.05;
        smooth.y += (mouseNorm.current.y - smooth.y) * 0.05;
        const pr = parallaxRefs.current;
        if (pr.tl) pr.tl.style.transform = `translate(${smooth.x * -8}px, ${smooth.y * -8}px)`;
        if (pr.tr) pr.tr.style.transform = `translate(${smooth.x * -6}px, ${smooth.y * -6}px)`;
        if (pr.bl) pr.bl.style.transform = `translate(${smooth.x * -10}px, ${smooth.y * -10}px)`;
        if (pr.br) pr.br.style.transform = `translate(${smooth.x * -5}px, ${smooth.y * -5}px)`;
        if (pr.canvas) pr.canvas.style.transform = `translate(${smooth.x * 12}px, ${smooth.y * 8}px)`;
      }

      raf = requestAnimationFrame(animate);
    }
    animate();
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, [isMobile]);

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

  useHomeCanvas(canvasRef, bassI, layerI, view);

  // Letter animation — only run on home view
  useEffect(() => {
    if (view !== "home") return;
    const glyphs = "01#$\u20BF\u039E\u0394>|_\u27E8\u27E9\u221E\u2248\u00D7\u2261".split("");
    const isDay = () => document.querySelector(".bl-root")?.classList.contains("day-mode");
    let raf;
    function animate() {
      tRef.current++;
      const t = tRef.current;
      const day = isDay();
      bassI.current += ((bassHov ? 1 : 0) - bassI.current) * (bassHov ? 0.12 : 0.06);
      layerI.current += ((layerHov ? 1 : 0) - layerI.current) * (layerHov ? 0.12 : 0.06);
      if (layerHov && !wasLayerHov.current) decodeTimers.current.fill(0);
      wasLayerHov.current = layerHov;

      bassLetters.current.forEach((el, i) => {
        if (!el) return;
        const bi = bassI.current;
        if (bi > 0.01) {
          const kick = Math.sin(t * 0.06) * 0.5 + 0.5;
          const tremor = (Math.random() - 0.5) * 3 * bi;
          const wave = Math.sin(t * 0.1 + i * 1.2);
          const y = wave * 8 * bi + tremor * kick;
          const x = tremor * kick * 0.4;
          const skew = wave * 2 * bi * kick;
          const scale = 1 + kick * 0.04 * bi;

          el.style.transform = `translate(${x}px, ${y}px) skewX(${skew}deg) scaleY(${scale})`;

          if (day) {
            const r = Math.round(30 + wave * 20 * bi);
            const g = Math.round(28 + wave * 12 * bi);
            const b2 = Math.round(25 + wave * 8 * bi);
            el.style.color = `rgb(${r},${g},${b2})`;
            const glowStr = (0.06 + kick * 0.08) * bi;
            el.style.textShadow = `0 0 ${10 * bi}px rgba(60,40,20,${glowStr})`;
          } else {
            const r = Math.round(230 + wave * 25 * bi);
            const g = Math.round(225 + wave * 15 * bi);
            const b2 = Math.round(220 - wave * 10 * bi);
            el.style.color = `rgb(${r},${g},${b2})`;
            const glowStr = (0.08 + kick * 0.12) * bi;
            const outerGlow = (0.03 + kick * 0.05) * bi;
            el.style.textShadow = [
              `0 0 ${10 * bi}px rgba(255,240,220,${glowStr})`,
              `0 0 ${40 * bi}px rgba(255,220,180,${outerGlow})`,
              `0 ${Math.abs(y) * 0.5}px ${12 * bi}px rgba(255,255,255,${0.03 * bi})`,
              `${-x * 0.5}px 0 ${2 * bi}px rgba(255,200,150,${0.06 * bi})`
            ].join(",");
          }
        } else {
          const breath = Math.sin(t * 0.02 + i * 0.8) * 1.2;
          el.style.transform = `translateY(${breath}px)`;
          el.style.color = ""; el.style.textShadow = "";
        }
      });

      layerLetters.current.forEach((el, i) => {
        if (!el) return;
        const li = layerI.current, orig = "Layer"[i];
        const dimColor = day ? "#BBBBBB" : "#3A3A3A";
        const midColor = day ? "#888888" : "#666666";
        const fullColor = day ? "#1A1A1A" : "#E5E5E5";
        const glowRgba = day ? "rgba(0,0,0," : "rgba(255,255,255,";
        if (li > 0.01) {
          const sf = i * 14;
          decodeTimers.current[i]++;
          const dt = decodeTimers.current[i];
          if (dt < sf) {
            el.textContent = orig; el.style.opacity = 0.12 * li; el.style.color = dimColor; el.style.textShadow = "none"; el.style.transform = "";
          } else if (dt < sf + 35) {
            if ((dt - sf) % 4 === 0) el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
            el.style.opacity = (0.35 + Math.random() * 0.25) * li; el.style.color = midColor;
            el.style.transform = `translateY(${(Math.random() - 0.5) * 1.5}px)`;
            el.style.textShadow = `0 0 ${10 * li}px ${glowRgba}${0.05 * li})`;
          } else {
            el.textContent = orig; el.style.opacity = 1; el.style.color = fullColor; el.style.transform = "";
            el.style.textShadow = `0 0 ${8 * li}px ${glowRgba}${0.04 * li})`;
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
  }, [bassHov, layerHov, view]);

  // Navigation
  const [activePanel, setActivePanel] = useState(0);

  // Scroll progress
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    if (view !== "sections") return;
    const panel = activePanel === 0 ? bassPanelRef.current : layerPanelRef.current;
    if (!panel) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = panel;
      setScrollProgress(scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0);
    };
    panel.addEventListener("scroll", onScroll, { passive: true });
    return () => panel.removeEventListener("scroll", onScroll);
  }, [view, activePanel]);

  // Prices
  useEffect(() => {
    const load = () => api.prices().then(setPrices).catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Pull-to-refresh (mobile) — works on both panels
  const bassPanelRef = useRef(null);
  const layerPanelRef = useRef(null);
  const bassPtrRef = useRef(null);
  const layerPtrRef = useRef(null);
  const ptrState = useRef({ startY: 0, triggered: false, panel: null, ptrEl: null });

  const makePtrHandlers = useCallback((panelRef, ptrRef, onRefresh) => ({
    onTouchStart: (e) => {
      if (!isMobile || !panelRef.current) return;
      if (panelRef.current.scrollTop <= 0) {
        ptrState.current = { startY: e.touches[0].clientY, triggered: false, panel: panelRef, ptrEl: ptrRef };
      }
    },
    onTouchMove: (e) => {
      if (!isMobile || !panelRef.current || !ptrRef.current) return;
      if (panelRef.current.scrollTop > 0) return;
      const dy = e.touches[0].clientY - ptrState.current.startY;
      if (dy > 10) {
        const h = Math.min(dy * 0.5, 60);
        ptrRef.current.style.height = h + "px";
        if (dy > 120 && !ptrState.current.triggered) {
          ptrState.current.triggered = true;
          ptrRef.current.querySelector(".bl-ptr-inner").textContent = "Soltar para actualizar";
        }
      }
    },
    onTouchEnd: () => {
      if (!ptrRef.current) return;
      if (ptrState.current.triggered) {
        ptrRef.current.querySelector(".bl-ptr-inner").textContent = "\u21BB Actualizando";
        onRefresh();
        setTimeout(() => { if (ptrRef.current) ptrRef.current.style.height = "0"; }, 1200);
      } else {
        ptrRef.current.style.height = "0";
      }
    },
  }), [isMobile]);

  const bassPtr = makePtrHandlers(bassPanelRef, bassPtrRef, loadEvents);
  const layerPtr = makePtrHandlers(layerPanelRef, layerPtrRef, loadNews);

  // Dynamic favicon
  useEffect(() => {
    const setFavicon = (text, bg, fg) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${bg}"/><text x="32" y="44" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="28" fill="${fg}">${text}</text></svg>`;
      const link = document.querySelector("link[rel='icon']");
      if (link) link.href = "data:image/svg+xml," + encodeURIComponent(svg);
    };
    if (view === "home") {
      setFavicon("BL", dayMode ? "#F5F5F0" : "#000", dayMode ? "#1A1A1A" : "#e5e5e5");
    } else if (activePanel === 0) {
      setFavicon("B", dayMode ? "#F5F5F0" : "#000", dayMode ? "#1A1A1A" : "#e5e5e5");
    } else {
      setFavicon("L", dayMode ? "#F5F5F0" : "#000", dayMode ? "#1A1A1A" : "#e5e5e5");
    }
  }, [view, activePanel, dayMode]);

  const touchStart = useRef({ x: 0, y: 0 });
  const touchDelta = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef(null);

  const navigateToSections = useCallback((e, startPanel = 0) => {
    if (view !== "home" || heroExiting) return;
    setActivePanel(startPanel);
    setHeroExiting(true);
    const cx = e?.clientX || e?.changedTouches?.[0]?.clientX || e?.touches?.[0]?.clientX || innerWidth / 2;
    const cy = e?.clientY || e?.changedTouches?.[0]?.clientY || e?.touches?.[0]?.clientY || innerHeight / 2;
    const sz = Math.max(innerWidth, innerHeight) * 2.5;
    // Letters exit first, then circle wipe
    setTimeout(() => {
      setCircleStyle({ width: sz, height: sz, left: cx, top: cy, background: dayMode ? "#EAEAE5" : "#161616" });
      setCircleExpand(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setCircleExpand(true)));
      setTimeout(() => {
        setView("sections");
        setHeroExiting(false);
        setTimeout(() => setCircleExpand(false), 100);
        if (!newsLoadedRef.current) { newsLoadedRef.current = true; loadNews(); }
        if (!eventsLoadedRef.current) { eventsLoadedRef.current = true; loadEvents(); }
      }, 500);
    }, 350); // wait for letters to exit
  }, [view, heroExiting, dayMode, loadNews, loadEvents]);

  const navigateHome = useCallback((e) => {
    if (view !== "sections") return;
    const cx = e?.clientX || e?.changedTouches?.[0]?.clientX || e?.touches?.[0]?.clientX || innerWidth / 2;
    const cy = e?.clientY || e?.changedTouches?.[0]?.clientY || e?.touches?.[0]?.clientY || innerHeight / 2;
    const sz = Math.max(innerWidth, innerHeight) * 2.5;
    setCircleStyle({ width: sz, height: sz, left: cx, top: cy, background: dayMode ? "#F5F5F0" : "#000000" });
    setCircleExpand(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setCircleExpand(true)));
    setTimeout(() => {
      setView("home");
      setTimeout(() => setCircleExpand(false), 100);
    }, 500);
  }, [view, dayMode]);

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

  const onTouchMoveRef = useRef(null);
  onTouchMoveRef.current = (e) => {
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
  };

  // Attach touchmove as non-passive so preventDefault works for swipe
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => onTouchMoveRef.current?.(e);
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, []);

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

  // Keyboard navigation + shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      if (view === "sections") {
        if (e.key === "ArrowLeft" && activePanel === 1) swipeTo(0);
        if (e.key === "ArrowRight" && activePanel === 0) swipeTo(1);
        if (key === "h") navigateHome(e);
        if (key === "b") swipeTo(0);
        if (key === "l") swipeTo(1);
      }
      if (key === "d" && view === "sections") toggleMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, activePanel, swipeTo, navigateHome, toggleMode]);

  // Feed loaders (defined early — used by PTR, navigateToSections, auto-refresh)

  // Auto-refresh
  useEffect(() => {
    if (view !== "sections") return;
    const iv = setInterval(() => {
      if (newsLoadedRef.current) loadNews();
      if (eventsLoadedRef.current) loadEvents();
    }, 5 * 60_000);
    return () => clearInterval(iv);
  }, [view, loadNews, loadEvents]);

  // Render
  const swipeTransform = `translateX(${-(activePanel * 50)}%)`;

  return (
    <div className={`bl-root${view === "home" ? " view-home" : ""}${dayMode ? " day-mode" : ""}`}>
      {!isMobile && <div className="bl-cursor" ref={cursorRef} />}
      <div className="bl-grain" aria-hidden="true" />
      {!loaded && <Preloader done={() => { setLoaded(true); if (!localStorage.getItem("bl-onboarded")) setShowOnboarding(true); }} />}

      <div className="bl-circle" aria-hidden="true">
        <div className={`bl-circle-inner${circleExpand ? " expand" : ""}`}
          style={{ width: circleStyle.width || 0, height: circleStyle.height || 0, left: circleStyle.left || 0, top: circleStyle.top || 0, background: circleStyle.background || "#0A0A0A" }} />
      </div>

      {/* HOME */}
      <div className={`bl-view bl-home-view${view === "home" ? " active" : ""}`}>
        <main className={`bl-home${heroEntered ? " hero-entered" : ""}${heroExiting ? " hero-exiting" : ""}${layerHov ? " layer-active" : ""}`}>
          <div className="bl-scanlines" aria-hidden="true" />
          <canvas className="bl-canvas" ref={(el) => { canvasRef.current = el; parallaxRefs.current.canvas = el; }} aria-hidden="true" />
          <div className="bl-info bl-info-tl" ref={(el) => (parallaxRefs.current.tl = el)} aria-hidden="true">BassLayer</div>
          <div className="bl-info bl-info-tr" ref={(el) => (parallaxRefs.current.tr = el)} aria-hidden="true">&mdash;&mdash; 2026</div>
          <div className="bl-info bl-info-bl" ref={(el) => (parallaxRefs.current.bl = el)} aria-hidden="true">Buenos Aires — {clock}</div>

          <div className={`bl-word-wrap${heroEntered ? " hero-entered" : ""}${heroExiting ? " hero-exiting" : ""}${bassHov ? " bass-hovered" : ""}${layerHov ? " layer-hovered" : ""}`}>
            <h1 className="bl-sr-only">BassLayer</h1>
            <div className="bl-word-row">
              <div className="bl-word-half bl-word-bass"
                onMouseEnter={isMobile ? undefined : () => setBassHov(true)}
                onMouseLeave={isMobile ? undefined : () => setBassHov(false)}
                onClick={(e) => navigateToSections(e, 0)}
                onKeyDown={(e) => e.key === "Enter" && navigateToSections(e, 0)}
                onTouchEnd={isMobile ? (e) => { e.preventDefault(); navigateToSections(e, 0); } : undefined}
                role="button"
                tabIndex={0}
                aria-label="Ir a Bass - Eventos de música electrónica">
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
            </div>
            <div className="bl-concepts bl-concepts-bass" aria-hidden="true">
              <div className={`bl-concept-text${bassHov || isMobile ? " show" : ""}`}>Electronic music scene</div>
            </div>
            <div className="bl-concepts bl-concepts-layer" aria-hidden="true">
              <div className={`bl-concept-text${layerHov || isMobile ? " show" : ""}`}>Blockchain · Crypto · Markets</div>
            </div>
          </div>

        </main>
      </div>

      {/* SECTIONS */}
      <section className={`bl-swipe-wrap${view === "sections" ? " active" : ""}`} aria-label="Contenido principal">
        <nav className="bl-topbar" aria-label="Navegaci&oacute;n principal">
          <div className="bl-scroll-progress" style={{ transform: `scaleX(${scrollProgress})` }} aria-hidden="true" />
          <div className="bl-topbar-left">
            <button className="bl-topbar-back" onClick={navigateHome} aria-label="Volver al inicio">&larr; Home</button>
            <span className="bl-topbar-sep" aria-hidden="true">|</span>
            <div className="bl-topbar-tabs" role="tablist">
              <button className={`bl-topbar-tab bl-topbar-tab-bass${activePanel === 0 ? " active" : ""}`} onClick={() => swipeTo(0)} role="tab" aria-selected={activePanel === 0}>Bass</button>
              <span className="bl-topbar-tab-sep" aria-hidden="true">/</span>
              <button className={`bl-topbar-tab bl-topbar-tab-layer${activePanel === 1 ? " active" : ""}`} onClick={() => swipeTo(1)} role="tab" aria-selected={activePanel === 1}>Layer</button>
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
          onTouchEnd={onTouchEnd}
        >
          {/* Panel 0: BASS */}
          <div className="bl-swipe-panel" role="tabpanel" aria-label="Bass - Eventos" ref={bassPanelRef} onTouchStart={bassPtr.onTouchStart} onTouchMove={bassPtr.onTouchMove} onTouchEnd={bassPtr.onTouchEnd}>
            <div className="bl-ptr" ref={bassPtrRef}><div className="bl-ptr-inner">{"\u2193"} Tirar para actualizar</div></div>
            <BassFeed events={events} loading={eventsLoading} error={eventsError} onRetry={loadEvents} filter={eventsFilter} onFilter={setEventsFilter} onSelect={setSelectedEvent} search={eventsSearch} onSearch={setEventsSearch} onOpenPicker={() => setShowWeekendPicker(true)} />
            <div className="bl-section-end" />
          </div>

          {/* Panel 1: LAYER */}
          <div className="bl-swipe-panel" role="tabpanel" aria-label="Layer - Crypto" ref={layerPanelRef} onTouchStart={layerPtr.onTouchStart} onTouchMove={layerPtr.onTouchMove} onTouchEnd={layerPtr.onTouchEnd}>
            <div className="bl-ptr" ref={layerPtrRef}><div className="bl-ptr-inner">{"\u2193"} Tirar para actualizar</div></div>
            <PriceTicker prices={prices} onSelect={setSelectedPrice} />
            <LayerFeed news={news} loading={newsLoading} error={newsError} onRetry={loadNews} filter={newsFilter} onFilter={setNewsFilter} />
            <div className="bl-section-end" />
          </div>
        </div>
      </section>

      {/* EVENT MODAL */}
      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onShare={shareEvent} />

      {/* PRICE MODAL */}
      <PriceModal price={selectedPrice} onClose={() => setSelectedPrice(null)} />

      {/* WEEKEND PICKER */}
      {showWeekendPicker && (
        <WeekendPicker
          events={events}
          onClose={() => setShowWeekendPicker(false)}
          onSelect={setSelectedEvent}
        />
      )}

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

      {/* MODE TOGGLE */}
      <button className="bl-mode-toggle" onClick={toggleMode} aria-label={dayMode ? "Modo nocturno" : "Modo diurno"}>
        {dayMode ? (
          <svg viewBox="0 0 24 24"><path className="bl-mode-icon" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><circle className="bl-mode-icon" cx="12" cy="12" r="5" /><path className="bl-mode-icon" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
        )}
      </button>

      {/* TOAST (placeholder for future use) */}
      <div className="bl-toast" aria-live="polite" />
    </div>
  );
}

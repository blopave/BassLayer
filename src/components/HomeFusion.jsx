import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import cyclesData from "../../data/btc-cycles.json";

/* ══════════════════════════════════════════════════════════════
   HomeFusion — home dual.
   DESKTOP: wordmark "Bass LAYER" fijo y centrado + los datos de los
   DOS mundos de fondo, desenfocados; al pasar el mouse por cada
   nombre se ACTIVA (enfoca) ese lado y el otro queda borroso pero
   presente (el wordmark NO se mueve). Click = entra a la sección.
   MOBILE: pórtico neutro SIEMPRE — ambos mundos de fondo desenfocados
   + "elegí un mundo"; tap en un nombre/dot o swipe entra al mundo
   real completo (mismo onEnter que el click del desktop).
   Datos reales: eventos (API), ciclo BTC (JSON), precio BTC (prices).
   ══════════════════════════════════════════════════════════════ */

const CURVE = cyclesData.priceHistoryEarly.map((p) => p.p);
const HALV_IDX = [10, 54, 100, 147];

function buildCurve(vals, w, h, pad = 6) {
  const logs = vals.map((v) => Math.log10(v));
  const mn = Math.min(...logs), mx = Math.max(...logs);
  const xs = (i) => pad + (i / (vals.length - 1)) * (w - 2 * pad);
  const ys = (v) => h - pad - ((v - mn) / (mx - mn)) * (h - 2 * pad);
  let d = "";
  logs.forEach((v, i) => { d += (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(v).toFixed(1) + " "; });
  const halv = HALV_IDX.filter((i) => i < vals.length).map((i) => ({ x: xs(i), y: ys(logs[i]) }));
  return { d: d.trim(), halv, last: { x: xs(vals.length - 1), y: ys(logs[vals.length - 1]) } };
}
function daysBetween(a, b) {
  const A = a instanceof Date ? a : new Date(a);
  const B = b instanceof Date ? b : new Date(b);
  return Math.max(0, Math.round((B - A) / 86400000));
}

export default function HomeFusion({ events = [], prices = [], t, locale, isMobile, onEnter }) {
  const [focus, setFocus] = useState("none");   // desktop hover: none|bass|layer
  const loc = locale === "en" ? "en-US" : "es";  // locale para toLocaleString/Date

  // ── datos reales ──
  const flyers = useMemo(() => (events || []).filter((e) => e.image).slice(0, 4), [events]);
  const eventCount = (events || []).length;
  const btcPrice = useMemo(() => {
    const b = (prices || []).find((p) => String(p.sym || "").toUpperCase().startsWith("BTC"));
    const v = b ? (b.usd ?? b.price) : null;   // la API expone `usd`; `price` queda como compat
    return v != null ? v : cyclesData.current.price;
  }, [prices]);
  const cycleDay = useMemo(() => daysBetween(cyclesData.keyDates.halving, new Date()), []);
  const halvingDays = useMemo(() => daysBetween(new Date(), cyclesData.keyDates.nextHalving), []);
  const halvingLabel = useMemo(() => {
    const d = new Date(cyclesData.keyDates.nextHalving);
    return d.toLocaleDateString(loc, { month: "short", year: "numeric" });
  }, [loc]);
  const phase = cyclesData.current.phaseLabel || cyclesData.current.phase || "";
  const curve = useMemo(() => buildCurve(CURVE, 500, 166), []);
  const fmtBtc = "$" + Number(btcPrice).toLocaleString(loc);

  // ── tickers de datos vivos (broadcast): eventos reales (hora·artista·venue·ciudad) y precios reales ──
  const bassTicker = useMemo(() => (events || [])
    .filter((e) => e.time && ((e.artists && e.artists[0]) || e.name))
    .slice(0, 16)
    .map((e) => ({ time: e.time, act: (e.artists && e.artists[0]) || e.name, venue: (e.venue || "").split(",")[0].trim(), city: e.city || "" })), [events]);
  const layerTicker = useMemo(() => (prices || [])
    .filter((p) => p && p.sym && (p.usd ?? p.price) != null)
    .slice(0, 12)
    .map((p) => ({ sym: p.sym, val: "$" + Number(p.usd ?? p.price).toLocaleString(loc), chg: typeof p.change === "number" ? p.change : null })), [prices, loc]);

  // El home mobile es SIEMPRE el pórtico neutro: ambos mundos de fondo desenfocados +
  // "elegí un mundo". Tap en un nombre/dot o swipe = ENTRA al mundo real completo
  // (onEnter → navigateToSections), como el click del desktop. No hay panel-teaser intermedio.
  const active = isMobile ? "none" : focus;
  const cls = `blf-home${active === "bass" ? " focus-bass" : ""}${active === "layer" ? " focus-layer" : ""}${isMobile ? " is-mobile pre" : ""}`;

  // ── swipe mobile: dirección → entra al mundo (no arrastra ningún track) ──
  const startX = useRef(0), startY = useRef(0), dragging = useRef(false), curDx = useRef(0), axisLock = useRef(null);
  const onTS = useCallback((e) => {
    if (!isMobile) return;
    startX.current = e.touches[0].clientX; startY.current = e.touches[0].clientY;
    dragging.current = true; curDx.current = 0; axisLock.current = null;
  }, [isMobile]);
  const onTM = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axisLock.current === null) axisLock.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (axisLock.current !== "x") return;
    curDx.current = dx;
  }, []);
  const onTE = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = curDx.current;
    const th = window.innerWidth * 0.14;
    if (dx < -th) onEnter(null, 1);        // swipe ← entra a Layer
    else if (dx > th) onEnter(null, 0);    // swipe → entra a Bass
  }, [onEnter]);

  // ── reduced motion ── (ref para los rAF/idle que lo leen sync; estado para gatear el render del SVG)
  const reduce = useRef(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduce.current = m; setReduced(m);
  }, []);

  // ── cursor-glow teñido por mundo (desktop): sutil, con seguimiento suave (lerp).
  // El rAF solo corre mientras el glow se mueve y se AUTO-FRENA al converger
  // (idle = 0 frames); se relanza en el próximo movimiento. .blf-home llena el
  // viewport, así que usamos clientX/Y directo (sin getBoundingClientRect por evento). ──
  const cursorRef = useRef(null);
  const rootRef = useRef(null);
  const target = useRef({ x: -1, y: -1, side: "bass" });
  const cur = useRef({ x: -1, y: -1 });
  const rafRef = useRef(0);
  const lastSide = useRef(null);
  const startGlow = useCallback(() => {
    if (rafRef.current) return;
    const loop = () => {
      const el = cursorRef.current, t = target.current, c = cur.current;
      if (!el) { rafRef.current = 0; return; }
      if (c.x < 0) { c.x = t.x; c.y = t.y; }
      c.x += (t.x - c.x) * 0.06; c.y += (t.y - c.y) * 0.06;
      el.style.transform = `translate(${c.x}px, ${c.y}px)`;
      if (t.side !== lastSide.current) {   // el gradiente/opacity solo se reescriben al cambiar de lado
        lastSide.current = t.side;
        el.style.background = t.side === "bass"
          ? "radial-gradient(closest-side, rgba(196,144,112,.14), transparent 70%)"
          : "radial-gradient(closest-side, rgba(108,184,200,.15), transparent 70%)";
        el.style.opacity = "1";
      }
      if (Math.abs(t.x - c.x) < 0.4 && Math.abs(t.y - c.y) < 0.4) { rafRef.current = 0; return; } // convergió → parar
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);
  const onMove = useCallback((e) => {
    if (isMobile || reduce.current) return;
    target.current = { x: e.clientX, y: e.clientY, side: e.clientX < window.innerWidth / 2 ? "bass" : "layer" };
    startGlow();
  }, [isMobile, startGlow]);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ── idle: cada ~7s insinúa un mundo si nadie está interactuando (enseña que hay dos) ──
  const [idle, setIdle] = useState(null);
  useEffect(() => { if (focus !== "none") setIdle(null); }, [focus]);
  useEffect(() => {
    if (isMobile) return;
    let n = 0, out;
    const iv = setInterval(() => {
      if (reduce.current || focus !== "none") return;
      setIdle(n++ % 2 === 0 ? "bass" : "layer");
      out = setTimeout(() => setIdle(null), 1100);
    }, 7000);
    return () => { clearInterval(iv); clearTimeout(out); };
  }, [isMobile, focus]);

  const rootCls = `${cls}${idle === "bass" ? " idle-bass" : ""}${idle === "layer" ? " idle-layer" : ""}`;

  // ── MISMA VELOCIDAD (no misma duración) en ambas barras: mido el ancho real de cada track
  // y fijo la duración para una velocidad px/seg constante. Así Bass (más ítems) y Layer marchan al mismo paso. ──
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const SPEED = 30; // px por segundo
    root.querySelectorAll(".blf-marq-track").forEach((tr) => {
      const half = tr.scrollWidth / 2;   // el contenido está duplicado 2× para el loop
      if (half > 4) tr.style.animationDuration = (half / SPEED).toFixed(1) + "s";
    });
  }, [bassTicker, layerTicker, isMobile, loc]);

  return (
    <div className={rootCls} ref={rootRef}
      onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE} onMouseMove={onMove}>
      {!isMobile && <div className="blf-cursor" ref={cursorRef} aria-hidden="true" />}
      {/* tintes de color por mundo: se funden por OPACIDAD (fluido) en vez de animar el gradiente */}
      <div className="blf-tint blf-tint-bass" aria-hidden="true" />
      <div className="blf-tint blf-tint-layer" aria-hidden="true" />

      {/* zonas de foco (solo desktop) */}
      {!isMobile && (
        <div className="blf-zones" aria-hidden="true">
          <div className="blf-zone" onMouseEnter={() => setFocus("bass")} onClick={(e) => onEnter(e, 0)} />
          <div className="blf-zone" onMouseEnter={() => setFocus("none")} />
          <div className="blf-zone" onMouseEnter={() => setFocus("layer")} onClick={(e) => onEnter(e, 1)} />
        </div>
      )}

      {/* mundos: en desktop son el contenido de cada lado; en mobile son el fondo
          desenfocado del pórtico (clase .pre) — el contenido real vive en las secciones */}
      <div className="blf-track">
        {/* ── BASS ── */}
        <section className="blf-side blf-bass" aria-hidden="true">
          <div className="blf-top">
            <div className="blf-kick"><span className="blf-dot" /> Bass · {t("home.bass")}</div>
          </div>
          <div className="blf-mid">
            <div className="blf-big"><em>{eventCount || "—"}</em> {eventCount === 1 ? t("home.evento") : t("home.eventos")}<br />{t("home.enAgenda")}</div>
            <div className="blf-flyrow">
              {flyers.map((e, i) => (
                <div className="blf-fcard" key={i} style={{ backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.05) 45%,rgba(0,0,0,.88)),url('${e.image}')` }}>
                  <span className="blf-fnm">{(e.artists && e.artists[0]) || e.name}</span>
                  <span className="blf-fvn">{e.venue || ""}</span>
                </div>
              ))}
            </div>
            <div className="blf-genres"><span>techno</span><span>house</span><span>club</span></div>
          </div>
          <div className="blf-bot">
            {bassTicker.length >= 3 && (
              <div className="blf-marq" aria-hidden="true"><div className="blf-marq-track">
                {[...bassTicker, ...bassTicker].map((it, i) => (
                  <span className="blf-tk" key={i}><b>{it.time}</b> {it.act} <i>{it.venue}{it.city ? ` · ${it.city}` : ""}</i></span>
                ))}
              </div></div>
            )}
            <button className="blf-cta blf-cta-bass" tabIndex={-1} onClick={(e) => onEnter(e, 0)}>{t("home.verAgenda")} →</button>
          </div>
        </section>

        {/* ── LAYER ── */}
        <section className="blf-side blf-layer" aria-hidden="true">
          <div className="blf-top">
            <div className="blf-kick">{t("home.blockchain")} · Layer <span className="blf-dot" /></div>
          </div>
          <div className="blf-mid">
          <div className="blf-chartwrap">
            <svg className="blf-chart" viewBox="0 0 500 166" preserveAspectRatio="none">
              <defs>
                <linearGradient id="blfArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#6CB8C8" stopOpacity=".18" />
                  <stop offset="1" stopColor="#6CB8C8" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${curve.d}L ${curve.last.x} 166 L 6 166 Z`} fill="url(#blfArea)" />
              {curve.halv.map((p, i) => (
                <g key={i}>
                  <line x1={p.x} y1="8" x2={p.x} y2="158" stroke="rgba(108,184,200,.25)" strokeWidth="1" strokeDasharray="2 4" />
                  <circle cx={p.x} cy={p.y} r="2.5" fill="#6CB8C8" />
                </g>
              ))}
              <path className="blf-curveline" d={curve.d} fill="none" stroke="#6CB8C8" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
              <circle cx={curve.last.x} cy={curve.last.y} r="3" fill="#bfeef7">
                {!reduced && <animate attributeName="r" values="2;5;2" dur="1.8s" repeatCount="indefinite" />}
              </circle>
            </svg>
            <div className="blf-caxis"><span>2012</span><span>{t("home.cicloHalvings")}</span><span>{t("home.hoy")}</span></div>
          </div>
          <div className="blf-lstats">
            <div className="blf-lstat"><div className="blf-v">{fmtBtc}</div><div className="blf-k">BTC / USD · {t("home.enVivo")}</div></div>
            <div className="blf-lstat"><div className="blf-v">{cycleDay}</div><div className="blf-k">{t("home.diaDelCiclo")} · {phase}</div></div>
          </div>
          <div className="blf-halv">{t("home.proximoHalving", { days: <b key="d">{halvingDays}</b>, date: halvingLabel })}</div>
          </div>
          <div className="blf-bot">
            {layerTicker.length >= 3 && (
              <div className="blf-marq blf-marq-r" aria-hidden="true"><div className="blf-marq-track">
                {[...layerTicker, ...layerTicker].map((it, i) => (
                  <span className="blf-tk" key={i}><b>{it.sym}</b> {it.val}{it.chg != null && <i className={it.chg >= 0 ? "up" : "down"}>{it.chg >= 0 ? "+" : ""}{it.chg}%</i>}</span>
                ))}
              </div></div>
            )}
            <button className="blf-cta blf-cta-layer" tabIndex={-1} onClick={(e) => onEnter(e, 1)}>{t("home.verCiclo")} →</button>
          </div>
        </section>
      </div>

      {/* wordmark central (control + marca) */}
      <div className="blf-axis">
        <div className="blf-wm">
          <div className="blf-words">
            <button className="blf-half b"
              onMouseEnter={isMobile ? undefined : () => setFocus("bass")}
              onClick={(e) => onEnter(e, 0)}
              aria-label={t("home.bassAria")}>
              <span className="blf-wd">Bass<span className="blf-wd-fill" aria-hidden="true">Bass</span></span>
              <span className="blf-door">{t("home.bass")}</span>
            </button>
            <button className="blf-half l"
              onMouseEnter={isMobile ? undefined : () => setFocus("layer")}
              onClick={(e) => onEnter(e, 1)}
              aria-label={t("home.layerAria")}>
              <span className="blf-wd">Layer<span className="blf-wd-fill" aria-hidden="true">Layer</span></span>
              <span className="blf-door">{t("home.blockchain")}</span>
            </button>
          </div>
          <div className="blf-hint">
            <span className="blf-a">◂</span> {t("home.elegiMundo")} <span className="blf-a2">▸</span>
          </div>
        </div>
      </div>

      {/* dots (mobile): atajo de entrada a cada mundo desde el pórtico */}
      {isMobile && (
        <div className="blf-dots">
          <button className="blf-dotnav b" aria-label={t("home.bassAria")} onClick={() => onEnter(null, 0)} />
          <button className="blf-dotnav l" aria-label={t("home.layerAria")} onClick={() => onEnter(null, 1)} />
        </div>
      )}
    </div>
  );
}

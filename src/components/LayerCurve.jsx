import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, shared } from "../utils/api";
import { useLocale } from "../hooks/useLocale";

// Portada de Layer: la curva histórica de Bitcoin (2012 → hoy) como mapa de
// navegación. Cada sección vive en un momento real de la curva; se entra
// tocando su cápsula o desde el índice sincronizado (franja en desktop, lista
// en mobile). Recorrer la curva muestra el precio y el hecho de cada mes.
// Dirección elegida por Pablo (sept 2026) entre varias maquetas.

const T = (s) => { const [y, m] = s.split("-").map(Number); return y + (m - 1) / 12; };
const MONTHS = { es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
const list = (d) => (Array.isArray(d) ? d : d?.items || d?.data || []);

// Dónde vive cada sección y cómo se ubica su cápsula (dy desktop, dm mobile:
// signo = arriba/abajo, magnitud = altura). `at` es un mes de la curva; las
// del futuro se calculan desde hoy.
const NODES = [
  { key: "finanzas", at: "2020-03", dy: -1, dm: 1 },
  { key: "acciones", at: "2021-02", dy: -2, dm: -2 },
  { key: "etfs", at: "2024-01", dy: 1, dm: -1 },
  { key: "ciclos", at: "peak", dy: -1, dm: -2 },
  { key: "noticias", at: "today", dy: 1, dm: 1 },
  { key: "eventos", at: "soon", dy: -2, dm: -1 },
  { key: "predicciones", at: "halving", dy: 1, dm: 2 },
];

function fmtUsd(p, locale) {
  const l = locale === "en" ? "en-US" : "es-AR";
  return p >= 1000 ? `$${Math.round(p).toLocaleString(l)}` : `$${p < 10 ? p.toFixed(1) : Math.round(p)}`;
}
function Pct({ v, locale }) {
  const s = `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
  return <span className={v >= 0 ? "up" : "down"}>{locale === "en" ? s : s.replace(".", ",")}%</span>;
}

function useLayerData() {
  const [d, setD] = useState({});
  useEffect(() => {
    let alive = true;
    const set = (k) => (v) => alive && setD((p) => ({ ...p, [k]: v }));
    shared("btcCycles", api.btcCycles).then(set("cycles")).catch(() => {});
    shared("markets", api.markets).then(set("markets")).catch(() => {});
    shared("financeNews", api.financeNews).then(set("finance")).catch(() => {});
    shared("cryptoEvents", api.cryptoEvents).then(set("events")).catch(() => {});
    shared("predictions", api.predictionMarkets).then(set("predictions")).catch(() => {});
    return () => { alive = false; };
  }, []);
  return d;
}

export function LayerCurve({ news = [], onEnter }) {
  const { t, locale } = useLocale();
  const d = useLayerData();
  const stageRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState(null);       // sección con vista previa
  const [hover, setHover] = useState(null);   // índice de mes bajo el cursor
  const shownAt = useRef(0);
  const hideT = useRef(null);
  // En desktop la vista previa se cierra con un respiro: da tiempo a llevar el
  // cursor del punto a la tarjeta y tocar "Entrar".
  const hideSoon = () => { clearTimeout(hideT.current); hideT.current = setTimeout(() => setSel(null), 220); };
  useEffect(() => () => clearTimeout(hideT.current), []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (sel == null) return;
    const onKey = (e) => e.key === "Escape" && setSel(null);
    const onDown = (e) => {
      if (Date.now() - shownAt.current < 400) return;
      if (!e.target.closest?.(".blc-pv, .blc-node, .blc-it")) setSel(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("click", onDown); };
  }, [sel]);

  const cyc = d.cycles;
  const H = cyc?.priceHistory || [];
  const mobile = size.w > 0 && size.w <= 700;

  // Contenido de cada sección: nombre, momento, historia y dato vivo.
  const content = useMemo(() => {
    const all = (d.markets?.groups || []).flatMap((g) => g.items || []);
    const sym = (s) => all.find((i) => i.symbol === s);
    const stocks = (d.markets?.groups || []).find((g) => g.kind === "stock")?.items || [];
    const mover = stocks.reduce((a, b) => (!a || Math.abs(b.changePct) > Math.abs(a.changePct) ? b : a), null);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = list(d.events).filter((e) => (e.date || "") >= today).sort((a, b) => a.date.localeCompare(b.date));
    const cur = cyc?.current;
    const phaseKey = cur?.phase ? `cycles.phase.${cur.phase}` : null;
    const phase = phaseKey && t(phaseKey) !== phaseKey ? t(phaseKey) : cur?.phaseLabel;
    const peak = cyc?.keyDates?.peak;
    const daysSincePeak = peak ? Math.round((Date.now() - new Date(`${peak}T12:00:00`)) / 86400000) : null;
    const preds = list(d.predictions);
    const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short" });
    const P = (s) => (s ? <Pct v={s.changePct} locale={locale} /> : null);
    return {
      finanzas: { v: d.finance ? <>{list(d.finance).length} {t("doors.notes")}</> : null, rows: [[t("doors.financeSub"), ""]] },
      acciones: { v: mover ? <>{mover.symbol} {P(mover)}</> : null, rows: ["NVDA", "META", "AAPL"].filter((s) => s !== mover?.symbol && sym(s)).slice(0, 3).map((s) => [sym(s).name, P(sym(s))]) },
      etfs: { v: sym("IBIT") ? <>IBIT {P(sym("IBIT"))}</> : null, rows: [["QQQ", "Nasdaq 100"], ["SPY", "S&P 500"], ["GLD", t("curve.gold")]].filter(([s]) => sym(s)).map(([s, n]) => [`${n} · ${s}`, P(sym(s))]) },
      ciclos: { v: cur ? <span className={cur.phase === "markdown" ? "down" : cur.phase === "markup" ? "up" : ""}>{cur.phase === "markdown" ? "▼ " : cur.phase === "markup" ? "▲ " : ""}{phase}</span> : null,
        rows: cur ? [[t("curve.daysSincePeak"), daysSincePeak ?? "—"], [t("aside.confluence"), `${cur.confluence}/100`], [t("curve.support200w"), cur.support200w ? fmtUsd(cur.support200w, locale) : "—"]] : [] },
      noticias: { v: <>{news.length} {t("curve.today")}</>, rows: news.slice(0, 3).map((n) => [n.title, ""]), titles: true },
      eventos: { v: d.events ? <>{upcoming.length} {t("doors.upcoming")}</> : null, rows: upcoming.slice(0, 2).map((e) => [e.title, fmtDay(e.date)]) },
      predicciones: { v: d.predictions ? (preds.length ? <>{preds.length} {t("doors.markets")}</> : "—") : null, rows: [[t("curve.openMarkets"), preds.length ? preds.length : t("doors.noMarkets")]] },
    };
  }, [d, cyc, news, t, locale]);

  const geo = useMemo(() => {
    if (!H.length || !size.w || !size.h) return null;
    const W = size.w, Hh = size.h, M = mobile;
    const TODAY = T(H[H.length - 1].t);
    const nextHalving = cyc?.keyDates?.nextHalving ? T(cyc.keyDates.nextHalving.slice(0, 7)) : TODAY + 1.6;
    const END = nextHalving + 0.35;
    const L = M ? 16 : 64, R = M ? 16 : 60, TOP = M ? 120 : 150, BOT = M ? 34 : 46;
    const bx = M ? [[2012, 0], [2019.5, 0.1], [TODAY, 0.66], [END, 1]] : [[2012, 0], [2020, 0.38], [TODAY, 0.74], [END, 1]];
    const X = (tt) => { for (let i = 1; i < bx.length; i++) if (tt <= bx[i][0]) { const [a, fa] = bx[i - 1], [b, fb] = bx[i]; return L + (fa + ((tt - a) / (b - a)) * (fb - fa)) * (W - L - R); } return W - R; };
    const lo = M ? 2 : 0;
    const Y = (p) => TOP + (1 - (Math.log10(Math.max(p, 1)) - lo) / (Math.log10(250000) - lo)) * (Hh - TOP - BOT);
    const pts = H.map((h) => [X(T(h.t)), Y(h.p)]);
    const path = "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L");
    const len = pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    const last = H[H.length - 1].p;
    const peakT = cyc?.keyDates?.peak ? T(cyc.keyDates.peak.slice(0, 7)) : TODAY - 1;
    const at = { today: TODAY, soon: TODAY + 0.45, peak: peakT, halving: nextHalving };
    const priceAt = (tt) => { if (tt >= TODAY) return last; let b = H[0]; for (const h of H) if (Math.abs(T(h.t) - tt) < Math.abs(T(b.t) - tt)) b = h; return b.p; };
    const nodes = NODES.map((n) => {
      const tt = at[n.at] ?? T(n.at);
      const cx = X(tt), cy = Y(priceAt(tt));
      const lv = M ? n.dm : n.dy, dir = Math.sign(lv), gap = M ? 40 : 58, ph = M ? 30 : 48;
      return { ...n, tt, cx, cy, lv, dir, gap, ph, future: tt > TODAY };
    });
    return { W, Hh, L, R, TOP, BOT, X, Y, path, pts, len, TODAY, xt: X(TODAY), yt: Y(last), nodes, M };
  }, [H, size, mobile, cyc]);

  const name = (k) => t(`section.${k === "etfs" ? "etfs" : k === "acciones" ? "stocks" : k === "finanzas" ? "finance" : k === "noticias" ? "news" : k === "eventos" ? "events" : k === "predicciones" ? "predictions" : "cycles"}`);
  const plain = (v) => (typeof v === "string" ? v : v == null ? "" : null);

  const show = (i) => { clearTimeout(hideT.current); shownAt.current = Date.now(); setSel(i); };
  const activate = (i) => (mobile ? show(i) : onEnter(NODES[i].key));

  const onMove = (clientX) => {
    if (!geo) return;
    const r = stageRef.current.getBoundingClientRect(), x = clientX - r.left;
    if (x < geo.X(2012) || x > geo.xt) return setHover(null);
    let best = 0, bd = 1e9;
    H.forEach((h, i) => { const dd = Math.abs(geo.X(T(h.t)) - x); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };

  // Vista previa: qué hay en la sección, su dato vivo y por qué vive en ese
  // punto de la curva. En mobile es una hoja inferior y va por portal a
  // .bl-root: el carrusel de mundos usa transform y rompe position:fixed.
  const selNodeP = sel != null && geo ? geo.nodes[sel] : null;
  const preview = selNodeP && (
    <div
      className="blc-pv"
      role="dialog"
      aria-label={name(selNodeP.key)}
      style={mobile ? undefined : { left: selNodeP.cx + 360 > geo.W ? selNodeP.cx - 360 : selNodeP.cx + 30, top: Math.max(10, Math.min(selNodeP.cy - 60, geo.Hh - 360)) }}
      onMouseEnter={() => clearTimeout(hideT.current)}
      onMouseLeave={() => !mobile && hideSoon()}
    >
      <div className="k">{t(`curve.${selNodeP.key}.when`)}</div>
      <h3>{name(selNodeP.key)}</h3>
      <p className="desc">{t(`curve.${selNodeP.key}.desc`)}</p>
      <div className="big">{content[selNodeP.key].v ?? "—"}</div>
      <div className="rows">
        {content[selNodeP.key].rows.map(([a, b], j) => (
          <div key={j} className={`r${content[selNodeP.key].titles ? " t" : ""}`}><span>{a}</span><span>{b}</span></div>
        ))}
      </div>
      <p className="why">{t(`curve.${selNodeP.key}.why`)}</p>
      <button type="button" className="go" onClick={() => onEnter(selNodeP.key)}>{t("curve.enter")} {name(selNodeP.key)} →</button>
    </div>
  );

  const hv = hover != null && geo ? H[hover] : null;
  const hvEvent = hv && (cyc?.newsEvents || []).find((e) => Math.abs(T(e.t) - T(hv.t)) <= 1 / 12);

  return (
    <section className="blc" aria-label={t("curve.aria")}>
      <div className="blc-intro">
        <h1>{t("curve.title")}</h1>
        <p>{t("curve.sub")}</p>
      </div>
      <div
        className={`blc-stage${geo ? " is-ready" : ""}`}
        ref={stageRef}
        onMouseMove={(e) => !e.target.closest(".blc-node") && onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setTimeout(() => setHover(null), 900)}
      >
        {geo && (
          <svg viewBox={`0 0 ${geo.W} ${geo.Hh}`} role="img" aria-label={t("curve.chartAria")}>
            <defs>
              <linearGradient id="blc-cg" x1="0" x2="1"><stop offset="0" stopColor="#2f5a63" /><stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" /></linearGradient>
              <linearGradient id="blc-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".16" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
              <linearGradient id="blc-fz" x1="0" x2="1"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".06" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
              <clipPath id="blc-cp"><rect x="0" y="0" width={geo.W} height={geo.Hh - geo.BOT} /></clipPath>
            </defs>
            <g className="blc-grid">
              {(geo.M ? [1000, 100000] : [10, 1000, 100000]).map((p) => (
                <g key={p}><line x1={geo.L} x2={geo.W - geo.R} y1={geo.Y(p)} y2={geo.Y(p)} /><text x={geo.L} y={geo.Y(p) - 6}>{fmtUsd(p, locale)}</text></g>
              ))}
              {(geo.M ? [2020, 2022, 2024, 2026, 2028] : [2012, 2016, 2020, 2022, 2024, 2026, 2028]).map((y) => (
                <text key={y} x={geo.X(y)} y={geo.Hh - geo.BOT + 22} textAnchor="middle">{y}</text>
              ))}
            </g>
            <rect className="blc-future" x={geo.xt} y={geo.TOP - 40} width={Math.max(0, geo.W - geo.R - geo.xt)} height={geo.Hh - geo.TOP - geo.BOT + 40} />
            <text className="blc-fut-l" x={geo.xt + 10} y={geo.Hh - geo.BOT - 10}>{t("curve.future")} →</text>
            <g clipPath="url(#blc-cp)">
              <path className="blc-area" d={`${geo.path}L${geo.pts[geo.pts.length - 1][0]},${geo.Hh - geo.BOT}L${geo.pts[0][0]},${geo.Hh - geo.BOT}Z`} />
              <path className="blc-curve" d={geo.path} style={{ strokeDasharray: geo.len, strokeDashoffset: geo.len }} />
            </g>
            <line className="blc-proj" x1={geo.xt} x2={geo.W - geo.R} y1={geo.yt} y2={geo.yt} />
            <g className="blc-ms">
              {(cyc.milestones || []).filter((x) => x.type !== "halving" || T(x.t) < 2024).map((x) => {
                const cx = geo.X(T(x.t)), cy = geo.Y(x.price);
                const near = geo.nodes.some((n) => Math.abs(n.tt - T(x.t)) < 0.7);
                if (cy >= geo.Hh - geo.BOT) return null;
                return (
                  <g key={x.t + x.type}><circle cx={cx} cy={cy} r="2.5" />
                    {!geo.M && !near && <text x={cx} y={cy + (x.type === "bottom" ? 16 : -9)} textAnchor="middle">{(locale === "en" ? x.labelEn || x.label : x.label).toUpperCase()}</text>}
                  </g>
                );
              })}
            </g>
            {hv && (
              <g className="blc-xh"><line x1={geo.X(T(hv.t))} x2={geo.X(T(hv.t))} y1={geo.TOP - 40} y2={geo.Hh - geo.BOT} /><circle cx={geo.X(T(hv.t))} cy={geo.Y(hv.p)} r="3.5" /></g>
            )}
            {geo.nodes.map((n, i) => {
              const c = content[n.key];
              const label = name(n.key);
              const vtext = plain(c.v);
              const pw = geo.M ? label.length * 7.6 + 22 : Math.max(label.length * 9.2, (vtext ?? "000000000000").length * 7.2) + 34;
              const py = n.dir < 0 ? n.cy - n.gap * Math.abs(n.lv) - n.ph : n.cy + n.gap * Math.abs(n.lv) - (geo.M ? 6 : 10);
              const px = Math.max(geo.L - 4, Math.min(n.cx - pw / 2, geo.W - geo.R - pw + 4));
              return (
                <g
                  key={n.key}
                  className={`blc-node${n.at === "today" ? " is-today" : ""}${sel === i ? " is-on" : ""}`}
                  style={{ animationDelay: `${2.1 + i * 0.16}s` }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${label}. ${t(`curve.${n.key}.desc`)}`}
                  onMouseEnter={() => !mobile && show(i)}
                  onMouseLeave={() => !mobile && hideSoon()}
                  onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(i)}
                  onClick={(e) => { e.stopPropagation(); activate(i); }}
                  onKeyDown={(e) => e.key === "Enter" && onEnter(n.key)}
                >
                  <line className="blc-stem" x1={n.cx} x2={n.cx} y1={n.cy + (n.dir > 0 ? 10 : -10)} y2={n.dir > 0 ? py : py + n.ph} />
                  <circle className="blc-halo" cx={n.cx} cy={n.cy} r={geo.M ? 15 : 19} />
                  <circle className="blc-dot" cx={n.cx} cy={n.cy} r={geo.M ? 7 : 9} />
                  <circle className="blc-core" cx={n.cx} cy={n.cy} r="3" />
                  <rect className="blc-pill" x={px} y={py} width={pw} height={n.ph} rx={geo.M ? 15 : 10} />
                  <text className="blc-nm" x={px + (geo.M ? 11 : 14)} y={py + (geo.M ? 20 : 21)}>{label}</text>
                  {!geo.M && <foreignObject x={px + 14} y={py + 26} width={pw - 30} height="18"><div className="blc-vl">{c.v ?? " "}</div></foreignObject>}
                  {!geo.M && <text className="blc-ar" x={px + pw - 20} y={py + 29}>→</text>}
                  <circle cx={n.cx} cy={n.cy} r="22" fill="transparent" />
                </g>
              );
            })}
          </svg>
        )}
        {!geo && <div className="blc-skel" aria-hidden="true" />}
        {hv && sel == null && (
          <div className="blc-tip" style={{ left: Math.min(geo.X(T(hv.t)) + 14, geo.W - 260), top: Math.max(8, geo.Y(hv.p) - 64) }}>
            <span className="d">{MONTHS[locale === "en" ? "en" : "es"][Number(hv.t.slice(5)) - 1]} {hv.t.slice(0, 4)}</span>
            <b>{fmtUsd(hv.p, locale)}</b>
            {hvEvent && <span className="ev">{locale === "en" ? hvEvent.en || hvEvent.es : hvEvent.es}</span>}
          </div>
        )}
        {!mobile && preview}
      </div>
      <nav className="blc-strip" aria-label={t("aside.sections")}>
        {NODES.map((n, i) => (
          <button
            key={n.key}
            type="button"
            className={`blc-it${sel === i ? " is-on" : ""}`}
            onMouseEnter={() => !mobile && show(i)}
            onMouseLeave={() => !mobile && hideSoon()}
            onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(i)}
            onClick={(e) => { e.stopPropagation(); activate(i); }}
          >
            <span className="w">{t(`curve.${n.key}.when`)}</span>
            <span className="n">{name(n.key)}</span>
            <span className="v">{content[n.key].v ?? " "}</span>
          </button>
        ))}
      </nav>
      {mobile && preview && createPortal(preview, document.querySelector(".bl-root") || document.body)}
    </section>
  );
}

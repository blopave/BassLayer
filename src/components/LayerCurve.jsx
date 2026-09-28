import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { SECTION_LABEL, T, Pct, Phase, fmtDay, fmtUsd, layerStats, list, monthLabel, useLayerData } from "../utils/layer";

// Portada de Layer: la curva histórica de Bitcoin (2012 → hoy) como mapa de
// navegación. Cada sección vive en un momento real de la curva y se entra
// tocando su cápsula (la curva es el único índice: sin franja ni lista, sept
// 2026). Recorrer la curva muestra el precio de cada mes.
// Mobile (dirección A, sept 2026): la curva gira y el tiempo baja con el
// scroll; el precio va a la derecha y cada sección es un título grande a la
// izquierda, con toda su franja tocable. Solo títulos, sin datos.
// Dirección elegida por Pablo (sept 2026) entre varias maquetas.

// Dónde vive cada sección y cómo se ubica su cápsula en desktop (dy: signo =
// arriba/abajo, magnitud = altura). `at` es un mes de la curva; las del
// futuro se calculan desde hoy.
const NODES = [
  { key: "historia", at: "2013-11", dy: -1 },
  { key: "finanzas", at: "2020-03", dy: 1 },
  { key: "acciones", at: "2021-02", dy: -1 },
  { key: "etfs", at: "2024-01", dy: 1 },
  { key: "ciclos", at: "peak", dy: -1 },
  { key: "noticias", at: "today", dy: 1 },
  { key: "eventos", at: "soon", dy: -1 },
  { key: "predicciones", at: "halving", dy: 1 },
];

// Mobile vertical: margen arriba, alto de cada franja y pie (eje de precios).
// El alto total (VT + 7·VGAP + VB) es el de .blc-stage en styles.css.
const VT = 48, VGAP = 92, VB = 84;

// Interpolación por tramos: [[t, pos], …] → pos(t).
const seg = (bx) => (tt) => {
  for (let i = 1; i < bx.length; i++) if (tt <= bx[i][0]) { const [a, fa] = bx[i - 1], [b, fb] = bx[i]; return fa + ((tt - a) / (b - a)) * (fb - fa); }
  return bx[bx.length - 1][1];
};

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
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (sel == null) return;
    const onKey = (e) => e.key === "Escape" && setSel(null);
    const onDown = (e) => {
      if (Date.now() - shownAt.current < 400) return;
      if (!e.target.closest?.(".blc-pv, .blc-node")) setSel(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("click", onDown); };
  }, [sel]);

  const cyc = d.cycles;
  const H = cyc?.priceHistory || [];
  const mobile = size.w > 0 && size.w <= 768;

  // Contenido de cada sección: nombre, momento, historia y dato vivo.
  const content = useMemo(() => {
    const { sym, mover, upcoming, cur, phase, preds } = layerStats(d, t);
    const peak = cyc?.keyDates?.peak;
    const daysSincePeak = peak ? Math.round((Date.now() - new Date(`${peak}T12:00:00`)) / 86400000) : null;
    const P = (s) => (s ? <Pct v={s.changePct} locale={locale} /> : null);
    return {
      finanzas: { v: d.finance ? <>{list(d.finance).length} {t("doors.notes")}</> : null, rows: [[t("doors.financeSub"), ""]] },
      acciones: { v: mover ? <>{mover.symbol} {P(mover)}</> : null, rows: ["NVDA", "META", "AAPL"].filter((s) => s !== mover?.symbol && sym(s)).slice(0, 3).map((s) => [sym(s).name, P(sym(s))]) },
      etfs: { v: sym("IBIT") ? <>IBIT {P(sym("IBIT"))}</> : null, rows: [["QQQ", "Nasdaq 100"], ["SPY", "S&P 500"], ["GLD", t("curve.gold")]].filter(([s]) => sym(s)).map(([s, n]) => [`${n} · ${s}`, P(sym(s))]) },
      ciclos: { v: cur ? <Phase cur={cur} label={phase} /> : null,
        rows: cur ? [[t("curve.daysSincePeak"), daysSincePeak ?? "—"], [t("aside.confluence"), `${cur.confluence}/100`], [t("curve.support200w"), cur.support200w ? fmtUsd(cur.support200w, locale) : "—"]] : [] },
      historia: { v: cyc ? <>{(cyc.newsEvents || []).length} {t("history.events")}</> : null, rows: (cyc?.newsEvents || []).slice(-3).reverse().map((e) => [locale === "en" ? e.en || e.es : e.es, e.t.slice(0, 4)]), titles: true },
      noticias: { v: <>{news.length} {t("curve.today")}</>, rows: news.slice(0, 3).map((n) => [n.title, ""]), titles: true },
      eventos: { v: d.events ? <>{upcoming.length} {t("doors.upcoming")}</> : null, rows: upcoming.slice(0, 2).map((e) => [e.title, fmtDay(e.date, locale)]) },
      predicciones: { v: d.predictions ? (preds.length ? <>{preds.length} {t("doors.markets")}</> : "—") : null, rows: [[t("curve.openMarkets"), preds.length ? preds.length : t("doors.noMarkets")]] },
    };
  }, [d, cyc, news, t, locale]);

  const geo = useMemo(() => {
    if (!H.length || !size.w || !size.h) return null;
    const W = size.w;
    const TODAY = T(H[H.length - 1].t);
    const nextHalving = cyc?.keyDates?.nextHalving ? T(cyc.keyDates.nextHalving.slice(0, 7)) : TODAY + 1.6;
    const END = nextHalving + 0.35;
    const peakT = cyc?.keyDates?.peak ? T(cyc.keyDates.peak.slice(0, 7)) : TODAY - 1;
    const at = { today: TODAY, soon: TODAY + 0.45, peak: peakT, halving: nextHalving };
    // Eje de tiempo por tramos: cada sección cae a la misma distancia en
    // pantalla (la historia 2012→2020 comprimida al inicio). La curva sigue
    // siendo el precio real; solo cambia cuánto lugar ocupa cada tramo.
    const times = NODES.map((n) => at[n.at] ?? T(n.at));
    const last = H[H.length - 1].p;
    const priceAt = (tt) => { if (tt >= TODAY) return last; let b = H[0]; for (const h of H) if (Math.abs(T(h.t) - tt) < Math.abs(T(b.t) - tt)) b = h; return b.p; };
    const draw = (pts) => ({
      pts,
      path: "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L"),
      len: pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0),
    });

    if (mobile) {
      // Vertical: el tiempo baja (una franja de VGAP por sección) y el precio
      // (log, $100 → $250k: la curva arranca en 2013, cuando BTC pasó los $100)
      // ocupa la mitad derecha; la izquierda es de los títulos.
      const Hh = VT + 7 * VGAP + VB, x0 = Math.round(W * 0.5), x1 = W - 22;
      const Yt = seg([[2012, VT - 46], ...times.map((tt, i) => [tt, VT + i * VGAP]), [END, VT + 7 * VGAP + 46]]);
      const Xp = (p) => x0 + ((Math.log10(Math.max(p, 100)) - 2) / (Math.log10(250000) - 2)) * (x1 - x0);
      const nodes = NODES.map((n, i) => ({ ...n, tt: times[i], cx: Xp(priceAt(times[i])), cy: Yt(times[i]) }));
      return { V: true, W, Hh, x0, Xp, Yt, END, ...draw(H.slice(Math.max(0, H.findIndex((h) => h.p >= 100))).map((h) => [Xp(h.p), Yt(T(h.t))])), xt: Xp(last), yt: Yt(TODAY), nodes };
    }

    const Hh = size.h, L = 64, R = 60, TOP = 120, BOT = 46;
    const f = seg([[2012, 0], ...times.map((tt, i) => [tt, 0.09 + (0.87 * i) / (times.length - 1)]), [END, 1]]);
    const X = (tt) => L + f(tt) * (W - L - R);
    const Y = (p) => TOP + (1 - Math.log10(Math.max(p, 1)) / Math.log10(250000)) * (Hh - TOP - BOT);
    const nodes = NODES.map((n, i) => {
      const tt = times[i], cx = X(tt), cy = Y(priceAt(tt));
      const pw = Math.max(t(SECTION_LABEL[n.key]).length * 9.2, 12 * 7.2) + 34;
      const dir = Math.sign(n.dy), ph = 48, gap = 58;
      const py = dir < 0 ? cy - gap * Math.abs(n.dy) - ph : cy + gap * Math.abs(n.dy) - 10;
      const px = Math.max(L - 4, Math.min(cx - pw / 2, W - R - pw + 4));
      return { ...n, tt, cx, cy, pill: { x: px, y: py, w: pw, h: ph, dir } };
    });
    return { W, Hh, L, R, TOP, BOT, X, Y, ...draw(H.map((h) => [X(T(h.t)), Y(h.p)])), xt: X(TODAY), yt: Y(last), nodes };
  }, [H, size, mobile, cyc, t]);

  const name = (k) => t(SECTION_LABEL[k]);
  // Fechas de las secciones ancladas a hitos: salen de los datos, no de strings.
  const dateOf = { ciclos: cyc?.keyDates?.peak, predicciones: cyc?.keyDates?.nextHalving };
  const tk = (k, f) => t(`curve.${k}.${f}`, { date: dateOf[k] ? monthLabel(dateOf[k], locale) : "—" });

  const show = (i) => { clearTimeout(hideT.current); shownAt.current = Date.now(); setSel(i); };
  // Tocar o hacer click entra directo; la vista previa es solo el hover de desktop.

  const onMove = (clientX) => {
    if (!geo || geo.V) return;
    const r = stageRef.current.getBoundingClientRect(), x = clientX - r.left;
    if (x < geo.X(2012) || x > geo.xt) return setHover(null);
    let best = 0, bd = 1e9;
    geo.pts.forEach(([px], i) => { const dd = Math.abs(px - x); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };

  // Vista previa (hover de desktop): qué hay en la sección, su dato vivo y
  // por qué vive en ese punto de la curva.
  const selNodeP = sel != null && geo ? geo.nodes[sel] : null;
  const preview = selNodeP && (
    <div
      className="blc-pv"
      role="dialog"
      aria-label={name(selNodeP.key)}
      style={{ left: selNodeP.cx + 360 > geo.W ? selNodeP.cx - 360 : selNodeP.cx + 30, top: Math.max(10, Math.min(selNodeP.cy - 60, geo.Hh - 360)) }}
      onMouseEnter={() => clearTimeout(hideT.current)}
      onMouseLeave={hideSoon}
    >
      <div className="k">{tk(selNodeP.key, "when")}</div>
      <h3>{name(selNodeP.key)}</h3>
      <p className="desc">{t(`curve.${selNodeP.key}.desc`)}</p>
      <div className="big">{content[selNodeP.key].v ?? "—"}</div>
      <div className="rows">
        {content[selNodeP.key].rows.map(([a, b], j) => (
          <div key={j} className={`r${content[selNodeP.key].titles ? " t" : ""}`}><span>{a}</span><span>{b}</span></div>
        ))}
      </div>
      <p className="why">{tk(selNodeP.key, "why")}</p>
      <button type="button" className="go" onClick={() => onEnter(selNodeP.key)}>{t("curve.enter")} {name(selNodeP.key)} →</button>
    </div>
  );

  // Mobile: la curva vertical. Cada sección es una franja entera tocable con
  // su título grande a la izquierda y una guía hasta su punto en la curva.
  const vertical = geo?.V && (
    <svg className="blc-v" viewBox={`0 0 ${geo.W} ${geo.Hh}`} role="img" aria-label={t("curve.chartAria")}>
      <defs>
        <linearGradient id="blc-cgv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f5a63" /><stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" /></linearGradient>
        <linearGradient id="blc-agv" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".14" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
        <linearGradient id="blc-fzv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".07" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
      </defs>
      <g className="blc-grid">
        {[1000, 100000].map((p) => (
          <g key={p}><line x1={geo.Xp(p)} x2={geo.Xp(p)} y1={0} y2={geo.Hh - 40} /><text x={geo.Xp(p)} y={geo.Hh - 22} textAnchor="middle">{fmtUsd(p, locale)}</text></g>
        ))}
      </g>
      <rect className="blc-future" x={geo.x0 - 8} y={geo.yt} width={geo.W - geo.x0 + 8} height={geo.Hh - 40 - geo.yt} />
      <text className="blc-fut-l" x={geo.x0} y={geo.yt + 44}>{t("curve.future")} ↓</text>
      <path className="blc-area" d={`${geo.path}L${geo.x0},${geo.yt}L${geo.x0},${geo.pts[0][1]}Z`} />
      <path className="blc-curve" d={geo.path} style={{ strokeDasharray: geo.len, strokeDashoffset: geo.len }} />
      <line className="blc-proj" x1={geo.xt} x2={geo.xt} y1={geo.yt} y2={geo.Yt(geo.END)} />
      <g className="blc-ms">
        {(cyc.milestones || []).filter((x) => x.price >= 100 && T(x.t) < geo.nodes[5].tt).map((x) => (
          <circle key={x.t + x.type} cx={geo.Xp(x.price)} cy={geo.Yt(T(x.t))} r="2.5" />
        ))}
      </g>
      {geo.nodes.map((n, i) => {
        const label = name(n.key);
        const lx = 16 + label.length * 13.5 + 12;
        return (
          <g
            key={n.key}
            className={`blc-node${n.at === "today" ? " is-today" : ""}${sel === i ? " is-on" : ""}`}
            style={{ animationDelay: `${2.1 + i * 0.12}s` }}
            tabIndex={0}
            role="button"
            aria-label={`${label}. ${t(`curve.${n.key}.desc`)}`}
            onClick={(e) => { e.stopPropagation(); onEnter(n.key); }}
            onKeyDown={(e) => e.key === "Enter" && onEnter(n.key)}
          >
            <rect className="blc-hit" x="0" y={n.cy - VGAP / 2} width={geo.W} height={VGAP} />
            {n.cx - 16 > lx + 8 && <line className="blc-lead" x1={lx} x2={n.cx - 16} y1={n.cy} y2={n.cy} />}
            <circle className="blc-halo" cx={n.cx} cy={n.cy} r="15" />
            <circle className="blc-dot" cx={n.cx} cy={n.cy} r="7" />
            <circle className="blc-core" cx={n.cx} cy={n.cy} r="2.8" />
            <text className="blc-ttl" x="16" y={n.cy + 9}>{label}</text>
          </g>
        );
      })}
    </svg>
  );

  const hv = hover != null && geo ? H[hover] : null;
  const [hx, hy] = hv ? geo.pts[hover] : [];

  return (
    <section className="blc" aria-label={t("curve.aria")}>
      {/* Sin intro visible (Pablo, sept 2026: la curva se explica sola); el
          título queda para lectores de pantalla y buscadores. */}
      <h1 className="bl-sr-only">{t("curve.title")}</h1>
      <div
        className={`blc-stage${geo ? " is-ready" : ""}`}
        ref={stageRef}
        onMouseMove={(e) => !e.target.closest(".blc-node") && onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setTimeout(() => setHover(null), 900)}
      >
        {geo?.V && vertical}
        {geo && !geo.V && (
          <svg viewBox={`0 0 ${geo.W} ${geo.Hh}`} role="img" aria-label={t("curve.chartAria")}>
            <defs>
              <linearGradient id="blc-cg" x1="0" x2="1"><stop offset="0" stopColor="#2f5a63" /><stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" /></linearGradient>
              <linearGradient id="blc-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".16" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
              <linearGradient id="blc-fz" x1="0" x2="1"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".06" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
              <clipPath id="blc-cp"><rect x="0" y="0" width={geo.W} height={geo.Hh - geo.BOT} /></clipPath>
            </defs>
            <g className="blc-grid">
              {[10, 1000, 100000].map((p) => (
                <g key={p}><line x1={geo.L} x2={geo.W - geo.R} y1={geo.Y(p)} y2={geo.Y(p)} /><text x={geo.L} y={geo.Y(p) - 6}>{fmtUsd(p, locale)}</text></g>
              ))}
              {[2012, 2016, 2020, 2022, 2024, 2026, 2028].map((y) => (
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
                    {!near && <text x={cx} y={cy + (x.type === "bottom" ? 16 : -9)} textAnchor="middle">{(locale === "en" ? x.labelEn || x.label : x.label).toUpperCase()}</text>}
                  </g>
                );
              })}
            </g>
            {hv && (
              <g className="blc-xh"><line x1={hx} x2={hx} y1={geo.TOP - 40} y2={geo.Hh - geo.BOT} /><circle cx={hx} cy={hy} r="3.5" /></g>
            )}
            {geo.nodes.map((n, i) => {
              const c = content[n.key];
              const label = name(n.key);
              const { x: px, y: py, w: pw, h: ph, dir } = n.pill;
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
                  onClick={(e) => { e.stopPropagation(); onEnter(NODES[i].key); }}
                  onKeyDown={(e) => e.key === "Enter" && onEnter(n.key)}
                >
                  <line className="blc-stem" x1={n.cx} x2={n.cx} y1={n.cy + (dir > 0 ? 10 : -10)} y2={dir > 0 ? py : py + ph} />
                  <circle className="blc-halo" cx={n.cx} cy={n.cy} r="19" />
                  <circle className="blc-dot" cx={n.cx} cy={n.cy} r="9" />
                  <circle className="blc-core" cx={n.cx} cy={n.cy} r="3" />
                  <rect className="blc-pill" x={px} y={py} width={pw} height={ph} rx="10" />
                  <text className="blc-nm" x={px + 14} y={py + 21}>{label}</text>
                  <foreignObject x={px + 14} y={py + 26} width={pw - 30} height="18"><div className="blc-vl">{c.v ?? " "}</div></foreignObject>
                  <text className="blc-ar" x={px + pw - 20} y={py + 29}>→</text>
                  <circle cx={n.cx} cy={n.cy} r="22" fill="transparent" />
                </g>
              );
            })}
          </svg>
        )}
        {!geo && <div className="blc-skel" aria-hidden="true" />}
        {hv && sel == null && (
          <div className="blc-tip" style={{ left: Math.min(hx + 14, geo.W - 260), top: Math.max(8, hy - 64) }}>
            <span className="d">{monthLabel(hv.t, locale)}</span>
            <b>{fmtUsd(hv.p, locale)}</b>
          </div>
        )}
        {!mobile && preview}
      </div>
    </section>
  );
}

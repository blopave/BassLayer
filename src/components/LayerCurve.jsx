import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { FutureFan } from "./FutureFan";
import { SECTION_LABEL, T, Pct, Phase, fmtDay, fmtUsd, layerStats, list, monthLabel, useLayerData } from "../utils/layer";

// Portada de Layer: la curva histórica de Bitcoin (2012 → hoy) como mapa de
// navegación. Cada sección vive en un momento real de la curva y se entra
// tocando su cápsula (la curva es el único índice: sin franja ni lista, sept
// 2026). Un solo hover: el de las secciones (sin cruz ni precio por mes:
// competía con la navegación; el precio mes a mes vive en Hitos).
// Mobile (dirección A, sept 2026): la curva gira y el tiempo baja con el
// scroll; el precio va a la derecha y cada sección es un título grande a la
// izquierda, con toda su franja tocable. Solo títulos: sin datos ni fechas
// (Pablo, sept 2026). "Estaciones" (30-sep): cada título va pegado a su
// punto, como un mapa de subte; la línea se corta limpia detrás del nombre.
// "Estratos" (30-sep, auditoría): en mobile el tiempo SUBE — el abanico del
// futuro abre la pantalla, Noticias (hoy) es la primera estación y el pasado
// se sedimenta hacia abajo hasta Hitos. Layer = capa.

// Dónde vive cada sección y cómo se ubica su cápsula en desktop (dy: signo =
// arriba/abajo, magnitud = altura). Todas viven en un momento REAL de la
// curva, en orden cronológico; hoy (Noticias) es la última y de ahí se abre
// el abanico del futuro (Pablo, sept 2026: "el pasado se navega, el futuro se
// pregunta"). Anclas verificadas con 2+ fuentes: Eventos = Bitcoin 2021 en
// Miami, donde El Salvador anunció la ley bitcoin (CBS, NPR, CNBC, CoinDesk);
// Predicciones = elección de EE.UU. 2024, Polymarket supera US$3.000 M en un
// mercado (The Block, Yahoo Finance).
const NODES = [
  { key: "historia", at: "2013-11", dy: -1 },
  { key: "finanzas", at: "2020-03", dy: 1 },
  { key: "acciones", at: "2021-02", dy: -1 },
  { key: "eventos", at: "2021-06", dy: 1 },
  { key: "etfs", at: "2024-01", dy: -1 },
  { key: "predicciones", at: "2024-11", dy: 1 },
  { key: "ciclos", at: "peak", dy: -1 },
  { key: "noticias", at: "today", dy: 1 },
];

// Mobile vertical: margen arriba, alto de cada franja, tramo del abanico
// (hoy → halving) y pie (eje de precios). El alto del gráfico sale de acá.
const VT = 40, VGAP = 92, VFAN = 420, VB = 56;
// Techo de la escala mobile: con $2,5 M (y no $250 k) hoy cae cerca del 60 %
// del ancho y el abanico se abre a los dos lados desde su punto real, sin
// correrlo (la auditoría marcó que desplazarlo no salía del dato).
const V_CEIL = 2_500_000;

// Títulos-estación: tamaño y ancho medido (para ubicarlos al lado del punto y
// cortar la línea detrás). Mismo font que .blc-ttl; sin canvas, estimación.
const TTL_FS = 27;
const TTL_FONT = `620 ${TTL_FS}px 'Geist Variable', system-ui, sans-serif`;
let ttlCtx;
const ttlWidth = (s) => {
  try { ttlCtx ??= document.createElement("canvas").getContext("2d"); ttlCtx.font = TTL_FONT; return ttlCtx.measureText(s).width; }
  catch { return s.length * 15; }
};

// Interpolación por tramos: [[t, pos], …] → pos(t).
const seg = (bx) => (tt) => {
  for (let i = 1; i < bx.length; i++) if (tt <= bx[i][0]) { const [a, fa] = bx[i - 1], [b, fb] = bx[i]; return fa + ((tt - a) / (b - a)) * (fb - fa); }
  return bx[bx.length - 1][1];
};

// Lupa del futuro: de hoy en adelante la escala del precio se amplía ×4
// (rotulado en pantalla) para que los caminos posibles se abran de verdad; a
// la escala de 12 años (×10.000) su rango real, ±3× en dos años, se vería
// como una sola línea.
const FAN_ZOOM = 4;

export function LayerCurve({ news = [], onEnter }) {
  const { t, locale } = useLocale();
  const d = useLayerData();
  const stageRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState(null);       // sección con vista previa
  // El hilo mide los títulos: se vuelve a medir cuando llega la fuente real.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { let on = true; document.fonts?.ready.then(() => on && setFontsReady(true)); return () => { on = false; }; }, []);
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
    const END = nextHalving + 0.1;
    const peakT = cyc?.keyDates?.peak ? T(cyc.keyDates.peak.slice(0, 7)) : TODAY - 1;
    const at = { today: TODAY, peak: peakT };
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
      // Estratos: el tiempo sube. Arriba el abanico (halving → hoy, VFAN),
      // después una franja de VGAP por sección de hoy hacia atrás; la curva
      // arranca en Hitos (2013), abajo de todo. Precio en log, $100 → V_CEIL.
      const Hh = VT + VFAN + 7 * VGAP + VB, x0 = 24, x1 = W - 24;
      const yToday = VT + VFAN;
      const Yt = seg([...times.map((tt, i) => [tt, yToday + (7 - i) * VGAP]), [nextHalving, VT], [END, VT - 20]]);
      const lc = Math.log10(V_CEIL) - 2;
      const Xp = (p) => x0 + ((Math.log10(Math.max(p, 100)) - 2) / lc) * (x1 - x0);
      // Todos los nombres a la izquierda de su estación (un solo borde de
      // lectura); a la derecha solo si no entran.
      const nodes = NODES.map((n, i) => {
        const cx = Xp(priceAt(times[i])), cy = Yt(times[i]), tw = ttlWidth(t(SECTION_LABEL[n.key]));
        const tx = cx - 17 - tw >= 10 ? cx - 17 - tw : cx + 17;
        return { ...n, tt: times[i], cx, cy, tx, tw, box: { x: tx - 7, y: cy - TTL_FS * 0.62, w: tw + 14, h: TTL_FS * 1.18 } };
      });
      const pxDec = (x1 - x0) / lc;
      const past = H.filter((h) => T(h.t) >= times[0]);
      return { V: true, W, Hh, x0, Xp, Yt, pxDec, last, nextHalving, TODAY, ...draw(past.map((h) => [Xp(h.p), Yt(T(h.t))])), xt: Xp(last), yt: yToday, nodes };
    }

    const Hh = size.h, L = 64, R = 60, TOP = 120, BOT = 46;
    // Las 8 secciones hasta el 72% del ancho; el resto es el abanico (hoy → halving).
    const f = seg([[2012, 0], ...times.map((tt, i) => [tt, 0.07 + (0.65 * i) / (times.length - 1)]), [nextHalving, 0.97], [END, 1]]);
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
    const pxDec = (Hh - TOP - BOT) / Math.log10(250000);
    return { W, Hh, L, R, TOP, BOT, X, Y, TODAY, pxDec, last, nextHalving, ...draw(H.map((h) => [X(T(h.t)), Y(h.p)])), xt: X(TODAY), yt: Y(last), nodes };
  }, [H, size, mobile, cyc, t, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caminos del futuro: (tiempo, precio) → pantalla, con la lupa ×4 centrada en hoy.
  const fan = useMemo(() => {
    if (!geo) return null;
    const until = geo.nextHalving;
    if (geo.V) {
      // Mobile (Estratos): el abanico abre la pantalla hacia arriba desde el
      // punto de hoy, con la misma lupa y sin desplazarlo.
      const yEnd = geo.Yt(until);
      return {
        until,
        toPoint: (tt, p) => [geo.xt + Math.log10(p / geo.last) * geo.pxDec * FAN_ZOOM, geo.Yt(tt)],
        clip: { x: 8, y: yEnd - 2, w: geo.W - 16, h: geo.yt - yEnd + 2 },
        fade: { x1: 0, y1: geo.yt, x2: 0, y2: yEnd },
      };
    }
    const xEnd = geo.X(until);
    return {
      until,
      toPoint: (tt, p) => [geo.X(tt), geo.yt - Math.log10(p / geo.last) * geo.pxDec * FAN_ZOOM],
      clip: { x: geo.xt, y: 8, w: xEnd - geo.xt + 2, h: geo.Hh - geo.BOT - 8 },
      fade: { x1: geo.xt, y1: 0, x2: xEnd, y2: 0 },
    };
  }, [geo]);

  const name = (k) => t(SECTION_LABEL[k]);
  // Fechas de las secciones ancladas a hitos: salen de los datos, no de strings.
  const dateOf = { ciclos: cyc?.keyDates?.peak };
  const tk = (k, f) => {
    // El "cuándo" de una sección anclada a un mes sale del dato, no de un texto.
    const at = NODES.find((n) => n.key === k)?.at;
    if (f === "when" && /^\d{4}-\d{2}$/.test(at || "") && k !== "historia") return monthLabel(at, locale);
    return t(`curve.${k}.${f}`, { date: dateOf[k] ? monthLabel(dateOf[k], locale) : "—" });
  };

  const show = (i) => { clearTimeout(hideT.current); shownAt.current = Date.now(); setSel(i); };

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
  // su título-estación pegado a su punto en la curva.
  const vertical = geo?.V && (
    <svg className="blc-v" viewBox={`0 0 ${geo.W} ${geo.Hh}`} role="img" aria-label={t("curve.chartAria")}>
      <defs>
        <linearGradient id="blc-cgv" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#2f5a63" /><stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" /></linearGradient>
      </defs>
      <g className="blc-grid" mask="url(#blc-kov)">
        {/* La escala del pasado empieza hoy: el abanico va con su propia lupa. */}
        {[1000, 100000].map((p) => (
          <g key={p}><line x1={geo.Xp(p)} x2={geo.Xp(p)} y1={geo.yt} y2={geo.Hh - 34} /><text x={geo.Xp(p)} y={geo.Hh - 16} textAnchor="middle">{fmtUsd(p, locale)}</text></g>
        ))}
      </g>
      <defs>
        {/* Estaciones: la línea (y la grilla) se cortan limpias detrás de cada nombre. */}
        <mask id="blc-kov" maskUnits="userSpaceOnUse" x="0" y="0" width={geo.W} height={geo.Hh}>
          <rect x="0" y="0" width={geo.W} height={geo.Hh} fill="#fff" />
          {geo.nodes.map((n) => <rect key={n.key} x={n.box.x} y={n.box.y} width={n.box.w} height={n.box.h} rx="6" fill="#000" />)}
        </mask>
      </defs>
      <FutureFan id="blc-fanv" H={H} label={t("curve.fanAria")} {...fan} />
      <text className="blc-fut-l" x={geo.W - 16} y={geo.Yt(geo.nextHalving) + 4} textAnchor="end">{t("curve.fanZoom", { n: FAN_ZOOM })}</text>
      {/* Sin puntitos de hitos en mobile: sin rótulo se leían como ruido. */}
      <path className="blc-curve" mask="url(#blc-kov)" d={geo.path} style={{ strokeDasharray: geo.len, strokeDashoffset: geo.len }} />
      {geo.nodes.map((n, i) => {
        const label = name(n.key);
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
            {n.at === "today" && <circle className="blc-live" cx={n.cx} cy={n.cy} r="7" />}
            <circle className="blc-halo" cx={n.cx} cy={n.cy} r="16" />
            <circle className="blc-dot" cx={n.cx} cy={n.cy} r="7" />
            <circle className="blc-core" cx={n.cx} cy={n.cy} r="2.8" />
            <text className="blc-ttl" x={n.tx} y={n.cy + TTL_FS * 0.35}>{label}</text>
          </g>
        );
      })}
    </svg>
  );


  return (
    <section className="blc" aria-label={t("curve.aria")}>
      {/* Sin intro visible (Pablo, sept 2026: la curva se explica sola); el
          título queda para lectores de pantalla y buscadores. */}
      <h1 className="bl-sr-only">{t("curve.title")}</h1>
      <div
        className={`blc-stage${geo ? " is-ready" : ""}`}
        style={geo?.V ? { height: geo.Hh } : undefined}
        ref={stageRef}
      >
        {geo?.V && vertical}
        {geo && !geo.V && (
          <svg viewBox={`0 0 ${geo.W} ${geo.Hh}`} role="img" aria-label={t("curve.chartAria")}>
            <defs>
              <linearGradient id="blc-cg" x1="0" x2="1"><stop offset="0" stopColor="#2f5a63" /><stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" /></linearGradient>
              <linearGradient id="blc-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".16" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
              <clipPath id="blc-cp"><rect x="0" y="0" width={geo.W} height={geo.Hh - geo.BOT} /></clipPath>
              {/* El área del pasado se disuelve en los últimos 160 px antes de hoy: sin corte de color. */}
              <linearGradient id="blc-amg" gradientUnits="userSpaceOnUse" x1={geo.xt - 160} y1="0" x2={geo.xt} y2="0"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" /></linearGradient>
              <mask id="blc-am" maskUnits="userSpaceOnUse" x="0" y="0" width={geo.W} height={geo.Hh}><rect x="0" y="0" width={geo.W} height={geo.Hh} fill="url(#blc-amg)" /></mask>
            </defs>
            <g className="blc-grid">
              {[10, 1000, 100000].map((p) => (
                <g key={p}><line x1={geo.L} x2={geo.W - geo.R} y1={geo.Y(p)} y2={geo.Y(p)} /><text x={geo.L} y={geo.Y(p) - 6}>{fmtUsd(p, locale)}</text></g>
              ))}
              {[2012, 2016, 2020, 2022, 2024, 2026, 2028].map((y) => (
                <text key={y} x={geo.X(y)} y={geo.Hh - geo.BOT + 22} textAnchor="middle">{y}</text>
              ))}
            </g>
            <FutureFan id="blc-fan" H={H} label={t("curve.fanAria")} {...fan} />
            <g clipPath="url(#blc-cp)">
              <path className="blc-area" mask="url(#blc-am)" d={`${geo.path}L${geo.pts[geo.pts.length - 1][0]},${geo.Hh - geo.BOT}L${geo.pts[0][0]},${geo.Hh - geo.BOT}Z`} />
              <path className="blc-curve" d={geo.path} style={{ strokeDasharray: geo.len, strokeDashoffset: geo.len }} />
            </g>
            {/* El abanico en lenguaje de gráfico: a qué escala va el futuro. */}
            <text className="blc-fut-l" x={geo.X(geo.nextHalving)} y={geo.TOP - 96} textAnchor="end">{t("curve.fanZoom", { n: FAN_ZOOM })}</text>
            <g className="blc-ms">
              {(cyc.milestones || []).filter((x) => T(x.t) <= geo.TODAY).map((x) => {
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
                  onMouseEnter={() => show(i)}
                  onMouseLeave={hideSoon}
                  onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(i)}
                  onClick={(e) => { e.stopPropagation(); onEnter(NODES[i].key); }}
                  onKeyDown={(e) => e.key === "Enter" && onEnter(n.key)}
                >
                  <line className="blc-stem" x1={n.cx} x2={n.cx} y1={n.cy + (dir > 0 ? 10 : -10)} y2={dir > 0 ? py : py + ph} />
                  {n.at === "today" && <circle className="blc-live" cx={n.cx} cy={n.cy} r="9" />}
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
        {!mobile && preview}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { FutureFan } from "./FutureFan";
import { SECTION_LABEL, T, Pct, Phase, fmtDay, fmtUsd, layerStats, list, monthLabel, useLayerData } from "../utils/layer";

// Portada de Layer: la curva histórica de Bitcoin (2012 → hoy) como mapa de
// navegación. Cada sección vive en un momento real de la curva (la curva es
// el único índice, sept 2026). Un solo hover: el de las secciones.
// "Ramas" (30-sep, tras la auditoría y referentes: Tufte, Minard, Beck): cada
// sección sale de su punto con una RAMA que es una lupa de la curva — el
// precio real de BTC alrededor de ese momento (±9 meses; hoy, los últimos 7
// días hora por hora) — con el mismo trazo que la curva principal, y termina
// en su nombre. Como las ramas llevan cada nombre a su lugar, el eje de
// tiempo es REAL (sin tramos comprimidos) y los nombres quedan parejos: en
// mobile, una columna con las 8 secciones y el abanico en una sola pantalla;
// en desktop, un riel de títulos arriba. Todo en un color (Pablo: el rojo/
// verde por sección rompía la estética de Layer).

// Dónde vive cada sección. Todas en un momento REAL de la curva, en orden
// cronológico; hoy (Noticias) es la última y de ahí se abre el abanico del
// futuro ("el pasado se navega, el futuro se pregunta"). Anclas verificadas
// con 2+ fuentes: Eventos = Bitcoin 2021 en Miami, donde El Salvador anunció
// la ley bitcoin (CBS, NPR, CNBC, CoinDesk); Predicciones = elección de
// EE.UU. 2024, Polymarket supera US$3.000 M en un mercado (The Block, Yahoo
// Finance).
const NODES = [
  { key: "historia", at: "2013-11" },
  { key: "finanzas", at: "2020-03" },
  { key: "acciones", at: "2021-02" },
  { key: "eventos", at: "2021-06" },
  { key: "etfs", at: "2024-01" },
  { key: "predicciones", at: "2024-11" },
  { key: "ciclos", at: "peak" },
  { key: "noticias", at: "today" },
];

// Mobile: margen arriba, abanico (halving → hoy), una fila por sección y pie.
// Las 8 secciones y el abanico entran en una pantalla de 390 × 844.
const VT = 14, VFAN = 214, VROW = 60, VB = 44;
// Techo de la escala mobile: hoy cae en el tercio izquierdo de la banda de
// la curva y el abanico se abre a los dos lados desde su punto real.
const V_CEIL = 2_500_000;

// Rama = lupa: log-precio alrededor de `tt` (±9 meses de la serie mensual;
// hoy, la serie horaria de 7 días si está) como desvío de la recta entre sus
// extremos, normalizado a ±1 — así arranca en el punto y termina en el nombre.
function lens(H, tt, today, spark) {
  const a = tt >= today - 0.02 && spark?.length > 12
    ? spark.filter((_, i) => i % 2 === 0).map((p) => Math.log10(p))
    : H.filter((h) => Math.abs(T(h.t) - tt) <= 0.76).map((h) => Math.log10(h.p));
  if (a.length < 3) return [0, 0];
  const n = a.length - 1, r = a.map((v, i) => v - (a[0] + ((a[n] - a[0]) * i) / n));
  const m = Math.max(1e-9, ...r.map(Math.abs));
  return r.map((v) => v / m);
}
// La rama: una curva de Bézier de la sección a su nombre con la lupa encima
// (desvío sobre la normal, que se apaga en las puntas).
function branchPath([x0, y0], c1, c2, [x1, y1], offs, amp) {
  const B = (t) => { const u = 1 - t; return [u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y1]; };
  const n = offs.length - 1;
  return offs.map((o, i) => {
    const t = i / n, [px, py] = B(t), [qx, qy] = B(Math.min(1, t + 0.01)), [rx, ry] = B(Math.max(0, t - 0.01));
    const L = Math.hypot(qx - rx, qy - ry) || 1, e = o * amp * Math.sin(Math.PI * t) ** 0.6;
    return `${i ? "L" : "M"}${(px - ((qy - ry) / L) * e).toFixed(1)},${(py + ((qx - rx) / L) * e).toFixed(1)}`;
  }).join("");
}

// Lupa del futuro: de hoy en adelante la escala del precio se amplía ×4
// (rotulado en pantalla) para que los caminos posibles se abran de verdad; a
// la escala de 12 años (×10.000) su rango real, ±3× en dos años, se vería
// como una sola línea.
const FAN_ZOOM = 4;
// En mobile la banda de la curva es angosta (la columna de nombres va al
// lado): la lupa del abanico es mayor para que se abra; va rotulada igual.
const FAN_ZOOM_V = 7;
// Desktop: parte del ancho para el futuro (hoy → halving), en su propia escala.
const FUT_SHARE = 0.24;
// Lo que tarda un impulso en recorrer una rama (mobile); igual que en el CSS.
const PULSE_MS = 700;
// Pulso base del movimiento de la portada (impulsos, abanico, latido de hoy).
const BEAT = 1200;

export function LayerCurve({ news = [], onEnter }) {
  const { t, locale } = useLocale();
  const d = useLayerData();
  const stageRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState(null);       // sección con vista previa
  // Impulsos (30-sep, Pablo): la curva manda un destello por una rama al
  // azar y el título se enciende al llegar. Mobile cada 1,2–2,4 s; desktop
  // más espaciado (3,6–4,8 s) y en pausa mientras el mouse explora la curva
  // o la ficha está abierta: invita, no interrumpe. Todo sobre un pulso base
  // de 1,2 s (el abanico redibuja cada 0,6 s y hoy late cada 2,4 s). Quieto
  // con reduced-motion y en pausa cuando no se ve.
  const [pulse, setPulse] = useState(null);   // { i, n }
  const [lit, setLit] = useState(null);
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

  const busy = useRef(false);                  // desktop: el mouse está en la curva
  useEffect(() => { busy.current = sel != null; }, [sel]);
  useEffect(() => {
    if (!size.w || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const [every, spread] = mobile ? [BEAT, BEAT] : [BEAT * 3, BEAT];
    let visible = true, n = 0, last = -1, t1, t2, t3;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    if (stageRef.current) io.observe(stageRef.current);
    const fire = () => {
      if (visible && !document.hidden && (mobile || !busy.current)) { // en táctil no hay "explorando"
        let i; do i = Math.floor(Math.random() * NODES.length); while (i === last);
        last = i;
        setPulse({ i, n: ++n });
        t2 = setTimeout(() => setLit(i), PULSE_MS);            // llega: se enciende
        t3 = setTimeout(() => setLit((v) => (v === i ? null : v)), PULSE_MS + 1100);
      }
      t1 = setTimeout(fire, every + Math.random() * spread);
    };
    t1 = setTimeout(fire, 2600);                                // después del dibujo inicial
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); io.disconnect(); setPulse(null); setLit(null); };
  }, [mobile, size.w > 0]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const times = NODES.map((n) => at[n.at] ?? T(n.at));
    const last = H[H.length - 1].p;
    const priceAt = (tt) => { if (tt >= TODAY) return last; let b = H[0]; for (const h of H) if (Math.abs(T(h.t) - tt) < Math.abs(T(b.t) - tt)) b = h; return b.p; };
    const draw = (pts) => ({
      pts,
      path: "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L"),
      len: pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0),
    });

    const spark = list(d.prices).find((x) => x.sym === "BTC")?.sparkline;
    const lensOf = (tt) => lens(H, tt, TODAY, spark);

    if (mobile) {
      // Tiempo real: el abanico arriba (halving → hoy) y el pasado hacia
      // abajo hasta Hitos. La curva va en una banda a la izquierda; los
      // nombres, en una columna pareja a la derecha (una fila por sección).
      const T0 = times[0], yToday = VT + VFAN, yBot = yToday + 7 * VROW;
      const Hh = yBot + VB, x0 = 14, x1 = Math.round(W * 0.46), lx = Math.round(W * 0.58);
      const Yt = (tt) => (tt >= TODAY ? yToday - ((tt - TODAY) / (nextHalving - TODAY)) * (yToday - VT) : yToday + ((TODAY - tt) / (TODAY - T0)) * (yBot - yToday));
      const lc = Math.log10(V_CEIL) - 2;
      const Xp = (p) => x0 + ((Math.log10(Math.max(p, 100)) - 2) / lc) * (x1 - x0);
      const nodes = NODES.map((n, i) => {
        const cx = Xp(priceAt(times[i])), cy = Yt(times[i]), ly = yToday + (NODES.length - 1 - i) * VROW, ex = lx - 12;
        const branch = branchPath([cx, cy], [cx + (ex - cx) * 0.35, cy], [ex - (ex - cx) * 0.35, ly], [ex, ly], lensOf(times[i]), 7);
        return { ...n, tt: times[i], cx, cy, lx, ly, ex, branch };
      });
      const pxDec = (x1 - x0) / lc;
      const past = H.filter((h) => T(h.t) >= T0);
      return { V: true, W, Hh, x0, Xp, Yt, pxDec, last, nextHalving, TODAY, yBot, ...draw(past.map((h) => [Xp(h.p), Yt(T(h.t))])), xt: Xp(last), yt: yToday, nodes };
    }

    // Desktop: el pasado en tiempo real (2012 → hoy) y el futuro como LUPA
    // (Pablo, 30-sep: que el abanico gane lugar): de hoy al halving ocupa el
    // FUT_SHARE del ancho, en su propia escala, marcada por el rótulo de
    // escala y los años del eje — como la lupa ×4 del precio (sin franja de
    // fondo: dejaba una costura de dos tonos en hoy). Riel de títulos arriba.
    const Hh = size.h, L = 64, R = 60, TOP = 170, BOT = 46, RAIL = 26;
    const span = W - L - R, xNow = L + span * (1 - FUT_SHARE);
    const X = (tt) => (tt <= TODAY ? L + ((tt - 2012) / (TODAY - 2012)) * (xNow - L) : xNow + ((tt - TODAY) / (END - TODAY)) * (W - R - xNow));
    const Y = (p) => TOP + (1 - Math.log10(Math.max(p, 1)) / Math.log10(250000)) * (Hh - TOP - BOT);
    // El riel pasa un poco sobre la zona del futuro (los caminos empiezan
    // debajo del riel): así entran los 8 títulos también en 1000 px.
    const railEnd = xNow + (W - R - xNow) * 0.45;
    const gapx = (railEnd - L - 110) / (NODES.length - 1), fs = gapx < 100 ? 14 : gapx < 125 ? 15 : 17;
    const nodes = NODES.map((n, i) => {
      const tt = times[i], cx = X(tt), cy = Y(priceAt(tt)), kx = L + i * gapx, ey = RAIL + 46;
      // Controles: sube casi vertical desde el punto y entra vertical al riel;
      // el primer control ya se inclina hacia su título, así las ramas del
      // racimo 2020–21 se abren en abanico en vez de cruzarse al salir.
      const branch = branchPath([cx, cy], [cx + (kx + 6 - cx) * 0.18, cy - (cy - ey) * 0.5], [kx + 6, ey + (cy - ey) * 0.38], [kx + 6, ey], lensOf(tt), 12 * Math.min(1, gapx / 150));
      return { ...n, tt, cx, cy, kx, ey, fs, branch };
    });
    const pxDec = (Hh - TOP - BOT) / Math.log10(250000);
    // Ficha de la sección (30-sep, Pablo): vive en el espacio libre debajo de
    // la curva (2018.6 → hoy), no flotando encima. Sin lugar, vuelve a flotar.
    const DOCK_FROM = 2018.6, dockTop = Math.max(...H.filter((h) => T(h.t) >= DOCK_FROM).map((h) => Y(h.p))) + 34;
    const dock = { x: X(DOCK_FROM), y: dockTop, w: X(TODAY) - X(DOCK_FROM) - 16, h: Hh - BOT - 14 - dockTop };
    return { W, Hh, L, R, TOP, BOT, RAIL, gapx, X, Y, TODAY, pxDec, last, nextHalving, ...draw(H.map((h) => [X(T(h.t)), Y(h.p)])), xt: X(TODAY), yt: Y(last), nodes, dock: dock.h >= 150 && dock.w >= 460 ? dock : null };
  }, [H, size, mobile, cyc, d.prices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caminos del futuro: (tiempo, precio) → pantalla, con la lupa ×4 centrada
  // en hoy. Sin rótulos de hitos sobre la curva (Pablo, 30-sep): viven en Hitos.
  const fan = useMemo(() => {
    if (!geo) return null;
    const until = geo.nextHalving;
    if (geo.V) {
      // Mobile: el abanico abre la pantalla hacia arriba desde el punto de
      // hoy, sin desplazarlo.
      const yEnd = geo.Yt(until);
      return {
        until,
        toPoint: (tt, p) => [geo.xt + Math.log10(p / geo.last) * geo.pxDec * FAN_ZOOM_V, geo.Yt(tt)],
        clip: { x: 8, y: yEnd + 14, w: geo.W - 16, h: geo.yt - yEnd - 14 }, // debajo del rótulo de escala
        fade: { x1: 0, y1: geo.yt, x2: 0, y2: yEnd },
      };
    }
    const xEnd = geo.X(until);
    return {
      until,
      toPoint: (tt, p) => [geo.X(tt), geo.yt - Math.log10(p / geo.last) * geo.pxDec * FAN_ZOOM],
      clip: { x: geo.xt, y: geo.RAIL + 50, w: xEnd - geo.xt + 2, h: geo.Hh - geo.BOT - geo.RAIL - 50 }, // debajo del riel
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
  const dock = geo?.dock;
  const preview = selNodeP && (
    <div
      className={`blc-pv${dock ? " is-dock" : ""}`}
      role="dialog"
      aria-label={name(selNodeP.key)}
      style={dock
        ? { left: dock.x, top: dock.y, width: dock.w, maxHeight: dock.h }
        : { left: selNodeP.cx + 360 > geo.W ? selNodeP.cx - 360 : selNodeP.cx + 30, top: Math.max(10, Math.min(selNodeP.cy - 60, geo.Hh - 360)) }}
      onMouseEnter={() => clearTimeout(hideT.current)}
      onMouseLeave={hideSoon}
    >
      <div className="pv-in" key={selNodeP.key}>
      <div className="pv-a">
        <div className="k">{tk(selNodeP.key, "when")}</div>
        <h3>{name(selNodeP.key)}</h3>
        <p className="desc">{t(`curve.${selNodeP.key}.desc`)}</p>
      </div>
      <div className="pv-b">
        <div className="big">{content[selNodeP.key].v ?? "—"}</div>
        <div className="rows">
          {content[selNodeP.key].rows.map(([a, b], j) => (
            <div key={j} className={`r${content[selNodeP.key].titles ? " t" : ""}`}><span>{a}</span><span>{b}</span></div>
          ))}
        </div>
      </div>
      <div className="pv-c">
        <p className="why">{tk(selNodeP.key, "why")}</p>
        <button type="button" className="go" onClick={() => onEnter(selNodeP.key)}>{t("curve.enter")} {name(selNodeP.key)} →</button>
      </div>
      </div>
    </div>
  );

  // Mobile: la curva en su banda, las ramas y la columna de nombres. Cada
  // fila entera es tocable. Solo títulos (Pablo: sin datos ni fechas).
  const vertical = geo?.V && (
    <svg className="blc-v" viewBox={`0 0 ${geo.W} ${geo.Hh}`} role="img" aria-label={t("curve.chartAria")}>
      <defs>
        <linearGradient id="blc-cgv" gradientUnits="userSpaceOnUse" x1="0" y1={geo.yBot} x2="0" y2={geo.yt}><stop offset="0" stopColor="#2f5a63" /><stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" /></linearGradient>
      </defs>
      {/* Los caminos se desvanecen arriba y contra los bordes: sin cortes rectos. */}
      <defs>
        <linearGradient id="blc-fvg" gradientUnits="userSpaceOnUse" x1="0" y1={VT + 14} x2="0" y2={VT + 90}><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity="1" /></linearGradient>
        <linearGradient id="blc-fhg" gradientUnits="userSpaceOnUse" x1="8" y1="0" x2={geo.W - 8} y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".1" stopColor="#fff" stopOpacity="1" /><stop offset=".9" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="blc-fvm" maskUnits="userSpaceOnUse" x="0" y="0" width={geo.W} height={geo.Hh}><rect x="0" y="0" width={geo.W} height={geo.Hh} fill="url(#blc-fvg)" /></mask>
        <mask id="blc-fhm" maskUnits="userSpaceOnUse" x="0" y="0" width={geo.W} height={geo.Hh}><rect x="0" y="0" width={geo.W} height={geo.Hh} fill="url(#blc-fhg)" /></mask>
      </defs>
      <g mask="url(#blc-fvm)"><g mask="url(#blc-fhm)"><FutureFan id="blc-fanv" H={H} label={t("curve.fanAria")} {...fan} /></g></g>
      <text className="blc-fut-l" x={geo.W - 14} y={VT + 4} textAnchor="end">{t("curve.fanZoom", { n: FAN_ZOOM_V })}</text>
      <path className="blc-curve" d={geo.path} style={{ strokeDasharray: geo.len, strokeDashoffset: geo.len }} />
      {geo.nodes.map((n, i) => {
        const label = name(n.key);
        return (
          <g
            key={n.key}
            className={`blc-node${n.at === "today" ? " is-today" : ""}${sel === i ? " is-on" : ""}${lit === i ? " is-lit" : ""}`}
            style={{ animationDelay: `${2.1 + (NODES.length - 1 - i) * 0.1}s` }}
            tabIndex={0}
            role="button"
            aria-label={`${label}. ${t(`curve.${n.key}.desc`)}`}
            onClick={(e) => { e.stopPropagation(); onEnter(n.key); }}
            onKeyDown={(e) => e.key === "Enter" && onEnter(n.key)}
          >
            <rect className="blc-hit" x="0" y={n.ly - VROW / 2} width={geo.W} height={VROW} />
            <path className="blc-branch-glow" d={n.branch} />
            <path className="blc-branch" d={n.branch} />
            {pulse?.i === i && <path key={pulse.n} className="blc-pulse" d={n.branch} pathLength="100" />}
            <circle className="blc-end" cx={n.ex} cy={n.ly} r="2.4" />
            {n.at === "today" && <circle className="blc-live" cx={n.cx} cy={n.cy} r="6" />}
            {/* Puntos chicos: en 2021 Acciones y Eventos caen a 7 px (fechas reales). */}
            <circle className="blc-halo" cx={n.cx} cy={n.cy} r="9" />
            <circle className="blc-dot" cx={n.cx} cy={n.cy} r="4.5" />
            <circle className="blc-core" cx={n.cx} cy={n.cy} r="1.7" />
            <text className="blc-ttl" x={n.lx} y={n.ly + 7}>{label}</text>
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
        onMouseEnter={() => { busy.current = true; }}
        onMouseLeave={() => { busy.current = sel != null; }}
      >
        {geo?.V && vertical}
        {geo && !geo.V && (
          <svg viewBox={`0 0 ${geo.W} ${geo.Hh}`} role="img" aria-label={t("curve.chartAria")}>
            <defs>
              <linearGradient id="blc-cg" x1="0" x2="1"><stop offset="0" stopColor="#2f5a63" /><stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" /></linearGradient>
              <linearGradient id="blc-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6CB8C8" stopOpacity=".16" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" /></linearGradient>
              <clipPath id="blc-cp"><rect x="0" y="0" width={geo.W} height={geo.Hh - geo.BOT} /></clipPath>
              {/* El área entra suave en 2012 y se disuelve en el último tercio antes
                  de hoy con curva suave: con 160 px lineales quedaba una franja. */}
              <linearGradient id="blc-amg" gradientUnits="userSpaceOnUse" x1={geo.L} y1="0" x2={geo.xt} y2="0">
                {[[0, 0], [0.05, 1], [0.62, 1], [0.72, 0.86], [0.8, 0.6], [0.88, 0.32], [0.95, 0.1], [1, 0]].map(([o, v]) => (
                  <stop key={o} offset={o} stopColor="#fff" stopOpacity={v} />
                ))}
              </linearGradient>
              <mask id="blc-am" maskUnits="userSpaceOnUse" x="0" y="0" width={geo.W} height={geo.Hh}><rect x="0" y="0" width={geo.W} height={geo.Hh} fill="url(#blc-amg)" /></mask>
            </defs>
            <g className="blc-grid">
              {[10, 1000, 100000].map((p) => (
                <g key={p}><line x1={geo.L} x2={geo.W - geo.R} y1={geo.Y(p)} y2={geo.Y(p)} /><text x={geo.L} y={geo.Y(p) - 6}>{fmtUsd(p, locale)}</text></g>
              ))}
              {[2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026, 2027, 2028].filter((y) => y <= geo.nextHalving).map((y) => (
                <text key={y} x={geo.X(y)} y={geo.Hh - geo.BOT + 22} textAnchor="middle">{y}</text>
              ))}
            </g>

            {/* Los caminos se desvanecen hacia el riel (sin corte recto arriba). */}
            <defs>
              <linearGradient id="blc-ffg" gradientUnits="userSpaceOnUse" x1="0" y1={geo.RAIL + 50} x2="0" y2={geo.RAIL + 150}><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity="1" /></linearGradient>
              <mask id="blc-ffm" maskUnits="userSpaceOnUse" x="0" y="0" width={geo.W} height={geo.Hh}><rect x="0" y="0" width={geo.W} height={geo.Hh} fill="url(#blc-ffg)" /></mask>
            </defs>
            <g mask="url(#blc-ffm)"><FutureFan id="blc-fan" H={H} label={t("curve.fanAria")} {...fan} /></g>
            <g clipPath="url(#blc-cp)">
              <path className="blc-area" mask="url(#blc-am)" d={`${geo.path}L${geo.pts[geo.pts.length - 1][0]},${geo.Hh - geo.BOT}L${geo.pts[0][0]},${geo.Hh - geo.BOT}Z`} />
              <path className="blc-curve" d={geo.path} style={{ strokeDasharray: geo.len, strokeDashoffset: geo.len }} />
            </g>
            {/* El abanico en lenguaje de gráfico: a qué escala va el futuro. */}
            <text className="blc-fut-l" x={geo.W - geo.R} y={geo.RAIL + 40} textAnchor="end">{t("curve.fanZoom", { n: FAN_ZOOM })}</text>
            {/* La ficha cuelga de su punto: una plomada al espacio de abajo. */}
            {selNodeP && dock && (
              <path className="blc-plumb" d={`M${selNodeP.cx},${selNodeP.cy + 10}L${Math.min(Math.max(selNodeP.cx, dock.x + 18), dock.x + dock.w - 18)},${dock.y}`} />
            )}
            {geo.nodes.map((n, i) => {
              const c = content[n.key];
              const label = name(n.key);
              return (
                <g
                  key={n.key}
                  className={`blc-node${n.at === "today" ? " is-today" : ""}${sel === i ? " is-on" : ""}${lit === i ? " is-lit" : ""}`}
                  style={{ animationDelay: `${2.1 + i * 0.12}s` }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${label}. ${t(`curve.${n.key}.desc`)}`}
                  onMouseEnter={() => show(i)}
                  onMouseLeave={hideSoon}
                  onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(i)}
                  onClick={(e) => { e.stopPropagation(); onEnter(n.key); }}
                  onKeyDown={(e) => e.key === "Enter" && onEnter(n.key)}
                >
                  <path className="blc-branch-glow" d={n.branch} />
                  <path className="blc-branch" d={n.branch} />
                  {pulse?.i === i && <path key={pulse.n} className="blc-pulse" d={n.branch} pathLength="100" />}
                  <circle className="blc-end" cx={n.kx + 6} cy={n.ey} r="2.6" />
                  {n.at === "today" && <circle className="blc-live" cx={n.cx} cy={n.cy} r="8" />}
                  <circle className="blc-halo" cx={n.cx} cy={n.cy} r="17" />
                  <circle className="blc-dot" cx={n.cx} cy={n.cy} r="7.5" />
                  <circle className="blc-core" cx={n.cx} cy={n.cy} r="2.6" />
                  {/* Riel: nombre + dato vivo, en un color (el dato en gris). */}
                  <rect className="blc-rail-hit" x={n.kx - 4} y={geo.RAIL - 6} width={geo.gapx - 8} height="58" />
                  <text className="blc-rn" x={n.kx} y={geo.RAIL + 12} style={{ fontSize: n.fs }}>{label}</text>
                  <foreignObject x={n.kx} y={geo.RAIL + 18} width={geo.gapx - 10} height="18"><div className="blc-rv">{c.v ?? " "}</div></foreignObject>
                  <circle cx={n.cx} cy={n.cy} r="20" fill="transparent" />
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

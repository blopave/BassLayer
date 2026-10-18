import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { FutureFan } from "./FutureFan";
import { registerShape } from "../utils/worldShapes";
import { SECTION_LABEL, T, Pct, Phase, fmtDay, fmtUsd, layerStats, list, useLayerData } from "../utils/layer";

// Portada de Layer: la curva histórica de Bitcoin (2012 → hoy) como mapa de
// navegación. Cada sección vive en un punto de la curva, en orden de uso (la
// curva es el único índice, sept 2026). Un solo hover: el de las secciones.
// "Haz" (oct 2026; Pablo la eligió entre las 10 direcciones del informe
// docs/reports/Conexión títulos y curva Layer.md): cada nombre alumbra hacia su
// punto con una línea RECTA de luz que se apaga antes de tocar la curva. Recta
// y en una sola dirección, como piden la cartografía, el subte y los estudios
// de rótulos (Barth et al.): no compite con la curva ni la cruza (la curva es
// función del tiempo: una vertical desde su punto no vuelve a tocarla). Al
// señalar, el haz completa el tramo y toca el punto. En desktop los nombres
// van en una fila alta; en mobile, a los dos lados del tronco. Todo en un
// color (Pablo: el rojo/verde por sección rompía la estética de Layer).
// "Lupa" (oct 2026, Pablo eligió C): al elegir una sección todo se retira —
// curva, área, abanico y las otras ramas— y queda encendido el camino tramo →
// haz → nombre → ficha: en la curva se prende el tramo de esa sección y el
// haz crece desde ahí. Sin plomada: la conexión la cuenta la luz.

// Orden de las secciones = orden de USO (Pablo, oct 2026): lo primero al
// entrar es ponerse al día. Ya no se atan a momentos históricos: se reparten
// parejas a lo largo del pasado de la curva y hoy queda libre — su punto
// late solo y de ahí se abre el abanico, sin ramas ni títulos encima.
const NODES = ["noticias", "finanzas", "acciones", "etfs", "ciclos", "predicciones", "eventos", "historia"].map((key) => ({ key }));
// Tramo de la curva donde se reparten los puntos (años): desde el comienzo
// hasta un poco antes de hoy, para dejarle aire al abanico.
const SPREAD_FROM = 2012.9, SPREAD_GAP = 0.7;

// Mobile: margen arriba, abanico (halving → hoy), una fila por sección y pie.
// La portada es solo la curva (Pablo, oct 2026): el alto se ajusta a lo que
// queda de pantalla (filas entre 46 y 60 px; el abanico toma el resto).
const VT = 14, VFAN = 214, VROW = 60, VB = 44;
// Techo de la escala mobile: hoy cae en el tercio izquierdo de la banda de
// la curva y el abanico se abre a los dos lados desde su punto real.
const V_CEIL = 2_500_000;


// Tramo de la curva que se enciende con la sección (años a cada lado del punto).
const TRAMO_WIN = 0.76;
// Haz: de pleno junto al nombre a nada en este largo (px), o antes si el punto
// queda más cerca: así todos se leen parejos, sean largos o cortos.
const HAZ_FADE = 150;

// Lupa del futuro: de hoy en adelante la escala del precio se amplía ×4
// (sin rótulo desde oct 2026, Pablo: ruido) para que los caminos posibles se abran de verdad; a
// la escala de 12 años (×10.000) su rango real, ±3× en dos años, se vería
// como una sola línea.
const FAN_ZOOM = 4;
// En mobile la banda de la curva es angosta (la columna de nombres va al
// lado): la lupa del abanico es mayor para que se abra.
const FAN_ZOOM_V = 7;
// Desktop: parte del ancho para el futuro (hoy → halving), en su propia escala.
const FUT_SHARE = 0.24;
// Luz del interior de la curva bajo la ficha: se apaga con curva suave
// (1 − t²)², en paradas finas, para que no se lean bandas ni bordes.
const INNER_GLOW = Array.from({ length: 11 }, (_, i) => [i / 10, +(0.17 * (1 - (i / 10) ** 2) ** 2).toFixed(4)]);
// Máscara de la grilla bajo la ficha: oculta hasta el 55 % del radio y
// vuelve con smoothstep hasta el borde.
const smooth = (t) => t * t * (3 - 2 * t);
const GRID_HIDE = Array.from({ length: 11 }, (_, i) => [i / 10, +(1 - smooth(Math.max(0, (i / 10 - 0.55) / 0.45))).toFixed(4)]);
// Lo que tarda un impulso en recorrer una rama (mobile); igual que en el CSS.
const PULSE_MS = 700;
// Pulso base del movimiento de la portada (impulsos, abanico, latido de hoy).
const BEAT = 1200;
// Luz del tramo encendido: plena en el punto, se apaga con smoothstep hacia las puntas.
const SEG_FADE = Array.from({ length: 9 }, (_, i) => [i / 8, +smooth(Math.min(1, (1 - Math.abs(i / 8 - 0.5) * 2) / 0.6)).toFixed(3)]);
// Ficha: por debajo de este alto de hueco queda solo "Entrar"; por encima
// suma una fila viva cada ROW_H px (descripción ~3 líneas + "Entrar" ≈ MINI_H).
const MINI_H = 170, ROW_H = 37;
// Mobile: lo que tarda el toque en viajar por la rama antes de entrar.
const TAP_MS = 340;

// El haz (mobile y desktop): su luz (pleno junto al nombre, nada antes de la
// curva), brillo, trazo y el impulso cuando lo hay (su número reinicia la animación).
function Branch({ id, d, haz, pulse }) {
  return (
    <>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" {...haz}>
        <stop offset="0" stopColor="#6CB8C8" stopOpacity=".42" /><stop offset="1" stopColor="#6CB8C8" stopOpacity="0" />
      </linearGradient>
      <path className="blc-branch-glow" d={d} />
      <path className="blc-branch" d={d} pathLength="100" style={{ "--hz": `url(#${id})` }} />
      {pulse ? <path key={pulse} className="blc-pulse" d={d} pathLength="100" /> : null}
    </>
  );
}



// Hoy: no es una sección; late solo y de ahí nace el abanico. Radios: latido, halo, punto, centro.
function Now({ x, y, r: [live, halo, dot, core] }) {
  return (
    <g className="blc-now" aria-hidden="true">
      <circle className="blc-live" cx={x} cy={y} r={live} /><circle className="blc-halo" cx={x} cy={y} r={halo} />
      <circle className="blc-dot" cx={x} cy={y} r={dot} /><circle className="blc-core" cx={x} cy={y} r={core} />
    </g>
  );
}

export function LayerCurve({ news = [], onEnter }) {
  const { t, locale } = useLocale();
  const d = useLayerData();
  const stageRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fit, setFit] = useState(0);          // mobile: alto de pantalla disponible para la curva
  const [sel, setSel] = useState(null);       // sección con vista previa
  // Impulsos (30-sep, Pablo): la curva manda un destello por una rama al
  // azar y el título se enciende al llegar. Mobile cada 1,2–2,4 s; desktop
  // más espaciado (3,6–4,8 s) y en pausa mientras el mouse explora la curva
  // o la ficha está abierta: invita, no interrumpe. Todo sobre un pulso base
  // de 1,2 s (el abanico redibuja cada 0,6 s y hoy late cada 2,4 s). Quieto
  // con reduced-motion y en pausa cuando no se ve.
  const [pulse, setPulse] = useState(null);   // { i, n }
  const pulseN = useRef(0);                   // número de impulso (reinicia la animación)
  const tapT = useRef(null);
  useEffect(() => () => clearTimeout(tapT.current), []);
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
    const measure = () => {
      const top = el.getBoundingClientRect().top, panel = el.closest(".bl-swipe-panel");
      if (top < 0 || top > window.innerHeight) return;
      const pb = panel ? parseFloat(getComputedStyle(panel).paddingBottom) || 0 : 0, mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
      setFit(Math.round(window.innerHeight - top - pb - mb));
    };
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      setSize((p) => (p.w === w && Math.abs(p.h - h) < 1 ? p : { w, h }));
      measure();
    });
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
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
    let visible = true, last = -1, t1, t2, t3;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    if (stageRef.current) io.observe(stageRef.current);
    const fire = () => {
      if (visible && !document.hidden && (mobile || !busy.current)) { // en táctil no hay "explorando"
        let i; do i = Math.floor(Math.random() * NODES.length); while (i === last);
        last = i;
        setPulse({ i, n: ++pulseN.current });
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
      noticias: { v: <>{news.length} {t("curve.today")}</>, rows: news.slice(0, 3).map((n) => [(locale === "es" && n.titleEs) || n.title, ""]), titles: true },
      eventos: { v: d.events ? <>{upcoming.length} {t("doors.upcoming")}</> : null, rows: upcoming.slice(0, 2).map((e) => [e.title, fmtDay(e.date, locale)]) },
      predicciones: { v: d.predictions ? (preds.length ? <>{preds.length} {t("doors.markets")}</> : "—") : null, rows: [[t("curve.openMarkets"), preds.length ? preds.length : t("doors.noMarkets")]] },
    };
  }, [d, cyc, news, t, locale]);

  const geo = useMemo(() => {
    // Mobile no espera al alto del contenedor: el alto lo pone la curva (a lo que queda de pantalla).
    if (!H.length || !size.w || (size.w > 768 && !size.h)) return null;
    const W = size.w;
    const TODAY = T(H[H.length - 1].t);
    const nextHalving = cyc?.keyDates?.nextHalving ? T(cyc.keyDates.nextHalving.slice(0, 7)) : TODAY + 1.6;
    const END = nextHalving + 0.1;
    // Puntos parejos entre SPREAD_FROM y hoy − gap (desktop: de izquierda a derecha).
    const spread = (gap) => NODES.map((_, i) => SPREAD_FROM + (i * (TODAY - gap - SPREAD_FROM)) / (NODES.length - 1));
    const last = H[H.length - 1].p;
    const priceAt = (tt) => { if (tt >= TODAY) return last; let b = H[0]; for (const h of H) if (Math.abs(T(h.t) - tt) < Math.abs(T(b.t) - tt)) b = h; return b.p; };
    const draw = (pts) => ({
      pts,
      path: "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L"),
      len: pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0),
    });

    if (mobile) {
      // Botánico (oct 2026, Pablo: "G+"): la curva es un tronco al centro, el
      // abanico del futuro es la copa (arriba, halving → hoy) y el pasado baja
      // hasta 2012. Los nombres se alternan a los dos lados, en columnas contra
      // el tronco; cada uno alumbra hacia su punto con un haz horizontal (recto,
      // como el tick del subte: no puede cruzar el tronco). Abajo, la historia anterior a 2012 sigue el tronco hasta el
      // pie y se funde: la curva viene de algún lado, no flota.
      // En pantallas bajas (≤ 700 px) las ramas se juntan hasta 38 px y el abanico
      // conserva 80: entra sin desplazar desde ~640 px de alto (antes, un mínimo
      // fijo de 460 hacía sobrar 20–90 px).
      const ROW_MIN = 38, FAN_MIN = 80;
      const Hfit = Math.max(VT + VB + 7 * ROW_MIN + FAN_MIN, Math.min(VT + VFAN + 7 * VROW + VB, fit || 692));
      const row = Math.max(ROW_MIN, Math.min(VROW, (VROW * (Hfit - VT - VB)) / (VFAN + 7 * VROW))), fan = Math.max(FAN_MIN, Hfit - VT - VB - 7 * row);
      // De arriba (cerca de hoy) hacia abajo, en el mismo orden de uso.
      const times = spread(1.2).reverse();
      const T0 = SPREAD_FROM, yToday = VT + fan, yBot = yToday + 7 * row, Hh = yBot + VB;
      const Yt = (tt) => (tt >= TODAY ? yToday - ((tt - TODAY) / (nextHalving - TODAY)) * (yToday - VT) : yToday + ((TODAY - tt) / (TODAY - T0)) * (yBot - yToday));
      const lc = Math.log10(V_CEIL) - 2, x0 = Math.round(W / 2 - 34), x1 = Math.round(W / 2 + 46);
      const Xp = (p) => x0 + ((Math.log10(Math.max(p, 100)) - 2) / lc) * (x1 - x0);
      const step = Yt(times[1]) - Yt(times[0]);
      const nodes = NODES.map((n, i) => {
        const cx = Xp(priceAt(times[i])), cy = Yt(times[i]), left = i % 2 === 1, ex = left ? x0 - 22 : x1 + 22, s = left ? -1 : 1;
        const fade = Math.min(Math.abs(ex - cx) - 14, HAZ_FADE);
        return { ...n, tt: times[i], cx, cy, lx: ex + s * 8, anchor: left ? "end" : "start", ly: cy,
          branch: `M${(cx + s * 7).toFixed(1)},${cy.toFixed(1)}H${ex}`, haz: { x1: ex, y1: cy, x2: ex - s * fade, y2: cy } };
      });
      // El tronco arranca en el pie y sube por toda la serie (desde 2012-01) hasta hoy.
      const trunk = H.map((h) => [Xp(h.p), Yt(T(h.t))]);
      trunk.unshift([trunk[0][0], Hh]);
      return { V: true, W, Hh, row: Math.max(44, step), x0, Xp, Yt, pxDec: (x1 - x0) / lc, last, nextHalving, TODAY, yBot, ...draw(trunk), xt: Xp(last), yt: yToday, nodes };
    }

    // Desktop: el pasado en tiempo real (2012 → hoy) y el futuro como LUPA
    // (Pablo, 30-sep: que el abanico gane lugar): de hoy al halving ocupa el
    // FUT_SHARE del ancho, en su propia escala, marcada por los años
    // del eje — como la lupa ×4 del precio (sin franja de
    // fondo: dejaba una costura de dos tonos en hoy). Riel de títulos arriba.
    const Hh = size.h, L = 76, R = 60, TOP = 170, BOT = 46, RAIL = 26;   // L: que entre "$100.000" entero
    const span = W - L - R, xNow = L + span * (1 - FUT_SHARE);
    const X = (tt) => (tt <= TODAY ? L + ((tt - 2012) / (TODAY - 2012)) * (xNow - L) : xNow + ((tt - TODAY) / (END - TODAY)) * (W - R - xNow));
    const Y = (p) => TOP + (1 - Math.log10(Math.max(p, 1)) / Math.log10(250000)) * (Hh - TOP - BOT);
    // El riel termina en hoy: el cielo del futuro queda libre para el abanico.
    // En pantallas angostas entra lo justo sobre el futuro (títulos a ≥96 px).
    const gapx = Math.max(96, (xNow - L - 100) / (NODES.length - 1)), fs = gapx < 110 ? 13 : 14; // dos niveles: nombre 13–14, dato 11
    const times = spread(SPREAD_GAP);
    // Haz: los nombres en una fila alta, cada uno en bandera junto a su haz.
    // Si no entra antes del haz siguiente, pasa a la izquierda (si ese cielo
    // está libre) o baja una línea. Anchos medidos con la fuente de la página.
    const cv = document.createElement("canvas").getContext("2d");
    cv.font = `620 ${fs}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-sans") || "sans-serif"}`;
    const GAP = 7;
    const nodes = NODES.map((n, i) => {
      const tt = times[i], cx = X(tt), cy = Y(priceAt(tt)), w = Math.max(70, cv.measureText(t(SECTION_LABEL[n.key])).width);
      return { ...n, tt, cx, cy, w, fs, seg: draw(H.filter((h) => Math.abs(T(h.t) - tt) <= TRAMO_WIN).map((h) => [X(T(h.t)), Y(h.p)])).path };
    });
    nodes.forEach((n, i) => {
      const next = nodes[i + 1], prev = nodes[i - 1];
      const prevR = prev ? (prev.anchor === "end" ? prev.kx : prev.kx + prev.w) + 12 : -Infinity;
      let flip = false;
      n.ly = RAIL;
      if (next && n.cx + GAP + n.w > next.cx - 10) {
        if (n.cx - GAP - n.w > prevR && prev?.ly !== RAIL + 44) flip = true; else n.ly = RAIL + 44;
      }
      const top = n.ly + 12 - fs * 0.72;
      n.anchor = flip ? "end" : "start"; n.kx = flip ? n.cx - GAP : n.cx + GAP;
      n.bx = flip ? n.kx - n.w - 4 : n.kx - 4;
      n.branch = `M${n.cx.toFixed(1)},${(n.cy - 6).toFixed(1)}V${top.toFixed(1)}`;
      n.haz = { x1: 0, y1: top, x2: 0, y2: top + Math.min(n.cy - 6 - top - 16, HAZ_FADE) };
    });
    const pxDec = (Hh - TOP - BOT) / Math.log10(250000);
    // Ficha de la sección (oct 2026, Pablo): vive ADENTRO de la curva, en el
    // hueco más grande entre la línea y el eje, sin caja: el interior de la
    // curva se ilumina y es el fondo. Sin lugar suficiente, vuelve a flotar.
    const floor = Hh - BOT - 10, pts = H.map((h) => [X(T(h.t)), Y(h.p)]);
    let dock = null;
    for (let a = 0; a < pts.length; a++) {
      let top = 0;
      for (let b = a; b < pts.length; b++) {
        top = Math.max(top, pts[b][1]);
        const w = pts[b][0] - pts[a][0] - 36, h = floor - top - 26;
        if (w >= 340 && h >= 76 && (!dock || w * Math.min(h, 340) > dock.w * Math.min(dock.h, 340))) dock = { a, b, x: pts[a][0] + 18, y: top + 26, w: Math.min(w, 560), h };
      }
    }
    // Hueco bajo (pantallas de ~650 px): la ficha mínima, solo "Entrar".
    if (dock) { dock.x += (pts[dock.b][0] - pts[dock.a][0] - 36 - dock.w) / 2; dock.mini = dock.h < MINI_H; }
    return { W, Hh, L, R, TOP, BOT, RAIL, gapx, X, Y, TODAY, pxDec, last, nextHalving, ...draw(pts), xt: X(TODAY), yt: Y(last), nodes, dock };
  }, [H, size, fit, mobile, cyc, d.prices, t]); // eslint-disable-line react-hooks/exhaustive-deps

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
        clip: { x: 8, y: yEnd + 14, w: geo.W - 16, h: geo.yt - yEnd - 14 }, // con aire arriba
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

  // La curva tal como va a estar en pantalla, para la transición entre mundos
  // (de 2012 a hoy; en mobile, de arriba hacia abajo como se lee).
  useEffect(() => registerShape("layer", () => {
    const path = stageRef.current?.querySelector(".blc-curve"), m = path?.getScreenCTM();
    const L = path?.getTotalLength();
    if (!L || !m) return null;
    const pts = Array.from({ length: 240 }, (_, i) => { const p = path.getPointAtLength((L * i) / 239), q = new DOMPoint(p.x, p.y).matrixTransform(m); return [q.x, q.y, 0]; });
    return pts[0][1] > pts[pts.length - 1][1] + 40 ? pts.reverse() : pts;
  }), []);

  const name = (k) => t(SECTION_LABEL[k]);
  // Mobile: el toque se ve viajar de la curva al nombre y recién ahí entra.
  const enterV = (i) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return onEnter(NODES[i].key);
    setSel(i); setPulse({ i, n: ++pulseN.current });
    clearTimeout(tapT.current);
    tapT.current = setTimeout(() => onEnter(NODES[i].key), TAP_MS);
  };
  const show = (i) => { clearTimeout(hideT.current); shownAt.current = Date.now(); setSel(i); };

  // Vista previa (hover de desktop): qué hay en la sección y su dato vivo.
  const selNodeP = sel != null && geo ? geo.nodes[sel] : null;
  const dock = geo?.dock;
  // Luz del interior de la curva bajo la ficha: una elipse centrada en ella
  // que se apaga antes de hoy (ahí termina el área: quedaría un corte vertical).
  const glow = selNodeP && dock && !geo.V ? (() => {
    const cx = dock.x + dock.w / 2, cy = dock.y + Math.min(dock.h, 300) * 0.35;
    const rx = Math.min(dock.w * 0.8, geo.xt - cx - 6), ry = Math.max(80, geo.Hh - geo.BOT - cy);
    // La grilla se esconde en toda la ficha y reaparece suave en sus bordes.
    const my = dock.y + dock.h / 2, mrx = dock.w * 0.72 + 60, mry = Math.max(160, dock.h * 0.8 + 60);
    const tfm = (x, y, k) => `translate(${x} ${y}) scale(1 ${k}) translate(${-x} ${-y})`;
    // Con poco alto para apagarse, la luz es más tenue: si no, se leen escalones.
    return { cx, cy, rx, ry, k: Math.min(1, ry / 220), tf: tfm(cx, cy, ry / rx), my, mrx, mtf: tfm(cx, my, mry / mrx) };
  })() : null;
  // Filas de la ficha: las que entran en el hueco.
  const rows = selNodeP ? content[selNodeP.key].rows.slice(0, dock ? Math.max(0, Math.floor((dock.h - MINI_H) / ROW_H)) : undefined) : [];
  const preview = selNodeP && (
    <div
      className={`blc-pv${dock ? " is-dock" : ""}${dock?.mini ? " is-mini" : ""}`}
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
        {/* Adentro de la curva el nombre ya está encendido en su bandera: la ficha no lo repite. */}
        {!dock && <h3>{name(selNodeP.key)}</h3>}
        <p className="desc">{t(`curve.${selNodeP.key}.desc`)}</p>
      </div>
      <div className="pv-b">
        {/* Adentro de la curva el dato ya está en la bandera: la ficha suma lo que hay adentro. */}
        {!dock && <div className="big">{content[selNodeP.key].v ?? "—"}</div>}
        {rows.length > 0 && (
          <div className="rows">
            {rows.map(([a, b], j) => (
              <div key={j} className={`r${content[selNodeP.key].titles ? " t" : ""}`}><span>{a}</span><span>{b}</span></div>
            ))}
          </div>
        )}
      </div>
      <div className="pv-c">
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
        {/* El tronco se enciende hacia hoy y, bajo 2012, se funde en el pie. */}
        <linearGradient id="blc-cgv" gradientUnits="userSpaceOnUse" x1="0" y1={geo.Hh} x2="0" y2={geo.yt}>
          <stop offset="0" stopColor="#2f5a63" stopOpacity="0" />
          <stop offset={(geo.Hh - geo.yBot) / (geo.Hh - geo.yt)} stopColor="#2f5a63" />
          <stop offset=".6" stopColor="#6CB8C8" /><stop offset="1" stopColor="#bfe8f0" />
        </linearGradient>
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
      <path className="blc-curve" d={geo.path} style={{ strokeDasharray: geo.len, strokeDashoffset: geo.len }} />
      <Now x={geo.xt} y={geo.yt} r={[6, 9, 4.5, 1.7]} />
      {geo.nodes.map((n, i) => {
        const label = name(n.key);
        return (
          <g
            key={n.key}
            className={`blc-node${sel === i ? " is-on" : ""}${lit === i ? " is-lit" : ""}`}
            style={{ animationDelay: `${2.1 + i * 0.1}s` }}
            tabIndex={0}
            role="button"
            aria-label={`${label}. ${t(`curve.${n.key}.desc`)}`}
            onClick={(e) => { e.stopPropagation(); enterV(i); }}
            onKeyDown={(e) => e.key === "Enter" && enterV(i)}
          >
            <rect className="blc-hit" x="0" y={n.ly - geo.row / 2} width={geo.W} height={geo.row} />
            <Branch id={`blc-hz${i}`} d={n.branch} haz={n.haz} pulse={pulse?.i === i && pulse.n} />
            <circle className="blc-halo" cx={n.cx} cy={n.cy} r="9" />
            <circle className="blc-dot" cx={n.cx} cy={n.cy} r="4.5" />
            <circle className="blc-core" cx={n.cx} cy={n.cy} r="1.7" />
            <text className="blc-ttl" x={n.lx} y={n.ly + 7} textAnchor={n.anchor}>{label}</text>
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
        className={`blc-stage${geo ? " is-ready" : ""}${sel != null ? " has-sel" : ""}`}
        style={{ "--tap": `${TAP_MS}ms`, ...(geo?.V ? { height: geo.Hh } : null) }}
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
              {/* El tramo encendido: pleno en el punto, fundido hacia las dos puntas. */}
              <linearGradient id="blc-sg">{SEG_FADE.map(([o, v]) => <stop key={o} offset={o} style={{ stopColor: "var(--blc-light)" }} stopOpacity={v} />)}</linearGradient>
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
              {/* Bajo la luz de la ficha las líneas de la grilla se disuelven. */}
              <defs>
                {glow && (<>
                  <radialGradient id="blc-ing" gradientUnits="userSpaceOnUse" cx={glow.cx} cy={glow.cy} r={glow.rx} gradientTransform={glow.tf}>
                    {INNER_GLOW.map(([o, v]) => <stop key={o} offset={o} stopColor="#6CB8C8" stopOpacity={v} />)}
                  </radialGradient>
                  <radialGradient id="blc-gmg" gradientUnits="userSpaceOnUse" cx={glow.cx} cy={glow.my} r={glow.mrx} gradientTransform={glow.mtf}>
                    {GRID_HIDE.map(([o, v]) => <stop key={o} offset={o} stopColor="#000" stopOpacity={v} />)}
                  </radialGradient>
                </>)}
                {/* Las líneas de la grilla no cruzan los nombres (que ahora bajan al gráfico). */}
                <mask id="blc-gm" maskUnits="userSpaceOnUse" x="0" y="0" width={geo.W} height={geo.Hh}>
                  <rect x="0" y="0" width={geo.W} height={geo.Hh} fill="#fff" />
                  {glow && <rect x="0" y="0" width={geo.W} height={geo.Hh} fill="url(#blc-gmg)" />}
                  {geo.nodes.map((n) => <rect key={n.key} x={n.bx - 4} y={n.ly - 10} width={n.w + 16} height="62" rx="8" fill="#000" />)}
                </mask>
              </defs>
              <g mask="url(#blc-gm)">
                {[10, 1000, 100000].map((p) => <line key={p} x1={geo.L} x2={geo.W - geo.R} y1={geo.Y(p)} y2={geo.Y(p)} />)}
              </g>
              {[10, 1000, 100000].map((p) => (
                <g key={p}><text x={geo.L - 8} y={geo.Y(p) + 3} textAnchor="end">{fmtUsd(p, locale)}</text></g>
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
            {/* Con la ficha abierta se ilumina el interior de la curva que la
                aloja: una luz elíptica centrada en la ficha que se apaga con
                curva suave (sin bordes ni bandas) y que solo corta la curva. */}
            {glow && (
              <g className="blc-inner" key="inner">
                <defs><clipPath id="blc-inc"><path d={`${geo.path}L${geo.xt},${geo.Hh - geo.BOT}L${geo.pts[0][0]},${geo.Hh - geo.BOT}Z`} /></clipPath></defs>
                <rect clipPath="url(#blc-inc)" opacity={glow.k} x={glow.cx - glow.rx} y={glow.cy - glow.ry} width={glow.rx * 2} height={glow.ry * 2} fill="url(#blc-ing)" />
              </g>
            )}
            <Now x={geo.xt} y={geo.yt} r={[8, 17, 7.5, 2.6]} />
            {geo.nodes.map((n, i) => {
              const c = content[n.key];
              const label = name(n.key);
              return (
                <g
                  key={n.key}
                  className={`blc-node${sel === i ? " is-on" : ""}${lit === i ? " is-lit" : ""}`}
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
                  <path className="blc-seg" d={n.seg} stroke="url(#blc-sg)" />
                  <Branch id={`blc-hz${i}`} d={n.branch} haz={n.haz} pulse={pulse?.i === i && pulse.n} />
                  <circle className="blc-halo" cx={n.cx} cy={n.cy} r="17" />
                  <circle className="blc-dot" cx={n.cx} cy={n.cy} r="7.5" />
                  <circle className="blc-core" cx={n.cx} cy={n.cy} r="2.6" />
                  {/* Nombre + dato vivo, en bandera junto a su haz (el dato en gris). */}
                  <rect className="blc-rail-hit" x={n.bx} y={n.ly - 6} width={n.w + 8} height="58" />
                  <text className="blc-rn" x={n.kx} y={n.ly + 12} textAnchor={n.anchor} style={{ fontSize: n.fs }}>{label}</text>
                  <foreignObject x={n.anchor === "end" ? n.kx - 140 : n.kx} y={n.ly + 18} width="140" height="18"><div className={`blc-rv${n.anchor === "end" ? " is-end" : ""}`}>{c.v ?? " "}</div></foreignObject>
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

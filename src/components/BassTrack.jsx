import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { api, shared } from "../utils/api";

// Portada de Bass (sept 2026, Pablo): el índice como un track. Lo que la curva
// de análisis técnico es para Layer (el instrumento de su público), la forma
// de onda lo es para Bass. La portada es solo eso: el tema y sus secciones.
// El tema son tres clips, como en el arreglo de Ableton o Rekordbox, y cada
// sección es la cabecera de su clip — el link ES su pedazo de onda:
//   A Noticias   — lo que ya sonó: las notas de las últimas 24 h, por hora (atenuado).
//   B Agenda     — desde el cabezal (AHORA): las fiestas de los próximos 30 días.
//   C Festivales — el cierre: los festivales de los próximos 6 meses.
// Desktop: los clips en fila, a lo ancho y alto de la pantalla. Mobile: tres
// pistas apiladas, cada onda de izquierda a derecha.
// Cada clip se dibuja con sus datos reales, comprimido como un master (sus
// altos y bajos, ver envelope), sobre un piso de señal. La textura es textura.
// Suena (canvas): 124 BPM tocados por una persona — golpes con su fuerza (el
// 1 del compás acentuado), ataque suave, caída larga, viajando desde el
// cabezal; encima una ondulación continua. Al ponerse sobre un link, el resto
// del tema FRENA como una bandeja sin motor (desacelera hasta quedar quieto y
// se apaga) y su clip pasa a PREESCUCHA: un cabezal lo recorre y enciende las
// barras a su paso. En mobile (sin hover) el loop hace lo mismo por turnos.

const BEAT = 60 / 124;                        // s por golpe: 124 BPM, tempo de club
const CUE_BEATS = 8;                          // mobile: golpes por clip en el loop
const SCAN_BEATS = 8;                         // preescucha: el cabezal cruza el clip en 2 compases
const FLOW = 0.45;                            // clips/s: cómo viaja el golpe desde el cabezal
const NEWS_BINS = 24, NEWS_H = 1;             // Noticias: 24 h en tramos de 1 h (el feed cubre ~1 día)
const AGENDA_DAYS = 30;                       // Agenda: un tramo por día
const FEST_WEEKS = 26;                        // Festivales: un tramo por semana

const minsAgo = (t) => { const m = /^(\d+)\s*([mhdw])/.exec(t || ""); return m ? Number(m[1]) * { m: 1, h: 60, d: 1440, w: 10080 }[m[2]] : null; };

// Textura determinística (0..1): transientes barra a barra sobre un pulso más
// lento (cada 3 barras), como el detalle de una forma de onda real.
const hash = (k) => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const grain = (i) => 0.65 * hash(i) + 0.35 * hash(Math.floor(i / 3) + 999);

// Envolvente continua de un clip: sus tramos suavizados (gaussiana de 0,9
// tramo) y normalizados como un compresor: cada tramo contra el más fuerte de
// sus ±7 vecinos (piso: 35 % del pico del clip). Así una noche enorme no
// aplasta al resto y cada semana conserva sus altos y bajos.
function envelope(bins) {
  const n = bins.length;
  const sm = bins.map((_, i) => { let s = 0, w = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { const g = Math.exp(-(((i - j) / 0.9) ** 2)); s += bins[j] * g; w += g; } return s / w; });
  const max = Math.max(1e-6, ...sm);
  const norm = sm.map((v, i) => v / Math.max(0.35 * max, ...sm.slice(Math.max(0, i - 7), i + 8)));
  return (t) => { const p = Math.max(0, Math.min(n - 1, t * n - 0.5)), a = Math.floor(p), b = Math.min(n - 1, a + 1), f = p - a; return norm[a] * (1 - f) + norm[b] * f; };
}

// Un golpe tocado: ataque de 50 ms y caída exponencial; fuerza humana (0,72–1)
// y el 1 de cada compás acentuado.
function hit(ph) {
  const n = Math.floor(ph), f = ph - n;
  const vel = (0.72 + 0.28 * hash(n * 7.13)) * ((((n % 4) + 4) % 4) === 0 ? 1.18 : 1);
  const a = 0.05 / BEAT;
  return vel * (f < a ? f / a : Math.exp(-(f - a) * 3.6));
}

export function BassTrack({ events, today, onCue }) {
  const { t, locale } = useLocale();
  const M = MONTHS_ABBR[locale] || MONTHS_ABBR.es;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(0);
  const [avail, setAvail] = useState(0);      // desktop: alto de pantalla disponible desde el track
  const [news, setNews] = useState([]);
  const [fests, setFests] = useState([]);
  const [hot, setHot] = useState(null);       // clip bajo el mouse o con foco
  const [live, setLive] = useState(false);    // en pantalla: suena (fuera, no gasta)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => { const top = el.getBoundingClientRect().top; if (top >= 0 && top < window.innerHeight) setAvail(Math.round(window.innerHeight - top)); };
    const ro = new ResizeObserver(([e]) => { setW(Math.round(e.contentRect.width)); measure(); });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting));
    io.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); io.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  useEffect(() => {
    let on = true;
    shared("bassNews", api.bassNews).then((d) => on && setNews(Array.isArray(d) ? d : [])).catch(() => {});
    shared("festivals", () => api.festivals()).then((d) => on && setFests(Array.isArray(d) ? d : [])).catch(() => {});
    return () => { on = false; };
  }, []);

  // Los tres clips: sus tramos (datos reales) y su cabecera.
  const data = useMemo(() => {
    const off = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 864e5);
    const day = (d) => `${d.getDate()} ${locale === "es" ? M[d.getMonth()].toLowerCase() : M[d.getMonth()]}`;

    const newsBins = Array(NEWS_BINS).fill(0);
    let lastDay = 0;
    for (const n of news) {
      const m = minsAgo(n.time);
      if (m == null) continue;
      const o = Math.floor(m / 60 / NEWS_H);
      if (o < NEWS_BINS) newsBins[NEWS_BINS - 1 - o]++;
      if (m < 1440) lastDay++;
    }

    const agendaBins = Array(AGENDA_DAYS).fill(0);
    let upcoming = 0, todayN = 0;
    for (const ev of events) {
      const d = getEventDate(ev);
      if (!d) continue;
      const o = off(d);
      if (o < 0) continue;
      upcoming++;
      if (o === 0) todayN++;
      if (o < AGENDA_DAYS) agendaBins[o] += 1 + Math.min(1, (ev.artists?.length || 0) / 4);
    }

    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const next = fests.filter((f) => (f.dates_start || "") >= todayISO).sort((a, b) => a.dates_start.localeCompare(b.dates_start));
    const festBins = Array(FEST_WEEKS).fill(0);
    for (const f of next) {
      const wk = Math.floor(off(new Date(`${f.dates_start}T12:00:00`)) / 7);
      if (wk < FEST_WEEKS) festBins[wk] += f.country === "Argentina" ? 2 : 1;
    }
    const fest = next.find((f) => f.country === "Argentina") || next[0];
    const festSub = fest ? `${fest.name.replace(/\s+Buenos Aires$/i, " BA")} · ${day(new Date(`${fest.dates_start}T12:00:00`))}` : "";

    return [
      { k: "news", letter: "A", env: envelope(newsBins), name: t("section.news"), sub: news.length ? t("track.newsSub", { n: lastDay }) : "", span: t("track.spanNews") },
      { k: "agenda", letter: "B", env: envelope(agendaBins), name: t("track.agenda"), sub: t("track.agendaSub", { today: todayN, n: upcoming }), span: t("track.spanAgenda") },
      { k: "fests", letter: "C", env: envelope(festBins), name: t("section.festivals"), sub: festSub, span: t("track.spanFests") },
    ];
  }, [events, news, fests, today, t, M, locale]);

  const mobile = w > 0 && w <= 768;
  // Geometría de los clips: cada uno es un rectángulo con cabecera, onda (en
  // `mid`, media amplitud `amp`) y pie. Desktop en fila; mobile apilados.
  const geo = useMemo(() => {
    if (!w) return null;
    const GAP = mobile ? 14 : 12, HEAD = mobile ? 40 : 46, FOOT = mobile ? 26 : 32;
    const H = mobile ? 600 : Math.round(Math.max(420, Math.min(720, (avail || 720) - 24)));
    const clips = data.map((p, j) => {
      const cw = mobile ? w : (w - 2 * GAP) / 3, ch = mobile ? (H - 2 * GAP) / 3 : H;
      const x = mobile ? 0 : j * (cw + GAP), y = mobile ? j * (ch + GAP) : 0;
      const top = y + HEAD + 8, bot = y + ch - FOOT;
      return { ...p, j, x, y, cw, ch, mid: (top + bot) / 2, amp: (bot - top) / 2 - 2, pad: mobile ? 12 : 16 };
    });
    const bars = [];
    let i = 0;
    for (const c of clips) {
      const x0 = c.x + c.pad, x1 = c.x + c.cw - c.pad, step = mobile ? 2.6 : 3;
      for (let px = x0; px <= x1; px += step, i++) {
        const f = (px - x0) / (x1 - x0), e = 0.16 + 0.84 * c.env(f);   // piso de señal + datos
        bars.push({ j: c.j, f, px, e, h: 1 + e * c.amp * (0.35 + 0.65 * grain(i)) });
      }
    }
    return { H, HEAD, FOOT, clips, bars, lw: mobile ? 1.5 : 1.8 };
  }, [w, mobile, avail, data]);

  // Loop de clips en mobile: solo con el track en pantalla y sin "reducir movimiento".
  const [auto, setAuto] = useState(0);
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loop = mobile && live && !still;
  useEffect(() => {
    if (!loop) return undefined;
    const id = setInterval(() => setAuto((n) => n + 1), BEAT * CUE_BEATS * 1000);
    return () => clearInterval(id);
  }, [loop]);
  const solo = hot || (loop ? data[auto % data.length].k : null);
  const soloIdx = data.findIndex((p) => p.k === solo);
  const soloRef = useRef(-1);
  soloRef.current = soloIdx;
  // Estado del motor entre cuadros: tiempo propio y velocidad de cada clip
  // (la bandeja que frena), brillo, y cuándo arrancó la preescucha.
  const motor = useRef({ time: [0, 0, 0], rate: [1, 1, 1], alpha: [0.42, 0.9, 0.9], scanFrom: 0, scanIdx: -1, last: 0 });

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !geo) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = w, H = geo.H;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    const css = getComputedStyle(cv);
    const color = css.getPropertyValue("--bl-accent-bass").trim() || "#c8956c";
    const ink = css.getPropertyValue("--bl-text").trim() || "#f1ece4";
    const S = motor.current;
    let raf = 0;
    const frame = (now) => {
      const dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 0;
      S.last = now;
      const s = soloRef.current;
      if (s !== S.scanIdx) { S.scanIdx = s; S.scanFrom = now; }
      for (let j = 0; j < 3; j++) {
        // Freno de bandeja: los clips que no están en solo desaceleran hasta 0.
        const rateT = s < 0 || j === s ? 1 : 0;
        S.rate[j] += (rateT - S.rate[j]) * (still ? 1 : rateT ? 0.08 : 0.045);
        S.time[j] += dt * S.rate[j];
        const aT = s < 0 ? (j === 0 ? 0.42 : 0.9) : j === s ? 1 : 0.22;
        S.alpha[j] += (aT - S.alpha[j]) * (still ? 1 : 0.07);
      }
      const scan = s >= 0 && !still ? (((now - S.scanFrom) / 1000) / (BEAT * SCAN_BEATS)) % 1 : -1;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = geo.lw;
      for (let j = 0; j < 3; j++) {
        const c = geo.clips[j], tt = still ? 0 : S.time[j], scanning = j === s && scan >= 0;
        // En preescucha, dos pasadas: lo que ya cruzó el cabezal, encendido; lo que falta, a media luz.
        for (const lit of scanning ? [true, false] : [null]) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = lit === false ? S.alpha[j] * 0.45 : S.alpha[j];
          ctx.beginPath();
          for (const b of geo.bars) {
            if (b.j !== j || (lit === true && b.f > scan) || (lit === false && b.f <= scan)) continue;
            let m = 1 + 0.07 * Math.sin(tt * 2.1 - b.px * 0.019) + 0.045 * Math.sin(tt * 3.4 + b.px * 0.031) + 0.04 * Math.sin(tt * 0.55 + (j + b.f) * 1.7);
            const dist = j + b.f - 1;     // en clips, desde el cabezal (comienzo de la Agenda)
            if (dist >= 0 && !still) m += 0.3 * (0.4 + 0.6 * b.e) * Math.exp(-dist / 1.2) * hit((tt - dist / FLOW) / BEAT) * S.rate[j];
            if (scanning) m += 0.45 * Math.exp(-((((b.f - scan) * c.cw) / 16) ** 2));
            const h = Math.min(c.amp + 6, b.h * m);
            ctx.moveTo(b.px, c.mid - h); ctx.lineTo(b.px, c.mid + h);
          }
          ctx.stroke();
        }
        if (scanning) {
          const x = c.x + c.pad + scan * (c.cw - 2 * c.pad);
          ctx.globalAlpha = 0.9; ctx.strokeStyle = ink; ctx.lineWidth = 1.25;
          ctx.beginPath(); ctx.moveTo(x, c.mid - c.amp - 4); ctx.lineTo(x, c.mid + c.amp + 4); ctx.stroke();
          ctx.lineWidth = geo.lw;
        }
      }
      ctx.globalAlpha = 1;
      if (!still && live) raf = requestAnimationFrame(frame);
      else S.last = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, w, live, still, still ? soloIdx : 0]); // eslint-disable-line react-hooks/exhaustive-deps -- quieto: redibuja el solo

  const clipProps = (c) => ({
    className: `btk-cue${solo === c.k ? " is-hot" : ""}${hot && hot !== c.k ? " is-off" : ""}`, role: "button", tabIndex: 0,
    onMouseEnter: () => setHot(c.k), onMouseLeave: () => setHot(null),
    onFocus: () => setHot(c.k), onBlur: () => setHot(null),
    "aria-label": c.sub ? `${c.name}: ${c.sub}` : c.name,
    onClick: () => onCue(c.k),
    onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onCue(c.k)),
  });

  return (
    <section className={`bl-btrack${live ? " is-live" : ""}${mobile ? " is-lanes" : ""}`} data-solo={solo || ""} aria-label={t("track.aria")} ref={wrapRef}>
      <h2 className="bl-sr-only">{t("track.title")}</h2>
      {geo && (
        <div className="btk-stage" style={{ height: geo.H }}>
          <canvas ref={canvasRef} className="btk-canvas" style={{ width: w, height: geo.H }} data-live={live && !still ? "1" : "0"} aria-hidden="true" />
          <svg viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
            {geo.clips.map((c) => (
              <g key={c.k} {...clipProps(c)}>
                <rect className="btk-clip" x={c.x + 0.5} y={c.y + 0.5} width={c.cw - 1} height={c.ch - 1} rx="5" />
                <path className="btk-head" d={`M${c.x + 0.5},${c.y + geo.HEAD} V${c.y + 5.5} a5,5 0 0 1 5,-5 H${c.x + c.cw - 5.5} a5,5 0 0 1 5,5 V${c.y + geo.HEAD} Z`} />
                <rect className="btk-pad" x={c.x + c.pad} y={c.y + (geo.HEAD - 22) / 2} width="22" height="22" rx="3" />
                <text className="btk-letter" x={c.x + c.pad + 11} y={c.y + geo.HEAD / 2 + 4.5} textAnchor="middle">{c.letter}</text>
                <text className="btk-name" x={c.x + c.pad + 32} y={c.y + geo.HEAD / 2 + (mobile ? 6 : 7)}>{c.name}</text>
                <text className="btk-sub" x={c.x + c.cw - c.pad} y={c.y + geo.HEAD / 2 + 4} textAnchor="end">{c.sub}</text>
                <text className="btk-span" x={c.x + c.pad} y={c.y + c.ch - (geo.FOOT - 12) / 2 - 2}>
                  {c.k === "agenda" && <tspan className="btk-nowl">{t("track.now")}{"  ·  "}</tspan>}{c.span}
                </text>
                {c.k === "agenda" && <line className="btk-now" x1={c.x + c.pad} x2={c.x + c.pad} y1={c.mid - c.amp - 4} y2={c.mid + c.amp + 4} />}
              </g>
            ))}
          </svg>
        </div>
      )}
    </section>
  );
}

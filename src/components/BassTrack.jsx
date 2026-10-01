import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { api, shared } from "../utils/api";
import { BlThumb } from "./BlThumb";

// Portada de Bass (sept 2026, Pablo): el índice como un track. Lo que la curva
// de análisis técnico es para Layer (el instrumento de su público), la forma
// de onda del CDJ lo es para Bass. El tema tiene tres partes iguales y cada
// sección es el hot cue que marca dónde empieza la suya, como un DJ marca la
// intro, el drop y el cierre:
//   Noticias   — lo que ya sonó: las notas de las últimas 24 h, por hora (atenuado).
//   Agenda     — desde el cabezal (AHORA): las fiestas de los próximos 30 días.
//   Festivales — el cierre: los festivales de los próximos 6 meses.
// Cada parte se dibuja con sus datos reales, comprimida como un master (sus
// altos y bajos, ver envelope), sobre un piso de señal: un tema nunca está en
// silencio. La textura de las barras es solo textura.
// Suena (canvas, cuadro a cuadro): 124 BPM tocados por una persona, no por una
// caja de ritmos — cada golpe con su fuerza (el 1 del compás acentuado), ataque
// suave y caída larga, viajando desde el cabezal; encima, una ondulación
// continua que corre por la onda como agua. Lo ya reproducido solo respira.
// Desktop: la onda ocupa la pantalla y abajo va el display del equipo,
// "Sonando": lo que hay en la parte activa (por defecto la Agenda; pasar por
// un cue la cambia), alineado a la grilla de las tres partes. Mobile: vertical,
// y el solo recorre las partes en loop, una cada 8 golpes.

const BEAT = 60 / 124;                        // s por golpe: 124 BPM, tempo de club
const CUE_BEATS = 8;                          // mobile: golpes por cue en el loop
const SPEED = 700;                            // px/s: cómo viaja el golpe desde el cabezal
const NEWS_BINS = 24, NEWS_H = 1;             // Noticias: 24 h en tramos de 1 h (el feed cubre ~1 día)
const AGENDA_DAYS = 30;                       // Agenda: un tramo por día
const FEST_WEEKS = 26;                        // Festivales: un tramo por semana
const DECK_H = 236;                           // desktop: alto del display "Sonando"

const minsAgo = (t) => { const m = /^(\d+)\s*([mhdw])/.exec(t || ""); return m ? Number(m[1]) * { m: 1, h: 60, d: 1440, w: 10080 }[m[2]] : null; };

// Textura determinística (0..1): transientes barra a barra sobre un pulso más
// lento (cada 3 barras), como el detalle de una forma de onda real.
const hash = (k) => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const grain = (i) => 0.65 * hash(i) + 0.35 * hash(Math.floor(i / 3) + 999);

// Envolvente continua de una parte: sus tramos suavizados (gaussiana de 0,9
// tramo) y normalizados como un compresor: cada tramo contra el más fuerte de
// sus ±7 vecinos (piso: 35 % del pico de la parte). Así una noche enorme no
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

export function BassTrack({ events, today, onCue, onSelect, onSelectNews, onSelectFestival }) {
  const { t, locale } = useLocale();
  const M = MONTHS_ABBR[locale] || MONTHS_ABBR.es;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(0);
  const [avail, setAvail] = useState(0);      // desktop: alto de pantalla disponible desde el track
  const [news, setNews] = useState([]);
  const [fests, setFests] = useState([]);
  const [hot, setHot] = useState(null);       // cue bajo el mouse o con foco
  const [deckK, setDeckK] = useState("agenda"); // desktop: la parte que muestra el display (queda en la última elegida)
  const go = useRef({});                      // handlers por ref: la onda no se recalcula en cada render
  go.current = { onSelect, onSelectNews, onSelectFestival };
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

  // Las tres partes: sus tramos (datos reales), su cue y lo que muestra el display.
  const data = useMemo(() => {
    const off = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 864e5);
    const mon = (d) => (locale === "es" ? M[d.getMonth()].toLowerCase() : M[d.getMonth()]);
    const day = (d) => `${d.getDate()} ${mon(d)}`;

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
    const ahead = [];
    let todayN = 0;
    for (const ev of events) {
      const d = getEventDate(ev);
      if (!d) continue;
      const o = off(d);
      if (o < 0) continue;
      ahead.push({ ev, d, o });
      if (o === 0) todayN++;
      if (o < AGENDA_DAYS) agendaBins[o] += 1 + Math.min(1, (ev.artists?.length || 0) / 4);
    }
    // Display de la Agenda: lo próximo, con flyer primero dentro de cada día.
    ahead.sort((a, b) => a.o - b.o || !!b.ev.image - !!a.ev.image);
    const dayLabel = (o, d) => (o === 0 ? t("day.today") : day(d));

    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const next = fests.filter((f) => (f.dates_start || "") >= todayISO).sort((a, b) => a.dates_start.localeCompare(b.dates_start));
    const festBins = Array(FEST_WEEKS).fill(0);
    for (const f of next) {
      const wk = Math.floor(off(new Date(`${f.dates_start}T12:00:00`)) / 7);
      if (wk < FEST_WEEKS) festBins[wk] += f.country === "Argentina" ? 2 : 1;
    }
    const fest = next.find((f) => f.country === "Argentina") || next[0];
    const fdate = (f) => new Date(`${f.dates_start}T12:00:00`);
    const festSub = fest ? `${fest.name.replace(/\s+Buenos Aires$/i, " BA")} · ${day(fdate(fest))}` : "";

    const parts = [
      { k: "news", letter: "A", env: envelope(newsBins), name: t("section.news"), sub: news.length ? t("track.newsSub", { n: lastDay }) : "", span: t("track.spanNews"),
        items: news.slice(0, 4).map((n) => ({ key: n.url || n.title, image: n.image, poster: { text: n.source || n.title, family: "news" }, title: n.title, meta: [n.source, n.time].filter(Boolean).join(" · "), open: () => go.current.onSelectNews?.(n) })) },
      { k: "agenda", letter: "B", env: envelope(agendaBins), name: t("track.agenda"), sub: t("track.agendaSub", { today: todayN, n: ahead.length }), span: t("track.spanAgenda"),
        items: ahead.slice(0, 4).map(({ ev, d, o }) => ({ key: `${ev.name}-${ev.venue}-${o}`, image: ev.image, artistImage: ev.artistImage, artistImageName: ev.artistImageName, poster: { text: (ev.artists && ev.artists[0]) || ev.name, family: ev.family }, title: ev.name, meta: [dayLabel(o, d), ev.time, ev.venue].filter(Boolean).join(" · "), open: () => go.current.onSelect?.(ev) })) },
      { k: "fests", letter: "C", env: envelope(festBins), name: t("section.festivals"), sub: festSub, span: t("track.spanFests"),
        items: [...next.filter((f) => f.country === "Argentina"), ...next.filter((f) => f.country !== "Argentina")].slice(0, 4).map((f) => ({ key: f.id || f.name, image: f.image, poster: { text: f.name, family: "festival" }, title: f.name, meta: [day(fdate(f)), f.city || f.country].filter(Boolean).join(" · "), open: () => go.current.onSelectFestival?.(f) })) },
    ];
    return { parts };
  }, [events, news, fests, today, t, M, locale]);

  // Energía en u ∈ [0, 3): parte = ⌊u⌋. Piso de señal (0,16) + datos; en los
  // bordes de cada parte la energía se mezcla con la vecina, como en un mix.
  const energy = (u) => {
    const P = data.parts, s = Math.min(2, Math.floor(u)), f = u - s;
    const at = (i, x) => 0.16 + 0.84 * P[i].env(Math.max(0, Math.min(1, x)));
    let e = at(s, f);
    const X = 0.06;
    if (f < X && s > 0) e = e * (0.5 + f / X / 2) + at(s - 1, 1) * (0.5 - f / X / 2);
    if (f > 1 - X && s < 2) e = e * (0.5 + (1 - f) / X / 2) + at(s + 1, 0) * (0.5 - (1 - f) / X / 2);
    return e;
  };

  const mobile = w > 0 && w <= 768;
  const geo = useMemo(() => {
    if (!w) return null;
    const bars = [];
    if (mobile) {
      // Vertical: el tema baja. Tres partes iguales; cada cue a la altura de
      // donde empieza la suya. "AHORA" a la izquierda de la onda.
      const H = 600, top = 30, bot = H - 24, seg = (bot - top) / 3, cx = Math.round(w * 0.29), amp = Math.round(w * 0.16), lx = Math.round(w * 0.5);
      let i = 0;
      for (let y = top; y <= bot; y += 2.5, i++) { const u = Math.min(2.999, ((y - top) / (bot - top)) * 3); const e = energy(u); bars.push({ pos: y, u, e, h: 1 + e * amp * (0.35 + 0.65 * grain(i)), dist: y - (top + seg), span: bot - top - seg }); }
      const cues = data.parts.map((p, j) => ({ ...p, y: top + j * seg }));
      return { V: true, H, cx, amp, lx, yNow: top + seg, bars, cues, lw: 1.6 };
    }
    // Horizontal: la onda llena lo que queda de pantalla sobre el display.
    const H = Math.round(Math.max(380, Math.min(620, (avail || 720) - DECK_H - 24)));
    const x0 = 24, x1 = w - 24, seg = (x1 - x0) / 3, head = 76, foot = 58, mid = head + (H - head - foot) / 2, amp = (H - head - foot) / 2 - 6;
    let i = 0;
    for (let px = x0; px <= x1; px += 3, i++) { const u = Math.min(2.999, ((px - x0) / (x1 - x0)) * 3); const e = energy(u); bars.push({ pos: px, u, e, h: 1 + e * amp * (0.35 + 0.65 * grain(i)), dist: px - (x0 + seg), span: x1 - x0 - seg }); }
    const cues = data.parts.map((p, j) => ({ ...p, x: x0 + j * seg }));
    return { V: false, H, x0, seg, xNow: x0 + seg, mid, amp, bars, cues, lw: 1.8 };
  }, [w, mobile, avail, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loop de cues en mobile: solo con el track en pantalla y sin "reducir movimiento".
  const [auto, setAuto] = useState(0);
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loop = mobile && live && !still;
  useEffect(() => {
    if (!loop) return undefined;
    const id = setInterval(() => setAuto((n) => n + 1), BEAT * CUE_BEATS * 1000);
    return () => clearInterval(id);
  }, [loop]);
  const solo = hot || (loop ? data.parts[auto % data.parts.length].k : null);
  const soloIdx = data.parts.findIndex((p) => p.k === solo);
  const soloRef = useRef(-1);
  soloRef.current = soloIdx;
  const alphaRef = useRef([0.42, 0.9, 0.9]);  // por parte; el solo las lleva suave a su destino
  const t0Ref = useRef(0);

  // El canvas: cuadro a cuadro mientras está en pantalla; quieto con "reducir movimiento".
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !geo) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = w, H = geo.H;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    const color = getComputedStyle(cv).getPropertyValue("--bl-accent-bass").trim() || "#c8956c";
    const alpha = alphaRef.current;
    if (!t0Ref.current) t0Ref.current = performance.now();
    const t0 = t0Ref.current;
    let raf = 0;
    const frame = (now) => {
      const tt = still ? 0 : (now - t0) / 1000;
      const s = soloRef.current;
      for (let j = 0; j < 3; j++) { const target = s < 0 ? (j === 0 ? 0.42 : 0.9) : j === s ? 1 : j === 0 ? 0.16 : 0.28; alpha[j] += (target - alpha[j]) * (still ? 1 : 0.09); }
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = color;
      ctx.lineWidth = geo.lw;
      for (let j = 0; j < 3; j++) {
        ctx.globalAlpha = alpha[j];
        ctx.beginPath();
        for (const b of geo.bars) {
          if (Math.min(2, Math.floor(b.u)) !== j) continue;
          // Ondulación que corre por la onda + respiración lenta del tema.
          let m = 1 + 0.07 * Math.sin(tt * 2.1 - b.pos * 0.019) + 0.045 * Math.sin(tt * 3.4 + b.pos * 0.031) + 0.04 * Math.sin(tt * 0.55 + b.u * 1.7);
          if (b.dist >= 0 && !still) m += 0.3 * (0.4 + 0.6 * b.e) * Math.exp(-b.dist / (b.span * 0.6)) * hit((tt - b.dist / SPEED) / BEAT);
          const h = b.h * m;
          if (geo.V) { ctx.moveTo(geo.cx - h, b.pos); ctx.lineTo(geo.cx + h, b.pos); }
          else { ctx.moveTo(b.pos, geo.mid - h); ctx.lineTo(b.pos, geo.mid + h); }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!still && live) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, w, live, still, still ? soloIdx : 0]); // eslint-disable-line react-hooks/exhaustive-deps -- quieto: redibuja el solo

  const cueProps = (c) => ({
    className: `btk-cue${solo === c.k ? " is-hot" : ""}`, role: "button", tabIndex: 0,
    onMouseEnter: () => { setHot(c.k); setDeckK(c.k); }, onMouseLeave: () => setHot(null),
    onFocus: () => { setHot(c.k); setDeckK(c.k); }, onBlur: () => setHot(null),
    "aria-label": c.sub ? `${c.name}: ${c.sub}` : c.name,
    onClick: () => onCue(c.k),
    onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onCue(c.k)),
  });
  // El display muestra la última parte elegida (de entrada, la Agenda: lo que suena ahora).
  const deck = data.parts.find((p) => p.k === deckK) || data.parts[1];

  return (
    <section className={`bl-btrack${live ? " is-live" : ""}${geo && !geo.V ? " is-deck" : ""}`} data-solo={solo || ""} aria-label={t("track.aria")} ref={wrapRef}>
      <h2 className="bl-sr-only">{t("track.title")}</h2>
      {geo && (
        <div className="btk-stage" style={{ height: geo.H }}>
          <canvas ref={canvasRef} className="btk-canvas" style={{ width: w, height: geo.H }} data-live={live && !still ? "1" : "0"} aria-hidden="true" />
          {geo.V ? (
            <svg className="is-v" viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
              {geo.cues.map((c) => (
                <g key={c.k} {...cueProps(c)}>
                  <rect className="btk-hit" x="0" y={c.y - 8} width={w} height="58" />
                  <line className="btk-mark" x1={geo.cx - geo.amp - 4} x2={geo.lx - 8} y1={c.y} y2={c.y} />
                  <rect className="btk-pad" x={geo.lx} y={c.y - 11} width="22" height="22" rx="3" />
                  <text className="btk-letter" x={geo.lx + 11} y={c.y + 4.5} textAnchor="middle">{c.letter}</text>
                  <text className="btk-name" x={geo.lx + 32} y={c.y + 6}>{c.name}</text>
                  <text className="btk-sub" x={geo.lx + 32} y={c.y + 24}>{c.sub.length > 26 ? `${c.sub.slice(0, 25)}…` : c.sub}</text>
                  <text className="btk-span" x={geo.lx + 32} y={c.y + 40}>{c.span}</text>
                </g>
              ))}
              <line className="btk-now" x1="4" x2={geo.cx + geo.amp + 4} y1={geo.yNow} y2={geo.yNow} />
              <text className="btk-nowl" x="4" y={geo.yNow - 6}>{t("track.now")}</text>
            </svg>
          ) : (
            <svg viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
              {geo.cues.map((c) => (
                <g key={c.k} {...cueProps(c)}>
                  <rect className="btk-hit" x={c.x - 4} y="6" width={geo.seg - 16} height={geo.H - 12} />
                  <line className="btk-mark" x1={c.x + 13} x2={c.x + 13} y1="50" y2={geo.mid + geo.amp + 8} />
                  <rect className="btk-pad" x={c.x} y="10" width="26" height="26" rx="3" />
                  <text className="btk-letter" x={c.x + 13} y="28" textAnchor="middle">{c.letter}</text>
                  <text className="btk-name" x={c.x + 38} y="31">{c.name}</text>
                  <text className="btk-sub" x={c.x + 38} y="52">{c.sub}</text>
                  <text className="btk-span" x={c.x + 38} y={geo.H - 12}>{c.span}</text>
                </g>
              ))}
              <line className="btk-now" x1={geo.xNow + 13} x2={geo.xNow + 13} y1={geo.mid - geo.amp - 12} y2={geo.mid + geo.amp + 12} />
              <text className="btk-nowl" x={geo.xNow + 13} y={geo.mid + geo.amp + 28} textAnchor="middle">{t("track.now")}</text>
            </svg>
          )}
        </div>
      )}
      {geo && !geo.V && (
        <div className="btk-deck" style={{ "--seg": `${geo.seg}px` }}>
          <div className="btk-deck-head">
            <span className="btk-deck-k"><i aria-hidden="true" />{t("track.playing")} · 124 BPM</span>
            <span className="btk-deck-name"><b>{deck.letter}</b>{deck.name}</span>
            <span className="btk-deck-sub">{deck.span}</span>
            <button type="button" className="btk-deck-all" onClick={() => onCue(deck.k)}>{t("track.seeAll")} →</button>
          </div>
          <ul className="btk-deck-list" key={deck.k}>
            {deck.items.map((it) => (
              <li key={it.key}>
                <button type="button" className="btk-deck-item" onClick={it.open} onMouseEnter={() => setHot(deck.k)} onMouseLeave={() => setHot(null)}>
                  <BlThumb image={it.image} artistImage={it.artistImage} artistImageName={it.artistImageName} poster={it.poster} />
                  <span className="btk-deck-txt"><span className="btk-deck-title">{it.title}</span><span className="btk-deck-meta">{it.meta}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

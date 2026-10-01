import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { api, shared } from "../utils/api";

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
// Suena: late a 124 BPM y cada golpe sale del cabezal hacia lo que viene; lo
// ya reproducido queda quieto. Pasar por un cue hace solo de su parte; en
// mobile (sin hover) el solo recorre las partes en loop, una cada 8 golpes.

const BEAT = 60 / 124;                        // s por golpe: 124 BPM, tempo de club
const CUE_BEATS = 8;                          // mobile: golpes por cue en el loop
const SPEED = 700;                            // px/s: cómo viaja el golpe desde el cabezal
const NEWS_BINS = 24, NEWS_H = 1;             // Noticias: 24 h en tramos de 1 h (el feed cubre ~1 día)
const AGENDA_DAYS = 30;                       // Agenda: un tramo por día
const FEST_WEEKS = 26;                        // Festivales: un tramo por semana

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

export function BassTrack({ events, today, onCue }) {
  const { t, locale } = useLocale();
  const M = MONTHS_ABBR[locale] || MONTHS_ABBR.es;
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [news, setNews] = useState([]);
  const [fests, setFests] = useState([]);
  const [hot, setHot] = useState(null);       // cue bajo el mouse o con foco
  const [live, setLive] = useState(false);    // en pantalla: late (fuera, no gasta)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting));
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  useEffect(() => {
    let on = true;
    shared("bassNews", api.bassNews).then((d) => on && setNews(Array.isArray(d) ? d : [])).catch(() => {});
    shared("festivals", () => api.festivals()).then((d) => on && setFests(Array.isArray(d) ? d : [])).catch(() => {});
    return () => { on = false; };
  }, []);

  // Las tres partes: sus tramos (datos reales) y su cue.
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

    const parts = [
      { k: "news", letter: "A", env: envelope(newsBins), name: t("section.news"), sub: news.length ? t("track.newsSub", { n: lastDay }) : "", span: t("track.spanNews") },
      { k: "agenda", letter: "B", env: envelope(agendaBins), name: t("track.agenda"), sub: t("track.agendaSub", { today: todayN, n: upcoming }), span: t("track.spanAgenda") },
      { k: "fests", letter: "C", env: envelope(festBins), name: t("section.festivals"), sub: festSub, span: t("track.spanFests") },
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
  // Alto de una barra (media amplitud, simétrica): envolvente × textura.
  const barH = (u, i, amp) => 1 + energy(u) * amp * (0.35 + 0.65 * grain(i));
  // El golpe: sale del cabezal (retardo por distancia, módulo un beat) y pierde
  // fuerza al alejarse; donde hay más energía pega más.
  const kick = (dist, e, span) => ({ d: ((Math.max(0, dist) / SPEED) % BEAT).toFixed(3), k: ((0.35 + 0.65 * e) * Math.exp(-Math.max(0, dist) / (span * 0.6))).toFixed(2) });

  const mobile = w > 0 && w <= 768;
  const geo = useMemo(() => {
    if (!w) return null;
    if (mobile) {
      // Vertical: el tema baja. Tres partes iguales; cada cue a la altura de
      // donde empieza la suya. "AHORA" a la izquierda de la onda.
      const H = 600, top = 30, bot = H - 24, seg = (bot - top) / 3, cx = Math.round(w * 0.29), amp = Math.round(w * 0.16), lx = Math.round(w * 0.5);
      const bars = [];
      let i = 0;
      for (let y = top; y <= bot; y += 2.5, i++) { const u = Math.min(2.999, ((y - top) / (bot - top)) * 3); bars.push({ y, u, h: barH(u, i, amp), past: u < 1, ...kick(y - (top + seg), energy(u), bot - top - seg) }); }
      const cues = data.parts.map((p, j) => ({ ...p, y: top + j * seg }));
      return { V: true, H, cx, amp, lx, yNow: top + seg, bars, cues };
    }
    // Horizontal: tres partes iguales a lo ancho; cada título arriba de donde
    // empieza su parte, el cabezal al comienzo de la Agenda.
    const H = 360, x0 = 24, x1 = w - 24, seg = (x1 - x0) / 3, mid = 214, amp = 92;
    const bars = [];
    let i = 0;
    for (let px = x0; px <= x1; px += 2.6, i++) { const u = Math.min(2.999, ((px - x0) / (x1 - x0)) * 3); bars.push({ x: px, u, h: barH(u, i, amp), past: u < 1, ...kick(px - (x0 + seg), energy(u), x1 - x0 - seg) }); }
    const cues = data.parts.map((p, j) => ({ ...p, x: x0 + j * seg }));
    return { V: false, H, seg, xNow: x0 + seg, mid, amp, bars, cues };
  }, [w, mobile, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loop de cues en mobile: solo con el track en pantalla y sin "reducir movimiento".
  const [auto, setAuto] = useState(0);
  const loop = mobile && live && typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!loop) return undefined;
    const id = setInterval(() => setAuto((n) => n + 1), BEAT * CUE_BEATS * 1000);
    return () => clearInterval(id);
  }, [loop]);
  const solo = hot || (loop ? data.parts[auto % data.parts.length].k : null);
  const soloIdx = data.parts.findIndex((p) => p.k === solo);
  const barClass = (u) => `btk-bar${u < 1 ? " is-past" : ""}${soloIdx >= 0 && Math.floor(u) === soloIdx ? " is-hot" : ""}`;
  const barStyle = (b) => (b.past ? undefined : { "--d": `${b.d}s`, "--k": b.k });
  const cueProps = (c) => ({
    className: `btk-cue${solo === c.k ? " is-hot" : ""}`, role: "button", tabIndex: 0,
    onMouseEnter: () => setHot(c.k), onMouseLeave: () => setHot(null),
    onFocus: () => setHot(c.k), onBlur: () => setHot(null),
    "aria-label": c.sub ? `${c.name}: ${c.sub}` : c.name,
    onClick: () => onCue(c.k),
    onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onCue(c.k)),
  });

  return (
    <section className={`bl-btrack${live ? " is-live" : ""}${solo ? " has-hot" : ""}`} style={{ "--beat": `${BEAT}s` }} aria-label={t("track.aria")} ref={wrapRef}>
      <h2 className="bl-sr-only">{t("track.title")}</h2>
      {geo?.V && (
        <svg className="is-v" viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
          {geo.bars.map((b) => <line key={b.y} className={barClass(b.u)} style={barStyle(b)} x1={geo.cx - b.h} x2={geo.cx + b.h} y1={b.y} y2={b.y} />)}
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
      )}
      {geo && !geo.V && (
        <svg viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
          {geo.bars.map((b) => <line key={b.x} className={barClass(b.u)} style={barStyle(b)} x1={b.x} x2={b.x} y1={geo.mid - b.h} y2={geo.mid + b.h} />)}
          {geo.cues.map((c) => (
            <g key={c.k} {...cueProps(c)}>
              <rect className="btk-hit" x={c.x - 4} y="8" width={geo.seg - 16} height="62" />
              <line className="btk-mark" x1={c.x + 11} x2={c.x + 11} y1="44" y2={geo.mid + geo.amp + 6} />
              <rect className="btk-pad" x={c.x} y="14" width="22" height="22" rx="3" />
              <text className="btk-letter" x={c.x + 11} y="29.5" textAnchor="middle">{c.letter}</text>
              <text className="btk-name" x={c.x + 32} y="31">{c.name}</text>
              <text className="btk-sub" x={c.x + 32} y="51">{c.sub}</text>
              <text className="btk-span" x={c.x + 32} y={geo.H - 10}>{c.span}</text>
            </g>
          ))}
          <line className="btk-now" x1={geo.xNow + 11} x2={geo.xNow + 11} y1={geo.mid - geo.amp - 10} y2={geo.mid + geo.amp + 10} />
          <text className="btk-nowl" x={geo.xNow + 11} y={geo.mid + geo.amp + 26} textAnchor="middle">{t("track.now")}</text>
        </svg>
      )}
    </section>
  );
}

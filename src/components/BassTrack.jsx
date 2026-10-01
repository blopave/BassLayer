import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { api, shared } from "../utils/api";

// Portada de Bass (sept 2026, Pablo): el índice como un track. Lo que la curva
// de análisis técnico es para Layer (el instrumento de su público), la forma
// de onda del CDJ lo es para Bass. La onda es un tema que ya empezó a sonar:
// lo reproducido (atenuado) es la semana que pasó —su volumen, las noticias de
// cada día— y lo que viene, las fiestas de cada día en el AMBA. Tres secciones,
// tres hot cues en su momento REAL: Noticias en lo que ya sonó, la Agenda en
// el cabezal y Festivales en el primer festival grande en Argentina. La
// envolvente de la onda es cuánto pasa cada noche (normalizada a la noche más
// fuerte: altos y bajos de verdad); la textura de adentro es solo textura.
// Mobile: vertical (el tiempo baja); desktop: horizontal. En los dos, cada
// título va junto a su momento.
// Suena (sept 2026, Pablo: "que la música esté"): la onda late a 124 BPM y
// cada golpe sale del cabezal hacia lo que viene, como el sonido; lo ya
// reproducido queda quieto. Pasar por un cue hace solo de su tramo; en
// mobile (sin hover) el solo recorre los cues solo, como un DJ saltando entre
// hot cues: uno cada 8 golpes.

const DAYS = 60;                              // lo que viene
const PAST = 7;                               // lo ya reproducido
const LETTERS = "ABC";
const BEAT = 60 / 124;                        // s por golpe: 124 BPM, tempo de club
const CUE_BEATS = 8;                          // mobile: golpes por cue en el loop
const SPEED = 700;                            // px/s: cómo viaja el golpe desde el cabezal

const minsAgo = (t) => { const m = /^(\d+)\s*([mhdw])/.exec(t || ""); return m ? Number(m[1]) * { m: 1, h: 60, d: 1440, w: 10080 }[m[2]] : null; };

// Textura determinística por barra (0..1): dos octavas de ruido, para que cada
// noche tenga transientes como un tema y no un bulto liso.
const grain = (i) => { const n = (k) => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }; return 0.6 * n(i) + 0.4 * n(Math.floor(i / 3) + 999); };

// `events`: la agenda del AMBA (la onda y los conteos).
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

  // Datos de la onda y de los cues, todos reales.
  const data = useMemo(() => {
    const off = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 864e5);
    const day = (d) => `${d.getDate()} ${locale === "es" ? M[d.getMonth()].toLowerCase() : M[d.getMonth()]}`;
    const perDay = Array(DAYS).fill(0);
    let upcoming = 0, todayN = 0;
    for (const ev of events) {
      const d = getEventDate(ev);
      if (!d) continue;
      const o = off(d);
      if (o < 0) continue;
      upcoming++;
      if (o === 0) todayN++;
      if (o < DAYS) perDay[o] += 1 + Math.min(1, (ev.artists?.length || 0) / 4);
    }
    const past = Array(PAST).fill(0);
    let lastDay = 0;
    for (const n of news) {
      const x = minsAgo(n.time);
      if (x == null) continue;
      const o = Math.floor(x / 1440);
      if (o < PAST) past[PAST - 1 - o]++;
      if (x < 1440) lastDay++;
    }
    const cues = [];
    if (news.length) cues.push({ k: "news", at: -1, r: [-2, 0], name: t("section.news"), sub: t("track.newsSub", { n: lastDay }) });
    cues.push({ k: "agenda", at: 0, r: [0, 7], name: t("track.agenda"), sub: t("track.agendaSub", { today: todayN, n: upcoming }) });
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const next = fests.filter((f) => (f.dates_start || "") >= todayISO).sort((a, b) => a.dates_start.localeCompare(b.dates_start));
    const fest = next.find((f) => f.country === "Argentina") || next[0];
    if (fest) {
      const fd = new Date(`${fest.dates_start}T12:00:00`);
      const at = Math.min(DAYS - 3, off(fd));
      cues.push({ k: "fests", at, r: [at - 0.3, at + 2.5], name: t("section.festivals"), sub: `${fest.name.replace(/\s+Buenos Aires$/i, " BA")} · ${day(fd)}` });
    }
    cues.forEach((c, i) => { c.letter = LETTERS[i]; });
    // Envolvente: cada día es una noche (pico hacia la madrugada). Se
    // normaliza por tramos, como el compresor de un master: cada noche se mide
    // contra la más fuerte de sus ±7 días (con un piso del 30 % de la más
    // fuerte de todas). Así cada semana tiene sus altos y sus bajos de verdad y
    // una noche enorme no aplasta al resto del tema.
    const raw = (x) => {
      let s = 0;
      if (x < 0) for (let i = 0; i < PAST; i++) s += past[i] * Math.exp(-(((x - (i - PAST + 0.5)) / 0.3) ** 2));
      else for (let i = 0; i < DAYS; i++) s += perDay[i] * Math.exp(-(((x - (i + 0.9)) / 0.36) ** 2));
      return s;
    };
    const STEP = 0.25, xs = [], vs = [];
    for (let x = -PAST; x <= DAYS; x += STEP) { xs.push(x); vs.push(raw(x)); }
    const maxPast = Math.max(1e-6, ...vs.filter((_, i) => xs[i] < 0)), maxFut = Math.max(1e-6, ...vs.filter((_, i) => xs[i] >= 0));
    const W = Math.round(7 / STEP);
    const ceil = vs.map((_, i) => { let m = 0; for (let j = Math.max(0, i - W); j <= Math.min(vs.length - 1, i + W); j++) if ((xs[j] < 0) === (xs[i] < 0)) m = Math.max(m, vs[j]); return Math.max(m, 0.3 * (xs[i] < 0 ? maxPast : maxFut)); });
    const energy = (x) => {
      const i = Math.max(0, Math.min(xs.length - 1, Math.round((x + PAST) / STEP)));
      return Math.min(1, raw(x) / ceil[i]) * (x < 0 ? 0.8 : 1);
    };
    return { cues, energy };
  }, [events, news, fests, today, t, M, locale]);
  const { energy } = data;

  // Alto de una barra: envolvente real × textura; en los valles queda un
  // susurro (piso de 1–4 px), como un tema en un pasaje tranquilo.
  const barH = (x, i, amp) => { const e = energy(x), g = grain(i); return 1 + 3 * g * g + e * amp * (0.42 + 0.58 * g); };

  // El golpe: sale del cabezal (retardo por distancia, módulo un beat) y pierde
  // fuerza al alejarse; los días con más fiestas pegan más.
  const kick = (dist, e, span) => ({ d: ((Math.max(0, dist) / SPEED) % BEAT).toFixed(3), k: ((0.35 + 0.65 * e) * Math.exp(-Math.max(0, dist) / (span * 0.55))).toFixed(2) });

  const mobile = w > 0 && w <= 768;
  const geo = useMemo(() => {
    if (!w) return null;
    if (mobile) {
      // La onda arranca a la derecha del rótulo "AHORA" (no lo pisa).
      const H = 600, top = 24, yNow = 96, bot = H - 30, cx = Math.round(w * 0.25), amp = Math.round(w * 0.19), lx = Math.round(w * 0.5);
      const Y = (x) => (x < 0 ? top + ((x + PAST) / PAST) * (yNow - top) : yNow + (x / DAYS) * (bot - yNow));
      const bars = [];
      let i = 0;
      for (let y = top; y <= bot; y += 2.5, i++) { const x = y < yNow ? -PAST + ((y - top) / (yNow - top)) * PAST : ((y - yNow) / (bot - yNow)) * DAYS; bars.push({ y, x, h: barH(x, i, amp), past: x < 0, ...kick(y - yNow, energy(x), bot - yNow) }); }
      // Cada título junto a su momento; si dos caen cerca, el siguiente baja.
      let prev = -Infinity;
      const cues = data.cues.map((c) => { const y = Y(c.at), ly = Math.min(bot - 20, Math.max(y, top + 14, prev + 64)); prev = ly; return { ...c, y, ly }; });
      return { V: true, H, cx, amp, lx, yNow, bars, cues, top, bot };
    }
    const H = 350, x0 = 24, x1 = w - 24, xNow = x0 + (x1 - x0) * 0.14, mid = 226, amp = 92;
    const X = (x) => (x < 0 ? x0 + ((x + PAST) / PAST) * (xNow - x0) : xNow + (x / DAYS) * (x1 - xNow));
    const bars = [];
    let i = 0;
    for (let px = x0; px <= x1; px += 2.6, i++) { const x = px < xNow ? -PAST + ((px - x0) / (xNow - x0)) * PAST : ((px - xNow) / (x1 - xNow)) * DAYS; bars.push({ x: px, dx: x, h: barH(x, i, amp), past: x < 0, ...kick(px - xNow, energy(x), x1 - xNow) }); }
    // Cada título sobre su momento (la letra encima de la marca). Si pisa al
    // anterior, primero el anterior se corre a la izquierda (termina en su
    // marca) y, si no alcanza, este se corre a la derecha.
    const cues = data.cues.map((c) => ({ ...c, x: X(c.at), cw: 30 + Math.max(c.name.length * 10, c.sub.length * 6.6) }));
    cues.forEach((c, j) => {
      c.kx = Math.min(x1 - c.cw, Math.max(x0, c.x - 11));
      const p = cues[j - 1];
      if (p && c.kx < p.kx + p.cw + 28) {
        p.kx = Math.max(x0, Math.min(p.kx, c.kx - 28 - p.cw, p.x + 11 - p.cw));
        c.kx = Math.max(c.kx, p.kx + p.cw + 28);
      }
    });
    const ticks = [7, 14, 21, 28, 35, 42, 49, 56].map((d) => { const dd = new Date(today); dd.setDate(dd.getDate() + d); const m = M[dd.getMonth()]; return { x: X(d), l: `${dd.getDate()} ${locale === "es" ? m.toLowerCase() : m}` }; });
    return { V: false, H, x0, x1, xNow, mid, amp, bars, cues, ticks };
  }, [w, mobile, data, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loop de cues en mobile: solo con el track en pantalla y sin "reducir movimiento".
  const [auto, setAuto] = useState(0);
  const loop = mobile && live && typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!loop) return undefined;
    const id = setInterval(() => setAuto((i) => i + 1), BEAT * CUE_BEATS * 1000);
    return () => clearInterval(id);
  }, [loop]);
  const solo = hot || (loop ? data.cues[auto % data.cues.length]?.k : null);
  const hotR = solo && data.cues.find((c) => c.k === solo)?.r;
  const barClass = (x) => `btk-bar${x < 0 ? " is-past" : ""}${hotR && x >= hotR[0] && x <= hotR[1] ? " is-hot" : ""}`;
  const barStyle = (b) => (b.past ? undefined : { "--d": `${b.d}s`, "--k": b.k });
  const cueProps = (c) => ({
    className: `btk-cue${solo === c.k ? " is-hot" : ""}`, role: "button", tabIndex: 0,
    onMouseEnter: () => setHot(c.k), onMouseLeave: () => setHot(null),
    onFocus: () => setHot(c.k), onBlur: () => setHot(null),
    "aria-label": `${c.name}: ${c.sub}`,
    onClick: () => onCue(c.k),
    onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onCue(c.k)),
  });

  return (
    <section className={`bl-btrack${live ? " is-live" : ""}${solo ? " has-hot" : ""}`} style={{ "--beat": `${BEAT}s` }} aria-label={t("track.aria")} ref={wrapRef}>
      <h2 className="bl-sr-only">{t("track.title")}</h2>
      {geo?.V && (
        <svg className="is-v" viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
          {geo.bars.map((b) => <line key={b.y} className={barClass(b.x)} style={barStyle(b)} x1={geo.cx - b.h * 0.6} x2={geo.cx + b.h} y1={b.y} y2={b.y} />)}
          <line className="btk-now" x1="6" x2={geo.cx + geo.amp + 10} y1={geo.yNow} y2={geo.yNow} />
          <text className="btk-nowl" x="6" y={geo.yNow - 6}>{t("track.now")}</text>
          {geo.cues.map((c) => (
            <g key={c.k} {...cueProps(c)}>
              <rect className="btk-hit" x="0" y={c.ly - 26} width={w} height="52" />
              <line className="btk-mark" x1={geo.cx - geo.amp * 0.6 - 4} x2={geo.cx + geo.amp + 6} y1={c.y} y2={c.y} />
              <path className="btk-thread" d={`M${geo.cx + geo.amp + 6},${c.y} C${geo.lx - 28},${c.y} ${geo.lx - 46},${c.ly} ${geo.lx - 8},${c.ly}`} />
              <rect className="btk-pad" x={geo.lx} y={c.ly - 11} width="22" height="22" rx="3" />
              <text className="btk-letter" x={geo.lx + 11} y={c.ly + 4.5} textAnchor="middle">{c.letter}</text>
              <text className="btk-name" x={geo.lx + 32} y={c.ly + 5}>{c.name}</text>
              <text className="btk-sub" x={geo.lx + 32} y={c.ly + 22}>{c.sub.length > 26 ? `${c.sub.slice(0, 25)}…` : c.sub}</text>
            </g>
          ))}
        </svg>
      )}
      {geo && !geo.V && (
        <svg viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
          {geo.bars.map((b) => <line key={b.x} className={barClass(b.dx)} style={barStyle(b)} x1={b.x} x2={b.x} y1={geo.mid - b.h} y2={geo.mid + b.h * 0.6} />)}
          <line className="btk-now" x1={geo.xNow} x2={geo.xNow} y1={geo.mid - geo.amp - 12} y2={geo.mid + geo.amp * 0.6 + 10} />
          <text className="btk-nowl" x={geo.xNow} y={geo.mid + geo.amp * 0.6 + 24} textAnchor="middle">{t("track.now")}</text>
          {geo.cues.map((c) => {
            const top = geo.mid - geo.amp - 6;
            return (
              <g key={c.k} {...cueProps(c)}>
                <rect className="btk-hit" x={c.kx - 4} y="10" width={c.cw + 8} height="48" />
                <path className="btk-thread" d={`M${c.kx + 11},66 C${c.kx + 11},104 ${c.x},${top - 40} ${c.x},${top}`} />
                <line className="btk-mark" x1={c.x} x2={c.x} y1={top} y2={geo.mid + geo.amp * 0.6} />
                <rect className="btk-pad" x={c.kx} y="14" width="22" height="22" rx="3" />
                <text className="btk-letter" x={c.kx + 11} y="29.5" textAnchor="middle">{c.letter}</text>
                <text className="btk-name" x={c.kx + 30} y="30.5">{c.name}</text>
                <text className="btk-sub" x={c.kx + 30} y="50">{c.sub}</text>
              </g>
            );
          })}
          {geo.ticks.map((k) => <text key={k.l} className="btk-tick" x={k.x} y={geo.H - 8} textAnchor="middle">{k.l}</text>)}
        </svg>
      )}
    </section>
  );
}

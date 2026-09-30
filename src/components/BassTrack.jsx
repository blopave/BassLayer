import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { api, shared } from "../utils/api";
import { computeTours } from "../../lib/tours.js";
import { cleanArtists } from "../utils/artists";

// Portada de Bass (sept 2026, Pablo): el índice como un track. Lo que la curva
// de análisis técnico es para Layer (el instrumento de su público), la forma
// de onda del CDJ lo es para Bass. La onda es un tema que ya empezó a sonar:
// lo reproducido (atenuado) es la semana que pasó —su volumen, las noticias de
// cada día— y lo que viene, las fiestas de cada día en el AMBA. Las secciones
// son hot cues en su momento REAL: Noticias en lo que ya sonó, Hoy en el
// cabezal, El finde, la próxima gira, el primer festival grande en Argentina
// y la Agenda al final. La onda no es audio: su altura es cuánto pasa.
// Mobile: vertical (el tiempo baja), cues en columna; desktop: horizontal con
// un riel parejo arriba — el mismo idioma que las Ramas de Layer.

const DAYS = 60;                              // lo que viene
const PAST = 7;                               // lo ya reproducido
const LETTERS = "ABCDEF";

const minsAgo = (t) => { const m = /^(\d+)\s*([mhdw])/.exec(t || ""); return m ? Number(m[1]) * { m: 1, h: 60, d: 1440, w: 10080 }[m[2]] : null; };

// `events`: la agenda del AMBA (la onda y los conteos); `allEvents`: todos,
// porque una gira se arma cruzando con las fechas del exterior.
export function BassTrack({ events, allEvents = events, today, weekend, onCue }) {
  const { t, locale } = useLocale();
  const M = MONTHS_ABBR[locale] || MONTHS_ABBR.es;
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [news, setNews] = useState([]);
  const [fests, setFests] = useState([]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
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
    if (news.length) cues.push({ k: "news", at: -1, name: t("section.news"), sub: t("track.newsSub", { n: lastDay }) });
    cues.push({ k: "today", at: 0, name: t("day.today"), sub: t("track.todaySub", { n: todayN }) });
    const fri = Math.max(0, off(weekend.friday)), sun = off(weekend.monday) - 1;
    const sunD = new Date(weekend.monday); sunD.setDate(sunD.getDate() - 1);
    const friD = new Date(today); friD.setDate(friD.getDate() + fri);
    cues.push({ k: "weekend", at: Math.min(fri + 0.5, sun), name: t("track.weekend"), sub: `${day(friD)} – ${day(sunD)}` });
    const tours = computeTours(allEvents, { dateOf: getEventDate, clean: cleanArtists });
    const tour = tours.find((x) => off(x.date) > sun) || tours[0];
    if (tour && off(tour.date) < DAYS) cues.push({ k: "tour", at: off(tour.date), name: t("tour.title"), sub: `${tour.on[0]} · ${day(tour.date)}` });
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const next = fests.filter((f) => (f.dates_start || "") >= todayISO).sort((a, b) => a.dates_start.localeCompare(b.dates_start));
    const fest = next.find((f) => f.country === "Argentina") || next[0];
    if (fest) {
      const fd = new Date(`${fest.dates_start}T12:00:00`);
      cues.push({ k: "fests", at: Math.min(DAYS - 3, off(fd)), name: t("section.festivals"), sub: `${fest.name.replace(/\s+Buenos Aires$/i, " BA")} · ${day(fd)}` });
    }
    cues.push({ k: "agenda", at: DAYS - 1, name: t("track.agenda"), sub: t("track.agendaSub", { n: upcoming }) });
    cues.sort((a, b) => a.at - b.at).forEach((c, i) => { c.letter = LETTERS[i]; });
    return { perDay, past, cues };
  }, [events, allEvents, news, fests, today, weekend, t, M, locale]);

  // Energía continua: cada día es una noche (pico hacia la madrugada).
  const energy = (x) => {
    let s = 0;
    if (x < 0) for (let i = 0; i < PAST; i++) s += (data.past[i] / 14) * Math.exp(-(((x - (i - PAST + 0.5)) / 0.32) ** 2));
    else for (let i = 0; i < DAYS; i++) s += (data.perDay[i] / 20) * Math.exp(-(((x - (i + 0.9)) / 0.42) ** 2));
    return Math.min(1, s / 1.6) ** 0.65;
  };

  const mobile = w > 0 && w <= 768;
  const geo = useMemo(() => {
    if (!w) return null;
    if (mobile) {
      // La onda arranca a la derecha del rótulo "AHORA" (no lo pisa).
      const H = 600, top = 24, yNow = 96, bot = H - 30, cx = Math.round(w * 0.26), amp = Math.round(w * 0.14), lx = Math.round(w * 0.49);
      const Y = (x) => (x < 0 ? top + ((x + PAST) / PAST) * (yNow - top) : yNow + (x / DAYS) * (bot - yNow));
      const bars = [];
      for (let y = top; y <= bot; y += 2.5) { const x = y < yNow ? -PAST + ((y - top) / (yNow - top)) * PAST : ((y - yNow) / (bot - yNow)) * DAYS; bars.push({ y, h: 1 + energy(x) * amp, past: x < 0 }); }
      const gap = (bot - 40 - top) / Math.max(1, data.cues.length - 1);
      const cues = data.cues.map((c, i) => ({ ...c, y: Y(c.at), ly: top + 18 + i * gap }));
      return { V: true, H, cx, amp, lx, yNow, bars, cues, top, bot };
    }
    const H = 330, x0 = 24, x1 = w - 24, xNow = x0 + (x1 - x0) * 0.14, mid = 206, amp = 60;
    const X = (x) => (x < 0 ? x0 + ((x + PAST) / PAST) * (xNow - x0) : xNow + (x / DAYS) * (x1 - xNow));
    const bars = [];
    for (let px = x0; px <= x1; px += 2.6) { const x = px < xNow ? -PAST + ((px - x0) / (xNow - x0)) * PAST : ((px - xNow) / (x1 - xNow)) * DAYS; bars.push({ x: px, h: 1.2 + energy(x) * amp, past: x < 0 }); }
    const cw = (x1 - x0) / data.cues.length;
    const cues = data.cues.map((c, i) => ({ ...c, x: X(c.at), kx: x0 + i * cw + 4 }));
    const ticks = [7, 14, 21, 28, 35, 42, 49, 56].map((d) => { const dd = new Date(today); dd.setDate(dd.getDate() + d); const m = M[dd.getMonth()]; return { x: X(d), l: `${dd.getDate()} ${locale === "es" ? m.toLowerCase() : m}` }; });
    return { V: false, H, x0, x1, xNow, mid, amp, bars, cues, ticks };
  }, [w, mobile, data, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const cueProps = (c) => ({
    className: "btk-cue", role: "button", tabIndex: 0,
    "aria-label": `${c.name}: ${c.sub}`,
    onClick: () => onCue(c.k),
    onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onCue(c.k)),
  });

  return (
    <section className="bl-btrack" aria-label={t("track.aria")} ref={wrapRef}>
      <h2 className="bl-sr-only">{t("track.title")}</h2>
      {geo?.V && (
        <svg viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
          {geo.bars.map((b) => <line key={b.y} className={`btk-bar${b.past ? " is-past" : ""}`} x1={geo.cx - b.h * 0.6} x2={geo.cx + b.h} y1={b.y} y2={b.y} />)}
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
          {geo.bars.map((b) => <line key={b.x} className={`btk-bar${b.past ? " is-past" : ""}`} x1={b.x} x2={b.x} y1={geo.mid - b.h} y2={geo.mid + b.h * 0.6} />)}
          <line className="btk-now" x1={geo.xNow} x2={geo.xNow} y1={geo.mid - geo.amp - 12} y2={geo.mid + geo.amp * 0.6 + 10} />
          <text className="btk-nowl" x={geo.xNow} y={geo.mid + geo.amp * 0.6 + 24} textAnchor="middle">{t("track.now")}</text>
          {geo.cues.map((c) => {
            const top = geo.mid - geo.amp - 6;
            return (
              <g key={c.k} {...cueProps(c)}>
                <rect className="btk-hit" x={c.kx - 4} y="10" width={(geo.x1 - geo.x0) / geo.cues.length} height="48" />
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

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { DAYS_LONG, getEventDate } from "../i18n/strings";
import CABA from "../../data/caba-barrios.json";

// Mapa de Bass (sept 2026, Pablo): la agenda sobre Buenos Aires como una
// constelación. Cada venue es un punto que brilla según cuántas fiestas
// tiene en el período elegido; tocarlo muestra su agenda y cada fiesta abre
// su ficha. Ubicación: la dirección que publica la fuente, geocodificada con
// Georef/OpenStreetMap (scripts/geocode-venues.mjs) — lo que no se pudo
// ubicar no se dibuja y el pie lo dice. De fondo, solo los 48 barrios de CABA
// (Buenos Aires Data, oficial), en un trazo apenas visible.

const WINDOWS = [["today", 1], ["week", 7], ["month", 31]];

export function BassMap({ events, today, onSelect }) {
  const { t, locale } = useLocale();
  const days = DAYS_LONG[locale] || DAYS_LONG.es;
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [win, setWin] = useState("week");
  const [pick, setPick] = useState(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fiestas del período, agrupadas por venue ubicado.
  const { venues, placed, total } = useMemo(() => {
    const span = WINDOWS.find(([k]) => k === win)[1];
    const end = new Date(today); end.setDate(end.getDate() + span);
    const inWin = events.filter((ev) => { const d = getEventDate(ev); return d && d >= today && d < end; });
    const map = new Map();
    for (const ev of inWin) {
      if (!ev.geo) continue;
      const k = `${ev.geo.lat},${ev.geo.lng}`;
      if (!map.has(k)) map.set(k, { k, venue: ev.venue, address: ev.address, ...ev.geo, evs: [] });
      map.get(k).evs.push(ev);
    }
    const list = [...map.values()].sort((a, b) => b.evs.length - a.evs.length);
    return { venues: list, placed: list.reduce((n, v) => n + v.evs.length, 0), total: inWin.length };
  }, [events, today, win]);

  // Encuadre: CABA y alrededores (±~9 km). Los venues más lejanos del GBA no
  // achican la ciudad: van en una fila aparte debajo del mapa.
  const { near, far } = useMemo(() => {
    const c = CABA.barrios.flatMap((b) => b.c), M = 0.08;
    const lo = [Math.min(...c.map((p) => p[0])) - M, Math.max(...c.map((p) => p[0])) + M];
    const la = [Math.min(...c.map((p) => p[1])) - M, Math.max(...c.map((p) => p[1])) + M];
    const inside = (v) => v.lng > lo[0] && v.lng < lo[1] && v.lat > la[0] && v.lat < la[1];
    return { near: venues.filter(inside), far: venues.filter((v) => !inside(v)) };
  }, [venues]);

  // Proyección con la escala real (grados de longitud achicados por el coseno
  // de la latitud).
  const geo = useMemo(() => {
    if (!w) return null;
    const pts = [...CABA.barrios.flatMap((b) => b.c), ...near.map((v) => [v.lng, v.lat])];
    const lng0 = Math.min(...pts.map((p) => p[0])), lng1 = Math.max(...pts.map((p) => p[0]));
    const lat0 = Math.min(...pts.map((p) => p[1])), lat1 = Math.max(...pts.map((p) => p[1]));
    const kx = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
    const small = w < 640, pad = small ? 14 : 40, H = Math.round(small ? w * 1.12 : Math.min(w * 0.82, 680));
    const s = Math.min((w - 2 * pad) / ((lng1 - lng0) * kx), (H - 2 * pad) / (lat1 - lat0));
    const ox = (w - (lng1 - lng0) * kx * s) / 2, oy = (H - (lat1 - lat0) * s) / 2;
    const P = (lng, lat) => [ox + (lng - lng0) * kx * s, oy + (lat1 - lat) * s];
    const barrios = CABA.barrios.map((b) => ({ n: b.n, d: "M" + b.c.map(([a, c]) => P(a, c).map((v) => v.toFixed(1)).join(",")).join("L") + "Z" }));
    const max = Math.max(1, ...venues.map((v) => v.evs.length));
    const dots = near.map((v) => { const [x, y] = P(v.lng, v.lat); return { ...v, x, y, r: (small ? 2 : 2.6) + Math.sqrt(v.evs.length / max) * (small ? 3.4 : 5.5) }; });
    // Rótulos de los venues más activos, sin pisarse (derecha / izquierda / arriba / abajo).
    const taken = dots.map((d) => ({ x: d.x - d.r, y: d.y - d.r, w: 2 * d.r, h: 2 * d.r }));
    const hit = (r) => taken.some((q) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
    const labels = [];
    for (const d of dots.slice(0, w < 640 ? 6 : 12)) {
      // Rótulo corto: el nombre antes de " - ", "," o "@" ("One More Club, Villa Devoto").
      const base = d.venue.split(/\s+-\s+|,|\s@\s/)[0].trim(), txt = base.length > 24 ? `${base.slice(0, 23).trimEnd()}…` : base;
      const fs = small ? 10.5 : 12, tw = txt.length * fs * 0.55, th = fs + 2;
      const opt = [[d.x + d.r + 5, d.y - th / 2], [d.x - d.r - 5 - tw, d.y - th / 2], [d.x - tw / 2, d.y - d.r - th - 3], [d.x - tw / 2, d.y + d.r + 3]]
        .find(([x, y]) => x > 2 && x + tw < w - 2 && y > 2 && y + th < H - 2 && !hit({ x, y, w: tw, h: th }));
      if (!opt) continue;
      taken.push({ x: opt[0], y: opt[1], w: tw, h: th });
      labels.push({ k: d.k, x: opt[0], y: opt[1] + fs - 1, txt });
    }
    return { H, barrios, dots, labels, glow: small ? 2.4 : 3.2 };
  }, [w, venues, near]);

  const sel = pick && venues.find((v) => v.k === pick);
  const when = (ev) => { const d = getEventDate(ev); return d ? `${(days[d.getDay()] || "").slice(0, 3)} ${d.getDate()} · ${ev.time || ""}` : ""; };

  return (
    <section className="bl-bmap" aria-label={t("map.aria")} ref={wrapRef}>
      <div className="bl-bmap-win" role="group" aria-label={t("map.when")}>
        {WINDOWS.map(([k]) => (
          <button key={k} type="button" className={`bl-bmap-chip${win === k ? " is-on" : ""}`} aria-pressed={win === k} onClick={() => { setWin(k); setPick(null); }}>
            {t(`map.win.${k}`)}
          </button>
        ))}
      </div>
      {geo && (
        <svg viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("map.chartAria")}>
          <defs>
            <radialGradient id="blm-glow"><stop offset="0" stopColor="var(--bl-accent-bass)" stopOpacity=".5" /><stop offset="1" stopColor="var(--bl-accent-bass)" stopOpacity="0" /></radialGradient>
          </defs>
          <g className="blm-caba">{geo.barrios.map((b) => <path key={b.n} d={b.d}><title>{b.n}</title></path>)}</g>
          {geo.dots.map((d) => <circle key={`g${d.k}`} className="blm-glow" cx={d.x} cy={d.y} r={d.r * geo.glow} fill="url(#blm-glow)" />)}
          {geo.dots.map((d) => (
            <g
              key={d.k}
              className={`blm-venue${pick === d.k ? " is-on" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("map.venueAria", { venue: d.venue, n: d.evs.length })}
              onClick={() => setPick(pick === d.k ? null : d.k)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setPick(pick === d.k ? null : d.k))}
            >
              <circle className="blm-hit" cx={d.x} cy={d.y} r={Math.max(14, d.r + 6)} />
              <circle className="blm-dot" cx={d.x} cy={d.y} r={d.r} />
            </g>
          ))}
          {geo.labels.map((l) => <text key={`l${l.k}`} className={`blm-label${pick === l.k ? " is-on" : ""}`} x={l.x} y={l.y}>{l.txt}</text>)}
        </svg>
      )}
      {far.length > 0 && (
        <div className="bl-bmap-far">
          <span>{t("map.far")}</span>
          {far.map((v) => (
            <button key={v.k} type="button" className={`bl-bmap-chip${pick === v.k ? " is-on" : ""}`} onClick={() => setPick(pick === v.k ? null : v.k)}>
              {v.venue} · {v.evs.length}
            </button>
          ))}
        </div>
      )}
      {sel ? (
        <div className="bl-bmap-venue">
          <div className="bl-bmap-vhead">
            <h3>{sel.venue}</h3>
            <button type="button" className="bl-bmap-close" onClick={() => setPick(null)} aria-label={t("common.close")}>✕</button>
          </div>
          {sel.address && sel.address !== sel.venue && <p className="bl-bmap-addr">{sel.address}</p>}
          <ul>
            {sel.evs.map((ev) => (
              <li key={`${ev.name}-${ev.day}-${ev.time}`}>
                <button type="button" onClick={() => onSelect(ev)}>
                  <span className="when">{when(ev)}</span>
                  <span className="name">{ev.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="bl-bmap-hint">{t("map.hint")}</p>
      )}
      <p className="bl-bmap-foot">{t("map.coverage", { placed, total })}</p>
    </section>
  );
}

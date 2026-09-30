import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { DAYS_LONG, getEventDate } from "../i18n/strings";

// Pulsar (sept 2026, Pablo): la identidad de Bass, hermana de la curva de
// Layer. Referencia: Peter Saville · Joy Division, Unknown Pleasures (1979).
// Cada línea es una noche de las próximas; cada pico, una fiesta real en su
// hora de inicio (15 h → 9 h), más alto cuanto más grande el line-up. Hoy va
// en el color de Bass. Tocar una línea filtra la agenda a esa noche; tocar
// un pico abre el evento. Las líneas de adelante tapan a las de atrás con
// recortes (no con rellenos del color del fondo, que dejaban costuras sobre
// el degradé de la página).

const H0 = 15, H1 = 33;                   // 15 h → 9 h del día siguiente
const hourOf = (ev) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(ev.time || "");
  if (!m) return null;
  let h = Number(m[1]) + Number(m[2]) / 60;
  if (h < 12) h += 24;                       // 02:00 = las 2 de la madrugada de esa noche
  return Math.min(H1 - 1, Math.max(H0 + 1, h)); // de día o after: pico entero cerca del borde
};
const peak1 = (ev) => Math.min(1.25, 0.6 + Math.log2(1 + (ev.artists?.length || 0)) * 0.2);
// Cada fiesta, su pico: manda el más alto y los superpuestos suman un poco
// (picos en punta, sin mesetas).
// `sd` = ancho del pico en horas (sale de un ancho fijo en píxeles: en desktop
// cada hora ocupa más, y con un ancho en horas los picos quedaban redondos).
const heightAt = (evs, h, sd) => {
  let mx = 0, sum = 0;
  for (const e of evs) { const g = peak1(e.ev) * Math.exp(-(((h - e.h) / sd) ** 2)); if (g > mx) mx = g; sum += g; }
  return mx + 0.12 * (sum - mx);
};
export const nightKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function Pulsar({ events, today, night, onNight, onSelect }) {
  const { t, locale } = useLocale();
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mobile = w > 0 && w < 640;
  const N = mobile ? 10 : 14;
  const days = DAYS_LONG[locale] || DAYS_LONG.es;

  // Noches (de hoy en adelante) con sus fiestas y la hora de cada una.
  const nights = useMemo(() => {
    const byKey = new Map();
    for (const ev of events) {
      const d = getEventDate(ev), h = hourOf(ev);
      if (!d || h == null) continue;
      const k = nightKey(d);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push({ ev, h });
    }
    return Array.from({ length: N }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const k = nightKey(d);
      return { i, d, k, evs: byKey.get(k) || [], all: events.filter((ev) => { const x = getEventDate(ev); return x && nightKey(x) === k; }).length };
    });
  }, [events, today, N]);

  const geo = useMemo(() => {
    if (!w) return null;
    const gap = mobile ? 30 : 32, amp = mobile ? 26 : 36, top = amp * 1.35 + 18;
    const x0 = mobile ? 50 : 78, x1 = w - (mobile ? 30 : 46), Hh = top + (N - 1) * gap + 40;
    const X = (h) => x0 + ((h - H0) / (H1 - H0)) * (x1 - x0);
    const sd = 9 / ((x1 - x0) / (H1 - H0));   // picos de ~9 px de medio ancho
    const lines = nights.map((n) => {
      const base = top + n.i * gap, pts = [];
      for (let x = x0; x <= x1 + 0.1; x += 2) pts.push([x, base - heightAt(n.evs, H0 + ((x - x0) / (x1 - x0)) * (H1 - H0), sd) * amp]);
      return { ...n, base, pts, path: "M" + pts.map(([x, y]) => `${x},${y.toFixed(1)}`).join("L") };
    });
    // Recorte de cada línea: solo se ve por encima de la envolvente de las
    // noches de adelante (las de abajo), como en la tapa de Saville.
    lines.forEach((l, i) => {
      if (i === lines.length - 1) { l.clip = null; return; }
      const env = l.pts.map(([x], j) => [x, Math.min(...lines.slice(i + 1).map((m) => m.pts[j][1]))]);
      l.clip = `M${x0 - 40},-40L${x1 + 40},-40L${x1 + 40},${env[env.length - 1][1]}` + env.slice().reverse().map(([x, y]) => `L${x},${y.toFixed(1)}`).join("") + `L${x0 - 40},${env[0][1]}Z`;
    });
    return { gap, amp, x0, x1, X, Hh, lines, sd };
  }, [w, mobile, nights, N]);

  const label = (n) => (n.i === 0 ? t("day.today") : `${(days[n.d.getDay()] || "").slice(0, 3)} ${n.d.getDate()}`);
  const pickLabel = geo && night && geo.lines.find((l) => l.k === night);

  return (
    <section className="bl-pulsar" aria-label={t("pulsar.aria")} ref={wrapRef}>
      <h2 className="bl-sr-only">{t("pulsar.title")}</h2>
      {geo && (
        <svg viewBox={`0 0 ${w} ${geo.Hh}`} width={w} height={geo.Hh} role="img" aria-label={t("pulsar.chartAria")}>
          <defs>
            {geo.lines.map((l) => l.clip && <clipPath key={l.k} id={`blp-c${l.i}`}><path d={l.clip} /></clipPath>)}
          </defs>
          {geo.lines.map((l) => {
            const on = night ? night === l.k : l.i === 0;
            return (
              <g
                key={l.k}
                className={`blp-night${on ? " is-on" : ""}${night && !on ? " is-dim" : ""}${l.i === 0 ? " is-today" : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={night === l.k}
                aria-label={t("pulsar.nightAria", { night: label(l), n: l.all })}
                onClick={() => onNight(night === l.k ? "" : l.k)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onNight(night === l.k ? "" : l.k))}
              >
                <rect className="blp-hit" x="0" y={l.base - geo.gap + 4} width={w} height={geo.gap} />
                <path className="blp-line" d={l.path} clipPath={l.clip ? `url(#blp-c${l.i})` : undefined} />
                <text className="blp-day" x={geo.x0 - 12} y={l.base + 3.5} textAnchor="end">{label(l)}</text>
                {l.all > 0 && <text className="blp-n" x={geo.x1 + 10} y={l.base + 3.5}>{l.all}</text>}
                {/* Picos tocables: cada fiesta abre su evento. */}
                {l.evs.map(({ ev, h }) => {
                  const x = geo.X(h), y = l.base - heightAt(l.evs, h, geo.sd) * geo.amp;
                  return (
                    <circle
                      key={`${ev.name}-${ev.time}-${ev.venue}`}
                      className="blp-peak"
                      cx={x} cy={y} r={mobile ? 11 : 9}
                      onClick={(e) => { e.stopPropagation(); onSelect(ev); }}
                      onMouseEnter={() => setHover({ ev, x, y })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
              </g>
            );
          })}
          {[16, 20, 24, 28, 32].map((h) => (
            <text key={h} className="blp-h" x={geo.X(h)} y={geo.Hh - 10} textAnchor="middle">{`${String(h % 24).padStart(2, "0")} h`}</text>
          ))}
        </svg>
      )}
      {/* Rótulo del pico: tarjeta con fondo propio, nunca texto cruzado por líneas. */}
      {hover && (
        <div className={`blp-card${hover.y < 90 ? " is-below" : ""}`} style={{ left: Math.min(Math.max(hover.x, 110), w - 110), top: hover.y < 90 ? hover.y + 16 : hover.y - 14 }} aria-hidden="true">
          <b>{hover.ev.name}</b>
          <span>{hover.ev.venue} · {hover.ev.time}</span>
        </div>
      )}
      {pickLabel && (
        <button type="button" className="blp-clear" onClick={() => onNight("")}>
          {t("pulsar.showing", { night: label(pickLabel) })} <span aria-hidden="true">✕</span>
        </button>
      )}
    </section>
  );
}

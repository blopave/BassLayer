import { useEffect, useMemo, useRef, useState } from "react";
import { api, shared } from "../utils/api";
import { useLocale } from "../hooks/useLocale";
import { NEWS_CAT } from "../utils/btcHistory";

// Sección Historia: la curva de Bitcoin (2012 → hoy) con los momentos que la
// movieron. Hechos verificados en data/btc-cycles.json (newsEvents), bandas de
// cada ciclo (halving → pico → fondo), filtros por tipo y la lista cronológica
// sincronizada con la curva (tocar un hecho lo marca en las dos).

const T = (s) => { const [y, m] = s.split("-").map(Number); return y + (m - 1) / 12; };
const MONTHS = { es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };

export function BtcHistory() {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState(null);
  const [w, setW] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    shared("btcCycles", api.btcCycles).then((d) => alive && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const H = data?.priceHistory || [];
  const events = useMemo(() => (data?.newsEvents || []).map((e, i) => ({ ...e, i })).sort((a, b) => a.t.localeCompare(b.t)), [data]);
  const shown = events.filter((e) => cat === "all" || e.cat === cat);
  const mobile = w > 0 && w <= 700;
  const L = (e) => (locale === "en" ? e.en || e.es : e.es);
  const month = (tt) => `${MONTHS[locale === "en" ? "en" : "es"][Number(tt.slice(5)) - 1]} ${tt.slice(0, 4)}`;
  const fmtUsd = (p) => (p >= 1000 ? `$${Math.round(p).toLocaleString(locale === "en" ? "en-US" : "es-AR")}` : `$${p < 10 ? p.toFixed(1) : Math.round(p)}`);

  const geo = useMemo(() => {
    if (!H.length || !w) return null;
    const Hh = mobile ? 300 : 440, padL = mobile ? 8 : 56, padR = mobile ? 8 : 20, padT = 24, padB = 30;
    const t0 = T(H[0].t), t1 = T(H[H.length - 1].t);
    const X = (tt) => padL + ((tt - t0) / (t1 - t0)) * (w - padL - padR);
    const lo = Math.log10(3), hi = Math.log10(200000);
    const Y = (p) => padT + (1 - (Math.log10(Math.max(p, 3)) - lo) / (hi - lo)) * (Hh - padT - padB);
    const price = (tt) => { let b = H[0]; for (const h of H) if (Math.abs(T(h.t) - T(tt)) < Math.abs(T(b.t) - T(tt))) b = h; return b.p; };
    const path = "M" + H.map((h) => `${X(T(h.t)).toFixed(1)},${Y(h.p).toFixed(1)}`).join("L");
    // Bandas de ciclo: halving → pico (alcista) y pico → fondo (bajista).
    const ms = (data.milestones || []).slice().sort((a, b) => a.t.localeCompare(b.t));
    const bands = [];
    ms.forEach((m, i) => {
      const next = ms[i + 1];
      if (m.type === "halving" && next?.type === "peak") bands.push({ a: T(m.t), b: T(next.t), k: "up" });
      if (m.type === "peak") bands.push({ a: T(m.t), b: next?.type === "bottom" ? T(next.t) : t1, k: "down" });
    });
    return { Hh, padL, padR, padT, padB, X, Y, price, path, bands, ms, t0, t1 };
  }, [H, w, mobile, data]);

  const pick = (e) => {
    setSel(e.i);
    const row = listRef.current?.querySelector(`[data-ev="${e.i}"]`);
    if (row && mobile) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const selEv = events.find((e) => e.i === sel && (cat === "all" || e.cat === cat));

  if (!data) return <div className="blh"><div className="blh-skel" aria-hidden="true" /></div>;

  const counts = events.reduce((a, e) => ((a[e.cat] = (a[e.cat] || 0) + 1), a), {});

  return (
    <section className="blh" aria-label={t("section.history")}>
      <header className="blh-head">
        <h2>{t("history.title")}</h2>
        <p>{t("history.sub", { n: events.length })}</p>
      </header>
      <div className="blh-cats" role="group" aria-label={t("history.filter")}>
        <button type="button" className={cat === "all" ? "is-on" : ""} onClick={() => setCat("all")}>{t("common.all")} <span>{events.length}</span></button>
        {Object.keys(NEWS_CAT).filter((k) => counts[k]).map((k) => (
          <button key={k} type="button" className={cat === k ? "is-on" : ""} onClick={() => setCat(k)} style={{ "--c": NEWS_CAT[k].color }}>
            <i aria-hidden="true" />{NEWS_CAT[k][locale === "en" ? "en" : "es"]} <span>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="blh-chart" ref={boxRef}>
        {geo && (
          <svg viewBox={`0 0 ${w} ${geo.Hh}`} role="img" aria-label={t("history.chartAria")} style={{ height: geo.Hh }}>
            <defs>
              <linearGradient id="blh-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--bl-accent-layer)" stopOpacity=".14" /><stop offset="1" stopColor="var(--bl-accent-layer)" stopOpacity="0" /></linearGradient>
            </defs>
            {geo.bands.map((b, i) => (
              <rect key={i} className={`blh-band ${b.k}`} x={geo.X(b.a)} y={geo.padT} width={Math.max(0, geo.X(b.b) - geo.X(b.a))} height={geo.Hh - geo.padT - geo.padB} />
            ))}
            {!mobile && [10, 1000, 100000].map((p) => (
              <g key={p} className="blh-grid"><line x1={geo.padL} x2={w - geo.padR} y1={geo.Y(p)} y2={geo.Y(p)} /><text x={geo.padL - 8} y={geo.Y(p) + 3} textAnchor="end">{fmtUsd(p)}</text></g>
            ))}
            {(mobile ? [2014, 2018, 2022, 2026] : [2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026]).map((y) => (
              <text key={y} className="blh-yr" x={geo.X(y)} y={geo.Hh - 8} textAnchor="middle">{y}</text>
            ))}
            <path className="blh-area" d={`${geo.path}L${geo.X(geo.t1)},${geo.Hh - geo.padB}L${geo.X(geo.t0)},${geo.Hh - geo.padB}Z`} />
            <path className="blh-curve" d={geo.path} />
            {geo.ms.map((m) => (
              <g key={m.t + m.type} className="blh-ms">
                <circle cx={geo.X(T(m.t))} cy={geo.Y(m.price)} r="3" />
                {!mobile && <text x={geo.X(T(m.t))} y={geo.Y(m.price) + (m.type === "bottom" ? 16 : -10)} textAnchor="middle">{(locale === "en" ? m.labelEn || m.label : m.label).toUpperCase()}</text>}
              </g>
            ))}
            {shown.map((e) => {
              const cx = geo.X(T(e.t)), cy = geo.Y(geo.price(e.t)), on = sel === e.i;
              return (
                <g
                  key={e.i}
                  className={`blh-ev${on ? " is-on" : ""}`}
                  style={{ "--c": NEWS_CAT[e.cat]?.color }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${month(e.t)}: ${L(e)}`}
                  onMouseEnter={() => !mobile && setSel(e.i)}
                  onFocus={() => setSel(e.i)}
                  onClick={() => pick(e)}
                >
                  <line x1={cx} x2={cx} y1={cy} y2={geo.Hh - geo.padB} />
                  <circle className="halo" cx={cx} cy={cy} r={on ? 14 : 0} />
                  <circle className="dot" cx={cx} cy={cy} r={mobile ? 6 : 6.5} />
                  <circle cx={cx} cy={cy} r="16" fill="transparent" />
                </g>
              );
            })}
          </svg>
        )}
        {geo && selEv && (() => {
          const cx = geo.X(T(selEv.t)), cy = geo.Y(geo.price(selEv.t));
          return (
            <div className="blh-card" style={{ "--c": NEWS_CAT[selEv.cat]?.color, ...(mobile ? {} : { left: Math.max(8, Math.min(cx - 150, w - 308)), top: cy > geo.Hh / 2 ? Math.max(8, cy - 150) : cy + 22 }) }}>
              <div className="k"><i aria-hidden="true" />{NEWS_CAT[selEv.cat]?.[locale === "en" ? "en" : "es"]} · {month(selEv.t)}</div>
              <p>{L(selEv)}</p>
              <div className="p">{t("history.monthPrice")} ~{fmtUsd(geo.price(selEv.t))}</div>
            </div>
          );
        })()}
      </div>

      <ol className="blh-list" ref={listRef}>
        {shown.map((e) => (
          <li key={e.i} data-ev={e.i}>
            <button type="button" className={sel === e.i ? "is-on" : ""} style={{ "--c": NEWS_CAT[e.cat]?.color }} onClick={() => pick(e)} onMouseEnter={() => !mobile && setSel(e.i)}>
              <span className="d">{month(e.t)}</span>
              <span className="c"><i aria-hidden="true" />{NEWS_CAT[e.cat]?.[locale === "en" ? "en" : "es"]}</span>
              <span className="x">{L(e)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

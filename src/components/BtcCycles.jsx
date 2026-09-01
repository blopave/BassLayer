import { useEffect, useRef, useState } from "react";
import { api } from "../utils/api";
import { IndicatorModal } from "./IndicatorModal";
import { useLocale } from "../hooks/useLocale";
import { monthAbbrLocale } from "../i18n/strings";

// Las fechas de ciclo vienen en el dato como "28 nov 2012" (mes en español).
// En español las dejamos tal cual; en inglés reescribimos el mes ("28 Nov 2012").
function fmtCycleDate(s, locale) {
  if (locale === "es" || !s) return s;
  const m = String(s).trim().match(/^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})$/);
  return m ? `${m[1]} ${monthAbbrLocale(m[2], "en")} ${m[3]}` : s;
}

// Texto curado bilingüe del dato: en inglés preferimos el campo `<base>En`
// (confluenceLabelEn, postureEn, noteEn — ya presentes en el JSON y en Supabase);
// si falta, caemos al campo base en español (degradación elegante, sin diccionario
// cliente que se desactualice).
const pickLocalized = (obj, base, locale) => (locale === "en" && obj?.[base + "En"]) || obj?.[base];

// Prueba de concepto — Dashboard de ciclos de halving de BTC en estética
// terminal (lado Layer). Los datos vienen de /btc-cycles.json (curado); los
// conteos de días se computan en vivo con la fecha actual, así el panel se
// mueve solo aunque la fuente sea estática. En la versión final el JSON lo
// sirve server.js (/api/btc-cycles) reusando el fetch de CoinGecko ya presente.

const DAY = 86_400_000;
const SCALE = 1520; // días de ancho del eje del timeline (~4 años + aire)

const daysBetween = (a, b) => Math.round((a.getTime() - b.getTime()) / DAY);
const pct = (d) => (d / SCALE) * 100;

// Parseamos las fechas ISO al mediodía para que el día del calendario no se
// corra según la zona horaria del navegador (ISO "2026-08-01" se interpreta
// como UTC medianoche y en husos al oeste retrocede un día).
const parseISO = (s) => new Date(s + "T12:00:00");
function fmtMonth(d, locale) {
  return d.toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { month: "short" }).replace(".", "");
}

// Timeline de fases: cada ciclo alineado a su halving (día 0). Segmentos
// posicionados en % sobre un eje común para que sean comparables. Sin librería
// de charts — divs absolutos, mismo criterio que las sparklines a mano.
function PhaseTimeline({ cycles }) {
  const { t, locale } = useLocale();
  const years = [365, 730, 1095, 1460];
  const cd = (s) => fmtCycleDate(s, locale); // fecha de ciclo localizada
  // Pista de scroll horizontal: el carril es más ancho que la pantalla en mobile.
  // Marcamos con `at-end` cuando ya no hay más a la derecha para apagar el fade
  // que insinúa "hay más contenido →" sin taparlo cuando llegaste al final.
  const scrollRef = useRef(null);
  const [atEnd, setAtEnd] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setAtEnd(max <= 1 || el.scrollLeft >= max - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [cycles]);
  return (
    <div ref={scrollRef} className={`bl-cyc-chart${atEnd ? " at-end" : ""}`} role="img" aria-label={locale === "en" ? "Duration of each halving cycle's phases, aligned to halving day" : "Duración de las fases de cada ciclo de halving, alineadas al día del halving"}>
      <div className="bl-cyc-rows">
        <div className="bl-cyc-axis" aria-hidden="true">
          <span className="bl-cyc-grid bl-cyc-grid-zero" style={{ left: "0%" }} />
          {years.map((y, i) => (
            <span className="bl-cyc-grid" key={y} style={{ left: `${pct(y)}%` }}>
              <span className="bl-cyc-yr">{t("cycles.year", { n: i + 1 })}</span>
            </span>
          ))}
        </div>
        {cycles.map((c) => (
          <div className="bl-cyc-row" key={c.n}>
            <div className="bl-cyc-row-label">
              <span className="bl-cyc-cy">C{c.n}</span>
              <span className="bl-cyc-cy-date">{cd(c.halvingDate)}</span>
              {c.halvingPrice && <span className="bl-cyc-cy-price" title={t("cycles.tip.halvingPrice", { price: c.halvingPrice })}>{c.halvingPrice}</span>}
            </div>
            <div className="bl-cyc-track">
              {/* markup */}
              <div className="bl-cyc-seg up" style={{ left: `${pct(0)}%`, width: `calc(${pct(c.markup)}% - 2px)` }} title={t("cycles.tip.markup", { d: c.markup })}>
                <span className="bl-cyc-d">{c.markup}d</span>
              </div>
              {!c.ongoing ? (
                <>
                  <div className="bl-cyc-seg down" style={{ left: `${pct(c.markup)}%`, width: `calc(${pct(c.markdown)}% - 2px)` }} title={t("cycles.tip.markdown", { d: c.markdown })}>
                    <span className="bl-cyc-d">{c.markdown}d</span>
                  </div>
                  <div className="bl-cyc-seg build" style={{ left: `${pct(c.markup + c.markdown)}%`, width: `calc(${pct(c.recovery)}% - 2px)` }} title={t("cycles.tip.accumulation", { d: c.recovery })}>
                    <span className="bl-cyc-d">{c.recovery}d</span>
                  </div>
                  <span className="bl-cyc-mk hv" style={{ left: `${pct(0)}%` }} title={`${t("cycles.mk.halving")} · ${cd(c.halvingDate)}`} />
                  <span className="bl-cyc-mk pk" style={{ left: `${pct(c.markup)}%` }} title={`${t("cycles.mk.peak")} · ${cd(c.peakDate)}`} />
                  <span className="bl-cyc-mk bt" style={{ left: `${pct(c.markup + c.markdown)}%` }} title={`${t("cycles.mk.bottom")} · ${cd(c.bottomDate)}`} />
                  {c.peakPrice && <span className="bl-cyc-pr pk" style={{ left: `${pct(c.markup)}%` }} title={`${t("cycles.mk.peak")} · ${cd(c.peakDate)} · ${c.peakPrice}`}>{c.peakPrice}</span>}
                  {c.bottomPrice && <span className="bl-cyc-pr bt" style={{ left: `${pct(c.markup + c.markdown)}%` }} title={`${t("cycles.mk.bottom")} · ${cd(c.bottomDate)} · ${c.bottomPrice}`}>{c.bottomPrice}</span>}
                </>
              ) : (
                <>
                  <div className="bl-cyc-seg down" style={{ left: `${pct(c.markup)}%`, width: `calc(${pct(c.markdownSoFar)}% - 2px)` }} title={t("cycles.tip.markdownOngoing", { d: c.markdownSoFar })}>
                    <span className="bl-cyc-d">{c.markdownSoFar}d</span>
                  </div>
                  <div className="bl-cyc-seg proj" style={{ left: `${pct(c.markup + c.markdownSoFar)}%`, width: `calc(${pct(c.projMax - c.markdownSoFar)}% - 2px)` }} title={t("cycles.tip.projBottom")}>
                    <span className="bl-cyc-d">{t("cycles.projShort")}</span>
                  </div>
                  <span className="bl-cyc-mk hv" style={{ left: `${pct(0)}%` }} title={`${t("cycles.mk.halving")} · ${cd(c.halvingDate)}`} />
                  <span className="bl-cyc-mk pk" style={{ left: `${pct(c.markup)}%` }} title={`${t("cycles.mk.peak")} · ${cd(c.peakDate)}`} />
                  {c.peakPrice && <span className="bl-cyc-pr pk" style={{ left: `${pct(c.markup)}%` }} title={`${t("cycles.mk.peak")} · ${cd(c.peakDate)} · ${c.peakPrice}`}>{c.peakPrice}</span>}
                  <span className="bl-cyc-now" style={{ left: `${pct(c.markup + c.markdownSoFar)}%` }} title={t("common.today")} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="bl-cyc-legend" aria-hidden="true">
        <span className="bl-cyc-lg"><span className="bl-cyc-sw hv" /> {t("cycles.legend.halving")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw up" /> {t("cycles.legend.markup")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw down" /> {t("cycles.legend.markdown")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw build" /> {t("cycles.legend.accumulation")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw proj" /> {t("cycles.legend.projected")}</span>
      </div>
    </div>
  );
}

function Cell({ label, value, sub, tone, onClick, hint }) {
  return (
    <div
      className={`bl-term-cell${onClick ? " bl-term-cell-clickable" : ""}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={hint}
    >
      <div className="bl-term-cell-label">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span>
        <span className="bl-term-cell-label-text">{label}</span>
      </div>
      <div className="bl-term-cell-value">
        <span className={`bl-term-cell-value-num${tone ? " bl-cyc-tone-" + tone : ""}`}>{value}</span>
      </div>
      {sub && <div className="bl-cyc-cell-sub">{sub}</div>}
    </div>
  );
}

// Tira de indicadores on-chain — versión compacta del tablero de confluencia.
// Cada uno con su barra fondo→techo y el marcador en la posición actual.
function IndicatorStrip({ indicators, onOpen, t, locale }) {
  return (
    <div className="bl-cyc-ind-strip">
      {indicators.map((ind) => (
        <div
          className="bl-cyc-ind bl-cyc-ind-clickable"
          key={ind.key}
          onClick={() => onOpen(ind)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(ind))}
          role="button"
          tabIndex={0}
          title={`${pickLocalized(ind, "note", locale)} · ${t("indicator.tapInfo")}`}
        >
          <div className="bl-cyc-ind-top">
            <span className="bl-cyc-ind-name">{ind.name}</span>
            <span className={`bl-cyc-ind-dot bl-cyc-dot-${ind.status}`} aria-hidden="true" />
          </div>
          <div className="bl-cyc-ind-val">{ind.value}</div>
          <div className="bl-cyc-ind-scale" aria-hidden="true">
            <span className="bl-cyc-ind-mk" style={{ left: `${Math.min(Math.max(ind.pos, 2), 98)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Curva de precio en escala logarítmica (2012→hoy) con halvings, picos y fondos
// marcados, más dots de hitos históricos que cuentan la historia de BTC. Cada
// hito cae sobre la curva (a la altura del precio de su mes) y al tocarlo se
// explica abajo. Historial mensual real; SVG a mano, sin librería de charts.
function PriceCurve({ history, milestones, news }) {
  const { locale } = useLocale();
  const [active, setActive] = useState(null); // índice del hito seleccionado
  if (!Array.isArray(history) || history.length < 2) return null;
  const L = (es, en) => (locale === "en" ? en : es);
  const W = 1000, H = 240, padL = 46, padR = 12, padT = 12, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const mi = (t) => { const [y, m] = t.split("-").map(Number); return y * 12 + (m - 1); };
  const iMin = mi(history[0].t), iMax = mi(history[history.length - 1].t);
  const x = (t) => padL + ((mi(t) - iMin) / (iMax - iMin)) * plotW;
  const allP = history.map((h) => h.p).concat((milestones || []).map((m) => m.price)).filter((v) => v > 0);
  const lo = Math.log10(Math.min(...allP)) - 0.08;
  const hi = Math.log10(Math.max(...allP)) + 0.08;
  const y = (p) => padT + (1 - (Math.log10(p) - lo) / (hi - lo)) * plotH;
  const decades = [];
  for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) decades.push(Math.pow(10, d));
  const fmtP = (v) => (v >= 1000 ? `$${v / 1000 >= 10 ? Math.round(v / 1000) : v / 1000}k` : `$${v}`);
  const years = [];
  for (let yr = Math.ceil(iMin / 12); yr * 12 <= iMax; yr += 2) years.push(yr);
  const linePts = history.map((h) => `${x(h.t).toFixed(1)},${y(h.p).toFixed(1)}`).join(" ");
  const mkColor = { halving: "var(--bl-saved)", peak: "#c56b6b", bottom: "var(--bl-accent-layer)" };
  // Label de hito localizado: la palabra sale del tipo, el número del label curado.
  const mkWord = { halving: L("Halving", "Halving"), peak: L("Pico", "Peak"), bottom: L("Fondo", "Bottom") };
  const mkLabel = (m) => { const n = (String(m.label).match(/\d+/) || [""])[0]; return `${mkWord[m.type] || m.label} ${n}`.trim(); };
  // Hitos: cada evento se apoya sobre la curva, a la altura del precio de su mes.
  const priceAt = new Map(history.map((h) => [h.t, h.p]));
  const events = (news || [])
    .map((e) => ({ ...e, p: priceAt.get(e.t) }))
    .filter((e) => e.p > 0 && mi(e.t) >= iMin && mi(e.t) <= iMax);
  const activeEv = active != null ? events[active] : null;
  const label = (e) => e[locale] || e.es || e.en;
  return (
    <div className="bl-cyc-curve">
      <svg viewBox={`0 0 ${W} ${H}`} className="bl-cyc-curve-svg" role="img" aria-label="Precio de Bitcoin en escala logarítmica con halvings, picos, fondos e hitos históricos">
        {decades.map((d) => (
          <g key={d}>
            <line x1={padL} y1={y(d)} x2={W - padR} y2={y(d)} className="bl-cyc-curve-grid" />
            <text x={padL - 6} y={y(d) + 3} className="bl-cyc-curve-ylab" textAnchor="end">{fmtP(d)}</text>
          </g>
        ))}
        {years.map((yr) => (
          <text key={yr} x={x(`${yr}-01`)} y={H - 6} className="bl-cyc-curve-xlab" textAnchor="middle">{yr}</text>
        ))}
        {(milestones || []).filter((m) => m.type === "halving").map((m, i) => (
          <line key={"hv" + i} x1={x(m.t)} y1={padT} x2={x(m.t)} y2={H - padB} className="bl-cyc-curve-hv" />
        ))}
        <polyline points={linePts} className="bl-cyc-curve-line" />
        {activeEv && <line x1={x(activeEv.t)} y1={y(activeEv.p)} x2={x(activeEv.t)} y2={H - padB} className="bl-cyc-curve-guide" />}
        {(milestones || []).map((m, i) => (
          <circle key={i} cx={x(m.t)} cy={y(m.price)} r="3.6" fill={mkColor[m.type]} className="bl-cyc-curve-mk">
            <title>{`${mkLabel(m)} · ${m.t} · $${m.price.toLocaleString(locale === "en" ? "en-US" : "es-AR")}`}</title>
          </circle>
        ))}
        {events.map((e, i) => {
          const cap = `${e.t} · ${label(e)}`;
          const on = active === i;
          return (
            <g
              key={"ev" + i}
              className="bl-cyc-curve-news-g"
              role="button"
              tabIndex={0}
              aria-label={cap}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(on ? null : i)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setActive(on ? null : i); } }}
            >
              <circle cx={x(e.t)} cy={y(e.p)} r="9" className="bl-cyc-curve-news-hit" />
              <circle cx={x(e.t)} cy={y(e.p)} r={on ? 5 : 3.2} className={`bl-cyc-curve-news${on ? " active" : ""}`} />
              <title>{cap}</title>
            </g>
          );
        })}
      </svg>
      <div className="bl-cyc-curve-legend">
        <span className="bl-cyc-lg"><span className="bl-cyc-sw hv" /> halving</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-curve-dot" style={{ background: "#c56b6b" }} /> {L("pico", "peak")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-curve-dot" style={{ background: "var(--bl-accent-layer)" }} /> {L("fondo", "bottom")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-curve-dot bl-cyc-curve-dot-news" /> {L("hito", "milestone")}</span>
        <span className="bl-cyc-curve-hint">{L("escala log · tocá un hito", "log scale · tap a milestone")}</span>
      </div>
      <div className="bl-cyc-curve-caption" aria-live="polite">
        {activeEv ? (
          <><span className="bl-term-prompt" aria-hidden="true">&gt;</span> <span className="bl-cyc-curve-cap-date">{activeEv.t}</span> · <span className="bl-cyc-curve-cap-text">{label(activeEv)}</span></>
        ) : (
          <span className="bl-cyc-curve-cap-empty">&gt; {L("tocá un hito sobre la curva para ver qué pasó", "tap a milestone on the curve to see what happened")}</span>
        )}
      </div>
    </div>
  );
}

export function BtcCycles() {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null); // indicador abierto en el modal

  useEffect(() => {
    let mounted = true;
    const load = () => api.btcCycles()
      .then((d) => { if (mounted) { setData(d); setError(false); } })
      .catch(() => { if (mounted) setError(true); });
    load();
    const iv = setInterval(load, 10 * 60_000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  if (error && !data) {
    return <div className="bl-terminal bl-cyc-terminal"><div className="bl-terminal-reading">&gt; {t("cycles.error")}</div></div>;
  }
  if (!data) return null;

  const { current, keyDates, cycles, indicators } = data;
  const now = new Date();
  const peak = parseISO(keyDates.peak);
  const daysSincePeak = daysBetween(now, peak);

  // El ciclo en curso trae `markdownSoFar` horneado en el JSON (snapshot de
  // curación). Lo recomputamos en vivo desde el pico real para que la barra del
  // timeline avance con el calendario, igual que la cabecera — si no, el conteo
  // queda congelado en la fecha del snapshot y el indicador deja de servir.
  // `projMax` se clampea a hoy para que el segmento de proyección nunca quede
  // con ancho negativo cuando el día actual pase el máximo proyectado.
  const cyclesLive = cycles.map((c) =>
    c.ongoing
      ? { ...c, markdownSoFar: daysSincePeak, projMax: Math.max(c.projMax, daysSincePeak) }
      : c
  );

  // Ventana de fondo proyectada, computada en vivo desde el pico + rango histórico
  const [loD, hiD] = keyDates.peakToBottomRange;
  const from = new Date(peak.getTime() + loD * DAY);
  const to = new Date(peak.getTime() + hiD * DAY);
  const central = new Date(peak.getTime() + keyDates.avgPeakToBottomDays * DAY);
  const countdown = daysBetween(central, now);
  const localeTag = locale === "en" ? "en-US" : "es-AR";
  const windowLabel = `${fmtMonth(from, locale)}–${fmtMonth(to, locale)} ${to.toLocaleDateString(localeTag, { year: "2-digit" })}`;
  const countdownLabel = countdown > 0 ? t("cycles.countdown", { n: countdown }) : t("cycles.windowActive");

  const syncTime = parseISO(data.meta.updated).toLocaleDateString(localeTag, { day: "2-digit", month: "short" }).replace(".", "");

  // Etiquetas que dependen del dato: la fase sale del enum `phase` (traducible);
  // confluencia y postura son texto libre curado, con variante `*En` en el JSON.
  const phaseKey = { markup: "markup", markdown: "markdown", accumulation: "accumulation", acumulacion: "accumulation" }[current.phase];
  const phaseLabel = phaseKey ? t("cycles.phase." + phaseKey) : current.phaseLabel;
  const confluenceLabel = pickLocalized(current, "confluenceLabel", locale);
  const posture = pickLocalized(current, "posture", locale);

  // Contexto al clickear: abre el IndicatorModal con la explicación (qué es /
  // cómo leerlo / por qué importa) y resalta la zona donde cae el valor actual.
  const openInd = (key, displayValue, matchValue) => setSelected({ key, displayValue, matchValue });
  const numVal = (v) => { const n = parseFloat(String(v).replace(/[^0-9.-]/g, "")); return isNaN(n) ? null : n; };
  const phaseIdx = { markup: 0.5, markdown: 1.5, accumulation: 2.5, acumulacion: 2.5 }[current.phase] ?? null;

  return (
    <>
    <div className="bl-cyc-head">
      <h3 className="bl-cyc-title">{t("cycles.title")}</h3>
      <div className="bl-cyc-subtitle">{t("cycles.subtitle")}</div>
    </div>
    <div className="bl-terminal bl-cyc-terminal" role="region" aria-label={t("cycles.title")}>
      <div className="bl-terminal-header" aria-hidden="true">
        <span className="bl-terminal-prompt-user">bl@layer</span>
        <span className="bl-terminal-prompt-sep">:</span>
        <span className="bl-terminal-prompt-path">~/cycles</span>
        <span className="bl-terminal-prompt-sep">$</span>
        <span className="bl-terminal-prompt-cmd">halving --status</span>
        <span className="bl-terminal-prompt-cursor" />
        <span className="bl-terminal-status">
          <span className="bl-terminal-status-dot" />
          <span className="bl-terminal-status-text">snapshot {syncTime}</span>
          <span className="bl-terminal-status-code">[200]</span>
        </span>
      </div>

      <div className="bl-terminal-reading" aria-live="polite">
        &gt; {t("cycles.reading", { phase: <b key="ph">{phaseLabel.toLowerCase()}</b>, days: daysSincePeak, conf: current.confluence, label: confluenceLabel, window: windowLabel })}
      </div>

      <div className="bl-terminal-grid bl-cyc-grid-stats">
        <Cell label={t("cycles.cell.phase")} value={<><span className="bl-cyc-arrow" aria-hidden="true">▼</span> {phaseLabel}</>} sub={t("cycles.dayFromPeak", { n: daysSincePeak })} tone="down"
          onClick={() => openInd("PHASE", phaseLabel, phaseIdx)} hint={t("indicator.tapInfo")} />
        <Cell label={t("cycles.cell.price")} value={`~$${(current.price / 1000).toFixed(0)}k`} sub={`200W ~$${(current.support200w / 1000).toFixed(0)}k (${current.priceVs200wPct >= 0 ? "+" : ""}${current.priceVs200wPct}%)`}
          onClick={() => openInd("PRICE", `~$${(current.price / 1000).toFixed(0)}k`, current.priceVs200wPct)} hint={t("indicator.tapInfo")} />
        <Cell label={t("cycles.cell.confluence")} value={`${current.confluence}/100`} sub={confluenceLabel} tone="build"
          onClick={() => openInd("CONFLUENCE", `${current.confluence}/100`, current.confluence)} hint={t("indicator.tapInfo")} />
        <Cell label={t("cycles.cell.projBottom")} value={windowLabel} sub={countdownLabel} tone="saved"
          onClick={() => openInd("PROJBOTTOM", windowLabel, null)} hint={t("indicator.tapInfo")} />
      </div>

      <div className="bl-cyc-section-title">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span> {t("cycles.section.cycles")}
      </div>
      <PhaseTimeline cycles={cyclesLive} />

      <div className="bl-cyc-section-title">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span> {t("cycles.section.price")}
      </div>
      <PriceCurve history={data.priceHistory} milestones={data.milestones} news={data.newsEvents} />

      <div className="bl-cyc-section-title">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span> {t("cycles.section.confluence")}
      </div>
      <IndicatorStrip indicators={indicators} onOpen={(ind) => openInd(ind.key, ind.value, numVal(ind.value))} t={t} locale={locale} />

      <div className="bl-cyc-posture">
        <span className="bl-cyc-posture-dot" aria-hidden="true" />
        <span className="bl-cyc-posture-txt"><b>{t("cycles.posture")}</b> {posture} <span className="bl-cyc-inval">{t("cycles.invalidation", { price: (current.invalidationPrice / 1000).toFixed(0) })}</span></span>
      </div>
    </div>
    <IndicatorModal indicator={selected} onClose={() => setSelected(null)} />
    </>
  );
}

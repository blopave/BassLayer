import { useEffect, useRef, useState, Suspense } from "react";
import { api } from "../utils/api";
import { lazyNamed } from "../utils/lazy";

const IndicatorModal = lazyNamed(() => import("./IndicatorModal"), "IndicatorModal");
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
// marcados, más dots de hitos históricos que cuentan la historia de BTC. Todos
// los puntos (halving/pico/fondo/hito) son interactivos: al tocar cualquiera se
// explica abajo con su contexto (precio del momento + recompensa/ROI/drawdown o
// la categoría del hito). Historial mensual real; SVG a mano, sin librería.

// Categorías de hitos: etiqueta bilingüe + color propio para el chip. Los datos
// ya traen `cat` por evento (macro/regulacion/colapso/protocolo/mercado/adopcion);
// acá le damos nombre legible y color, sin inventar nada nuevo.
const NEWS_CAT = {
  macro:      { es: "Macro",      en: "Macro",      color: "#c9a227" },
  regulacion: { es: "Regulación", en: "Regulation", color: "#6b8fc5" },
  colapso:    { es: "Colapso",    en: "Collapse",   color: "#c56b6b" },
  protocolo:  { es: "Protocolo",  en: "Protocol",   color: "var(--bl-accent-layer)" },
  mercado:    { es: "Mercado",    en: "Market",     color: "#9b8fc5" },
  adopcion:   { es: "Adopción",   en: "Adoption",   color: "var(--bl-up)" },
};

function PriceCurve({ history, milestones, news, cycles, realizedPrice }) {
  const { locale } = useLocale();
  const [active, setActive] = useState(null); // id del punto seleccionado
  if (!Array.isArray(history) || history.length < 2) return null;
  const L = (es, en) => (locale === "en" ? en : es);
  const localeTag = locale === "en" ? "en-US" : "es-AR";
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
  const money = (v) => `$${Math.round(v).toLocaleString(localeTag)}`;
  // "2013-04" → "abr 2013" / "Apr 2013" (mes localizado, sin depender del huso).
  const fmtYM = (t) => { const d = new Date(t + "-15T12:00:00"); return `${fmtMonth(d, locale)} ${d.getFullYear()}`; };
  const years = [];
  for (let yr = Math.ceil(iMin / 12); yr * 12 <= iMax; yr += 2) years.push(yr);
  const linePts = history.map((h) => `${x(h.t).toFixed(1)},${y(h.p).toFixed(1)}`).join(" ");
  const mkColor = { halving: "var(--bl-saved)", peak: "#c56b6b", bottom: "var(--bl-accent-layer)" };
  // Label de hito localizado: la palabra sale del tipo, el número del label curado.
  const mkWord = { halving: L("Halving", "Halving"), peak: L("Pico", "Peak"), bottom: L("Fondo", "Bottom") };
  const mkNum = (m) => (String(m.label).match(/\d+/) || [""])[0];
  const mkLabel = (m) => `${mkWord[m.type] || m.label} ${mkNum(m)}`.trim();

  // Ciclo por número: para colgar del pico su ROI (halving→pico) y del fondo su
  // drawdown (pico→fondo). Ambos ya curados en `cycles`, sin recomputar.
  const cycleByN = new Map((cycles || []).map((c) => [c.n, c]));
  // Recompensa por bloque tras cada halving: constante de protocolo (50→25→12,5…).
  const rewardText = (n) => {
    const after = 50 / 2 ** Number(n), before = after * 2;
    return L(
      `recompensa ${before.toLocaleString("es-AR")}→${after.toLocaleString("es-AR")} BTC/bloque`,
      `reward ${before.toLocaleString("en-US")}→${after.toLocaleString("en-US")} BTC/block`
    );
  };

  // Hitos: cada evento se apoya sobre la curva, a la altura del precio de su mes.
  const priceAt = new Map(history.map((h) => [h.t, h.p]));
  const events = (news || [])
    .map((e) => ({ ...e, p: priceAt.get(e.t) }))
    .filter((e) => e.p > 0 && mi(e.t) >= iMin && mi(e.t) <= iMax);
  const newsLabel = (e) => e[locale] || e.es || e.en;

  // Descriptor unificado del punto activo → alimenta el caption rico de abajo.
  // Cada punto tiene id ("mk3"/"ev5"), color, palabra-chip, título, y una línea
  // meta con fecha · precio · dato extra según el tipo.
  const describe = (id) => {
    const [kind, idx] = [id.slice(0, 2), Number(id.slice(2))];
    if (kind === "mk") {
      const m = (milestones || [])[idx];
      if (!m) return null;
      const c = cycleByN.get(Number(mkNum(m)));
      let extra = null;
      if (m.type === "halving") extra = rewardText(mkNum(m));
      else if (m.type === "peak" && c?.roi) extra = L(`${c.roi} desde el halving`, `${c.roi} from halving`);
      else if (m.type === "bottom" && c?.drawdown) extra = L(`${c.drawdown} desde el pico`, `${c.drawdown} from peak`);
      return {
        color: mkColor[m.type], chip: mkWord[m.type], title: mkLabel(m),
        meta: [fmtYM(m.t), money(m.price), extra].filter(Boolean),
      };
    }
    const e = events[idx];
    if (!e) return null;
    const cat = NEWS_CAT[e.cat];
    return {
      color: cat?.color || "var(--bl-text-ter)", chip: cat ? cat[locale] || cat.es : null,
      title: newsLabel(e), meta: [fmtYM(e.t), `BTC ${money(e.p)}`],
    };
  };
  const activeDesc = active ? describe(active) : null;
  const activePt = active
    ? (active.slice(0, 2) === "mk" ? (milestones || [])[Number(active.slice(2))] : events[Number(active.slice(2))])
    : null;
  const activeXY = activePt ? { t: activePt.t, p: activePt.p ?? activePt.price } : null;
  // Toggle con teclado/click; hover/focus fijan; segundo tap sobre el mismo cierra.
  const toggle = (id) => setActive((cur) => (cur === id ? null : id));

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
        {/* Precio realizado (costo base agregado on-chain): la línea que separa
            mercado en ganancia de mercado en pérdida. Data viva, sin key. */}
        {realizedPrice > 0 && Math.log10(realizedPrice) > lo && Math.log10(realizedPrice) < hi && (
          <g>
            <line x1={padL} y1={y(realizedPrice)} x2={W - padR} y2={y(realizedPrice)} className="bl-cyc-curve-rlz" />
            <text x={W - padR - 4} y={y(realizedPrice) - 5} className="bl-cyc-curve-rlz-lab" textAnchor="end">
              {L("precio realizado", "realized price")} {fmtP(Math.round(realizedPrice))}
            </text>
          </g>
        )}
        <polyline points={linePts} className="bl-cyc-curve-line" />
        {activeXY && <line x1={x(activeXY.t)} y1={y(activeXY.p)} x2={x(activeXY.t)} y2={H - padB} className="bl-cyc-curve-guide" />}
        {(milestones || []).map((m, i) => {
          const id = "mk" + i, on = active === id;
          return (
            <g
              key={id}
              className="bl-cyc-curve-mk-g"
              role="button"
              tabIndex={0}
              aria-label={`${mkLabel(m)} · ${fmtYM(m.t)} · ${money(m.price)}`}
              onMouseEnter={() => setActive(id)}
              onFocus={() => setActive(id)}
              onClick={() => toggle(id)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(id); } }}
            >
              <circle cx={x(m.t)} cy={y(m.price)} r="9" className="bl-cyc-curve-news-hit" />
              <circle cx={x(m.t)} cy={y(m.price)} r={on ? 5.4 : 3.6} fill={mkColor[m.type]} className={`bl-cyc-curve-mk${on ? " active" : ""}`} />
            </g>
          );
        })}
        {events.map((e, i) => {
          const id = "ev" + i, on = active === id;
          return (
            <g
              key={id}
              className="bl-cyc-curve-news-g"
              role="button"
              tabIndex={0}
              aria-label={`${fmtYM(e.t)} · ${newsLabel(e)}`}
              onMouseEnter={() => setActive(id)}
              onFocus={() => setActive(id)}
              onClick={() => toggle(id)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(id); } }}
            >
              <circle cx={x(e.t)} cy={y(e.p)} r="9" className="bl-cyc-curve-news-hit" />
              <circle cx={x(e.t)} cy={y(e.p)} r={on ? 5 : 3.2} className={`bl-cyc-curve-news${on ? " active" : ""}`} />
            </g>
          );
        })}
      </svg>
      <div className="bl-cyc-curve-legend">
        <span className="bl-cyc-lg"><span className="bl-cyc-sw hv" /> halving</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-curve-dot" style={{ background: "#c56b6b" }} /> {L("pico", "peak")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-curve-dot" style={{ background: "var(--bl-accent-layer)" }} /> {L("fondo", "bottom")}</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-curve-dot bl-cyc-curve-dot-news" /> {L("hito", "milestone")}</span>
        <span className="bl-cyc-curve-hint">{L("escala log · tocá un punto", "log scale · tap a point")}</span>
      </div>
      <div className="bl-cyc-curve-caption" aria-live="polite">
        {activeDesc ? (
          <div className="bl-cyc-cap-rich">
            <div className="bl-cyc-cap-head">
              <span className="bl-term-prompt" aria-hidden="true">&gt;</span>
              {activeDesc.chip && <span className="bl-cyc-cap-badge" style={{ color: activeDesc.color, borderColor: activeDesc.color }}>{activeDesc.chip}</span>}
              <span className="bl-cyc-curve-cap-text">{activeDesc.title}</span>
            </div>
            <div className="bl-cyc-cap-meta">{activeDesc.meta.join(" · ")}</div>
          </div>
        ) : (
          <span className="bl-cyc-curve-cap-empty">&gt; {L("tocá cualquier punto de la curva para ver qué pasó", "tap any point on the curve to see what happened")}</span>
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
  const [network, setNetwork] = useState(null);   // fees + dificultad (mempool)

  useEffect(() => {
    let mounted = true;
    const load = () => api.btcCycles()
      .then((d) => { if (mounted) { setData(d); setError(false); } })
      .catch(() => { if (mounted) setError(true); });
    load();
    const loadNet = () => api.btcNetwork()
      .then((n) => { if (mounted) setNetwork(n); })
      .catch(() => {});
    loadNet();
    const iv = setInterval(load, 10 * 60_000);
    const ivNet = setInterval(loadNet, 10 * 60_000);
    return () => { mounted = false; clearInterval(iv); clearInterval(ivNet); };
  }, []);

  if (error && !data) {
    return <div className="bl-terminal bl-cyc-terminal"><div className="bl-terminal-reading">&gt; {t("cycles.error")}</div></div>;
  }
  if (!data) return null;

  const { current, keyDates, cycles, indicators } = data;
  const now = new Date();
  const peak = parseISO(keyDates.peak);
  const daysSincePeak = daysBetween(now, peak);

  // Los días de markdown del ciclo en curso se computan en vivo desde el pico
  // real (mismo valor que la cabecera), no vienen del dato — así la barra del
  // timeline avanza con el calendario en vez de quedar congelada en un snapshot.
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
      <PriceCurve history={data.priceHistory} milestones={data.milestones} news={data.newsEvents} cycles={cycles} realizedPrice={data.onchain?.realizedPrice} />

      <div className="bl-cyc-section-title">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span> {t("cycles.section.confluence")}
      </div>
      <IndicatorStrip indicators={indicators} onOpen={(ind) => openInd(ind.key, ind.value, numVal(ind.value))} t={t} locale={locale} />

      {/* Red Bitcoin en vivo (mempool.space): fees + ajuste de dificultad con
          progress bar — el patrón visual de mempool, hermano de los halvings. */}
      {network && (network.fees || network.difficulty) && (
        <>
          <div className="bl-cyc-section-title">
            <span className="bl-term-prompt" aria-hidden="true">&gt;</span> {t("cycles.section.network")}
          </div>
          <div className="bl-cyc-network">
            {network.fees && (
              <div className="bl-cyc-net-item">
                <span className="bl-cyc-net-k">{t("cycles.net.fees")}</span>
                <span className="bl-cyc-net-v">
                  <b>{network.fees.fast}</b>/{network.fees.half}/{network.fees.hour}
                </span>
              </div>
            )}
            {network.difficulty && (
              <div className="bl-cyc-net-item bl-cyc-net-diff">
                <span className="bl-cyc-net-k">{t("cycles.net.adjust")}</span>
                <span className="bl-cyc-net-bar" role="progressbar" aria-valuenow={network.difficulty.progress} aria-valuemin={0} aria-valuemax={100}>
                  <span className="bl-cyc-net-bar-fill" style={{ width: `${Math.min(100, network.difficulty.progress)}%` }} />
                </span>
                <span className="bl-cyc-net-v">
                  {network.difficulty.progress}% · <b className={network.difficulty.change >= 0 ? "up" : "down"}>{network.difficulty.change >= 0 ? "+" : ""}{network.difficulty.change}%</b>
                  {network.difficulty.retargetDate ? ` · ~${Math.max(0, Math.round((network.difficulty.retargetDate - Date.now()) / 86400000))}d` : ""}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="bl-cyc-posture">
        <span className="bl-cyc-posture-dot" aria-hidden="true" />
        <span className="bl-cyc-posture-txt"><b>{t("cycles.posture")}</b> {posture} <span className="bl-cyc-inval">{t("cycles.invalidation", { price: (current.invalidationPrice / 1000).toFixed(0) })}</span></span>
      </div>
    </div>
    {selected && (
      <Suspense fallback={null}>
        <IndicatorModal indicator={selected} onClose={() => setSelected(null)} />
      </Suspense>
    )}
    </>
  );
}

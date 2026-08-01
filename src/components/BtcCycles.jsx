import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useLocale } from "../hooks/useLocale";

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
function fmtMonth(d) {
  return d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
}

// Timeline de fases: cada ciclo alineado a su halving (día 0). Segmentos
// posicionados en % sobre un eje común para que sean comparables. Sin librería
// de charts — divs absolutos, mismo criterio que las sparklines a mano.
function PhaseTimeline({ cycles }) {
  const years = [365, 730, 1095, 1460];
  return (
    <div className="bl-cyc-chart" role="img" aria-label="Duración de las fases de cada ciclo de halving, alineadas al día del halving">
      <div className="bl-cyc-rows">
        <div className="bl-cyc-axis" aria-hidden="true">
          <span className="bl-cyc-grid bl-cyc-grid-zero" style={{ left: "0%" }} />
          {years.map((y, i) => (
            <span className="bl-cyc-grid" key={y} style={{ left: `${pct(y)}%` }}>
              <span className="bl-cyc-yr">{`Año ${i + 1}`}</span>
            </span>
          ))}
        </div>
        {cycles.map((c) => (
          <div className="bl-cyc-row" key={c.n}>
            <div className="bl-cyc-row-label">
              <span className="bl-cyc-cy">C{c.n}</span>
              <span className="bl-cyc-cy-date">{c.halvingDate}</span>
            </div>
            <div className="bl-cyc-track">
              {/* markup */}
              <div className="bl-cyc-seg up" style={{ left: `${pct(0)}%`, width: `calc(${pct(c.markup)}% - 2px)` }} title={`Markup · ${c.markup} d`}>
                <span className="bl-cyc-d">{c.markup}d</span>
              </div>
              {!c.ongoing ? (
                <>
                  <div className="bl-cyc-seg down" style={{ left: `${pct(c.markup)}%`, width: `calc(${pct(c.markdown)}% - 2px)` }} title={`Markdown · ${c.markdown} d`}>
                    <span className="bl-cyc-d">{c.markdown}d</span>
                  </div>
                  <div className="bl-cyc-seg build" style={{ left: `${pct(c.markup + c.markdown)}%`, width: `calc(${pct(c.recovery)}% - 2px)` }} title={`Acumulación · ${c.recovery} d`}>
                    <span className="bl-cyc-d">{c.recovery}d</span>
                  </div>
                  <span className="bl-cyc-mk hv" style={{ left: `${pct(0)}%` }} title={`Halving · ${c.halvingDate}`} />
                  <span className="bl-cyc-mk pk" style={{ left: `${pct(c.markup)}%` }} title={`Pico · ${c.peakDate}`} />
                  <span className="bl-cyc-mk bt" style={{ left: `${pct(c.markup + c.markdown)}%` }} title={`Fondo · ${c.bottomDate}`} />
                </>
              ) : (
                <>
                  <div className="bl-cyc-seg down" style={{ left: `${pct(c.markup)}%`, width: `calc(${pct(c.markdownSoFar)}% - 2px)` }} title={`Markdown en curso · ${c.markdownSoFar} d`}>
                    <span className="bl-cyc-d">{c.markdownSoFar}d</span>
                  </div>
                  <div className="bl-cyc-seg proj" style={{ left: `${pct(c.markup + c.markdownSoFar)}%`, width: `calc(${pct(c.projMax - c.markdownSoFar)}% - 2px)` }} title="Fondo proyectado (oct–nov 2026)">
                    <span className="bl-cyc-d">proy.</span>
                  </div>
                  <span className="bl-cyc-mk hv" style={{ left: `${pct(0)}%` }} title={`Halving · ${c.halvingDate}`} />
                  <span className="bl-cyc-mk pk" style={{ left: `${pct(c.markup)}%` }} title={`Pico · ${c.peakDate}`} />
                  <span className="bl-cyc-now" style={{ left: `${pct(c.markup + c.markdownSoFar)}%` }} title="Hoy" />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="bl-cyc-legend" aria-hidden="true">
        <span className="bl-cyc-lg"><span className="bl-cyc-sw hv" /> halving</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw up" /> markup</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw down" /> markdown</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw build" /> acumulación</span>
        <span className="bl-cyc-lg"><span className="bl-cyc-sw proj" /> proyectado</span>
      </div>
    </div>
  );
}

function Cell({ label, value, sub, tone }) {
  return (
    <div className="bl-term-cell">
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
function IndicatorStrip({ indicators }) {
  return (
    <div className="bl-cyc-ind-strip">
      {indicators.map((ind) => (
        <div className="bl-cyc-ind" key={ind.key} title={ind.note}>
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

export function BtcCycles() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

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
    return <div className="bl-terminal bl-cyc-terminal"><div className="bl-terminal-reading">&gt; error: no se pudo cargar el ciclo. tocá para reintentar.</div></div>;
  }
  if (!data) return null;

  const { current, keyDates, cycles, indicators } = data;
  const now = new Date();
  const peak = parseISO(keyDates.peak);
  const daysSincePeak = daysBetween(now, peak);

  // Ventana de fondo proyectada, computada en vivo desde el pico + rango histórico
  const [loD, hiD] = keyDates.peakToBottomRange;
  const from = new Date(peak.getTime() + loD * DAY);
  const to = new Date(peak.getTime() + hiD * DAY);
  const central = new Date(peak.getTime() + keyDates.avgPeakToBottomDays * DAY);
  const countdown = daysBetween(central, now);
  const windowLabel = `${fmtMonth(from)}–${fmtMonth(to)} ${to.toLocaleDateString("es-AR", { year: "2-digit" })}`;
  const countdownLabel = countdown > 0 ? `faltan ~${countdown} d` : "ventana activa";

  const syncTime = parseISO(data.meta.updated).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }).replace(".", "");

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
        &gt; lectura: fase <b>{current.phaseLabel.toLowerCase()}</b> · día {daysSincePeak} del pico · confluencia {current.confluence}/100 · {current.confluenceLabel} · fondo proy. {windowLabel}
      </div>

      <div className="bl-terminal-grid bl-cyc-grid-stats">
        <Cell label="FASE" value={<><span className="bl-cyc-arrow" aria-hidden="true">▼</span> {current.phaseLabel}</>} sub={`día ${daysSincePeak} del pico`} tone="down" />
        <Cell label="PRECIO" value={`~$${(current.price / 1000).toFixed(0)}k`} sub={`200W ~$${(current.support200w / 1000).toFixed(0)}k (${current.priceVs200wPct >= 0 ? "+" : ""}${current.priceVs200wPct}%)`} />
        <Cell label="CONFLUENCIA" value={`${current.confluence}/100`} sub={current.confluenceLabel} tone="build" />
        <Cell label="FONDO.PROY" value={windowLabel} sub={countdownLabel} tone="saved" />
      </div>

      <div className="bl-cyc-section-title">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span> ciclos --alineados-al-halving
      </div>
      <PhaseTimeline cycles={cycles} />

      <div className="bl-cyc-section-title">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span> confluencia --on-chain
      </div>
      <IndicatorStrip indicators={indicators} />

      <div className="bl-cyc-posture">
        <span className="bl-cyc-posture-dot" aria-hidden="true" />
        <span className="bl-cyc-posture-txt"><b>Postura:</b> {current.posture} <span className="bl-cyc-inval">· invalida la tesis: nuevo ATH &gt; ${(current.invalidationPrice / 1000).toFixed(0)}k</span></span>
      </div>
    </div>
    </>
  );
}

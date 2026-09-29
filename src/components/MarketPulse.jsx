import { useEffect, useState, Suspense } from "react";
import { api } from "../utils/api";
import { lazyNamed } from "../utils/lazy";
import { useLocale } from "../hooks/useLocale";
import { formatMarketCap } from "../utils/format";

// Solo baja al tocar un indicador: es el componente más pesado de Layer.
const IndicatorModal = lazyNamed(() => import("./IndicatorModal"), "IndicatorModal");

// Pulso del mercado (dirección B, sept 2026): reemplaza al terminal, la barra
// del dólar y el índice lateral. Un solo módulo con un solo lenguaje —
// etiqueta legible, número mono—. Desktop: panel fijo en la columna derecha.
// Mobile: tira de una línea (lectura + miedo/codicia + blue) que se despliega.
// Datos: /api/dashboard y /api/dolar, cada 5 min.

const FNG_KEY = { "extreme fear": "extremeFear", fear: "fear", neutral: "neutral", greed: "greed", "extreme greed": "extremeGreed" };

function useEvery5m(fetcher) {
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () => fetcher().then((d) => alive && setData(d)).catch(() => {}).finally(() => alive && setPending(false));
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, [fetcher]);
  return [data, pending];
}

// Lectura del día con reglas simples sobre la capitalización y el miedo/codicia.
function reading(d, t) {
  const mc = d?.marketCapChange24h, fg = d?.fearGreed?.value;
  const key = mc == null ? "noSignal" : mc >= 1.5 ? "greenDay" : mc <= -1.5 ? "redDay" : mc >= 0.5 ? "upTimid" : mc <= -0.5 ? "downTimid" : "flat";
  const flag = fg != null && fg < 25 ? t("dashboard.reading.extremeFear") : fg != null && fg > 75 ? t("dashboard.reading.euphoria") : null;
  const text = t(`dashboard.reading.${key}`);
  return { text: text.charAt(0).toUpperCase() + text.slice(1), flag, tone: mc <= -0.5 ? "down" : mc >= 0.5 ? "up" : "" };
}

export function MarketPulse() {
  const { t, locale } = useLocale();
  const [dash, dashPending] = useEvery5m(api.dashboard);
  const [dolar] = useEvery5m(api.dolar);
  const [open, setOpen] = useState(false);       // mobile: tira desplegada
  const [usdt, setUsdt] = useState(false);       // tabla USDT/ARS por exchange
  const [selected, setSelected] = useState(null);

  if (!dash) return dashPending ? <section className="bl-mpulse is-loading" aria-hidden="true" /> : null;

  const nf = (n, dec = 0) => Number(n).toLocaleString(locale === "en" ? "en-US" : "es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const signed = (n) => `${n >= 0 ? "+" : "−"}${nf(Math.abs(n), 1)}%`;
  const r = reading(dash, t);
  const mc = dash.marketCapChange24h;
  const fg = dash.fearGreed?.value;
  const fgColor = fg != null ? `hsl(${(fg / 100) * 120}, 55%, var(--bl-fng-l, 55%))` : undefined;
  const fgLabel = dash.fearGreed?.label ? t(`pulse.fng.${FNG_KEY[dash.fearGreed.label.toLowerCase()] || "neutral"}`) : "";
  const D = dolar?.dolares || {};
  const openIndicator = (key, displayValue, matchValue) => setSelected({ key, displayValue, matchValue });

  const cells = [
    dash.btcDominance != null && ["btcDominance", t("pulse.btcDom"), `${nf(dash.btcDominance, 1)}%`, dash.btcDominance],
    dash.ethDominance != null && ["ethDominance", t("pulse.ethDom"), `${nf(dash.ethDominance, 1)}%`, dash.ethDominance],
    dash.totalMarketCap != null && ["marketCap", t("pulse.cap"), formatMarketCap(dash.totalMarketCap), mc ?? 0],
    fg != null && ["fearGreed", t("pulse.fng"), fg, fg],
  ].filter(Boolean);

  return (
    <section className={`bl-mpulse${open ? " is-open" : ""}`} aria-label={t("pulse.title")}>
      <div className="bl-mpulse-head" aria-hidden="true">
        <span>{t("pulse.title")}</span>
        <span className="bl-mpulse-live">{t("pulse.live")}</span>
      </div>

      {/* Mobile: una línea que abre el resto. */}
      <button type="button" className="bl-mpulse-sum" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`bl-mpulse-rd ${r.tone}`}>{r.text}</span>
        <span className="bl-mpulse-q">
          {fg != null && <span>F&amp;G <b style={{ color: fgColor }}>{fg}</b></span>}
          {D.blue && <span>Blue <b>${nf(D.blue.venta)}</b></span>}
        </span>
        <svg className="bl-mpulse-chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
      </button>

      <div className="bl-mpulse-body">
        <div className="bl-mpulse-read">
          <b className={r.tone}>{r.text}</b>
          {mc != null && <span>{t(mc < 0 ? "pulse.capDown" : "pulse.capUp", { n: nf(Math.abs(mc), 1) })}{r.flag ? ` · ${r.flag}` : ""}</span>}
        </div>

        <div className="bl-mpulse-grid">
          {cells.map(([key, label, value, match]) => (
            <button key={key} type="button" className="bl-mpulse-c" onClick={() => openIndicator(key, value, match)} aria-label={`${t("dashboard.viewInfo")} ${label}`}>
              <span className="k">{label}</span>
              {key === "fearGreed" ? (
                <>
                  <span className="v" style={{ color: fgColor }}>{value}<small>{fgLabel}</small></span>
                  <span className="bar" aria-hidden="true"><span style={{ width: `${fg}%`, background: fgColor }} /></span>
                </>
              ) : (
                <span className="v">{value}{key === "marketCap" && mc != null && <small className={mc >= 0 ? "up" : "down"}>{signed(mc)}</small>}</span>
              )}
            </button>
          ))}
        </div>

        {dolar && (
          <>
            <div className="bl-mpulse-sec">{t("pulse.dollar")}</div>
            <div className="bl-mpulse-rows">
              {D.blue && <div>{t("pulse.blue")}<b>${nf(D.blue.venta)}</b></div>}
              {D.oficial && <div>{t("pulse.official")}<b>${nf(D.oficial.venta)}</b></div>}
              {D.cripto && <div>{t("pulse.crypto")}<b>${nf(D.cripto.venta)}</b></div>}
              {dolar.brecha != null && <div>{t("pulse.gap")}<b className="acc">{dolar.brecha > 0 ? "+" : ""}{nf(dolar.brecha, 1)}%</b></div>}
            </div>
            {dolar.usdt?.length > 0 && (
              <button type="button" className="bl-mpulse-more" aria-expanded={usdt} onClick={() => setUsdt((v) => !v)}>
                {t("pulse.usdt")} <span aria-hidden="true">{usdt ? "−" : "+"}</span>
              </button>
            )}
            {usdt && (
              <table className="bl-mpulse-usdt">
                <thead><tr><th scope="col">USDT/ARS</th><th scope="col">{t("dolar.bid")}</th><th scope="col">{t("dolar.ask")}</th></tr></thead>
                <tbody>
                  {dolar.usdt.map((q) => <tr key={q.exchange}><td>{q.exchange}</td><td>{nf(q.bid, 2)}</td><td>{nf(q.ask, 2)}</td></tr>)}
                </tbody>
              </table>
            )}
          </>
        )}

        {dash.trending?.length > 0 && (
          <>
            <div className="bl-mpulse-sec">{t("pulse.trending")}</div>
            <div className="bl-mpulse-trend">
              {dash.trending.slice(0, 6).map((c) => (
                <span key={c.symbol} title={c.name}>
                  {c.symbol}
                  {c.change24h != null && <em className={c.change24h >= 0 ? "up" : "down"}>{signed(c.change24h)}</em>}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {selected && (
        <Suspense fallback={null}>
          <IndicatorModal indicator={selected} onClose={() => setSelected(null)} />
        </Suspense>
      )}
    </section>
  );
}

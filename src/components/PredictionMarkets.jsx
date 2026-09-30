import { useEffect, useState } from "react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";
import { api, shared } from "../utils/api";
import { formatUsdCompact } from "../utils/format";
import { TranslateToggle, useTranslatedTitle } from "./TranslatedTitle";

// Predicciones (sept 2026): un evento de Polymarket por tarjeta con sus
// resultados principales, agrupados por tema. Los títulos vienen traducidos
// por máquina (marcado, con el original a un toque); las etiquetas de
// resultado, por glosario en el server.
const GROUP_ORDER = ["crypto", "fed", "macro", "tech", "argentina"];

function daysLeft(iso) {
  const ms = iso ? new Date(iso).getTime() - Date.now() : NaN;
  if (!(ms > 0)) return null;
  const d = Math.ceil(ms / 86_400_000);
  return d < 60 ? `${d} d` : `${Math.round(d / 30)} m`;
}

function PredictionCard({ ev, idx, es }) {
  const { t } = useLocale();
  const tr = useTranslatedTitle(ev, es);
  const left = daysLeft(ev.endDate);
  return (
    <article className="bl-predict-card bl-reveal" style={{ transitionDelay: `${Math.min(idx * 0.03, 0.24)}s` }}>
      <div className="bl-predict-top">
        <h4 className="bl-predict-question" lang={tr.lang}>{tr.title}</h4>
        {left && <span className="bl-predict-deadline" title={t("predict.closes")}>{left}</span>}
      </div>
      <ul className="bl-predict-outcomes">
        {ev.outcomes.map((o) => (
          <li key={o.label} className="bl-predict-row">
            <span className="bl-predict-label">{o.binary ? t("predict.yes") : (es && o.labelEs) || o.label}</span>
            <span className="bl-predict-bar" aria-hidden="true"><span className="bl-predict-fill" style={{ width: `${o.pct}%` }} /></span>
            <span className="bl-predict-pct">{o.pct}%</span>
          </li>
        ))}
      </ul>
      <div className="bl-predict-foot">
        {tr.translated ? <TranslateToggle tr={tr} /> : <span />}
        <a className="bl-predict-link" href={ev.url} target="_blank" rel="noopener noreferrer">
          <span className="bl-predict-vol">{formatUsdCompact(ev.volume24h)} {t("predict.vol24")} · </span>Polymarket <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

export function PredictionMarkets() {
  const { t, locale } = useLocale();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    // Misma caché que la curva de Layer (useLayerData): un solo pedido.
    shared("predictions", api.predictionMarkets)
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setError(true))
      .then(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const listRef = useScrollReveal(loading, "predictions");
  const groups = GROUP_ORDER
    .map((key) => ({ key, items: events.filter((e) => e.group === key) }))
    .filter((g) => g.items.length);

  if (loading) {
    return <div className="bl-feed"><div className="bl-loading-text">{t("predict.loading")}<span>.</span><span>.</span><span>.</span></div></div>;
  }
  if (error) {
    return <div className="bl-feed"><div className="bl-error" onClick={load} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && load()}>{t("predict.error")}</div></div>;
  }
  if (!groups.length) {
    return <div className="bl-feed"><div className="bl-empty">{t("predict.empty")}</div></div>;
  }

  return (
    <div className="bl-predict-feed" role="region" aria-label={t("predict.aria")} ref={listRef}>
      <p className="bl-predict-sub">{t("predict.sub")}</p>
      {groups.map((g) => (
        <section key={g.key} className="bl-mkt-group bl-predict-group" data-group={g.key}>
          <h3 className="bl-mkt-group-label">{t(`predict.group.${g.key}`)}</h3>
          <div className="bl-predict-grid">
            {g.items.map((ev, idx) => <PredictionCard key={ev.id} ev={ev} idx={idx} es={locale === "es"} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

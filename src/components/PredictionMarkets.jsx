import { useEffect, useState } from "react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";
import { api, shared } from "../utils/api";
import { formatUsdCompact } from "../utils/format";
import { useTranslatedTitle } from "./TranslatedTitle";
import { FilterBar } from "./FilterBar";
import { SectionHead } from "./SectionHead";

// Predicciones (oct 2026, "B · Filas"): un evento de Polymarket por fila, con
// sus resultados principales en barras finas, agrupados por tema. Los títulos
// vienen traducidos por máquina (lo dice el pie); las etiquetas de resultado,
// por glosario en el server.
const GROUP_ORDER = ["crypto", "fed", "macro", "tech", "argentina"];

function Prediccion({ ev, idx }) {
  const { t, locale } = useLocale();
  const es = locale === "es";
  const tr = useTranslatedTitle(ev, es);
  const vence = ev.endDate ? new Date(ev.endDate).toLocaleDateString(es ? "es-AR" : "en-US", { day: "numeric", month: "short" }) : "";
  return (
    <article className="bl-pm bl-reveal" style={{ transitionDelay: `${Math.min(idx * 0.03, 0.24)}s` }}>
      <h4 className="bl-pm-t" lang={tr.lang}>{tr.title}</h4>
      <ul className="bl-pm-out">
        {ev.outcomes.map((o) => (
          <li key={o.label}>
            <span className="bl-pm-l">{o.binary ? t("predict.yes") : (es && o.labelEs) || o.label}<i style={{ width: `${o.pct}%` }} aria-hidden="true" /></span>
            <span className="bl-pm-p">{o.pct}%</span>
          </li>
        ))}
      </ul>
      <div className="bl-pm-meta">
        {[vence && t("predict.closesOn", { date: vence }), ev.volume24h > 0 && t("predict.volToday", { v: formatUsdCompact(ev.volume24h, locale) })].filter(Boolean).join(" · ")}
        {" · "}<a href={ev.url} target="_blank" rel="noopener noreferrer">Polymarket <span aria-hidden="true">↗</span></a>
      </div>
    </article>
  );
}

export function PredictionMarkets() {
  const { t } = useLocale();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tema, setTema] = useState("All");

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

  const listRef = useScrollReveal(loading, tema);
  const groups = GROUP_ORDER
    .map((key) => ({ key, items: events.filter((e) => e.group === key) }))
    .filter((g) => g.items.length);
  const visibles = tema === "All" ? groups : groups.filter((g) => g.key === tema);
  const n = visibles.reduce((s, g) => s + g.items.length, 0);

  if (loading) {
    return <div className="bl-feed"><div className="bl-loading-text">{t("predict.loading")}<span>.</span><span>.</span><span>.</span></div></div>;
  }
  if (error) {
    return <div className="bl-feed"><div className="bl-error" onClick={load} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && load()}>{t("predict.error")}</div></div>;
  }
  if (!groups.length) {
    return <div className="bl-feed"><div className="bl-empty">{t("predict.empty")}</div></div>;
  }

  let idx = 0;
  return (
    <>
      {groups.length > 1 && (
        <FilterBar
          items={["All", ...groups.map((g) => g.key)]}
          active={tema}
          onChange={setTema}
          className="layer-filters"
          labels={Object.fromEntries(groups.map((g) => [g.key, t(`predict.group.${g.key}`)]))}
          counts={{ all: groups.reduce((s, g) => s + g.items.length, 0), ...Object.fromEntries(groups.map((g) => [g.key, g.items.length])) }}
        />
      )}
      <SectionHead n={n} word={t("predict.word")} />
      <div className="bl-pms" role="region" aria-label={t("predict.aria")} ref={listRef}>
        {visibles.map((g) => (
          <section key={g.key} className="bl-pm-group" data-group={g.key}>
            <h3 className="bl-day-header">
              <span className="bl-day-label">{t(`predict.group.${g.key}`)}</span>
              <span className="bl-day-line" aria-hidden="true" />
            </h3>
            {g.items.map((ev) => <Prediccion key={ev.id} ev={ev} idx={idx++} />)}
          </section>
        ))}
      </div>
      <p className="bl-lpie">{t("predict.pie")}</p>
    </>
  );
}

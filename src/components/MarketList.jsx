import { useEffect, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { api } from "../utils/api";
import { fmtNum, formatPct } from "../utils/format";
import { SectionHead } from "./SectionHead";

// Cotizaciones en filas (oct 2026, "B · Filas"): símbolo, nombre, precio y
// variación, sin cajas; los grupos (y su orden) los define el server, cada uno
// con su rótulo y qué los junta. kind: "etf" o "stock".
function MarketRow({ item, locale }) {
  const up = (item.changePct ?? 0) >= 0;
  return (
    <div className="bl-cot">
      <span className="bl-cot-sym">{item.symbol}</span>
      <span className="bl-cot-name" title={item.name}>{item.name}</span>
      <span className="bl-cot-price">{locale === "en" ? "$" : "US$ "}{fmtNum(item.price, locale)}</span>
      <span className={`bl-cot-chg ${up ? "up" : "down"}`}>{formatPct(item.changePct, locale, 2)}</span>
    </div>
  );
}

export function MarketList({ kind, titleKey }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    api.markets()
      .then((d) => { setData(d); setError(false); })
      .catch(() => setError(true))
      .then(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = (data?.groups || []).filter((g) => g.kind === kind);
  const n = groups.reduce((s, g) => s + g.items.length, 0);
  const listRef = useScrollReveal(loading, kind);
  const hora = data?.asof ? new Date(data.asof).toLocaleTimeString(locale === "en" ? "en-US" : "es-AR", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="bl-layer-content">
      <h2 className="bl-sr-only">{t(titleKey)}</h2>
      {loading ? (
        <div className="bl-cots" aria-hidden="true">
          {Array.from({ length: kind === "stock" ? 10 : 6 }).map((_, i) => <div key={i} className="bl-cot bl-cot-skel" />)}
        </div>
      ) : error ? (
        <div className="bl-feed"><div className="bl-error" onClick={load} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && load()}>{t("markets.error")}</div></div>
      ) : groups.length === 0 ? (
        <div className="bl-empty">{t("markets.empty")}</div>
      ) : (
        <>
          <SectionHead n={n} word={t("markets.word")} />
          <div className="bl-cots" ref={listRef}>
            {groups.map((g) => (
              <section key={g.key} className="bl-cot-group bl-reveal">
                <h3 className="bl-day-header">
                  <span className="bl-day-label">{t(`markets.group.${g.key}`)}</span>
                  <span className="bl-day-date">{t(`markets.group.${g.key}.sub`)}</span>
                  <span className="bl-day-line" aria-hidden="true" />
                </h3>
                {g.items.map((item) => <MarketRow key={item.symbol} item={item} locale={locale} />)}
              </section>
            ))}
          </div>
          <p className="bl-lpie">CNBC · {t("markets.delayed")}{hora && <> · {t("markets.asof", { time: hora })}</>}</p>
        </>
      )}
    </div>
  );
}

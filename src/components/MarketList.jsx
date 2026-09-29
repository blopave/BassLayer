import { useEffect, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { api, formatPrice } from "../utils/api";

function fmtPct(p) {
  if (p == null || isNaN(p)) return "—";
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(2)}%`;
}
function fmtTime(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function MarketCard({ item, idx }) {
  const up = (item.changePct ?? 0) >= 0;
  return (
    <div
      className="bl-mkt-card bl-reveal"
      style={{ transitionDelay: `${Math.min(idx * 0.03, 0.24)}s` }}
    >
      <div className="bl-mkt-card-top">
        <span className="bl-mkt-symbol">{item.symbol}</span>
        <span className={`bl-mkt-chg ${up ? "up" : "down"}`}>{fmtPct(item.changePct)}</span>
      </div>
      <div className="bl-mkt-name" title={item.name}>{item.name}</div>
      <div className="bl-mkt-price">{formatPrice(item.price)}</div>
    </div>
  );
}

// kind: "etf" o "stock". Los grupos (y su orden) los define el server; cada
// uno lleva título y una línea que dice qué los junta (sept 2026).
export function MarketList({ kind, titleKey }) {
  const { t } = useLocale();
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
  const listRef = useScrollReveal(loading, kind);

  return (
    <div className="bl-layer-content">
      <div className="bl-mkt-head">
        <h2 className="bl-mkt-title">{t(titleKey)}</h2>
      </div>

      {loading ? (
        <div className="bl-mkt-grid" aria-hidden="true">
          {Array.from({ length: kind === "stock" ? 12 : 6 }).map((_, i) => (
            <div key={i} className="bl-mkt-card bl-mkt-card-skel" />
          ))}
        </div>
      ) : error ? (
        <div className="bl-feed"><div className="bl-error" onClick={load} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && load()}>{t("markets.error")}</div></div>
      ) : groups.length === 0 ? (
        <div className="bl-empty">{t("markets.empty")}</div>
      ) : (
        <div ref={listRef}>
          {groups.map((g) => (
            <div key={g.key} className="bl-mkt-group">
              <h3 className="bl-mkt-group-label">{t(`markets.group.${g.key}`)}</h3>
              <p className="bl-mkt-group-sub">{t(`markets.group.${g.key}.sub`)}</p>
              <div className="bl-mkt-grid">
                {g.items.map((item, idx) => <MarketCard key={item.symbol} item={item} idx={idx} />)}
              </div>
            </div>
          ))}
          <div className="bl-mkt-foot">
            {data?.asof && <span>{t("markets.asof", { time: fmtTime(data.asof) })}</span>}
            <span className="bl-mkt-disclaimer">{t("markets.disclaimer")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

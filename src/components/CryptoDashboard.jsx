import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { IndicatorModal } from "./IndicatorModal";
import { useLocale } from "../hooks/useLocale";

function formatMarketCap(n) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

function FearGreedGauge({ value, label, onClick, t }) {
  if (value == null) return null;
  const hue = (value / 100) * 120;
  const color = `hsl(${hue}, 60%, 45%)`;
  return (
    <div
      className="bl-dash-card bl-dash-fng bl-dash-card-clickable"
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      role="button"
      tabIndex={0}
      aria-label={`${t("dashboard.viewInfo")} ${t("dashboard.fearGreed")}`}
    >
      <div className="bl-dash-card-label">{t("dashboard.fearGreed")}</div>
      <div className="bl-dash-fng-ring" style={{ "--fng-color": color, "--fng-pct": `${value}%` }}>
        <span className="bl-dash-fng-value">{value}</span>
      </div>
      <div className="bl-dash-fng-label" style={{ color }}>{label}</div>
    </div>
  );
}

export function CryptoDashboard() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.dashboard()
      .then((d) => { if (mounted) { setData(d); setError(false); } })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setLoading(false); });
    const iv = setInterval(() => {
      api.dashboard()
        .then((d) => { if (mounted) { setData(d); setError(false); } })
        .catch(() => {});
    }, 5 * 60_000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  if (loading || (!data && !error)) return null;
  if (error && !data) return null;

  const openIndicator = (key, displayValue, matchValue) => {
    setSelected({ key, displayValue, matchValue });
  };

  const cardKeyDown = (handler) => (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };

  return (
    <div className="bl-dashboard">
      <div className="bl-dash-grid">
        {/* BTC Dominance */}
        {data.btcDominance != null && (
          <div
            className="bl-dash-card bl-dash-card-clickable"
            onClick={() => openIndicator("btcDominance", `${data.btcDominance}%`, data.btcDominance)}
            onKeyDown={cardKeyDown(() => openIndicator("btcDominance", `${data.btcDominance}%`, data.btcDominance))}
            role="button"
            tabIndex={0}
            aria-label={`${t("dashboard.viewInfo")} ${t("dashboard.btcDominance")}`}
          >
            <div className="bl-dash-card-label">{t("dashboard.btcDominance")}</div>
            <div className="bl-dash-card-value">{data.btcDominance}%</div>
          </div>
        )}

        {/* ETH Dominance */}
        {data.ethDominance != null && (
          <div
            className="bl-dash-card bl-dash-card-clickable"
            onClick={() => openIndicator("ethDominance", `${data.ethDominance}%`, data.ethDominance)}
            onKeyDown={cardKeyDown(() => openIndicator("ethDominance", `${data.ethDominance}%`, data.ethDominance))}
            role="button"
            tabIndex={0}
            aria-label={`${t("dashboard.viewInfo")} ${t("dashboard.ethDominance")}`}
          >
            <div className="bl-dash-card-label">{t("dashboard.ethDominance")}</div>
            <div className="bl-dash-card-value">{data.ethDominance}%</div>
          </div>
        )}

        {/* Total Market Cap */}
        {data.totalMarketCap != null && (
          <div
            className="bl-dash-card bl-dash-card-clickable"
            onClick={() => openIndicator("marketCap", formatMarketCap(data.totalMarketCap), data.marketCapChange24h ?? 0)}
            onKeyDown={cardKeyDown(() => openIndicator("marketCap", formatMarketCap(data.totalMarketCap), data.marketCapChange24h ?? 0))}
            role="button"
            tabIndex={0}
            aria-label={`${t("dashboard.viewInfo")} ${t("dashboard.marketCap")}`}
          >
            <div className="bl-dash-card-label">{t("dashboard.marketCap")}</div>
            <div className="bl-dash-card-value">
              {formatMarketCap(data.totalMarketCap)}
              {data.marketCapChange24h != null && (
                <span className={`bl-dash-change ${data.marketCapChange24h >= 0 ? "up" : "down"}`}>
                  {data.marketCapChange24h > 0 ? "+" : ""}{data.marketCapChange24h}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Fear & Greed */}
        <FearGreedGauge
          value={data.fearGreed?.value}
          label={data.fearGreed?.label}
          onClick={() => openIndicator("fearGreed", data.fearGreed?.value, data.fearGreed?.value)}
          t={t}
        />

        {/* ETH Gas */}
        {data.ethGas && (
          <div
            className="bl-dash-card bl-dash-gas bl-dash-card-clickable"
            onClick={() => openIndicator("ethGas", `${data.ethGas.avg} gwei`, data.ethGas.avg)}
            onKeyDown={cardKeyDown(() => openIndicator("ethGas", `${data.ethGas.avg} gwei`, data.ethGas.avg))}
            role="button"
            tabIndex={0}
            aria-label={`${t("dashboard.viewInfo")} ${t("dashboard.ethGas")}`}
          >
            <div className="bl-dash-card-label">{t("dashboard.ethGas")}</div>
            <div className="bl-dash-gas-row">
              <div className="bl-dash-gas-item">
                <span className="bl-dash-gas-tier">{t("dashboard.gasLow")}</span>
                <span className="bl-dash-gas-val">{data.ethGas.low}</span>
              </div>
              <div className="bl-dash-gas-item">
                <span className="bl-dash-gas-tier">{t("dashboard.gasAvg")}</span>
                <span className="bl-dash-gas-val">{data.ethGas.avg}</span>
              </div>
              <div className="bl-dash-gas-item">
                <span className="bl-dash-gas-tier">{t("dashboard.gasFast")}</span>
                <span className="bl-dash-gas-val">{data.ethGas.high}</span>
              </div>
            </div>
            <div className="bl-dash-gas-unit">gwei</div>
          </div>
        )}
      </div>

      <IndicatorModal indicator={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../utils/api";

function formatMarketCap(n) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

function FearGreedGauge({ value, label }) {
  if (value == null) return null;
  // Color: 0=red, 50=yellow, 100=green
  const hue = (value / 100) * 120;
  const color = `hsl(${hue}, 60%, 45%)`;
  return (
    <div className="bl-dash-card bl-dash-fng">
      <div className="bl-dash-card-label">Fear & Greed</div>
      <div className="bl-dash-fng-ring" style={{ "--fng-color": color, "--fng-pct": `${value}%` }}>
        <span className="bl-dash-fng-value">{value}</span>
      </div>
      <div className="bl-dash-fng-label" style={{ color }}>{label}</div>
    </div>
  );
}

export function CryptoDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.dashboard()
      .then((d) => { if (mounted) setData(d); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    const iv = setInterval(() => {
      api.dashboard().then((d) => { if (mounted) setData(d); }).catch(() => {});
    }, 5 * 60_000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  if (loading || !data) return null;

  return (
    <div className="bl-dashboard">
      <div className="bl-dash-grid">
        {/* BTC Dominance */}
        {data.btcDominance != null && (
          <div className="bl-dash-card">
            <div className="bl-dash-card-label">BTC Dominance</div>
            <div className="bl-dash-card-value">{data.btcDominance}%</div>
          </div>
        )}

        {/* ETH Dominance */}
        {data.ethDominance != null && (
          <div className="bl-dash-card">
            <div className="bl-dash-card-label">ETH Dominance</div>
            <div className="bl-dash-card-value">{data.ethDominance}%</div>
          </div>
        )}

        {/* Total Market Cap */}
        {data.totalMarketCap != null && (
          <div className="bl-dash-card">
            <div className="bl-dash-card-label">Market Cap</div>
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
        <FearGreedGauge value={data.fearGreed?.value} label={data.fearGreed?.label} />

        {/* ETH Gas */}
        {data.ethGas && (
          <div className="bl-dash-card bl-dash-gas">
            <div className="bl-dash-card-label">ETH Gas</div>
            <div className="bl-dash-gas-row">
              <div className="bl-dash-gas-item">
                <span className="bl-dash-gas-tier">Low</span>
                <span className="bl-dash-gas-val">{data.ethGas.low}</span>
              </div>
              <div className="bl-dash-gas-item">
                <span className="bl-dash-gas-tier">Avg</span>
                <span className="bl-dash-gas-val">{data.ethGas.avg}</span>
              </div>
              <div className="bl-dash-gas-item">
                <span className="bl-dash-gas-tier">Fast</span>
                <span className="bl-dash-gas-val">{data.ethGas.high}</span>
              </div>
            </div>
            <div className="bl-dash-gas-unit">gwei</div>
          </div>
        )}
      </div>
    </div>
  );
}

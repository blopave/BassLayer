import { useEffect, useState, useRef } from "react";
import { api } from "../utils/api";
import { IndicatorModal } from "./IndicatorModal";
import { useLocale } from "../hooks/useLocale";

function formatMarketCap(n) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

// Cambio porcentual con signo: 5 → "+5%", -2 → "-2%". Compartido por StatCell
// (grid) y TrendingRow.
const signedPct = (n) => `${n > 0 ? "+" : ""}${n}%`;

function useTickFlash(value) {
  const [flash, setFlash] = useState(null);
  const prevRef = useRef(value);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev == null || value == null || prev === value) return;
    setFlash(value > prev ? "up" : "down");
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

function StatCell({ label, value, change, tickValue, onClick, ariaLabel }) {
  const flash = useTickFlash(tickValue);
  return (
    <div
      className={`bl-term-cell bl-term-cell-clickable${flash ? " bl-term-cell-flash-" + flash : ""}`}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick?.())}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
    >
      <div className="bl-term-cell-label">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span>
        <span className="bl-term-cell-label-text">{label}</span>
      </div>
      <div className="bl-term-cell-value">
        <span className="bl-term-cell-value-num">{value}</span>
        {change != null && (
          <span className={`bl-term-cell-change ${change >= 0 ? "up" : "down"}`}>
            <span aria-hidden="true">{change >= 0 ? "▲" : "▼"}</span> {signedPct(change)}
          </span>
        )}
      </div>
    </div>
  );
}

function FngSparkline({ history }) {
  if (!Array.isArray(history) || history.length < 2) return null;
  // 60x18 viewBox — línea monocroma, sin ejes ni librerías. El path se calcula
  // normalizando los valores 0-100 al alto del SVG.
  const w = 60, h = 18, pad = 1;
  const max = 100, min = 0;
  const step = (w - pad * 2) / (history.length - 1);
  const y = (v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const d = history.map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="bl-term-cell-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FearGreedCell({ value, label, history, onClick, t }) {
  const flash = useTickFlash(value);
  if (value == null) return null;
  const hue = (value / 100) * 120;
  const color = `hsl(${hue}, 55%, 50%)`;
  return (
    <div
      className={`bl-term-cell bl-term-cell-clickable${flash ? " bl-term-cell-flash-" + flash : ""}`}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      role="button"
      tabIndex={0}
      aria-label={`${t("dashboard.viewInfo")} ${t("dashboard.fearGreed")}`}
    >
      <div className="bl-term-cell-label">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span>
        <span className="bl-term-cell-label-text">FNG.IDX</span>
      </div>
      <div className="bl-term-cell-value">
        <span className="bl-term-cell-value-num" style={{ color }}>{value}</span>
        <span className="bl-term-cell-fng-tag" style={{ color }}>{label}</span>
        <FngSparkline history={history} />
      </div>
      <div className="bl-term-cell-bar" aria-hidden="true">
        <span className="bl-term-cell-bar-fill" style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
    </div>
  );
}

// Lectura del día — se compone con reglas simples sobre los datos ya en pantalla.
// Sin lookup extra: usa marketCapChange24h y fearGreed.value. Si en el futuro
// tenemos btcChange vs alts change, se puede refinar sin cambiar el shape.
function readingOfTheDay(data, t) {
  if (!data) return null;
  const mc = data.marketCapChange24h;
  const fg = data.fearGreed?.value;

  let baseKey;
  if (mc == null) baseKey = "noSignal";
  else if (mc >= 1.5) baseKey = "greenDay";
  else if (mc <= -1.5) baseKey = "redDay";
  else if (mc >= 0.5) baseKey = "upTimid";
  else if (mc <= -0.5) baseKey = "downTimid";
  else baseKey = "flat";

  const flags = [];
  if (fg != null && fg < 25) flags.push(t("dashboard.reading.extremeFear"));
  else if (fg != null && fg > 75) flags.push(t("dashboard.reading.euphoria"));

  return `> ${t("dashboard.reading.label")}: ${t("dashboard.reading." + baseKey)}${flags.length ? " · " + flags.join(" · ") : ""}`;
}

function GasCell({ gas, onClick, t }) {
  const flash = useTickFlash(gas?.avg);
  if (!gas) return null;
  return (
    <div
      className={`bl-term-cell bl-term-cell-clickable${flash ? " bl-term-cell-flash-" + flash : ""}`}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      role="button"
      tabIndex={0}
      aria-label={`${t("dashboard.viewInfo")} ${t("dashboard.ethGas")}`}
    >
      <div className="bl-term-cell-label">
        <span className="bl-term-prompt" aria-hidden="true">&gt;</span>
        <span className="bl-term-cell-label-text">ETH.GAS</span>
      </div>
      <div className="bl-term-gas-row">
        <div className="bl-term-gas-item">
          <span className="bl-term-gas-tier">{t("dashboard.gasLow")}</span>
          <span className="bl-term-gas-val">{gas.low}</span>
        </div>
        <div className="bl-term-gas-item">
          <span className="bl-term-gas-tier">{t("dashboard.gasAvg")}</span>
          <span className="bl-term-gas-val bl-term-gas-val-primary">{gas.avg}</span>
        </div>
        <div className="bl-term-gas-item">
          <span className="bl-term-gas-tier">{t("dashboard.gasFast")}</span>
          <span className="bl-term-gas-val">{gas.high}</span>
        </div>
      </div>
      <div className="bl-term-cell-unit">gwei</div>
    </div>
  );
}

// Trending: monedas más buscadas ahora (CoinGecko). Fila horizontal en el
// mismo lenguaje terminal del dashboard — display-only, scroll en mobile.
function TrendingRow({ trending, t }) {
  if (!Array.isArray(trending) || trending.length === 0) return null;
  return (
    <div className="bl-term-trending" role="region" aria-label={t("dashboard.trendingAria")}>
      <div className="bl-term-trending-label" aria-hidden="true">
        <span className="bl-term-prompt">&gt;</span>
        <span className="bl-term-cell-label-text">trending</span>
      </div>
      <div className="bl-term-trending-list">
        {trending.map((c, i) => (
          <span className="bl-term-trending-item" key={`${c.symbol}-${i}`} title={c.name}>
            <span className="bl-term-trending-rank" aria-hidden="true">{i + 1}</span>
            <span className="bl-term-trending-sym">{c.symbol}</span>
            {c.change24h != null && (
              <span className={`bl-term-trending-chg ${c.change24h >= 0 ? "up" : "down"}`}>
                {signedPct(c.change24h)}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function contextualCommand(date) {
  const baHour = parseInt(date.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false }), 10);
  if (baHour < 7)  return "markets --watch";       // madrugada — tape silenciosa
  if (baHour < 12) return "feed --since=12h";       // mañana — catching up
  if (baHour < 18) return "status --live";          // intraday
  return "dashboard --eod";                         // tarde/noche — cierre
}

export function CryptoDashboard() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = () => api.dashboard()
      .then((d) => { if (mounted) { setData(d); setError(false); setLastSync(Date.now()); } })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setLoading(false); });
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  if (loading || (!data && !error)) return null;
  if (error && !data) return null;

  const openIndicator = (key, displayValue, matchValue) => setSelected({ key, displayValue, matchValue });
  const syncDate = lastSync ? new Date(lastSync) : null;
  const syncTime = syncDate
    ? syncDate.toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
  const cmd = contextualCommand(syncDate || new Date());

  return (
    <div className="bl-terminal" role="region" aria-label="Market dashboard">
      <div className="bl-terminal-header" aria-hidden="true">
        <span className="bl-terminal-prompt-user">bl@layer</span>
        <span className="bl-terminal-prompt-sep">:</span>
        <span className="bl-terminal-prompt-path">~/market</span>
        <span className="bl-terminal-prompt-sep">$</span>
        <span className="bl-terminal-prompt-cmd">{cmd}</span>
        <span className="bl-terminal-prompt-cursor" />
        <span className="bl-terminal-status">
          <span className="bl-terminal-status-dot" />
          <span className="bl-terminal-status-text">sync {syncTime}</span>
          <span className="bl-terminal-status-code">[200]</span>
        </span>
      </div>
      <div className="bl-terminal-reading" aria-live="polite">{readingOfTheDay(data, t)}</div>
      <div className="bl-terminal-grid">
        {data.btcDominance != null && (
          <StatCell
            label="BTC.DOM"
            value={`${data.btcDominance}%`}
            tickValue={data.btcDominance}
            onClick={() => openIndicator("btcDominance", `${data.btcDominance}%`, data.btcDominance)}
            ariaLabel={`${t("dashboard.viewInfo")} ${t("dashboard.btcDominance")}`}
          />
        )}
        {data.ethDominance != null && (
          <StatCell
            label="ETH.DOM"
            value={`${data.ethDominance}%`}
            tickValue={data.ethDominance}
            onClick={() => openIndicator("ethDominance", `${data.ethDominance}%`, data.ethDominance)}
            ariaLabel={`${t("dashboard.viewInfo")} ${t("dashboard.ethDominance")}`}
          />
        )}
        {data.totalMarketCap != null && (
          <StatCell
            label="MKT.CAP"
            value={formatMarketCap(data.totalMarketCap)}
            change={data.marketCapChange24h}
            tickValue={data.totalMarketCap}
            onClick={() => openIndicator("marketCap", formatMarketCap(data.totalMarketCap), data.marketCapChange24h ?? 0)}
            ariaLabel={`${t("dashboard.viewInfo")} ${t("dashboard.marketCap")}`}
          />
        )}
        <FearGreedCell
          value={data.fearGreed?.value}
          label={data.fearGreed?.label}
          history={data.fearGreed?.history}
          onClick={() => openIndicator("fearGreed", data.fearGreed?.value, data.fearGreed?.value)}
          t={t}
        />
        <GasCell
          gas={data.ethGas}
          onClick={() => data.ethGas && openIndicator("ethGas", `${data.ethGas.avg} gwei`, data.ethGas.avg)}
          t={t}
        />
      </div>
      <TrendingRow trending={data.trending} t={t} />
      <IndicatorModal indicator={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

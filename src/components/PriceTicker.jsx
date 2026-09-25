import { memo } from "react";
import { tickerItemA11y } from "../utils/constants";
import { formatPrice } from "../utils/api";
import { useLocale } from "../hooks/useLocale";

function Sparkline({ data, up }) {
  if (!data || data.length < 2) return null;
  const h = 24, w = 48, pad = 1;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  // Downsample to ~24 points for performance
  const step = Math.max(1, Math.floor(data.length / 24));
  const pts = [];
  for (let i = 0; i < data.length; i += step) {
    const x = pad + ((i / (data.length - 1)) * (w - pad * 2));
    const y = pad + (1 - (data[i] - min) / range) * (h - pad * 2);
    pts.push(`${x},${y}`);
  }
  const color = up ? "var(--bl-up)" : "var(--bl-down)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="bl-sparkline" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const PriceTicker = memo(function PriceTicker({ prices, onSelect, loading }) {
  const { t } = useLocale();
  // Misma lógica que el LineupTicker: reservar la barra con un item invisible mientras llegan los precios.
  if (!prices?.length) {
    return loading ? (
      <div className="bl-price-bar" aria-hidden="true">
        <div className="bl-price-track">
          <div className="bl-price-item bl-skel-invisible"><span className="bl-price-sym">&nbsp;</span><Sparkline data={[1, 1]} up /><span className="bl-price-val">&nbsp;</span><span className="bl-price-chg">&nbsp;</span></div>
        </div>
      </div>
    ) : null;
  }
  const renderItem = (p, suffix) => (
    <div className="bl-price-item bl-price-clickable" key={`${p.id}-${suffix}`} onClick={() => onSelect?.(p)} {...tickerItemA11y(suffix === "b")} onKeyDown={(e) => e.key === "Enter" && onSelect?.(p)}>
      <span className="bl-price-sym">{p.sym}</span>
      <Sparkline data={p.sparkline} up={p.change >= 0} />
      <span className="bl-price-val">{formatPrice(p.usd)}</span>
      <span className={`bl-price-chg ${p.change >= 0 ? "bl-price-up" : "bl-price-down"}`}>
        {p.change >= 0 ? "+" : ""}{p.change}%
      </span>
    </div>
  );
  return (
    <div className="bl-price-bar" role="marquee" aria-label={t("ticker.aria")}>
      <div className="bl-price-track">
        {prices.map((p) => renderItem(p, "a"))}
        {prices.map((p) => renderItem(p, "b"))}
      </div>
    </div>
  );
});

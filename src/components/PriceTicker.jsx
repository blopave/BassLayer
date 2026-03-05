import { formatPrice } from "../utils/api";

export function PriceTicker({ prices, onSelect }) {
  if (!prices.length) return null;
  const items = prices.map((p) => (
    <div className="bl-price-item bl-price-clickable" key={p.id} onClick={() => onSelect?.(p)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect?.(p)}>
      <span className="bl-price-sym">{p.sym}</span>
      <span className="bl-price-val">{formatPrice(p.usd)}</span>
      <span className={`bl-price-chg ${p.change >= 0 ? "bl-price-up" : "bl-price-down"}`}>
        {p.change >= 0 ? "+" : ""}{p.change}%
      </span>
    </div>
  ));
  return (
    <div className="bl-price-bar" role="marquee" aria-label="Precios de criptomonedas">
      <div className="bl-price-track">{items}{items}</div>
    </div>
  );
}

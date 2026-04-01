import { useEffect, useRef, useState } from "react";
import { formatPrice } from "../utils/api";

export function PriceModal({ price, onClose }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!price) return;
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [price, onClose]);

  useEffect(() => {
    if (!price) return;
    setLoading(true);
    setChartData(null);
    fetch(`/api/prices/${price.id}/chart`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { setChartData(d.prices || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [price]);

  useEffect(() => {
    if (!chartData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    if (chartData.length < 2) {
      ctx.fillStyle = "#666666";
      ctx.font = "11px 'Space Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("Sin datos", w / 2, h / 2);
      return;
    }

    const prices = chartData.map((p) => p[1]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const pad = 8;

    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? "#2D6B3F" : "#6B2D2D";

    ctx.clearRect(0, 0, w, h);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, isUp ? "rgba(45,107,63,0.15)" : "rgba(107,45,45,0.15)");
    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = pad + (i / (prices.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (prices[i] - min) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Fill area
    const lastX = pad + (w - pad * 2);
    ctx.lineTo(lastX, h);
    ctx.lineTo(pad, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = pad + (i / (prices.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (prices[i] - min) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Current price dot
    const lastY = pad + (1 - (prices[prices.length - 1] - min) / range) * (h - pad * 2);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [chartData]);

  if (!price) return null;

  return (
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={price.sym}>
      <div className="bl-modal bl-price-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label="Cerrar">&#x2715;</button>

        <div className="bl-price-modal-header">
          <div className="bl-price-modal-sym">{price.sym}</div>
          <div className="bl-price-modal-name">{price.name || price.id}</div>
        </div>

        <div className="bl-price-modal-price">
          <span className="bl-price-modal-val">{formatPrice(price.usd)}</span>
          <span className={`bl-price-modal-chg ${price.change >= 0 ? "bl-price-up" : "bl-price-down"}`}>
            {price.change >= 0 ? "+" : ""}{price.change}%
          </span>
        </div>

        <div className="bl-price-modal-chart">
          {loading ? (
            <div className="bl-price-modal-loading">Cargando chart...</div>
          ) : (
            <canvas ref={canvasRef} className="bl-price-canvas" />
          )}
          <div className="bl-price-modal-period">7 dias</div>
        </div>

        {price.marketCap && (
          <div className="bl-price-modal-meta">
            <span className="bl-price-modal-label">Market Cap</span>
            <span className="bl-price-modal-value">${(price.marketCap / 1e9).toFixed(1)}B</span>
          </div>
        )}

        <div className="bl-price-modal-footer">
          <a className="bl-modal-btn bl-modal-btn-primary" href={`https://www.coingecko.com/en/coins/${price.id}`} target="_blank" rel="noopener noreferrer">
            Ver en CoinGecko &#x2192;
          </a>
        </div>
      </div>
    </div>
  );
}

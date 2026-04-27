import { useEffect, useState } from "react";
import { useScrollReveal } from "../hooks/useScrollReveal";

function fmtVolume(n) {
  if (!n || n < 1000) return `$${Math.round(n || 0)}`;
  if (n < 1_000_000) return `$${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1_000_000_000).toFixed(2)}B`;
}

function daysLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms)) return null;
  const d = Math.ceil(ms / 86_400_000);
  if (d < 0) return null;
  if (d === 0) return "hoy";
  if (d === 1) return "1d";
  if (d < 30) return `${d}d`;
  const m = Math.round(d / 30);
  return `${m}m`;
}

export function PredictionMarkets() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch("/api/prediction-markets")
      .then((r) => (r.ok ? r.json() : Promise.reject(`Error ${r.status}`)))
      .then((data) => { if (mounted) { setMarkets(data || []); setError(null); } })
      .catch((e) => { if (mounted) setError(typeof e === "string" ? e : "No se pudo cargar"); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const listRef = useScrollReveal(loading, "predictions");

  if (loading) {
    return (
      <div className="bl-feed">
        <div className="bl-loading-text">CARGANDO MERCADOS<span>.</span><span>.</span><span>.</span></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bl-feed">
        <div className="bl-empty">
          <span className="bl-empty-icon" aria-hidden="true">&#x26A0;</span>
          {error}
        </div>
      </div>
    );
  }

  if (!markets.length) {
    return (
      <div className="bl-feed">
        <div className="bl-empty">
          <span className="bl-empty-icon" aria-hidden="true">&#x1F52E;</span>
          Sin mercados destacados ahora mismo.
        </div>
      </div>
    );
  }

  return (
    <div className="bl-feed bl-predict-feed" role="feed" aria-label="Mercados de predicción" ref={listRef}>
      <div className="bl-predict-header">
        <span className="bl-predict-source">POLYMARKET</span>
        <span className="bl-predict-sub">Top markets · 24h volumen</span>
      </div>
      {markets.map((m, idx) => {
        const dleft = daysLeft(m.endDate);
        const pct = Math.max(0, Math.min(100, m.topPct ?? 0));
        return (
          <a
            key={m.id}
            className="bl-predict-card bl-reveal"
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ transitionDelay: `${Math.min(idx * 0.03, 0.25)}s` }}
          >
            <div className="bl-predict-top">
              <span className="bl-predict-question">{m.question}</span>
              {dleft && <span className="bl-predict-deadline">{dleft}</span>}
            </div>
            <div className="bl-predict-meter">
              <div className="bl-predict-bar"><div className="bl-predict-fill" style={{ width: `${pct}%` }} /></div>
              <div className="bl-predict-meta">
                <span className="bl-predict-outcome">{m.topOutcome || "—"}</span>
                <span className="bl-predict-pct">{pct}%</span>
                <span className="bl-predict-vol">{fmtVolume(m.volume24h)}</span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

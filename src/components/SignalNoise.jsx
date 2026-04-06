import { useMemo, useState } from "react";

// Source credibility tiers
const SOURCE_SCORE = {
  "CoinDesk": 9, "The Block": 9, "Blockworks": 8, "Decrypt": 8,
  "The Defiant": 8, "Unchained": 8, "CoinTelegraph": 7, "CryptoSlate": 6,
  "Bitcoin Magazine": 7, "CryptoBriefing": 6, "U.Today": 5, "Daily Hodl": 4,
  "CT Español": 6, "CriptoNoticias": 6, "DiarioBitcoin": 5, "CriptoTendencia": 5,
};

// Hype/noise keywords reduce signal score
const NOISE_KEYWORDS = [
  "moon","pump","100x","millionaire","explod","skyrocket","crash","plummet",
  "breaking","urgent","just in","alert","massive","huge","incredible",
  "to the moon","next big","don't miss","hurry","fomo","lambo",
];

// Signal keywords increase score
const SIGNAL_KEYWORDS = [
  "report","analysis","research","data","according","study","quarterly",
  "partnership","launch","update","upgrade","proposal","governance",
  "audit","security","vulnerability","hack","exploit",
  "regulation","policy","framework","compliance","ruling",
  "earnings","revenue","tvl","volume","metric","on-chain",
];

function scoreArticle(item, allNews) {
  let score = 50; // base

  // Source credibility (0-20 points)
  const srcScore = SOURCE_SCORE[item.source] || 5;
  score += (srcScore - 5) * 4; // -4 to +16

  // Noise penalty
  const titleLower = (item.title || "").toLowerCase();
  let noiseHits = 0;
  for (const kw of NOISE_KEYWORDS) {
    if (titleLower.includes(kw)) noiseHits++;
  }
  score -= noiseHits * 8;

  // Signal bonus
  let signalHits = 0;
  for (const kw of SIGNAL_KEYWORDS) {
    if (titleLower.includes(kw)) signalHits++;
  }
  score += signalHits * 6;

  // Repetition penalty — if many articles have similar words, it's noise
  const words = new Set(titleLower.split(/\s+/).filter(w => w.length > 4));
  let dupeCount = 0;
  for (const other of allNews) {
    if (other === item) continue;
    const otherLower = (other.title || "").toLowerCase();
    let overlap = 0;
    for (const w of words) {
      if (otherLower.includes(w)) overlap++;
    }
    if (overlap >= 3) dupeCount++;
  }
  if (dupeCount >= 3) score -= 12;
  else if (dupeCount >= 1) score -= 4;

  // Title length — very short titles are usually clickbait
  if (titleLower.length < 30) score -= 5;
  // Very long titles might be more descriptive
  if (titleLower.length > 80) score += 3;

  return Math.max(0, Math.min(100, score));
}

function getScoreLabel(score) {
  if (score >= 75) return { text: "Alta senal", cls: "high" };
  if (score >= 50) return { text: "Moderada", cls: "mid" };
  return { text: "Ruido", cls: "low" };
}

export function SignalNoise({ news, filter }) {
  const [active, setActive] = useState(false);
  const [threshold, setThreshold] = useState("all"); // "all" | "signal" | "high"

  const scored = useMemo(() => {
    return news.map(item => ({
      ...item,
      signalScore: scoreArticle(item, news),
    }));
  }, [news]);

  const filtered = useMemo(() => {
    let items = scored;
    if (filter !== "All") {
      items = items.filter(n => n.tag === filter);
    }
    if (threshold === "signal") {
      items = items.filter(n => n.signalScore >= 50);
    } else if (threshold === "high") {
      items = items.filter(n => n.signalScore >= 75);
    }
    return items.sort((a, b) => b.signalScore - a.signalScore);
  }, [scored, filter, threshold]);

  // Stats — computed from tag-filtered set so numbers match visible feed
  const tagFiltered = useMemo(() => {
    if (filter === "All") return scored;
    return scored.filter(n => n.tag === filter);
  }, [scored, filter]);

  const stats = useMemo(() => {
    const high = tagFiltered.filter(n => n.signalScore >= 75).length;
    const mid = tagFiltered.filter(n => n.signalScore >= 50 && n.signalScore < 75).length;
    const low = tagFiltered.filter(n => n.signalScore < 50).length;
    const avg = tagFiltered.length > 0 ? Math.round(tagFiltered.reduce((s, n) => s + n.signalScore, 0) / tagFiltered.length) : 0;
    return { high, mid, low, avg, total: tagFiltered.length };
  }, [tagFiltered]);

  if (!active) {
    return (
      <button className="bl-sn-toggle" onClick={() => setActive(true)}>
        <div className="bl-sn-toggle-left">
          <span className="bl-sn-toggle-icon">
            <svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 8h2l2-5 3 10 2-7 2 4h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="bl-sn-toggle-label">Senal vs Ruido</span>
        </div>
        <span className="bl-sn-toggle-arrow">&rarr;</span>
      </button>
    );
  }

  return (
    <div className="bl-sn">
      <div className="bl-sn-header">
        <div className="bl-sn-header-left">
          <div className="bl-sn-title">Senal vs Ruido</div>
          <div className="bl-sn-subtitle">Relevancia real vs hype</div>
        </div>
        <button className="bl-sn-close" onClick={() => setActive(false)}>&times;</button>
      </div>

      {/* Stats bar */}
      <div className="bl-sn-stats">
        <div className="bl-sn-stat">
          <span className="bl-sn-stat-val bl-sn-high">{stats.high}</span>
          <span className="bl-sn-stat-lbl">Senal</span>
        </div>
        <div className="bl-sn-stat">
          <span className="bl-sn-stat-val bl-sn-mid">{stats.mid}</span>
          <span className="bl-sn-stat-lbl">Moderada</span>
        </div>
        <div className="bl-sn-stat">
          <span className="bl-sn-stat-val bl-sn-low">{stats.low}</span>
          <span className="bl-sn-stat-lbl">Ruido</span>
        </div>
        <div className="bl-sn-stat-sep" />
        <div className="bl-sn-stat">
          <span className="bl-sn-stat-val">{stats.avg}</span>
          <span className="bl-sn-stat-lbl">Promedio</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bl-sn-tabs">
        {[
          { key: "all", label: `Todo (${scored.length})` },
          { key: "signal", label: `Senal (${stats.high + stats.mid})` },
          { key: "high", label: `Alta (${stats.high})` },
        ].map(t => (
          <button
            key={t.key}
            className={`bl-sn-tab${threshold === t.key ? " active" : ""}`}
            onClick={() => setThreshold(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtered feed */}
      <div className="bl-sn-feed">
        {filtered.length === 0 ? (
          <div className="bl-sn-empty">Sin noticias en este nivel</div>
        ) : (
          filtered.map((item, idx) => {
            const label = getScoreLabel(item.signalScore);
            return (
              <article className="bl-sn-item" key={`${item.source}-${(item.title || "").slice(0,30)}-${idx}`}>
                <div className="bl-sn-item-score">
                  <div className={`bl-sn-score-ring bl-sn-${label.cls}`}>
                    {item.signalScore}
                  </div>
                </div>
                <div className="bl-sn-item-body">
                  {item.url ? (
                    <a className="bl-sn-item-title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  ) : (
                    <span className="bl-sn-item-title">{item.title}</span>
                  )}
                  <div className="bl-sn-item-meta">
                    <span className="bl-sn-item-src">{item.source}</span>
                    <span className="bl-sn-item-dot">&middot;</span>
                    <span className="bl-sn-item-time">{item.time}</span>
                    <span className="bl-sn-item-dot">&middot;</span>
                    <span className={`bl-sn-item-label bl-sn-${label.cls}`}>{label.text}</span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

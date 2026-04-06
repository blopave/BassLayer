import { useMemo } from "react";

const NARRATIVES = [
  { id: "defi",    label: "DeFi",        keywords: ["defi","\\bdex\\b","lending","\\byield\\b","liquidity","\\bswap\\b","\\bamm\\b","aave","uniswap","compound","\\bcurve\\b","\\blido\\b","staking","restaking","eigenlayer"] },
  { id: "ai",      label: "AI",          keywords: ["\\bai\\b","artificial intelligence","machine learning","\\bgpt\\b","openai","nvidia","\\brender\\b","singularity","ai token","ai agent"] },
  { id: "rwa",     label: "RWA",         keywords: ["\\brwa\\b","real world asset","tokeniz","treasury","\\bbond\\b","blackrock","\\bondo\\b","maple","centrifuge","securitiz"] },
  { id: "l2",      label: "Layer 2",     keywords: ["layer 2","\\bl2\\b","rollup","arbitrum","optimism","\\bbase\\b chain","zksync","starknet","polygon","\\bscroll\\b","\\blinea\\b","\\bblast\\b"] },
  { id: "meme",    label: "Memecoins",   keywords: ["meme","memecoin","\\bdoge\\b","\\bshib\\b","\\bpepe\\b","\\bbonk\\b","\\bwif\\b","\\bfloki\\b","\\bbrett\\b","pump.fun","pump fun"] },
  { id: "btc-eco", label: "BTC Eco",     keywords: ["ordinal","inscription","brc-20","brc20","\\brune\\b","bitcoin nft","bitcoin defi","\\bstacks\\b","lightning network"] },
  { id: "reg",     label: "Regulacion",  keywords: ["\\bsec\\b","regulat","congress","\\blaw\\b","\\blegal\\b","compliance","\\betf\\b","approval","gensler","\\bcftc\\b","\\bmica\\b"] },
  { id: "stable",  label: "Stablecoins", keywords: ["stablecoin","\\busdt\\b","\\busdc\\b","\\bdai\\b","tether","\\bcircle\\b","depeg","\\bfdusd\\b","\\bpyusd\\b","\\busde\\b"] },
  { id: "gaming",  label: "Gaming",      keywords: ["\\bgaming\\b","play to earn","\\bp2e\\b","metaverse","nft game","\\baxie\\b","immutable","\\bgala\\b","web3 game"] },
  { id: "infra",   label: "Infra",       keywords: ["infrastructure","\\boracle\\b","chainlink","\\bbridge\\b","cross-chain","interop","cosmos","polkadot","solana","modular","data availability"] },
  { id: "depin",   label: "DePIN",       keywords: ["depin","decentralized physical","helium","hivemapper","\\brender\\b","io.net","filecoin","arweave"] },
  { id: "privacy", label: "Privacy",     keywords: ["privacy","zero knowledge","\\bzk\\b","\\bzkp\\b","tornado","monero","zcash","aztec"] },
];

const MATCHERS = NARRATIVES.map(n => ({
  ...n,
  compiled: n.keywords.map(kw =>
    kw.includes("\\b") ? new RegExp(kw, "i") : null
  ),
}));

function matchesNarrative(text, narr) {
  for (let i = 0; i < narr.keywords.length; i++) {
    const regex = narr.compiled[i];
    if (regex ? regex.test(text) : text.includes(narr.keywords[i])) return true;
  }
  return false;
}

export function matchesAnyNarrative(title, narrativeId) {
  const narr = MATCHERS.find(n => n.id === narrativeId);
  if (!narr) return false;
  return matchesNarrative((title || "").toLowerCase(), narr);
}

function analyzeTrending(news) {
  if (!news || news.length === 0) return [];

  const mid = Math.floor(news.length / 2);
  // news comes sorted newest-first from API, so first half = recent, second half = older
  const recent = news.slice(0, mid);
  const older = news.slice(mid);

  const results = [];

  for (const narr of MATCHERS) {
    let total = 0, recentCount = 0, olderCount = 0;
    const headlines = [];

    for (const item of news) {
      const text = (item.title || "").toLowerCase();
      if (matchesNarrative(text, narr)) {
        total++;
        if (headlines.length < 3) headlines.push(item);
      }
    }
    for (const item of recent) {
      if (matchesNarrative((item.title || "").toLowerCase(), narr)) recentCount++;
    }
    for (const item of older) {
      if (matchesNarrative((item.title || "").toLowerCase(), narr)) olderCount++;
    }

    if (total === 0) continue;

    // Trend: compare recent vs older halves
    let trend = "stable";
    if (older.length > 0 && recent.length > 0) {
      const recentRate = recentCount / recent.length;
      const olderRate = olderCount / older.length;
      const diff = recentRate - olderRate;
      if (diff > 0.02) trend = "up";
      else if (diff < -0.02) trend = "down";
    }

    results.push({ ...narr, count: total, trend, headlines });
  }

  return results.sort((a, b) => b.count - a.count).slice(0, 6);
}

const TREND_ARROWS = { up: "\u2197", down: "\u2198", stable: "\u2192" };

export function NarrativeMap({ news, activeNarrative, onSelectNarrative }) {
  const trending = useMemo(() => analyzeTrending(news), [news]);

  if (trending.length === 0) return null;

  return (
    <div className="bl-trend">
      <div className="bl-trend-header">
        <div className="bl-trend-title">Trending</div>
        {activeNarrative && (
          <button className="bl-trend-clear" onClick={() => onSelectNarrative(null)}>
            Limpiar filtro
          </button>
        )}
      </div>

      <div className="bl-trend-list">
        {trending.map((n) => {
          const isActive = activeNarrative === n.id;
          return (
            <button
              key={n.id}
              className={`bl-trend-chip${isActive ? " active" : ""} bl-trend-${n.trend}`}
              onClick={() => onSelectNarrative(isActive ? null : n.id)}
            >
              <span className="bl-trend-chip-label">{n.label}</span>
              <span className="bl-trend-chip-count">{n.count}</span>
              <span className="bl-trend-chip-arrow">{TREND_ARROWS[n.trend]}</span>
            </button>
          );
        })}
      </div>

      {/* Show headlines when a narrative is selected */}
      {activeNarrative && (() => {
        const selected = trending.find(n => n.id === activeNarrative);
        if (!selected || selected.headlines.length === 0) return null;
        return (
          <div className="bl-trend-preview">
            {selected.headlines.map((item, i) => (
              <div key={i} className="bl-trend-preview-item">
                <span className="bl-trend-preview-time">{item.time}</span>
                {item.url ? (
                  <a className="bl-trend-preview-title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                ) : (
                  <span className="bl-trend-preview-title">{item.title}</span>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

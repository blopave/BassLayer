import { useMemo, useState } from "react";

// Keywords use word-boundary regex to avoid false positives (e.g. "ai" matching "said")
// Multi-word phrases and partial stems (like "tokeniz", "regulat") use plain includes
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

// Pre-compile regex patterns for keywords with \b, use includes() for the rest
const NARRATIVE_MATCHERS = NARRATIVES.map(n => ({
  ...n,
  matchers: n.keywords.map(kw =>
    kw.includes("\\b") ? new RegExp(kw, "i") : null
  ),
}));

function scoreNarratives(news) {
  if (!news || news.length === 0) return [];
  const counts = {};
  NARRATIVE_MATCHERS.forEach(n => { counts[n.id] = { ...n, count: 0, recent: [] }; });

  for (const item of news) {
    const text = (item.title || "").toLowerCase();
    for (const narr of NARRATIVE_MATCHERS) {
      let matched = false;
      for (let i = 0; i < narr.keywords.length; i++) {
        const regex = narr.matchers[i];
        if (regex ? regex.test(text) : text.includes(narr.keywords[i])) {
          matched = true;
          break;
        }
      }
      if (matched) {
        counts[narr.id].count++;
        if (counts[narr.id].recent.length < 2) {
          counts[narr.id].recent.push(item.title);
        }
      }
    }
  }

  return Object.values(counts)
    .filter(n => n.count > 0)
    .sort((a, b) => b.count - a.count);
}

function intensityClass(count, max) {
  const ratio = count / max;
  if (ratio > 0.7) return "hot";
  if (ratio > 0.4) return "warm";
  return "cool";
}

export function NarrativeMap({ news }) {
  const [expanded, setExpanded] = useState(null);

  const narratives = useMemo(() => scoreNarratives(news), [news]);

  if (narratives.length === 0) return null;

  const maxCount = narratives[0]?.count || 1;

  return (
    <div className="bl-narr">
      <div className="bl-narr-header">
        <div className="bl-narr-title">Mapa de narrativas</div>
        <div className="bl-narr-subtitle">Tendencias por volumen de conversacion</div>
      </div>

      <div className="bl-narr-grid">
        {narratives.map((n) => {
          const intensity = intensityClass(n.count, maxCount);
          const isExpanded = expanded === n.id;
          const barWidth = Math.max((n.count / maxCount) * 100, 8);

          return (
            <div
              key={n.id}
              className={`bl-narr-item bl-narr-${intensity}${isExpanded ? " expanded" : ""}`}
              onClick={() => setExpanded(isExpanded ? null : n.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setExpanded(isExpanded ? null : n.id)}
            >
              <div className="bl-narr-item-top">
                <span className="bl-narr-label">{n.label}</span>
                <span className="bl-narr-count">{n.count}</span>
              </div>
              <div className="bl-narr-bar-bg">
                <div
                  className={`bl-narr-bar bl-narr-bar-${intensity}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              {isExpanded && n.recent.length > 0 && (
                <div className="bl-narr-recent">
                  {n.recent.map((title, i) => (
                    <div key={i} className="bl-narr-recent-item">{title}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

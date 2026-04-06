import { useState } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";
import { CryptoDashboard } from "./CryptoDashboard";
import { CryptoBATimeline } from "./CryptoBATimeline";
import { CryptoIRL } from "./CryptoIRL";
import { useScrollReveal } from "../hooks/useScrollReveal";

export function LayerFeed({ news, loading, error, onRetry, filter, onFilter }) {
  const tags = ["All", "BTC", "ETH", "SOL", "DeFi", "L2", "Reg", "AI", "NFT", "Stable", "Crypto"];
  const [section, setSection] = useState("noticias"); // "noticias" | "eventos"

  const filtered = filter === "All" ? news : news.filter((n) => n.tag === filter);

  const listRef = useScrollReveal(loading);

  return (
    <>
      <CryptoDashboard />
      <div className="bl-layer-tools">
        <CryptoBATimeline />
      </div>

      {/* Section toggle */}
      <div className="bl-layer-sections">
        <button
          className={`bl-layer-section-btn${section === "noticias" ? " active" : ""}`}
          onClick={() => setSection("noticias")}
        >
          <span className="bl-layer-section-label">Noticias</span>
          <span className="bl-layer-section-count">{news.length}</span>
          <svg className="bl-layer-section-chevron" viewBox="0 0 16 16" width="12" height="12"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <button
          className={`bl-layer-section-btn${section === "eventos" ? " active" : ""}`}
          onClick={() => setSection("eventos")}
        >
          <span className="bl-layer-section-label">Eventos</span>
          <svg className="bl-layer-section-chevron" viewBox="0 0 16 16" width="12" height="12"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
      </div>

      {/* Noticias section */}
      {section === "noticias" && (
        <div className="bl-layer-content">
          <FilterBar items={tags} active={filter} onChange={onFilter} className="layer-filters" />
          {loading ? <NewsSkeleton />
            : error ? <div className="bl-feed"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>{error}</div></div>
            : filtered.length === 0 ? (
              <div className="bl-feed">
                <div className="bl-empty">
                  <span className="bl-empty-icon" aria-hidden="true">&#x1F4E1;</span>
                  Sin noticias para &ldquo;{filter}&rdquo;. El mercado est&aacute; tranquilo.
                </div>
              </div>
            )
            : <div className="bl-feed" role="feed" aria-label="Noticias crypto" ref={listRef}>
                {filtered.map((item, idx) => (
                  <article className="bl-feed-item bl-reveal" key={`${item.source}-${(item.title || "").slice(0,40)}-${idx}`} style={{ transitionDelay: `${Math.min(idx * 0.03, 0.25)}s` }}>
                    <span className="bl-feed-time">{item.time}</span>
                    <span className="bl-feed-tag">{item.tag}</span>
                    {item.url ? <a className="bl-feed-title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                      : <span className="bl-feed-title">{item.title}</span>}
                    <span className="bl-feed-src">{item.source}</span>
                  </article>
                ))}
              </div>}
        </div>
      )}

      {/* Eventos section */}
      {section === "eventos" && (
        <div className="bl-layer-content">
          <CryptoIRL />
        </div>
      )}
    </>
  );
}

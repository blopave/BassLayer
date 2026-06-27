import { useState } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";
import { CryptoDashboard } from "./CryptoDashboard";
import { CryptoBATimeline } from "./CryptoBATimeline";
import { CryptoIRL } from "./CryptoIRL";
import { PredictionMarkets } from "./PredictionMarkets";
import { BlThumb } from "./BlThumb";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";

function LayerNewsItem({ item, idx, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPill = !!(item.tag && item.image && !imgFailed);
  return (
    <article
      className="bl-layer-news-item bl-reveal"
      onClick={() => onSelect?.(item)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect?.(item))}
      tabIndex={0}
      role="button"
      aria-label={`${item.title}${item.tag ? ` — ${item.tag}` : ""}`}
      style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <BlThumb image={item.image} onImgFail={() => setImgFailed(true)} />
      <div className="bl-layer-news-body">
        <h3 className="bl-layer-news-title">{item.title}</h3>
        {showPill && <span className="bl-layer-news-tag-pill">{item.tag}</span>}
      </div>
    </article>
  );
}

export function LayerFeed({ news, loading, error, onRetry, filter, onFilter, onSelectNews }) {
  const { t } = useLocale();
  const tags = ["All", "BTC", "ETH", "SOL", "DeFi", "L2", "Reg", "AI", "NFT", "Stable", "Crypto"];
  const [section, setSection] = useState("noticias"); // "noticias" | "eventos" | "predicciones"

  const filtered = filter === "All" ? news : news.filter((n) => n.tag === filter);

  const listRef = useScrollReveal(loading, section);

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
          <span className="bl-layer-section-label">{t("section.news")}</span>
          <span className="bl-layer-section-count">{news.length}</span>
          <svg className="bl-layer-section-chevron" viewBox="0 0 16 16" width="12" height="12"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <button
          className={`bl-layer-section-btn${section === "eventos" ? " active" : ""}`}
          onClick={() => setSection("eventos")}
        >
          <span className="bl-layer-section-label">{t("section.events")}</span>
          <svg className="bl-layer-section-chevron" viewBox="0 0 16 16" width="12" height="12"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <button
          className={`bl-layer-section-btn${section === "predicciones" ? " active" : ""}`}
          onClick={() => setSection("predicciones")}
        >
          <span className="bl-layer-section-label">{t("section.predictions")}</span>
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
                  {t("feed.empty.news")} &ldquo;{filter === "All" ? t("common.all") : filter}&rdquo;. {t("feed.empty.newsHint")}
                </div>
              </div>
            )
            : <div className="bl-layer-news-list" role="feed" aria-label="Noticias crypto" ref={listRef}>
                {filtered.map((item, idx) => (
                  <LayerNewsItem
                    key={`${item.source}-${(item.title || "").slice(0,40)}-${idx}`}
                    item={item}
                    idx={idx}
                    onSelect={onSelectNews}
                  />
                ))}
                <div className="bl-end-of-feed" aria-hidden="true">
                  <span>{t("feed.endOfFeed")}</span>
                  <span className="bl-end-cursor" />
                </div>
              </div>}
        </div>
      )}

      {/* Eventos section */}
      {section === "eventos" && (
        <div className="bl-layer-content">
          <CryptoIRL />
        </div>
      )}

      {/* Predicciones section */}
      {section === "predicciones" && (
        <div className="bl-layer-content">
          <PredictionMarkets />
        </div>
      )}
    </>
  );
}

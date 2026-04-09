import { useState, useEffect } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";
import { CryptoDashboard } from "./CryptoDashboard";
import { CryptoBATimeline } from "./CryptoBATimeline";
import { CryptoIRL } from "./CryptoIRL";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { api } from "../utils/api";

const ANN_CATEGORY_LABELS = {
  listing: "Nuevo listing",
  promo: "Promo",
  update: "Actualización",
  launch: "Lanzamiento",
  education: "Educación",
  event: "Evento",
  other: "Otro",
};

export function LayerFeed({ news, loading, error, onRetry, filter, onFilter, onOpenExchanges }) {
  const tags = ["All", "BTC", "ETH", "SOL", "DeFi", "L2", "Reg", "AI", "NFT", "Stable", "Crypto"];
  const [section, setSection] = useState("noticias"); // "noticias" | "eventos" | "anuncios"
  const [announcements, setAnnouncements] = useState([]);
  const [annLoading, setAnnLoading] = useState(false);

  useEffect(() => {
    if (section === "anuncios" && announcements.length === 0) {
      setAnnLoading(true);
      api.announcements()
        .then(setAnnouncements)
        .catch(() => setAnnouncements([]))
        .finally(() => setAnnLoading(false));
    }
  }, [section]);

  const filtered = filter === "All" ? news : news.filter((n) => n.tag === filter);

  const listRef = useScrollReveal(loading, section);

  return (
    <>
      <CryptoDashboard />
      <div className="bl-layer-tools">
        <CryptoBATimeline />
      </div>

      {/* Exchange CTA */}
      {onOpenExchanges && (
        <div className="bl-exchange-cta" onClick={onOpenExchanges} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpenExchanges()}>
          <span className="bl-exchange-cta-text">
            <strong>Sos un exchange o proyecto crypto?</strong> Registrate para publicar tus novedades oficiales en Layer
          </span>
          <span className="bl-exchange-cta-arrow">Registrar &rarr;</span>
        </div>
      )}

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
        <button
          className={`bl-layer-section-btn${section === "anuncios" ? " active" : ""}`}
          onClick={() => setSection("anuncios")}
        >
          <span className="bl-layer-section-label">Anuncios</span>
          {announcements.length > 0 && <span className="bl-layer-section-count">{announcements.length}</span>}
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

      {/* Anuncios section */}
      {section === "anuncios" && (
        <div className="bl-layer-content">
          {annLoading ? (
            <div className="bl-feed"><div className="bl-loading-text">Cargando anuncios...</div></div>
          ) : announcements.length === 0 ? (
            <div className="bl-feed">
              <div className="bl-empty">
                <span className="bl-empty-icon" aria-hidden="true">&#x1F4E2;</span>
                No hay anuncios de proyectos todav&iacute;a.
              </div>
            </div>
          ) : (
            <div className="bl-feed bl-announcements-feed" role="feed" aria-label="Anuncios de proyectos">
              {announcements.map((a, idx) => (
                <article className="bl-announcement-card bl-reveal" key={a.id} style={{ transitionDelay: `${Math.min(idx * 0.03, 0.25)}s` }}>
                  {a.image_url && <img className="bl-announcement-img" src={a.image_url} alt="" loading="lazy" />}
                  <div className="bl-announcement-body">
                    <div className="bl-announcement-header">
                      <span className="bl-announcement-category">{ANN_CATEGORY_LABELS[a.category] || a.category}</span>
                      {a.pinned && <span className="bl-announcement-pin" title="Destacado">&#9733;</span>}
                      <span className="bl-announcement-date">{new Date(a.created_at).toLocaleDateString("es-AR")}</span>
                    </div>
                    <div className="bl-announcement-title">{a.title}</div>
                    {a.body && <div className="bl-announcement-text">{a.body}</div>}
                    <div className="bl-announcement-footer">
                      {a.profiles?.display_name && (
                        <span className="bl-announcement-author">
                          {a.profiles.display_name}
                          {a.profiles.verified && <span className="bl-venue-verified">&#10003;</span>}
                        </span>
                      )}
                      {a.url && <a className="bl-announcement-link" href={a.url} target="_blank" rel="noopener noreferrer">Ver m&aacute;s &rarr;</a>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

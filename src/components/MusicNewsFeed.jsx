import { useEffect, useRef } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";

function useScrollReveal(deps) {
  const containerRef = useRef(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = container.querySelectorAll(".bl-reveal");
    if (!items.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -20px 0px" });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, deps);
  return containerRef;
}

export function MusicNewsFeed({ news, loading, error, onRetry, filter, onFilter }) {
  const tags = ["All", "Local", "Interview", "Music", "Festival", "Techno", "House", "Clubs", "Tour", "Mix", "Scene"];
  const filtered = filter === "All" ? news : news.filter((n) => n.tag === filter);
  const listRef = useScrollReveal([filtered, loading]);

  return (
    <>
      <FilterBar items={tags} active={filter} onChange={onFilter} className="bass-news-filters" />
      {loading ? <NewsSkeleton />
        : error ? <div className="bl-feed"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>{error}</div></div>
        : filtered.length === 0 ? (
          <div className="bl-feed">
            <div className="bl-empty">
              <span className="bl-empty-icon">{"\uD83C\uDFA7"}</span>
              Sin noticias para &ldquo;{filter}&rdquo;.
            </div>
          </div>
        )
        : <div className="bl-feed" role="feed" aria-label="Noticias de música electrónica" ref={listRef}>
            {filtered.map((item, idx) => (
              <article className="bl-feed-item bl-reveal" key={`${item.source}-${item.title.slice(0,40)}`} style={{ transitionDelay: `${Math.min(idx * 0.03, 0.25)}s` }}>
                <span className="bl-feed-time">{item.time}</span>
                <span className="bl-feed-tag">{item.tag}</span>
                {item.url ? <a className="bl-feed-title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  : <span className="bl-feed-title">{item.title}</span>}
                <span className="bl-feed-src">{item.source}</span>
              </article>
            ))}
          </div>}
    </>
  );
}

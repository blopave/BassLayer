export function EventSkeleton({ count = 5 }) {
  return (
    <div className="bl-skeleton" aria-label="Cargando eventos" role="status">
      {Array.from({ length: count }, (_, i) => (
        <div className="bl-skeleton-item" key={i}>
          <div className="bl-skeleton-bone bl-skeleton-circle" />
          <div className="bl-skeleton-bone" style={{ width: 1, height: 32 }} />
          <div className="bl-skeleton-body">
            <div className="bl-skeleton-bone bl-skeleton-line bl-skeleton-line-long" />
            <div className="bl-skeleton-bone bl-skeleton-line bl-skeleton-line-short" />
          </div>
          <div className="bl-skeleton-bone bl-skeleton-line-tag" />
        </div>
      ))}
    </div>
  );
}

export function NewsSkeleton({ count = 5 }) {
  return (
    <div className="bl-feed" aria-label="Cargando noticias" role="status">
      {Array.from({ length: count }, (_, i) => (
        <div className="bl-skeleton-news" key={i}>
          <div className="bl-skeleton-bone bl-skeleton-news-time" />
          <div className="bl-skeleton-bone bl-skeleton-news-tag" />
          <div className="bl-skeleton-bone bl-skeleton-news-title" />
        </div>
      ))}
    </div>
  );
}

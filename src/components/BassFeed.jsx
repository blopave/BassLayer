import { FilterBar } from "./FilterBar";
import { SearchBar } from "./SearchBar";
import { EventSkeleton } from "./SkeletonLoader";

export function BassFeed({ events, loading, error, onRetry, filter, onFilter, onSelect, search, onSearch, isFavorite }) {
  const genres = ["All", "\u2605 Saved", "Techno", "House", "Deep House", "Tech House", "Progressive", "Melodic", "Minimal", "Festival", "Electronic"];

  let filtered = events;
  if (filter === "\u2605 Saved") {
    filtered = events.filter((e) => isFavorite(e));
  } else if (filter !== "All") {
    filtered = events.filter((e) => e.genre === filter);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.venue.toLowerCase().includes(q) ||
      (e.artists || []).some((a) => a.toLowerCase().includes(q)) ||
      (e.detail || "").toLowerCase().includes(q)
    );
  }

  function emptyMessage() {
    if (filter === "\u2605 Saved") {
      return <><span className="bl-empty-icon">{"\u2606"}</span>Todav\u00eda no guardaste eventos. Toc\u00e1 {"\u2606"} en cualquier evento.</>;
    }
    if (search) {
      return <><span className="bl-empty-icon">{"\uD83D\uDD0D"}</span>No encontramos nada para &ldquo;{search}&rdquo;. Prob\u00e1 con otro t\u00e9rmino.</>;
    }
    return <><span className="bl-empty-icon">{"\uD83C\uDFB6"}</span>Sin eventos para este filtro. Prob\u00e1 con otro o volv\u00e9 pronto.</>;
  }

  return (
    <>
      <FilterBar items={genres} active={filter} onChange={onFilter} className="bass-filters" />
      <SearchBar value={search} onChange={onSearch} />
      {loading ? <EventSkeleton />
        : error ? <div className="bl-ev-list"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>{error}</div></div>
        : filtered.length === 0 ? <div className="bl-ev-list"><div className="bl-empty">{emptyMessage()}</div></div>
        : <div className="bl-ev-list" role="feed" aria-label="Eventos de m\u00fasica electr\u00f3nica">
            {filtered.map((item) => (
              <article
                className={`bl-ev-item${item.featured ? " bl-ev-item-featured" : ""}`}
                key={`${item.day}-${item.month}-${item.venue}-${item.name}`}
                onClick={() => onSelect(item)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
                style={{ cursor: "pointer" }}
                tabIndex={0}
                role="button"
                aria-label={`${item.name} - ${item.day} ${item.month} en ${item.venue}`}
              >
                <div className="bl-ev-date">
                  <div className="bl-ev-date-d">{item.day}</div>
                  <div className="bl-ev-date-m">{item.month}</div>
                </div>
                <div className="bl-ev-sep" aria-hidden="true" />
                <div className="bl-ev-body">
                  <div className="bl-ev-name">{item.name}</div>
                  <div className="bl-ev-detail">{item.detail}</div>
                </div>
                <span className="bl-ev-genre">{item.genre}</span>
                <div className="bl-ev-right">
                  <div className="bl-ev-time">{item.time}</div>
                  <div className="bl-ev-venue">{item.venue}</div>
                </div>
              </article>
            ))}
          </div>}
    </>
  );
}

import { useEffect, useState, useRef } from "react";

export function EventModal({ event, onClose, isFavorite, onToggleFavorite, onShare }) {
  const [favPop, setFavPop] = useState(false);
  const favBtnRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [event, onClose]);

  if (!event) return null;

  function ticketUrl() {
    if (event.url) return event.url;
    return `https://www.google.com/search?q=${encodeURIComponent(event.name + " " + event.venue + " Buenos Aires entradas tickets")}`;
  }

  function mapsUrl() {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue + " Buenos Aires")}`;
  }

  const artists = event.artists?.length
    ? event.artists.join(", ")
    : (event.detail?.split(" · ").slice(1).join(", ") || null);

  const fav = isFavorite?.(event);

  function handleFav() {
    onToggleFavorite?.(event);
    setFavPop(true);
    setTimeout(() => setFavPop(false), 300);
  }

  return (
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={event.name}>
      <div className="bl-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label="Cerrar">&#x2715;</button>

        <div className="bl-modal-header">
          <div className="bl-modal-date">
            <div className="bl-modal-date-d">{event.day}</div>
            <div className="bl-modal-date-m">{event.month}</div>
          </div>
          <div className="bl-modal-title-area">
            <h2 className="bl-modal-name">{event.name}</h2>
            <span className="bl-modal-genre">{event.genre}</span>
          </div>
        </div>

        {event.image && (
          <div className="bl-modal-image-wrap">
            <img className="bl-modal-image" src={event.image} alt={event.name} loading="lazy" />
          </div>
        )}

        <div className="bl-modal-body">
          <div className="bl-modal-row">
            <div className="bl-modal-icon" aria-hidden="true">&#x1F550;</div>
            <div>
              <div className="bl-modal-label">Hora</div>
              <div className="bl-modal-value">{event.time} hs</div>
            </div>
          </div>

          <div className="bl-modal-row">
            <div className="bl-modal-icon" aria-hidden="true">&#x1F4CD;</div>
            <div>
              <div className="bl-modal-label">Venue</div>
              <div className="bl-modal-value">
                <a className="bl-maps-link" href={mapsUrl()} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${event.venue} en Google Maps`}>
                  {event.venue} <span className="bl-maps-arrow" aria-hidden="true">&#x2197; Maps</span>
                </a>
              </div>
            </div>
          </div>

          {artists && (
            <div className="bl-modal-row">
              <div className="bl-modal-icon" aria-hidden="true">&#x1F3A7;</div>
              <div>
                <div className="bl-modal-label">Line-up</div>
                <div className="bl-modal-value">{artists}</div>
              </div>
            </div>
          )}
        </div>

        <div className="bl-modal-actions">
          <a className="bl-modal-btn bl-modal-btn-primary" href={ticketUrl()} target="_blank" rel="noopener noreferrer">
            Buscar entradas &#x2192;
          </a>
          <button
            ref={favBtnRef}
            className={`bl-modal-btn bl-modal-btn-secondary bl-modal-btn-fav${fav ? " saved" : ""}${favPop ? " pop" : ""}`}
            onClick={handleFav}
            aria-label={fav ? "Quitar de guardados" : "Guardar evento"}
          >
            {fav ? "\u2605 Guardado" : "\u2606 Guardar"}
          </button>
          <button className="bl-modal-btn bl-modal-btn-secondary" onClick={() => onShare?.(event)} aria-label="Compartir evento">
            Compartir
          </button>
        </div>
      </div>
    </div>
  );
}

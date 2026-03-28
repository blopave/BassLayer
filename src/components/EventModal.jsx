import { useEffect } from "react";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

function buildICS(event) {
  const m = MONTHS_MAP[event.month?.toLowerCase()];
  if (m === undefined) return null;

  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (event.time || "23:00").split(":").map(Number);
  const start = new Date(year, m, parseInt(event.day), h || 23, min || 0);
  // If date is in the past, assume next year
  if (start < now - 30 * 86400000) start.setFullYear(year + 1);
  const end = new Date(start.getTime() + 5 * 3600000); // 5 hour duration

  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const artistStr = event.artists?.filter(a => a && a !== "TBA").join(", ") || "";
  const location = event.address || event.venue || "";
  const description = [
    artistStr ? `Line-up: ${artistStr}` : "",
    event.genre ? `Genero: ${event.genre}` : "",
    event.url ? `Info: ${event.url}` : "",
  ].filter(Boolean).join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BassLayer//Events//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${event.name}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    `UID:${start.getTime()}-${event.venue}@basslayer`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(event) {
  const ics = buildICS(event);
  if (!ics) return;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function EventModal({ event, onClose, onShare }) {
  useEffect(() => {
    if (!event) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [event, onClose]);

  if (!event) return null;

  const hasDirectLink = !!event.url;

  function ticketUrl() {
    if (event.url) return event.url;
    const terms = [event.name, event.venue, "Buenos Aires", "entradas"]
      .filter(Boolean)
      .join(" ");
    return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
  }

  function mapsUrl() {
    const q = event.address || (event.venue + ", Buenos Aires, Argentina");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  const artists = event.artists?.filter(a => a && a !== "TBA" && !a.match(/^(b2b|más a confirmar)/i));

  return (
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={event.name}>
      <div className="bl-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label="Cerrar">&times;</button>

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
          {artists && artists.length > 0 && (
            <div className="bl-modal-section">
              <div className="bl-modal-label">Line-up</div>
              <div className="bl-modal-artists">
                {artists.map((a, i) => (
                  <span key={i} className="bl-modal-artist">{a}</span>
                ))}
              </div>
            </div>
          )}

          <div className="bl-modal-info-grid">
            <div className="bl-modal-info-item">
              <div className="bl-modal-label">Hora</div>
              <div className="bl-modal-info-value">{event.time} hs</div>
            </div>
            <div className="bl-modal-info-item">
              <div className="bl-modal-label">Venue</div>
              <div className="bl-modal-info-value">
                <a className="bl-maps-link" href={mapsUrl()} target="_blank" rel="noopener noreferrer">
                  {event.venue} <span className="bl-maps-arrow">&#x2197;</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="bl-modal-actions">
          <a className={`bl-modal-btn bl-modal-btn-primary${hasDirectLink ? "" : " bl-modal-btn-search"}`} href={ticketUrl()} target="_blank" rel="noopener noreferrer">
            {hasDirectLink ? "Comprar entradas \u2192" : "Buscar entradas \u2192"}
          </a>
          <button className="bl-modal-btn bl-modal-btn-calendar" onClick={() => downloadICS(event)} aria-label="Agregar al calendario">
            <svg className="bl-cal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="16" height="14" rx="2" />
              <line x1="2" y1="9" x2="18" y2="9" />
              <line x1="6" y1="2" x2="6" y2="6" />
              <line x1="14" y1="2" x2="14" y2="6" />
            </svg>
            Calendario
          </button>
          <button className="bl-modal-btn bl-modal-btn-secondary" onClick={() => onShare?.(event)} aria-label="Compartir evento">
            Compartir
          </button>
        </div>
      </div>
    </div>
  );
}

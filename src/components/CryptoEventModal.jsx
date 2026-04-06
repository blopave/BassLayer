import { useEffect } from "react";
import { createPortal } from "react-dom";

const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function parseDate(dateStr) {
  if (!dateStr) return null;
  try { return new Date(dateStr + "T00:00:00"); } catch { return null; }
}

function formatDateLong(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return dateStr || "";
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function buildICS(item) {
  const d = parseDate(item.date);
  if (!d) return null;
  const [h, m] = (item.time || "19:00").split(":").map(Number);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 19, m || 0);
  const end = new Date(start.getTime() + 2 * 3600000);

  const fmt = (dt) => {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${y}${mo}${dd}T${hh}${mm}00`;
  };

  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BassLayer//CryptoIRL//ES",
    "BEGIN:VEVENT",
    `DTSTART;TZID=America/Argentina/Buenos_Aires:${fmt(start)}`,
    `DTEND;TZID=America/Argentina/Buenos_Aires:${fmt(end)}`,
    `SUMMARY:${item.title}`,
    `LOCATION:${item.location || ""}`,
    `DESCRIPTION:${item.organizer || ""}${item.url ? "\\nInfo: " + item.url : ""}`,
    `UID:${start.getTime()}-crypto@basslayer`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(item) {
  const ics = buildICS(item);
  if (!ics) return;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${item.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function mapsUrl(item) {
  const q = item.location || item.organizer || "Buenos Aires";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function CryptoEventModal({ item, onClose }) {
  useEffect(() => {
    if (!item) return;
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [item, onClose]);

  if (!item) return null;

  const d = parseDate(item.date);
  const day = d ? String(d.getDate()) : "";
  const month = d ? MONTHS[d.getMonth()] : "";

  return createPortal(
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="bl-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label="Cerrar">&times;</button>

        <div className="bl-modal-header">
          <div className="bl-modal-date">
            <div className="bl-modal-date-d">{day}</div>
            <div className="bl-modal-date-m">{month}</div>
          </div>
          <div className="bl-modal-title-area">
            <h2 className="bl-modal-name">{item.title}</h2>
            {item.source && <span className="bl-modal-genre">{item.source === "luma" ? "Luma" : item.source === "community" ? "Comunidad" : item.source}</span>}
          </div>
        </div>

        <div className="bl-modal-body">
          {item.description && (
            <div className="bl-modal-section">
              <div className="bl-modal-label">Descripcion</div>
              <div className="bl-modal-desc">{item.description}</div>
            </div>
          )}

          <div className="bl-modal-info-grid">
            <div className="bl-modal-info-item">
              <div className="bl-modal-label">Fecha</div>
              <div className="bl-modal-info-value">{formatDateLong(item.date)}</div>
            </div>
            {item.time && (
              <div className="bl-modal-info-item">
                <div className="bl-modal-label">Hora</div>
                <div className="bl-modal-info-value">{item.time} hs</div>
              </div>
            )}
            <div className="bl-modal-info-item">
              <div className="bl-modal-label">Organizador</div>
              <div className="bl-modal-info-value">{item.organizer}</div>
            </div>
            {item.location && (
              <div className="bl-modal-info-item">
                <div className="bl-modal-label">Lugar</div>
                <div className="bl-modal-info-value">
                  {item.location === "Online" ? "Online" : (
                    <a className="bl-maps-link" href={mapsUrl(item)} target="_blank" rel="noopener noreferrer">
                      {item.location} <span className="bl-maps-arrow">&#x2197;</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {item.free && <div className="bl-cirl-modal-free">Evento gratuito</div>}
          {item.guests > 0 && <div className="bl-cirl-modal-guests">{item.guests} interesados</div>}
        </div>

        <div className="bl-modal-actions">
          {item.url && (
            <a className="bl-modal-btn bl-modal-btn-primary" href={item.url} target="_blank" rel="noopener noreferrer">
              Ver evento &#x2192;
            </a>
          )}
          <button className="bl-modal-btn bl-modal-btn-calendar" onClick={() => downloadICS(item)}>
            <svg className="bl-cal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="16" height="14" rx="2" />
              <line x1="2" y1="9" x2="18" y2="9" />
              <line x1="6" y1="2" x2="6" y2="6" />
              <line x1="14" y1="2" x2="14" y2="6" />
            </svg>
            Calendario
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLocale } from "../hooks/useLocale";
import { formatShortDateLocale, sourceLabel } from "../i18n/strings";

function parseDate(dateStr) {
  if (!dateStr) return null;
  try { return new Date(dateStr + "T00:00:00"); } catch { return null; }
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
  a.download = `${String(item.title || "evento").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}.ics`;
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
  const { t, locale } = useLocale();
  const trapRef = useFocusTrap(!!item, onClose);

  if (!item) return null;

  const lugar = item.location && item.location !== "Online"
    ? <a className="bl-maps-link" href={mapsUrl(item)} target="_blank" rel="noopener noreferrer">{item.location} <span className="bl-maps-arrow">&#x2197;</span></a>
    : item.location;
  const extra = [item.free && t("cevent.free"), item.guests > 0 && t("cevent.interested", { n: item.guests }), sourceLabel(item.source, t)].filter(Boolean);

  // Como la nota (oct 2026): hoja con una línea de cuándo arriba, el nombre,
  // quién y dónde, la descripción y las acciones. Sin la caja de fecha vieja.
  return createPortal(
    <div className="bl-modal-overlay bl-modal-overlay--sheet open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={item.title} ref={trapRef}>
      <div className="bl-modal bl-news-modal bl-cevent-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>
        <div className="bl-news-modal-body">
          <div className="bl-news-modal-meta">
            {[formatShortDateLocale(item.date, locale, { longDay: true }), item.time && `${item.time} ${t("event.hoursShort")}`].filter(Boolean).join(" · ")}
          </div>
          <h2 className="bl-news-modal-title">{item.title}</h2>
          <div className="bl-cevent-who">
            {item.organizer}{lugar && <> · {lugar}</>}
          </div>
          {item.description && <p className="bl-news-modal-desc">{item.description}</p>}
          {extra.length > 0 && <div className="bl-cevent-extra">{extra.join(" · ")}</div>}

          <div className="bl-news-modal-actions">
          {item.url && (
            <a className="bl-modal-btn bl-modal-btn-primary" href={item.url} target="_blank" rel="noopener noreferrer">
              {t("cevent.viewEvent")} &#x2192;
            </a>
          )}
          <button className="bl-modal-btn bl-modal-btn-calendar" onClick={() => downloadICS(item)}>
            <svg className="bl-cal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="16" height="14" rx="2" />
              <line x1="2" y1="9" x2="18" y2="9" />
              <line x1="6" y1="2" x2="6" y2="6" />
              <line x1="14" y1="2" x2="14" y2="6" />
            </svg>
            {t("common.calendar")}
          </button>
          </div>
        </div>
      </div>
    </div>,
    // Dentro de .bl-root (no en body): así toma la paleta de Layer, como la nota.
    document.querySelector(".bl-root") || document.body
  );
}

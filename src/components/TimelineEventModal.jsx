import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLocale } from "../hooks/useLocale";

export function TimelineEventModal({ event, onClose }) {
  const { t } = useLocale();
  const trapRef = useFocusTrap(!!event);

  useEffect(() => {
    if (!event) return;
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [event, onClose]);

  if (!event) return null;

  const typeLabel = t(`timeline.type.${event.type}`);
  const typeDesc = t(`timeline.type.${event.type}.desc`);

  return createPortal(
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={event.title} ref={trapRef}>
      <div className="bl-modal bl-tle-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label={t("common.close")}>&#x2715;</button>

        <div className="bl-tle-header">
          <div className="bl-tle-meta">
            <span className="bl-tle-date">{event.date}</span>
            <span className={`bl-timeline-event-type bl-timeline-type-${event.type}`}>{typeLabel}</span>
          </div>
          <h2 className="bl-tle-title">{event.title}</h2>
        </div>

        <div className="bl-indicator-modal-section">
          <div className="bl-indicator-modal-label">{t("timeline.description")}</div>
          <p className="bl-indicator-modal-text">{event.desc}</p>
        </div>

        {event.context && (
          <div className="bl-indicator-modal-section">
            <div className="bl-indicator-modal-label">{t("timeline.context")}</div>
            <p className="bl-indicator-modal-text">{event.context}</p>
          </div>
        )}

        {typeDesc && (
          <div className="bl-indicator-modal-section">
            <div className="bl-indicator-modal-label">{t("timeline.category")} · {typeLabel}</div>
            <p className="bl-indicator-modal-text">{typeDesc}</p>
          </div>
        )}

        {event.link && (
          <div className="bl-tle-footer">
            <a className="bl-modal-btn bl-modal-btn-primary" href={event.link} target="_blank" rel="noopener noreferrer">
              {t("timeline.viewSource")} &rarr;
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

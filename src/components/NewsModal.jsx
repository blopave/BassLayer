import { useEffect, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLocale } from "../hooks/useLocale";

export function NewsModal({ item, onClose }) {
  const { t } = useLocale();
  const trapRef = useFocusTrap(!!item);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!item) return;
    setImageFailed(false);
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [item, onClose]);

  if (!item) return null;

  const hasImage = item.image && !imageFailed;

  return (
    <div
      className="bl-modal-overlay open"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      ref={trapRef}
    >
      <div className="bl-modal bl-news-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="bl-news-modal-image-wrap">
          {hasImage ? (
            <img
              className="bl-news-modal-image"
              src={item.image}
              alt={item.title}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="bl-news-modal-image-placeholder" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="4" y="6" width="24" height="20" rx="2" />
                <circle cx="11" cy="13" r="2" />
                <path d="M4 22l7-7 6 6 4-4 7 7" />
              </svg>
            </div>
          )}
        </div>

        <div className="bl-news-modal-body">
          <div className="bl-news-modal-meta">
            <span className="bl-news-modal-source">{item.source}</span>
            {item.region && <span className={`bl-bass-news-region bl-bass-news-region-${item.region.toLowerCase()}`}>{item.region}</span>}
            {item.tag && <span className="bl-news-modal-tag">{item.tag}</span>}
            {item.time && <span className="bl-news-modal-time">{item.time}</span>}
          </div>

          <h2 className="bl-news-modal-title">{item.title}</h2>

          {item.description && item.description !== item.title && (
            <div className="bl-news-modal-section">
              <div className="bl-news-modal-label">{t("news.summary")}</div>
              <p className="bl-news-modal-desc">{item.description}</p>
            </div>
          )}

          <div className="bl-news-modal-actions">
            {item.url && (
              <a
                className="bl-modal-btn bl-modal-btn-primary"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("news.readFull")} &rarr;
              </a>
            )}
          </div>

          <div className="bl-news-modal-foot">
            {t("news.source")}: <span className="bl-news-modal-foot-source">{item.source}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLocale } from "../hooks/useLocale";

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDateRange(start, end, locale) {
  if (!start) return "—";
  const s = new Date(start + "T00:00:00");
  const e = end ? new Date(end + "T00:00:00") : null;
  const months = locale === "en" ? MONTHS_EN : MONTHS_ES;
  const sd = s.getDate();
  const sm = months[s.getMonth()];
  const sy = s.getFullYear();
  if (!e || (e.getTime() === s.getTime())) return `${sd} ${sm} ${sy}`;
  const ed = e.getDate();
  const em = months[e.getMonth()];
  const ey = e.getFullYear();
  if (sm === em && sy === ey) return `${sd}–${ed} ${sm} ${sy}`;
  return `${sd} ${sm} – ${ed} ${em} ${sy}`;
}

export function FestivalModal({ festival, onClose }) {
  const { locale, t } = useLocale();
  const trapRef = useFocusTrap(!!festival);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!festival) return;
    setImageFailed(false);
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [festival, onClose]);

  if (!festival) return null;

  const hasImage = festival.image && !imageFailed;
  const dateRange = formatDateRange(festival.dates_start, festival.dates_end, locale);
  const statusLabel = festival.status === "live" ? "EN CURSO"
    : festival.status === "upcoming" ? "PRÓXIMO"
    : festival.status === "past" ? "FINALIZADO"
    : "TBA";

  return (
    <div
      className="bl-modal-overlay open"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={festival.name}
      ref={trapRef}
    >
      <div className="bl-modal bl-festival-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="bl-festival-modal-image-wrap">
          {hasImage ? (
            <img
              className="bl-festival-modal-image"
              src={festival.image}
              alt={festival.name}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="bl-festival-modal-image-placeholder" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M4 28V10l12-6 12 6v18" />
                <path d="M10 28V14l6-3 6 3v14" />
                <path d="M14 28v-6h4v6" />
              </svg>
            </div>
          )}
          <span className={`bl-festival-modal-status bl-festival-status-${festival.status}`}>{statusLabel}</span>
        </div>

        <div className="bl-festival-modal-body">
          <div className="bl-festival-modal-meta">
            <span className="bl-festival-modal-region">{festival.region}</span>
            {festival.country && <span className="bl-festival-modal-country">{festival.country}</span>}
          </div>

          <h2 className="bl-festival-modal-name">{festival.name}</h2>

          <div className="bl-festival-modal-info">
            <div className="bl-festival-modal-info-row">
              <span className="bl-festival-modal-info-key">{locale === "en" ? "When" : "Cuándo"}</span>
              <span className="bl-festival-modal-info-val">{dateRange}</span>
            </div>
            <div className="bl-festival-modal-info-row">
              <span className="bl-festival-modal-info-key">{locale === "en" ? "Where" : "Dónde"}</span>
              <span className="bl-festival-modal-info-val">{festival.city}{festival.country ? `, ${festival.country}` : ""}</span>
            </div>
          </div>

          {festival.description && (
            <p className="bl-festival-modal-desc">{festival.description}</p>
          )}

          {festival.tags && festival.tags.length > 0 && (
            <div className="bl-festival-modal-tags">
              {festival.tags.map((tag) => (
                <span key={tag} className="bl-festival-modal-tag">{tag}</span>
              ))}
            </div>
          )}

          {festival.url && festival.linkStatus !== "broken" && (
            <div className="bl-festival-modal-actions">
              <a
                className="bl-modal-btn bl-modal-btn-primary"
                href={festival.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {locale === "en" ? "Open festival site" : "Abrir sitio del festival"} &rarr;
              </a>
            </div>
          )}
          {festival.linkStatus === "broken" && (
            <div className="bl-festival-modal-link-warn">
              {locale === "en"
                ? "Official site temporarily unavailable. We'll re-check soon."
                : "El sitio oficial está caído por ahora. Lo volvemos a chequear pronto."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

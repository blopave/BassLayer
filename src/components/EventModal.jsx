import { useEffect, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { api } from "../utils/api";
import { useLocale } from "../hooks/useLocale";
import { formatLongDateLocale } from "../i18n/strings";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

function buildICS(event) {
  const m = MONTHS_MAP[event.month?.toLowerCase()];
  if (m === undefined) return null;

  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (event.time || "23:00").split(":").map(Number);
  const start = new Date(year, m, parseInt(event.day), h || 23, min || 0);
  if (start < now - 30 * 86400000) start.setFullYear(year + 1);
  const end = new Date(start.getTime() + 5 * 3600000);

  const fmtLocal = (d) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${y}${mo}${dd}T${hh}${mm}${ss}`;
  };
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
    `DTSTART;TZID=America/Argentina/Buenos_Aires:${fmtLocal(start)}`,
    `DTEND;TZID=America/Argentina/Buenos_Aires:${fmtLocal(end)}`,
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

function searchArtistUrl(name) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} dj`)}`;
}

export function EventModal({ event, onClose, onShare }) {
  const { locale, t } = useLocale();
  const trapRef = useFocusTrap(!!event);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistInfo, setArtistInfo] = useState(null);
  const [artistLoading, setArtistLoading] = useState(false);

  useEffect(() => {
    if (!event) return;
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [event, onClose]);

  // Pre-select headliner when modal opens / event changes
  useEffect(() => {
    if (!event) { setSelectedArtist(null); setArtistInfo(null); return; }
    const list = (event.artists || []).filter(a => a && a !== "TBA" && !a.match(/^(b2b|más a confirmar)/i));
    setSelectedArtist(list[0] || null);
  }, [event]);

  // Fetch info for the selected artist
  useEffect(() => {
    if (!selectedArtist) { setArtistInfo(null); return; }
    let cancelled = false;
    setArtistLoading(true);
    setArtistInfo(null);
    api.artist(selectedArtist, locale)
      .then((data) => { if (!cancelled) setArtistInfo(data); })
      .catch(() => { if (!cancelled) setArtistInfo({ name: selectedArtist, found: false }); })
      .finally(() => { if (!cancelled) setArtistLoading(false); });
    return () => { cancelled = true; };
  }, [selectedArtist, locale]);

  if (!event) return null;

  const hasDirectLink = !!event.url;

  function ticketUrl() {
    if (event.url) return event.url;
    const terms = [event.name, event.venue, "Buenos Aires", "entradas"]
      .filter(Boolean)
      .join(" ");
    return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
  }

  const mapsLocationQuery = (() => {
    const venue = (event.venue || "").trim();
    const address = (event.address || "").trim();
    let core;
    if (venue && address) {
      core = address.toLowerCase().includes(venue.toLowerCase())
        ? address
        : `${venue}, ${address}`;
    } else {
      core = venue || address;
    }
    if (!/buenos aires/i.test(core)) core += ", Buenos Aires";
    if (!/argentina/i.test(core)) core += ", Argentina";
    return core;
  })();
  const mapsViewUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsLocationQuery)}`;
  const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsLocationQuery)}`;

  const artists = event.artists?.filter(a => a && a !== "TBA" && !a.match(/^(b2b|más a confirmar)/i)) || [];
  const headliner = artists[0];
  const supporting = artists.slice(1);

  const longDate = formatLongDateLocale(event.day, event.month, locale);

  return (
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={event.name} ref={trapRef}>
      <div className="bl-modal bl-event-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label="Cerrar">&times;</button>

        <div className="bl-modal-header">
          <div className="bl-modal-date">
            <div className="bl-modal-date-d">{event.day}</div>
            <div className="bl-modal-date-m">{event.month}</div>
          </div>
          <div className="bl-modal-title-area">
            <h2 className="bl-modal-name">{event.name}</h2>
            <div className="bl-em-meta">
              {event.time && <span className="bl-em-meta-time">{event.time} hs</span>}
              {event.genre && <span className="bl-modal-genre">{event.genre}</span>}
            </div>
          </div>
        </div>

        {event.image && (
          <div className="bl-modal-image-wrap">
            <img className="bl-modal-image" src={event.image} alt={event.name} loading="lazy" />
          </div>
        )}

        <div className="bl-modal-body">
          {artists.length > 0 && (
            <div className="bl-modal-section">
              <div className="bl-modal-label">
                {t("event.lineup")} · {artists.length} {artists.length === 1 ? t("event.lineupSingle") : t("event.lineupPlural")}
              </div>
              {headliner && (
                <div className="bl-em-headliner">
                  <button
                    type="button"
                    className={`bl-em-headliner-name${selectedArtist === headliner ? " active" : ""}`}
                    onClick={() => setSelectedArtist(headliner)}
                    title={`${t("event.viewArtist")} ${headliner}`}
                  >
                    {headliner}
                  </button>
                </div>
              )}
              {supporting.length > 0 && (
                <div className="bl-modal-artists">
                  {supporting.map((a, i) => (
                    <button
                      type="button"
                      key={i}
                      className={`bl-modal-artist${selectedArtist === a ? " active" : ""}`}
                      onClick={() => setSelectedArtist(a)}
                      title={`${t("event.viewArtist")} ${a}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}

              {selectedArtist && (
                <ArtistPanel
                  name={selectedArtist}
                  info={artistInfo}
                  loading={artistLoading}
                  t={t}
                />
              )}
            </div>
          )}

          <div className="bl-modal-section">
            <div className="bl-modal-label">{t("event.info")}</div>
            <div className="bl-em-info">
              <div className="bl-em-info-row">
                <span className="bl-em-info-key">{t("event.when")}</span>
                <span className="bl-em-info-val">{longDate}{event.time ? `, ${event.time} ${t("event.hoursShort")}` : ""}</span>
              </div>
              <div className="bl-em-info-row">
                <span className="bl-em-info-key">{t("event.where")}</span>
                <span className="bl-em-info-val">{event.venue}</span>
              </div>
              {event.address && (
                <div className="bl-em-info-row">
                  <span className="bl-em-info-key">{t("event.address")}</span>
                  <span className="bl-em-info-val">{event.address}</span>
                </div>
              )}
              {event.genre && (
                <div className="bl-em-info-row">
                  <span className="bl-em-info-key">{t("event.genre")}</span>
                  <span className="bl-em-info-val">{event.genre}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bl-modal-section">
            <div className="bl-modal-label">{t("event.location")}</div>
            <div className="bl-em-loc-card">
              <div className="bl-em-loc-pin" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 21s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </div>
              <div className="bl-em-loc-body">
                <div className="bl-em-loc-venue">{event.venue}</div>
                {event.address && (
                  <div className="bl-em-loc-addr">{event.address}</div>
                )}
                <div className="bl-em-loc-actions">
                  <a
                    className="bl-em-loc-btn"
                    href={mapsViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("event.viewOnMaps")} &#x2197;
                  </a>
                  <a
                    className="bl-em-loc-btn bl-em-loc-btn-primary"
                    href={mapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("event.directions")} &rarr;
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bl-modal-actions">
          <a className={`bl-modal-btn bl-modal-btn-primary${hasDirectLink ? "" : " bl-modal-btn-search"}`} href={ticketUrl()} target="_blank" rel="noopener noreferrer">
            {hasDirectLink ? `${t("event.buyTickets")} →` : `${t("event.searchTickets")} →`}
          </a>
          <button className="bl-modal-btn bl-modal-btn-calendar" onClick={() => downloadICS(event)} aria-label={t("common.calendar")}>
            <svg className="bl-cal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="16" height="14" rx="2" />
              <line x1="2" y1="9" x2="18" y2="9" />
              <line x1="6" y1="2" x2="6" y2="6" />
              <line x1="14" y1="2" x2="14" y2="6" />
            </svg>
            {t("common.calendar")}
          </button>
          <button className="bl-modal-btn bl-modal-btn-secondary" onClick={() => onShare?.(event)} aria-label={t("common.share")}>
            {t("common.share")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArtistPanel({ name, info, loading, t }) {
  const tFn = t || ((k) => k);

  if (loading) {
    return (
      <div className="bl-em-artist-panel">
        <div className="bl-em-artist-loading">
          <span className="bl-em-artist-pulse">{name}</span>
          <span className="bl-em-artist-pulse-sub">{tFn("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (!info || !info.found) {
    return (
      <div className="bl-em-artist-panel">
        <div className="bl-em-artist-body">
          <div className="bl-em-artist-name">{name}</div>
          <div className="bl-em-artist-desc">{tFn("artist.noBio")}</div>
          <div className="bl-em-artist-links">
            <a
              href={searchArtistUrl(name)}
              target="_blank"
              rel="noopener noreferrer"
              className="bl-em-artist-link"
            >
              {tFn("common.searchOnGoogle")} &#x2197;
            </a>
            <a
              href={`https://soundcloud.com/search?q=${encodeURIComponent(name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bl-em-artist-link"
            >
              SoundCloud &#x2197;
            </a>
          </div>
        </div>
      </div>
    );
  }

  const sourceLabel = info.source === "deezer"
    ? "Deezer"
    : info.source === "wikipedia-en"
      ? "Wikipedia (EN)"
      : info.source === "wikipedia-es"
        ? "Wikipedia (ES)"
        : "Wikipedia";

  return (
    <div className="bl-em-artist-panel">
      {info.thumbnail && (
        <div className="bl-em-artist-thumb-wrap">
          <img className="bl-em-artist-thumb" src={info.thumbnail} alt={info.title || name} loading="lazy" />
        </div>
      )}
      <div className="bl-em-artist-body">
        <div className="bl-em-artist-name">{info.title || name}</div>
        {info.description && (
          <div className="bl-em-artist-desc">{info.description}</div>
        )}
        {info.extract && (
          <p className="bl-em-artist-extract">{info.extract}</p>
        )}
        <div className="bl-em-artist-links">
          {info.url && (
            <a
              href={info.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bl-em-artist-link"
            >
              {sourceLabel} &#x2197;
            </a>
          )}
          <a
            href={`https://soundcloud.com/search?q=${encodeURIComponent(name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bl-em-artist-link"
          >
            SoundCloud &#x2197;
          </a>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { cleanArtists } from "../utils/artists";
import { Poster, ArtistPhoto } from "./BlThumb";
import { imgUrl } from "../utils/img";
import { api } from "../utils/api";
import { useLocale } from "../hooks/useLocale";
import { formatLongDateLocale, monthAbbrLocale, MONTH_ABBR_INDEX, eventStamp } from "../i18n/strings";
import { useSavedEvents } from "../hooks/useSavedEvents";
import { eventSlug } from "../utils/slug";

// Fechas: asumimos 23:00 local si el evento no trae hora, +5h de duración
// para el .ics, +6h para Google Calendar (según el prompt). Zona horaria
// fija America/Argentina/Buenos_Aires (offset -03:00 sin DST).
function eventTimes(event) {
  const m = MONTH_ABBR_INDEX[event.month?.toLowerCase()];
  if (m === undefined) return null;
  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (event.time || "23:00").split(":").map(Number);
  const start = new Date(year, m, parseInt(event.day), h || 23, min || 0);
  if (start < now - 30 * 86400000) start.setFullYear(year + 1);
  return start;
}

function buildEventDescription(event) {
  const artistStr = cleanArtists(event.artists).join(", ");
  return [
    artistStr ? `Line-up: ${artistStr}` : "",
    event.genre ? `Género: ${event.genre}` : "",
    event.url ? `Info: ${event.url}` : "",
    `https://basslayer.io/eventos/${eventSlug(event)}`,
  ].filter(Boolean).join("\n");
}

function buildICS(event) {
  const start = eventTimes(event);
  if (!start) return null;
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
  const location = event.address || event.venue || "";
  // Escapado RFC-5545 para líneas TEXT: barra invertida, coma, punto y coma, saltos
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BassLayer//Events//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `DTSTART;TZID=America/Argentina/Buenos_Aires:${fmtLocal(start)}`,
    `DTEND;TZID=America/Argentina/Buenos_Aires:${fmtLocal(end)}`,
    `SUMMARY:${esc(event.name)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(buildEventDescription(event))}`,
    "STATUS:CONFIRMED",
    `UID:${start.getTime()}-${esc(event.venue || "basslayer")}@basslayer`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// Formato UTC compacto YYYYMMDDTHHMMSSZ para el link de Google Calendar.
function googleCalendarUrl(event) {
  const start = eventTimes(event);
  if (!start) return null;
  const end = new Date(start.getTime() + 6 * 3600000);
  const fmtUtc = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name || "Evento",
    dates: `${fmtUtc(start)}/${fmtUtc(end)}`,
    details: buildEventDescription(event),
    location: [event.venue, event.address, event.city].filter(Boolean).join(", ") || "Buenos Aires",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(event) {
  const ics = buildICS(event);
  if (!ics) return;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(event.name || "evento").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function searchArtistUrl(name) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} dj`)}`;
}

// Nombre corto de la ticketera a partir del link del evento, para que el CTA
// diga a dónde lleva ("Entradas en RA") en vez de un genérico.
const TICKET_HOSTS = [
  ["ra.co", "RA"], ["passline", "Passline"], ["venti", "Venti"],
  ["allaccess", "All Access"], ["entradauno", "EntradaUno"], ["ticketek", "Ticketek"],
];
function ticketHostLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const hit = TICKET_HOSTS.find(([k]) => host === k || host.endsWith("." + k) || host.includes(k));
    return hit ? hit[1] : null;
  } catch { return null; }
}

export function EventModal({ event, onClose, onShare }) {
  const { locale, t } = useLocale();
  const trapRef = useFocusTrap(!!event, onClose);
  const dragRef = useSheetDrag(onClose);
  const { isSaved, toggle } = useSavedEvents();
  const [infos, setInfos] = useState({});         // nombre → info del artista (o null mientras carga)
  const [openArtist, setOpenArtist] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageDirect, setImageDirect] = useState(false); // el proxy falló → URL original
  const [artistImageFailed, setArtistImageFailed] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  useEffect(() => {
    if (!event) return;
    setImageFailed(false);
    setImageDirect(false);
    setArtistImageFailed(false);
    setCalOpen(false);
    setOpenArtist(null);
  }, [event]);

  useEffect(() => {
    if (!calOpen) return;
    const handler = (e) => {
      if (!e.target.closest(".bl-cal-menu-wrap")) setCalOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [calOpen]);

  // Info de cada artista del line-up (foto, descripción corta, link), en
  // paralelo y fila a fila: el server cachea 12 h y el browser respeta ese
  // Cache-Control, así que reabrir no repite el viaje. null = pendiente.
  useEffect(() => {
    if (!event) { setInfos({}); return; }
    const names = cleanArtists(event.artists);
    let cancelled = false;
    setInfos(Object.fromEntries(names.map((n) => [n, null])));
    names.forEach((name) => {
      api.artist(name, locale)
        .catch(() => ({ name, found: false }))
        .then((data) => { if (!cancelled) setInfos((prev) => ({ ...prev, [name]: data })); });
    });
    return () => { cancelled = true; };
  }, [event, locale]);

  if (!event) return null;

  const hasDirectLink = !!event.url;
  const hostLabel = hasDirectLink ? ticketHostLabel(event.url) : null;

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

  const artists = cleanArtists(event.artists);
  const longDate = formatLongDateLocale(event.day, event.month, locale);
  const stamp = eventStamp(event, t);
  const slug = eventSlug(event);
  const savedOn = isSaved(slug);
  const priceNum = Number(event.ticket_price);
  const priceLabel = isFinite(priceNum) && priceNum > 0
    ? `${t("event.priceFrom")} $${priceNum.toLocaleString(locale === "en" ? "en-US" : "es-AR")}`
    : null;
  const showFlyer = event.image && !imageFailed;
  const showArtistPhoto = !showFlyer && event.artistImage && !artistImageFailed;

  return (
    <div className="bl-modal-overlay bl-modal-overlay--sheet open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={event.name} ref={trapRef}>
      <div className="bl-modal bl-event-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        {/* Columna del flyer: el afiche entero sobre su propia copia desenfocada.
            Sin flyer, la foto del artista a escala hero; sin foto, el mini-afiche. */}
        <div className="bl-em-fly" ref={dragRef}>
          <span className="bl-em-grab" aria-hidden="true" />
          {showFlyer ? (
            <>
              <div className="bl-em-fly-blur" style={{ backgroundImage: `url("${imageDirect ? event.image : imgUrl(event.image, 80)}")` }} aria-hidden="true" />
              <img
                className="bl-em-fly-img"
                src={imageDirect ? event.image : imgUrl(event.image, 400)}
                alt={event.name}
                onError={() => { if (imageDirect) setImageFailed(true); else setImageDirect(true); }}
              />
            </>
          ) : showArtistPhoto ? (
            <div className="bl-em-fly-photo" aria-hidden="true">
              <ArtistPhoto
                src={event.artistImage}
                name={event.artistImageName || artists[0] || event.name}
                family={event.family}
                onFail={() => setArtistImageFailed(true)}
              />
            </div>
          ) : (
            <div className="bl-em-fly-poster" aria-hidden="true">
              <Poster text={artists[0] || event.name} family={event.family} />
            </div>
          )}
          <div className="bl-em-stamp" aria-hidden="true">
            <b>{event.day}</b>
            <span>{monthAbbrLocale(event.month, locale)}</span>
          </div>
        </div>

        <div className="bl-em-body">
          <div className="bl-em-scroll">
            <div className="bl-em-eyebrow">
              <span>{longDate}</span>
              {event.time && <><i aria-hidden="true">·</i><b>{event.time}</b></>}
              {stamp && <><i aria-hidden="true">·</i><span>{stamp}</span></>}
              {priceLabel && <><i aria-hidden="true">·</i><span className="bl-em-price">{priceLabel}</span></>}
            </div>
            <h1 className="bl-em-title">{event.name}</h1>

            {event.description && (
              <p className="bl-em-desc bl-bass-t-body">{event.description}</p>
            )}

            {artists.length > 0 && (
              <section className="bl-em-sec" aria-label={t("event.lineup")}>
                <div className="bl-em-label bl-bass-t-label">
                  {t("event.lineup")} · {artists.length} {artists.length === 1 ? t("event.lineupSingle") : t("event.lineupPlural")}
                </div>
                <ul className="bl-em-lineup">
                  {artists.map((name, i) => (
                    <LineupRow
                      key={name}
                      name={name}
                      info={infos[name]}
                      headliner={i === 0}
                      open={openArtist === name}
                      onToggle={() => setOpenArtist(openArtist === name ? null : name)}
                      t={t}
                    />
                  ))}
                </ul>
              </section>
            )}

            <section className="bl-em-sec bl-em-loc" aria-label={t("event.where")}>
              <div className="bl-em-label bl-bass-t-label">{t("event.where")}</div>
              <div className="bl-em-loc-venue">{event.venue}</div>
              {event.address && <div className="bl-em-loc-addr">{event.address}</div>}
              <div className="bl-em-loc-links">
                <a href={mapsViewUrl} target="_blank" rel="noopener noreferrer">{t("event.viewOnMaps")} &#x2197;</a>
                <a href={mapsDirectionsUrl} target="_blank" rel="noopener noreferrer">{t("event.directions")} &rarr;</a>
              </div>
            </section>
          </div>

          <div className="bl-em-act">
            <a className="bl-em-cta" href={ticketUrl()} target="_blank" rel="noopener noreferrer">
              {hasDirectLink
                ? (hostLabel ? `${t("event.ticketsOn")} ${hostLabel}` : t("event.tickets"))
                : t("event.searchTickets")}
              <small aria-hidden="true">&#x2197;</small>
            </a>
            <div className="bl-em-ghosts">
              <button
                type="button"
                className={`bl-em-gh${savedOn ? " on" : ""}`}
                aria-pressed={savedOn}
                onClick={() => toggle(slug)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21V3z" fill={savedOn ? "currentColor" : "none"} /></svg>
                {savedOn ? t("saved.remove") : t("saved.add")}
              </button>
              <div className="bl-cal-menu-wrap">
                <button
                  type="button"
                  className="bl-em-gh"
                  onClick={(e) => { e.stopPropagation(); setCalOpen((v) => !v); }}
                  aria-haspopup="menu"
                  aria-expanded={calOpen}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                  {t("common.calendar")}
                </button>
                {calOpen && (
                  <div className="bl-cal-menu" role="menu">
                    <a
                      className="bl-cal-menu-item"
                      href={googleCalendarUrl(event) || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={() => setCalOpen(false)}
                    >
                      Google Calendar
                    </a>
                    <button
                      className="bl-cal-menu-item"
                      onClick={async () => {
                        setCalOpen(false);
                        // El server sirve el .ics con Content-Type text/calendar:
                        // en iOS eso lo abre Calendario directo, sin pasos de
                        // descarga. Si el server no lo tiene, blob local.
                        const href = `/api/ics/${eventSlug(event)}.ics`;
                        try {
                          const r = await fetch(href, { method: "HEAD" });
                          if (r.ok) { window.location.assign(href); return; }
                        } catch { /* offline → local */ }
                        downloadICS(event);
                      }}
                      role="menuitem"
                    >
                      {t("event.downloadIcs")}
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="bl-em-gh" onClick={() => onShare?.(event)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6" /></svg>
                {t("common.share")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SOURCE_LABELS = { deezer: "Deezer", "wikipedia-en": "Wikipedia (EN)", "wikipedia-es": "Wikipedia (ES)", itunes: "Apple Music", musicbrainz: "MusicBrainz" };

// Fila del line-up: foto (o inicial), nombre, una línea de contexto y el link
// a la fuente. Tocarla despliega la bio debajo cuando hay algo que contar.
function LineupRow({ name, info, headliner, open, onToggle, t }) {
  const loading = info === null;
  const found = !!(info && info.found);
  const [thumbFailed, setThumbFailed] = useState(false);
  // Si la foto falla (p. ej. el CDN de Deezer corta el proxy) cae a la inicial.
  const thumb = found && !thumbFailed && info.thumbnail;
  const sub = headliner ? t("event.headliner") : (found && info.description) || null;
  const sourceLabel = found ? (SOURCE_LABELS[info.source] || "Wikipedia") : null;
  const hasMore = found && (info.extract || info.description);
  const initial = name.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase() || "·";

  return (
    <li className={`bl-em-row${open ? " is-open" : ""}${headliner ? " is-headliner" : ""}`}>
      <button type="button" className="bl-em-row-btn" onClick={onToggle} aria-expanded={open}>
        {thumb ? (
          <img className="bl-em-av" src={thumb} alt="" loading="lazy" decoding="async" onError={() => setThumbFailed(true)} />
        ) : (
          <span className={`bl-em-av bl-em-av-ph${loading ? " is-loading" : ""}`} aria-hidden="true">{initial}</span>
        )}
        <span className="bl-em-row-txt">
          <b>{name}</b>
          {sub && <span className={`bl-em-row-sub${headliner ? " is-h" : ""}`}>{sub}</span>}
        </span>
        <span className="bl-em-row-chev" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="bl-em-bio">
          {loading ? (
            <div className="bl-em-bio-loading">{t("common.loading")}</div>
          ) : (
            <>
              {found && info.extract && <p className="bl-em-bio-extract">{info.extract}</p>}
              {!hasMore && <p className="bl-em-bio-extract bl-em-bio-none">{t("artist.noBio")}</p>}
              <div className="bl-em-bio-links">
                {found && info.url && (
                  <a href={info.url} target="_blank" rel="noopener noreferrer">{sourceLabel} &#x2197;</a>
                )}
                <a href={`https://soundcloud.com/search?q=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer">SoundCloud &#x2197;</a>
                {!found && (
                  <a href={searchArtistUrl(name)} target="_blank" rel="noopener noreferrer">{t("common.searchOnGoogle")} &#x2197;</a>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

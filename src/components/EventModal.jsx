import { useCallback, useEffect, useRef, useState } from "react";
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
  const player = usePreviewPlayer();
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
      api.artist(name, locale, event.family)
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
            <div className="bl-em-fly-poster bl-thumb-poster" aria-hidden="true">
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
                <LineupHead name={artists[0]} info={infos[artists[0]]} player={player} t={t} />
                {artists.length > 1 && (
                  <ul className="bl-em-grid">
                    {artists.slice(1).map((name) => (
                      <LineupChip
                        key={name}
                        name={name}
                        info={infos[name]}
                        player={player}
                        open={openArtist === name}
                        onToggle={() => setOpenArtist(openArtist === name ? null : name)}
                        t={t}
                      />
                    ))}
                  </ul>
                )}
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

const SOURCE_LABELS = { deezer: "Deezer", "wikipedia-en": "Wikipedia (EN)", "wikipedia-es": "Wikipedia (ES)", itunes: "Apple Music" };

// Un solo <audio> por ficha: tocar otro ▶ corta el anterior, cerrar la ficha
// lo corta todo. La URL la resuelve /api/preview (la de Deezer vence en ~15 min).
function usePreviewPlayer() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(null);   // track id sonando
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onEnd = () => { setPlaying(null); setProgress(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onEnd);
    audioRef.current = a;
    return () => { a.pause(); a.removeAttribute("src"); a.removeEventListener("timeupdate", onTime); a.removeEventListener("ended", onEnd); a.removeEventListener("error", onEnd); };
  }, []);
  const toggle = useCallback((trackId) => {
    const a = audioRef.current;
    if (!a) return;
    if (playing === trackId) { a.pause(); setPlaying(null); setProgress(0); return; }
    a.src = `/api/preview/${trackId}`;
    setProgress(0);
    setPlaying(trackId);
    a.play().catch(() => { setPlaying(null); });
  }, [playing]);
  return { playing, progress, toggle };
}

function PlayButton({ track, artist, player, withTitle, t }) {
  if (!track) return null;
  const on = player.playing === track.id;
  return (
    <button
      type="button"
      className={`bl-em-play${on ? " is-on" : ""}`}
      onClick={(e) => { e.stopPropagation(); player.toggle(track.id); }}
      aria-pressed={on}
      aria-label={`${on ? t("event.pause") : t("event.listen")}: ${track.title} — ${artist}`}
    >
      <span className="bl-em-play-ic" style={on ? { "--p": player.progress } : undefined} aria-hidden="true">
        {on ? <svg viewBox="0 0 10 10"><path d="M0 0h3.5v10H0zM6.5 0H10v10H6.5z" /></svg>
            : <svg viewBox="0 0 10 12"><path d="M0 0l10 6-10 6z" /></svg>}
      </span>
      {withTitle && <span className="bl-em-play-title">{track.title}</span>}
    </button>
  );
}

// Foto del artista o su inicial; si la foto falla (CDN caído) cae a la inicial.
function ArtistAvatar({ name, info, className }) {
  const [failed, setFailed] = useState(false);
  const loading = info === null;
  const thumb = info?.found && !failed && info.thumbnail;
  const initial = name.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase() || "·";
  return thumb
    ? <img className={className} src={thumb} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className={`${className} bl-em-av-ph${loading ? " is-loading" : ""}`} aria-hidden="true">{initial}</span>;
}

function ArtistLinks({ name, info, t }) {
  const found = !!info?.found;
  return (
    <div className="bl-em-bio-links">
      {found && info.url && <a href={info.url} target="_blank" rel="noopener noreferrer">{SOURCE_LABELS[info.source] || "Wikipedia"} &#x2197;</a>}
      <a href={`https://soundcloud.com/search?q=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer">SoundCloud &#x2197;</a>
      {!found && <a href={searchArtistUrl(name)} target="_blank" rel="noopener noreferrer">{t("common.searchOnGoogle")} &#x2197;</a>}
    </div>
  );
}

// Headliner: tarjeta grande con foto, bio verificada y su tema para escuchar.
// Replica la jerarquía del flyer (el nombre grande arriba, el resto abajo).
function LineupHead({ name, info, player, t }) {
  const bio = info?.found && info.extract;
  return (
    <div className="bl-em-head">
      <ArtistAvatar name={name} info={info} className="bl-em-head-av" />
      <div className="bl-em-head-id">
        <div className="bl-em-head-tag">{t("event.headliner")}</div>
        <div className="bl-em-head-name">{name}</div>
      </div>
      {bio && <p className="bl-em-head-bio">{bio}</p>}
      <div className="bl-em-head-act">
        <PlayButton track={info?.track} artist={name} player={player} withTitle t={t} />
        <ArtistLinks name={name} info={info} t={t} />
      </div>
    </div>
  );
}

// Resto del line-up: fichas compactas. Tocar el nombre despliega bio y links
// a lo ancho de la grilla; el ▶ es un botón aparte (no anidado).
function LineupChip({ name, info, player, open, onToggle, t }) {
  const bio = info?.found && info.extract;
  return (
    <li className={`bl-em-chip${open ? " is-open" : ""}`}>
      <div className="bl-em-chip-row">
        <button type="button" className="bl-em-chip-main" onClick={onToggle} aria-expanded={open}>
          <ArtistAvatar name={name} info={info} className="bl-em-chip-av" />
          <span className="bl-em-chip-txt">
            <b>{name}</b>
            {info?.track && <span className="bl-em-chip-sub">{info.track.title}</span>}
          </span>
        </button>
        <PlayButton track={info?.track} artist={name} player={player} t={t} />
      </div>
      {open && (
        <div className="bl-em-bio">
          {info === null ? <div className="bl-em-bio-loading">{t("common.loading")}</div> : (
            <>
              <p className="bl-em-bio-extract">{bio || t("artist.noBio")}</p>
              <ArtistLinks name={name} info={info} t={t} />
            </>
          )}
        </div>
      )}
    </li>
  );
}

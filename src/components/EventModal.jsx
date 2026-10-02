import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { noOrphanSep } from "../utils/format";

// La ficha sin scroll (oct 2026, Pablo): toma el alto de su contenido; el
// line-up es un afiche que ajusta su letra, la ficha de cada artista se abre
// adentro de la misma ventana y las acciones van en una sola fila.

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
  const player = usePreviewPlayer();
  const [imageFailed, setImageFailed] = useState(false);
  const [imageDirect, setImageDirect] = useState(false); // el proxy falló → URL original
  const [artistImageFailed, setArtistImageFailed] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [artistView, setArtistView] = useState(null);   // artista abierto adentro de la ficha ("*" = line-up completo)
  // La ventana toma el alto de su contenido; solo si no entra en la
  // pantalla pasa a "ajustada" (alto disponible y el afiche achica su letra).
  const [tight, setTight] = useState(false);
  const modalRef = useRef(null);
  const [flash, setFlash] = useState(null);             // "Guardado" / "Quitado" un instante
  const flashT = useRef(null);
  const say = (msg) => { clearTimeout(flashT.current); setFlash(msg); flashT.current = setTimeout(() => setFlash(null), 1600); };
  useEffect(() => () => clearTimeout(flashT.current), []);

  useEffect(() => {
    if (!event) return;
    setImageFailed(false);
    setImageDirect(false);
    setArtistImageFailed(false);
    setCalOpen(false);
    setArtistView(null);
    setTight(false);
  }, [event]);
  useEffect(() => { setTight(false); }, [artistView]);
  useLayoutEffect(() => {
    if (tight) return;
    const sc = modalRef.current?.querySelector(".bl-em-scroll");
    if (sc && sc.scrollHeight > sc.clientHeight + 1) setTight(true);
  });
  useEffect(() => {
    const onResize = () => setTight(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  const locSec = (
    <section className="bl-em-sec bl-em-loc" aria-label={t("event.where")}>
      <div className="bl-em-label bl-bass-t-label">{t("event.where")}</div>
      <div className="bl-em-loc-venue">{event.venue}</div>
      {event.address && <div className="bl-em-loc-addr">{event.address}</div>}
      <div className="bl-em-loc-links">
        <a href={mapsViewUrl} target="_blank" rel="noopener noreferrer">{t("event.viewOnMaps")} &#x2197;</a>
        <a href={mapsDirectionsUrl} target="_blank" rel="noopener noreferrer">{t("event.directions")} &rarr;</a>
      </div>
    </section>
  );
  const showFlyer = event.image && !imageFailed;
  const showArtistPhoto = !showFlyer && event.artistImage && !artistImageFailed;

  return (
    <div className="bl-modal-overlay bl-modal-overlay--sheet open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={event.name} ref={trapRef}>
      <div ref={modalRef} className={`bl-modal bl-event-modal is-v2${tight ? " is-tight" : ""}${tight && artists.length > 1 ? " has-cartel" : ""}${artistView === "*" ? " is-all" : ""}`}>
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
            <h1 className="bl-em-title">{noOrphanSep(event.name)}</h1>

            {event.description && (
              <p className="bl-em-desc bl-bass-t-body">{event.description}</p>
            )}

            {/* "Dónde" va con la fecha, arriba; el afiche del line-up llena el resto. */}
            {locSec}
            {artists.length > 0 && (
              <section className="bl-em-sec" aria-label={t("event.lineup")}>
                {artistView !== "*" && <div className="bl-em-label bl-bass-t-label">
                  {/* Con un solo nombre no se cuenta: la fuente a veces trae solo el headliner
                      y "1 artista" contradecía al flyer (oct 2026). */}
                  {t("event.lineup")}{artists.length > 1 && <> · {artists.length} {t("event.lineupPlural")}</>}
                </div>}
                {artistView === "*" ? (
                    <div className="bl-em-artist bl-em-all">
                      <button type="button" className="bl-em-back" onClick={() => setArtistView(null)}>← {t("event.lineup")}</button>
                      <Cartel names={artists} onPick={setArtistView} t={t} />
                    </div>
                  ) : artistView ? (
                    <div className="bl-em-artist">
                      <button type="button" className="bl-em-back" onClick={() => setArtistView(null)}>← {t("event.lineup")}</button>
                      <LineupHead name={artistView} info={infos[artistView]} player={player} t={t} tag={artistView === artists[0] ? t("event.headliner") : t("event.lineup")} />
                    </div>
                  ) : (
                    <>
                      <LineupHead name={artists[0]} info={infos[artists[0]]} player={player} t={t} />
                      {artists.length > 1 && <Cartel names={artists.slice(1)} onPick={setArtistView} onMore={() => setArtistView("*")} t={t} />}
                    </>
                  )}
              </section>
            )}

          </div>

          <div className="bl-em-act bl-em-act2">
              {flash && <div className="bl-em-flash" role="status">{flash}</div>}
              <a className="bl-em-cta" href={ticketUrl()} target="_blank" rel="noopener noreferrer">
                {hasDirectLink ? (hostLabel ? `${t("event.ticketsOn")} ${hostLabel}` : t("event.tickets")) : t("event.searchTickets")}
                <small aria-hidden="true">&#x2197;</small>
              </a>
              <button type="button" className={`bl-em-ic${savedOn ? " on" : ""}`} aria-pressed={savedOn} aria-label={savedOn ? t("saved.remove") : t("saved.add")} data-tip={savedOn ? t("saved.remove") : t("saved.add")}
                onClick={() => { toggle(slug); say(savedOn ? t("saved.removed") : t("saved.remove")); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21V3z" fill={savedOn ? "currentColor" : "none"} /></svg>
              </button>
              <div className="bl-cal-menu-wrap">
                <button type="button" className="bl-em-ic" onClick={(e) => { e.stopPropagation(); setCalOpen((v) => !v); }} aria-haspopup="menu" aria-expanded={calOpen} aria-label={t("common.calendar")} data-tip={t("common.calendar")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                </button>
                {calOpen && (
                  <div className="bl-cal-menu bl-cal-menu--up" role="menu">
                    <a className="bl-cal-menu-item" href={googleCalendarUrl(event) || "#"} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setCalOpen(false)}>Google Calendar</a>
                    <button className="bl-cal-menu-item" role="menuitem" onClick={async () => {
                      setCalOpen(false);
                      const href = `/api/ics/${eventSlug(event)}.ics`;
                      try { const r = await fetch(href, { method: "HEAD" }); if (r.ok) { window.location.assign(href); return; } } catch { /* offline → local */ }
                      downloadICS(event);
                    }}>{t("event.downloadIcs")}</button>
                  </div>
                )}
              </div>
              <button type="button" className="bl-em-ic" onClick={() => onShare?.(event)} aria-label={t("common.share")} data-tip={t("common.share")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6" /></svg>
              </button>
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
  const playingRef = useRef(null);   // espejo de `playing` para que toggle sea estable
  const [playing, setPlaying] = useState(null);   // track id sonando
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    const onEnd = () => { playingRef.current = null; setPlaying(null); };
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onEnd);
    audioRef.current = a;
    return () => { a.pause(); a.removeAttribute("src"); a.removeEventListener("ended", onEnd); a.removeEventListener("error", onEnd); };
  }, []);
  const toggle = useCallback((trackId) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingRef.current === trackId) { a.pause(); playingRef.current = null; setPlaying(null); return; }
    a.src = `/api/preview/${trackId}`;
    playingRef.current = trackId;
    setPlaying(trackId);
    a.play().catch(() => { playingRef.current = null; setPlaying(null); });
  }, []);
  return useMemo(() => ({ playing, toggle, audioRef }), [playing, toggle]);
}

function PlayButton({ track, artist, player, withTitle, t }) {
  const on = !!track && player.playing === track.id;
  const icRef = useRef(null);
  // El progreso va directo al anillo del botón que suena (timeupdate ~4/s):
  // como estado de React re-renderizaba la ficha entera durante 30 s.
  useEffect(() => {
    const a = player.audioRef.current, ic = icRef.current;
    if (!on || !a || !ic) return;
    const onTime = () => ic.style.setProperty("--p", a.duration ? a.currentTime / a.duration : 0);
    a.addEventListener("timeupdate", onTime);
    return () => { a.removeEventListener("timeupdate", onTime); ic.style.removeProperty("--p"); };
  }, [on, player.audioRef]);
  if (!track) return null;
  return (
    <button
      type="button"
      className={`bl-em-play${on ? " is-on" : ""}`}
      onClick={(e) => { e.stopPropagation(); player.toggle(track.id); }}
      aria-pressed={on}
      aria-label={`${on ? t("event.pause") : t("event.listen")}: ${track.title} — ${artist}`}
    >
      <span className="bl-em-play-ic" ref={icRef} aria-hidden="true">
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
function LineupHead({ name, info, player, t, tag }) {
  const bio = info?.found && info.extract;
  return (
    <div className="bl-em-head">
      <ArtistAvatar name={name} info={info} className="bl-em-head-av" />
      <div className="bl-em-head-id">
        <div className="bl-em-head-tag">{tag || t("event.headliner")}</div>
        <div className="bl-em-head-name">{name}</div>
      </div>
      {bio && (
        <div className="bl-em-head-bio">
          <p>{bio}</p>
          {info.translated && <span className="bl-em-tr">{t("artist.autoTranslated")}</span>}
        </div>
      )}
      <div className="bl-em-head-act">
        <PlayButton track={info?.track} artist={name} player={player} withTitle t={t} />
        <ArtistLinks name={name} info={info} t={t} />
      </div>
    </div>
  );
}

// El resto del line-up como afiche — nombres en renglones separados
// por "·", cada uno se toca para abrir su ficha. La letra se achica hasta que
// todo entre en el lugar que queda (sin scroll); por debajo de 12 px, cierra
// con "+N más", que abre el line-up completo en la misma ventana.
function Cartel({ names, onPick, onMore, t }) {
  const ref = useRef(null);
  const [fit, setFit] = useState({ size: 17, shown: names.length });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // Se mide sobre una copia invisible del mismo ancho y alto: el afiche real
    // lo maneja React y no se toca a mano.
    const run = () => {
      const probe = el.cloneNode(false);
      Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", left: "0", top: "0", width: `${el.clientWidth}px`, height: `${el.clientHeight}px` });
      el.parentElement.appendChild(probe);
      // La copia se arma con las mismas piezas que el afiche (botones y
      // separadores): un botón ocupa más alto que el texto suelto.
      const fits = (size, k) => {
        probe.style.fontSize = `${size}px`;
        probe.replaceChildren();
        names.slice(0, k).forEach((n, i) => {
          const w = document.createElement("span"); w.className = "bl-em-cartel-w";
          const b = document.createElement("button"); b.className = "bl-em-cartel-it"; b.textContent = n; w.append(b);
          if (i < k - 1 || k < names.length) { const sep = document.createElement("i"); sep.textContent = "\u00a0·"; w.append(sep); }
          probe.append(w, " ");
        });
        if (k < names.length) { const more = document.createElement(onMore ? "button" : "span"); more.className = "bl-em-cartel-more"; more.textContent = t("event.moreArtists", { n: names.length - k }); probe.append(more); }
        return probe.scrollHeight <= probe.clientHeight + 1;
      };
      let size = 17, shown = names.length;
      while (size > 12 && !fits(size, shown)) size -= 0.5;          // primero la letra
      if (!fits(size, shown)) {                                       // después, menos nombres
        let lo = 1, hi = names.length;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(size, mid)) lo = mid; else hi = mid - 1; }
        shown = lo;
      }
      probe.remove();
      setFit((f) => (f.size === size && f.shown === shown ? f : { size, shown }));
    };
    run();
    // Se vuelve a medir si cambia el lugar del afiche (la ficha pasa a
    // ajustada, gira el teléfono): el padre y el afiche mismo.
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
    ro.observe(el.parentElement); ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [names]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = names.slice(0, fit.shown), rest = names.length - fit.shown;
  return (
    <p className="bl-em-cartel" ref={ref} style={{ fontSize: `${fit.size}px` }}>
      {/* El nombre no se parte; el renglón corta después del "·" (igual que la copia que se mide). */}
      {list.map((n, i) => (
        <Fragment key={n}>
          <span className="bl-em-cartel-w"><button type="button" className="bl-em-cartel-it" onClick={() => onPick(n)}>{n}</button>{(i < list.length - 1 || rest > 0) && <i aria-hidden="true">&nbsp;·</i>}</span>{" "}
        </Fragment>
      ))}
      {rest > 0 && (onMore
        ? <button type="button" className="bl-em-cartel-more" onClick={onMore}>{t("event.moreArtists", { n: rest })}</button>
        : <span className="bl-em-cartel-more">{t("event.moreArtists", { n: rest })}</span>)}
    </p>
  );
}

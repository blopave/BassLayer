import { useState, useEffect, useRef, useMemo, useCallback } from "react";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

function getEventDate(ev) {
  const m = MONTHS_MAP[ev.month?.toLowerCase()];
  if (m === undefined) return null;
  const d = parseInt(ev.day);
  if (isNaN(d)) return null;
  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (ev.time || "23:00").split(":").map(Number);
  const date = new Date(year, m, d, h || 23, min || 0);
  if (date < now - 30 * 86400000) date.setFullYear(year + 1);
  return date;
}

function isThisWeekend(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();
  let fridayOffset;
  if (dow === 5) fridayOffset = 0;
  else if (dow === 6) fridayOffset = -1;
  else if (dow === 0) fridayOffset = -2;
  else fridayOffset = 5 - dow;
  const friday = new Date(today);
  friday.setDate(friday.getDate() + fridayOffset);
  const monday = new Date(friday);
  monday.setDate(monday.getDate() + 3);
  const evDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  return evDay >= friday && evDay < monday;
}

function mapsUrl(event) {
  const q = event.address || (event.venue + ", Buenos Aires, Argentina");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function ticketUrl(event) {
  if (event.url) return event.url;
  const terms = [event.name, event.venue, "Buenos Aires", "entradas"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}

export function WeekendPicker({ events, onClose, onSelect }) {
  const weekendEvents = useMemo(() => {
    return events
      .filter(e => isThisWeekend(getEventDate(e)))
      .sort((a, b) => {
        const da = getEventDate(a), db = getEventDate(b);
        return (da || 0) - (db || 0);
      })
      .slice(0, 10);
  }, [events]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [liked, setLiked] = useState([]);
  const [direction, setDirection] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const cardRef = useRef(null);
  const startX = useRef(0);
  const dragXRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const isDraggingRef = useRef(false);
  const animatingRef = useRef(false); // guard against double-advance
  const timerRefs = useRef([]);

  const currentEvent = weekendEvents[currentIdx];
  const isFinished = currentIdx >= weekendEvents.length;

  // Pick the winner
  const winner = useMemo(() => {
    if (!isFinished && !showResult) return null;
    if (liked.length > 0) return liked[liked.length - 1];
    return null;
  }, [isFinished, showResult, liked]);

  useEffect(() => {
    if (isFinished && !showResult) {
      const t = setTimeout(() => setShowResult(true), 300);
      timerRefs.current.push(t);
    }
  }, [isFinished, showResult]);

  // Lock body scroll + Escape
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
      // Cleanup all pending timers
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, [onClose]);

  const advance = useCallback((dir) => {
    if (animatingRef.current) return; // prevent double-advance
    animatingRef.current = true;
    setDirection(dir);
    if (dir === "right" && currentEvent) {
      setLiked(prev => [...prev, currentEvent]);
    }
    const t = setTimeout(() => {
      setCurrentIdx(prev => prev + 1);
      setDirection(null);
      setDragX(0);
      dragXRef.current = 0;
      animatingRef.current = false;
    }, 300);
    timerRefs.current.push(t);
  }, [currentEvent]);

  // Touch handlers — use refs to avoid stale closures
  const onTouchStart = useCallback((e) => {
    if (animatingRef.current) return;
    startX.current = e.touches[0].clientX;
    isDraggingRef.current = true;
    dragXRef.current = 0;
    setDragX(0);
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!isDraggingRef.current || animatingRef.current) return;
    const dx = e.touches[0].clientX - startX.current;
    dragXRef.current = dx;
    setDragX(dx);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dx = dragXRef.current;
    const threshold = 80;
    if (dx > threshold) advance("right");
    else if (dx < -threshold) advance("left");
    else { setDragX(0); dragXRef.current = 0; }
  }, [advance]);

  // Mouse handlers (desktop only, no conflict with touch)
  const onMouseDown = useCallback((e) => {
    if (animatingRef.current || e.button !== 0) return;
    startX.current = e.clientX;
    isDraggingRef.current = true;
    dragXRef.current = 0;
    setDragX(0);
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!isDraggingRef.current || animatingRef.current) return;
    const dx = e.clientX - startX.current;
    dragXRef.current = dx;
    setDragX(dx);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const dx = dragXRef.current;
    const threshold = 80;
    if (dx > threshold) advance("right");
    else if (dx < -threshold) advance("left");
    else { setDragX(0); dragXRef.current = 0; }
  }, [advance]);

  // Keyboard support — stopPropagation prevents App-level handler
  useEffect(() => {
    if (isFinished) return;
    const handler = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.stopPropagation();
        if (e.key === "ArrowLeft") advance("left");
        else advance("right");
      }
    };
    window.addEventListener("keydown", handler, true); // capture phase
    return () => window.removeEventListener("keydown", handler, true);
  }, [isFinished, advance]);

  if (weekendEvents.length === 0) {
    return (
      <div className="bl-wp-overlay" onClick={onClose}>
        <div className="bl-wp-empty" onClick={e => e.stopPropagation()}>
          <div className="bl-wp-empty-icon">~</div>
          <div className="bl-wp-empty-text">No hay eventos este finde</div>
          <div className="bl-wp-empty-sub">Chequea de nuevo mas tarde</div>
          <button className="bl-wp-close-btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    );
  }

  const artists = currentEvent?.artists?.filter(a => a && a !== "TBA" && !a.match(/^(b2b|más a confirmar)/i)) || [];
  const rotation = dragX * 0.05;
  const opacity = 1 - Math.abs(dragX) * 0.002;

  return (
    <div className="bl-wp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bl-wp-container">
        <div className="bl-wp-header">
          <button className="bl-wp-back" onClick={onClose}>&times;</button>
          <div className="bl-wp-header-text">
            <div className="bl-wp-header-title">A que voy este finde?</div>
            {!isFinished && (
              <div className="bl-wp-progress">{currentIdx + 1} / {weekendEvents.length}</div>
            )}
          </div>
        </div>

        {!isFinished && !showResult && (
          <div className="bl-wp-stack">
            {currentIdx + 1 < weekendEvents.length && (
              <div className="bl-wp-card bl-wp-card-next">
                <div className="bl-wp-card-name">{weekendEvents[currentIdx + 1].name}</div>
              </div>
            )}

            <div
              ref={cardRef}
              className={`bl-wp-card bl-wp-card-current${direction === "left" ? " bl-wp-exit-left" : ""}${direction === "right" ? " bl-wp-exit-right" : ""}`}
              style={!direction ? {
                transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
                opacity: Math.max(opacity, 0.5),
              } : undefined}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onMouseDown={onMouseDown}
              onMouseMove={isDraggingRef.current ? onMouseMove : undefined}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <div className="bl-wp-indicator bl-wp-indicator-left" style={{ opacity: dragX < -20 ? Math.min(Math.abs(dragX) / 80, 1) : 0 }}>NAH</div>
              <div className="bl-wp-indicator bl-wp-indicator-right" style={{ opacity: dragX > 20 ? Math.min(dragX / 80, 1) : 0 }}>ME COPA</div>

              <div className="bl-wp-card-top">
                <div className="bl-wp-card-date">
                  <span className="bl-wp-card-day">{currentEvent.day}</span>
                  <span className="bl-wp-card-month">{currentEvent.month}</span>
                </div>
                <span className="bl-wp-card-genre">{currentEvent.genre}</span>
              </div>

              <div className="bl-wp-card-name">{currentEvent.name}</div>

              <div className="bl-wp-card-info">
                <div className="bl-wp-card-venue">
                  <svg className="bl-wp-pin" viewBox="0 0 16 16" width="14" height="14"><path d="M8 1C5.2 1 3 3.2 3 6c0 4 5 9 5 9s5-5 5-9c0-2.8-2.2-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>
                  {currentEvent.venue}
                </div>
                {currentEvent.time && (
                  <>
                    <div className="bl-wp-card-info-sep" />
                    <div className="bl-wp-card-time">{currentEvent.time} hs</div>
                  </>
                )}
              </div>

              {artists.length > 0 && (
                <div className="bl-wp-card-artists">
                  <div className="bl-wp-card-artists-label">Line-up</div>
                  <div className="bl-wp-card-artists-list">
                    {artists.slice(0, 8).map((a, i) => (
                      <span key={i} className="bl-wp-artist-chip">{a}</span>
                    ))}
                    {artists.length > 8 && <span className="bl-wp-artist-more">+{artists.length - 8}</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="bl-wp-actions">
              <button className="bl-wp-btn bl-wp-btn-nah" onClick={() => advance("left")} aria-label="Nah, paso">
                <svg viewBox="0 0 24 24" width="28" height="28"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              </button>
              <button className="bl-wp-btn bl-wp-btn-copa" onClick={() => advance("right")} aria-label="Me copa">
                <svg viewBox="0 0 24 24" width="28" height="28"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              </button>
            </div>
          </div>
        )}

        {showResult && winner && (
          <div className="bl-wp-result">
            <div className="bl-wp-result-label">Tu pick del finde</div>
            <div className="bl-wp-result-card">
              <div className="bl-wp-card-top">
                <div className="bl-wp-card-date">
                  <span className="bl-wp-card-day">{winner.day}</span>
                  <span className="bl-wp-card-month">{winner.month}</span>
                </div>
                <div className="bl-wp-result-genre">{winner.genre}</div>
              </div>
              <div className="bl-wp-result-name">{winner.name}</div>

              <div className="bl-wp-card-info">
                <div className="bl-wp-card-venue">
                  <svg className="bl-wp-pin" viewBox="0 0 16 16" width="14" height="14"><path d="M8 1C5.2 1 3 3.2 3 6c0 4 5 9 5 9s5-5 5-9c0-2.8-2.2-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>
                  {winner.venue}
                </div>
                {winner.time && (
                  <>
                    <div className="bl-wp-card-info-sep" />
                    <div className="bl-wp-card-time">{winner.time} hs</div>
                  </>
                )}
              </div>

              {winner.artists?.filter(a => a && a !== "TBA").length > 0 && (
                <div className="bl-wp-card-artists">
                  <div className="bl-wp-card-artists-label">Line-up</div>
                  <div className="bl-wp-card-artists-list">
                    {winner.artists.filter(a => a && a !== "TBA").map((a, i) => (
                      <span key={i} className="bl-wp-artist-chip">{a}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bl-wp-result-actions">
                <a className="bl-wp-result-btn bl-wp-result-btn-map" href={mapsUrl(winner)} target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1C5.2 1 3 3.2 3 6c0 4 5 9 5 9s5-5 5-9c0-2.8-2.2-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>
                  Ver mapa
                </a>
                <a className="bl-wp-result-btn bl-wp-result-btn-ticket" href={ticketUrl(winner)} target="_blank" rel="noopener noreferrer">
                  {winner.url ? "Entradas" : "Buscar entradas"}
                </a>
                <button className="bl-wp-result-btn bl-wp-result-btn-detail" onClick={() => { onClose(); onSelect?.(winner); }}>
                  Ver detalle
                </button>
              </div>
            </div>

            {liked.length > 1 && (
              <div className="bl-wp-also-liked">
                <div className="bl-wp-also-label">Tambien te coparon</div>
                {liked.slice(0, -1).map((ev, i) => (
                  <div key={i} className="bl-wp-also-item" onClick={() => { onClose(); onSelect?.(ev); }}>
                    <span className="bl-wp-also-date">{ev.day} {ev.month}</span>
                    <span className="bl-wp-also-name">{ev.name}</span>
                    <span className="bl-wp-also-venue">{ev.venue}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="bl-wp-close-btn" onClick={onClose}>Cerrar</button>
          </div>
        )}

        {showResult && !winner && (
          <div className="bl-wp-result">
            <div className="bl-wp-result-label">Nada te cerro?</div>
            <div className="bl-wp-empty-sub">Quizas la proxima semana haya algo para vos</div>
            <button className="bl-wp-close-btn" onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from "react";

const MONTHS_MAP = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };

function getEventDate(ev) {
  const m = MONTHS_MAP[ev.month?.toLowerCase()];
  if (m === undefined) return null;
  const now = new Date();
  const year = now.getFullYear();
  const [h, min] = (ev.time || "23:00").split(":").map(Number);
  const d = new Date(year, m, parseInt(ev.day), h || 23, min || 0);
  if (d < now - 30 * 86400000) d.setFullYear(year + 1);
  return d;
}

function isTonight(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowEnd = new Date(todayStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(8, 0, 0, 0); // events end around 8am next day
  return eventDate >= todayStart && eventDate <= tomorrowEnd;
}

function isThisWeek(eventDate) {
  if (!eventDate) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return eventDate >= today && eventDate < weekEnd;
}

export function BpmPulse({ events }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [bpm, setBpm] = useState(0);

  const stats = useMemo(() => {
    if (!events || events.length === 0) return null;

    const tonight = events.filter(e => isTonight(getEventDate(e)));
    const thisWeek = events.filter(e => isThisWeek(getEventDate(e)));

    // Genre distribution
    const genreCounts = {};
    thisWeek.forEach(e => {
      const g = e.genre || "Electronic";
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    });
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const maxGenreCount = topGenres.length > 0 ? topGenres[0][1] : 1;

    // Most active venue
    const venueCounts = {};
    thisWeek.forEach(e => {
      if (e.venue) venueCounts[e.venue] = (venueCounts[e.venue] || 0) + 1;
    });
    const topVenue = Object.entries(venueCounts).sort((a, b) => b[1] - a[1])[0];

    // Pseudo BPM: more events = higher BPM
    const intensity = Math.min(tonight.length * 15 + thisWeek.length * 3, 180);
    const baseBpm = 80 + intensity;

    return {
      tonight: tonight.length,
      thisWeek: thisWeek.length,
      topGenres,
      maxGenreCount,
      topVenue: topVenue ? topVenue[0] : null,
      topVenueCount: topVenue ? topVenue[1] : 0,
      bpm: Math.min(baseBpm, 200),
    };
  }, [events]);

  // Animate BPM counter
  useEffect(() => {
    if (!stats) return;
    const target = stats.bpm;
    let current = 0;
    let raf;
    const step = () => {
      current += Math.ceil((target - current) * 0.08);
      if (current >= target) { setBpm(target); return; }
      setBpm(current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [stats]);

  // Waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stats) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    let w, h;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();

    let t = 0;
    const freq = stats.bpm / 60; // beats per second

    function draw() {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Main pulse wave
      const isDay = document.querySelector(".bl-root")?.classList.contains("day-mode");
      const baseColor = isDay ? "rgba(30,30,30," : "rgba(230,230,230,";
      const accentColor = isDay ? "rgba(60,40,20," : "rgba(255,220,180,";

      // Heartbeat line
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `${baseColor}0.3)`;

      const mid = h / 2;
      const beatPhase = (t * freq * Math.PI * 2) % (Math.PI * 2);

      for (let x = 0; x < w; x++) {
        const progress = x / w;
        const wave1 = Math.sin(progress * Math.PI * 6 + t * 2) * 4;
        const wave2 = Math.sin(progress * Math.PI * 10 + t * 3.5) * 2;

        // Beat spike
        const distFromCenter = Math.abs(progress - 0.5);
        const beatEnvelope = Math.exp(-distFromCenter * 8);
        const beat = Math.sin(beatPhase) * 12 * beatEnvelope;

        const y = mid + wave1 + wave2 + beat;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow line on top
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `${accentColor}${0.15 + Math.sin(beatPhase) * 0.1})`;
      for (let x = 0; x < w; x++) {
        const progress = x / w;
        const wave1 = Math.sin(progress * Math.PI * 6 + t * 2) * 4;
        const distFromCenter = Math.abs(progress - 0.5);
        const beatEnvelope = Math.exp(-distFromCenter * 8);
        const beat = Math.sin(beatPhase) * 12 * beatEnvelope;
        const y = mid + wave1 + beat;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      animRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [stats]);

  if (!stats || stats.thisWeek === 0) return null;

  return (
    <div className="bl-bpm-pulse">
      <div className="bl-bpm-header">
        <div className="bl-bpm-title">BPM del momento</div>
        <div className="bl-bpm-subtitle">Pulso de la escena</div>
      </div>

      <div className="bl-bpm-canvas-wrap">
        <canvas ref={canvasRef} className="bl-bpm-canvas" />
        <div className="bl-bpm-value">
          <span className="bl-bpm-number">{bpm}</span>
          <span className="bl-bpm-unit">BPM</span>
        </div>
      </div>

      <div className="bl-bpm-stats">
        <div className="bl-bpm-stat">
          <div className="bl-bpm-stat-value">{stats.tonight}</div>
          <div className="bl-bpm-stat-label">Esta noche</div>
        </div>
        <div className="bl-bpm-stat-sep" />
        <div className="bl-bpm-stat">
          <div className="bl-bpm-stat-value">{stats.thisWeek}</div>
          <div className="bl-bpm-stat-label">Esta semana</div>
        </div>
        {stats.topVenue && (
          <>
            <div className="bl-bpm-stat-sep" />
            <div className="bl-bpm-stat">
              <div className="bl-bpm-stat-value bl-bpm-stat-venue">{stats.topVenue}</div>
              <div className="bl-bpm-stat-label">Venue activo</div>
            </div>
          </>
        )}
      </div>

      {stats.topGenres.length > 0 && (
        <div className="bl-bpm-genres">
          {stats.topGenres.map(([genre, count]) => (
            <div className="bl-bpm-genre-row" key={genre}>
              <span className="bl-bpm-genre-name">{genre}</span>
              <div className="bl-bpm-genre-bar-bg">
                <div
                  className="bl-bpm-genre-bar"
                  style={{ width: `${(count / stats.maxGenreCount) * 100}%` }}
                />
              </div>
              <span className="bl-bpm-genre-count">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

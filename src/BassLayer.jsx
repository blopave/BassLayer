import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════
//  BassLayer v1.2 — Bass + Layer
// ═══════════════════════════════════════════

// ── API ──────────────────────────────────

const api = {
  prices: () => fetch("/api/prices").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  news:   () => fetch("/api/news").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  events: () => fetch("/api/events").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
};

function formatPrice(p) {
  if (p >= 1000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

const isMobile = typeof window !== "undefined" && (window.innerWidth <= 768 || "ontouchstart" in window);

// ── Styles ───────────────────────────────

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap');

/* Base */
.bl-root { background:#000; color:#e5e5e5; width:100vw; height:100vh; overflow:hidden; font-family:'DM Sans',sans-serif; -webkit-tap-highlight-color:transparent; }
.bl-grain { position:fixed; inset:0; pointer-events:none; z-index:9500; opacity:0.022;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:256px; }

/* Preloader */
.bl-preloader { position:fixed; inset:0; z-index:9800; background:#000; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:14px; transition:opacity .4s, visibility .4s; }
.bl-pre-count { font-family:'Space Mono',monospace; font-size:11px; letter-spacing:6px; color:#3a3a3a; }
.bl-pre-bar { width:100px; height:1px; background:#151515; overflow:hidden; }
.bl-pre-bar-inner { height:100%; background:#444; transition:width .04s; }

/* Circle transition */
.bl-circle { position:fixed; inset:0; z-index:9600; pointer-events:none; }
.bl-circle-inner { position:absolute; border-radius:50%; transform:translate(-50%,-50%) scale(0); transition:transform .65s cubic-bezier(.76,0,.24,1); }
.bl-circle-inner.expand { transform:translate(-50%,-50%) scale(1); }

/* Views */
.bl-view { position:fixed; inset:0; z-index:100; overflow:hidden; visibility:hidden; opacity:0; }
.bl-view.active { visibility:visible; opacity:1; }
.bl-home-view { z-index:200; }

/* Swipe container — holds Bass & Layer side by side */
.bl-swipe-wrap { position:fixed; inset:0; z-index:100; overflow:hidden; visibility:hidden; opacity:0; display:flex; flex-direction:column; background:#1F1E1D; }
.bl-swipe-wrap.active { visibility:visible; opacity:1; }
.bl-swipe-container { display:flex; width:200%; flex:1; transition:transform .4s cubic-bezier(.25,.46,.45,.94); will-change:transform; }
.bl-swipe-container.dragging { transition:none; }
.bl-swipe-panel { width:50%; height:100%; overflow-y:auto; overflow-x:hidden; background:#1F1E1D; -webkit-overflow-scrolling:touch; flex-shrink:0; }

/* Unified topbar with tabs */
.bl-topbar-tabs { display:flex; align-items:center; gap:0; }
.bl-topbar-tab { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:#3d3a36; cursor:pointer; background:none; border:none; padding:4px 12px; transition:color .2s; position:relative; }
.bl-topbar-tab:hover { color:#6a665f; }
.bl-topbar-tab.active { color:#e5e5e5; }
.bl-topbar-tab.active::after { content:''; position:absolute; bottom:-17px; left:50%; transform:translateX(-50%); width:16px; height:2px; background:#5a5854; border-radius:1px; }
.bl-topbar-tab-sep { color:#2a2926; font-size:12px; padding:0 2px; user-select:none; }

/* Swipe indicator dots */
.bl-swipe-dots { display:flex; gap:6px; align-items:center; }
.bl-swipe-dot { width:6px; height:6px; border-radius:50%; background:#2a2926; transition:all .3s; }
.bl-swipe-dot.active { background:#5a5854; width:16px; border-radius:3px; }

/* Home */
.bl-home { position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.bl-home::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at 50% 50%,transparent 40%,rgba(0,0,0,0.5) 100%); pointer-events:none; z-index:5; }
.bl-scanlines { position:absolute; inset:0; pointer-events:none; z-index:4; opacity:0; transition:opacity .4s;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.006) 2px,rgba(255,255,255,0.006) 4px); }
.bl-home.layer-active .bl-scanlines { opacity:1; }
.bl-canvas { position:absolute; inset:0; pointer-events:none; z-index:1; }

.bl-word-wrap { position:relative; z-index:100; display:flex; align-items:baseline; }
.bl-word-half { position:relative; cursor:pointer; display:inline-flex; }
.bl-letter { display:inline-block; font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:clamp(48px,10.5vw,155px); letter-spacing:-4px; line-height:1; color:#e5e5e5; will-change:transform,color,opacity; }
.bl-word-wrap.bass-hovered .bl-word-layer .bl-letter { color:#131313!important; text-shadow:none!important; opacity:0.08!important; }
.bl-word-wrap.layer-hovered .bl-word-bass .bl-letter { color:#131313!important; text-shadow:none!important; }

.bl-concepts { position:absolute; top:calc(100% + 34px); pointer-events:none; white-space:nowrap; }
.bl-concepts-bass { left:0; } .bl-concepts-layer { right:0; }
.bl-concept-text { font-family:'Plus Jakarta Sans',sans-serif; font-weight:300; font-size:clamp(11px,1.1vw,15px); letter-spacing:2.5px; text-transform:uppercase; color:#2a2a2a; opacity:0; transform:translateY(5px); transition:opacity .25s, transform .3s; }
.bl-concept-text.show { opacity:1; transform:translateY(0); }

.bl-info { position:absolute; font-family:'Space Mono',monospace; font-size:9px; letter-spacing:3px; text-transform:uppercase; color:#1e1e1e; z-index:50; }
.bl-info-tl { top:32px; left:40px; } .bl-info-tr { top:32px; right:40px; }
.bl-info-bl { bottom:32px; left:40px; } .bl-info-br { bottom:32px; right:40px; }
.bl-choose { position:absolute; bottom:32px; left:50%; transform:translateX(-50%); z-index:50; text-align:center; }
.bl-choose-text { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:4px; text-transform:uppercase; color:#252525; }
.bl-choose-line { width:1px; height:20px; background:#151515; margin:10px auto 0; position:relative; overflow:hidden; }
.bl-choose-line::after { content:''; position:absolute; left:0; top:-100%; width:100%; height:100%; background:#3a3a3a; animation:bl-drip 2s ease-in-out infinite; }
@keyframes bl-drip { 0%{top:-100%} 35%{top:100%} 100%{top:100%} }

/* Sections — now inside swipe panels */
.bl-topbar { position:sticky; top:0; z-index:900; display:flex; align-items:center; justify-content:space-between; padding:16px 32px; background:rgba(31,30,29,0.92); backdrop-filter:blur(24px); border-bottom:1px solid #2a2926; }
.bl-topbar-left { display:flex; align-items:center; gap:6px; }
.bl-topbar-back { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:#5a5854; cursor:pointer; background:none; border:none; padding:4px 8px; transition:color .2s; }
.bl-topbar-back:hover { color:#a09a92; }
.bl-topbar-sep { color:#2a2926; font-size:10px; padding:0 2px; user-select:none; }
.bl-topbar-title { font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:18px; letter-spacing:-0.5px; color:#e5e5e5; padding:0 8px; }
.bl-topbar-meta { font-family:'Space Mono',monospace; font-size:8px; letter-spacing:1px; color:#3d3a36; }

/* Filters */
.bl-filters { position:sticky; z-index:898; display:flex; gap:6px; padding:10px 32px; overflow-x:auto; border-bottom:1px solid #2a2926; background:rgba(27,26,25,0.95); backdrop-filter:blur(12px); scrollbar-width:none; }
.bl-filters::-webkit-scrollbar { display:none; }
.bl-filters.layer-filters { top:0; position:sticky; z-index:898; }
.bl-filters.bass-filters { top:0; position:sticky; z-index:898; }
.bl-filter-chip { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:#5a5854; padding:5px 12px; border:1px solid #2a2926; border-radius:20px; cursor:pointer; background:transparent; white-space:nowrap; transition:all .15s; flex-shrink:0; }
.bl-filter-chip:hover { color:#a09a92; border-color:#3d3a36; }
.bl-filter-chip.active { color:#e5e5e5; border-color:#5a5854; background:rgba(255,255,255,0.04); }

/* Price Ticker */
.bl-price-bar { position:sticky; top:0; z-index:899; overflow:hidden; border-bottom:1px solid #2a2926; background:rgba(23,22,21,0.95); backdrop-filter:blur(24px); white-space:nowrap; }
.bl-price-track { display:inline-flex; animation:bl-scroll 35s linear infinite; }
.bl-price-track:hover { animation-play-state:paused; }
@keyframes bl-scroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
.bl-price-item { display:inline-flex; align-items:center; gap:12px; padding:16px 32px; border-right:1px solid #2a2926; flex-shrink:0; }
.bl-price-sym { font-family:'Space Mono',monospace; font-size:12px; letter-spacing:2px; color:#666; font-weight:700; }
.bl-price-val { font-family:'Space Mono',monospace; font-size:15px; color:#ccc; font-weight:700; }
.bl-price-chg { font-family:'Space Mono',monospace; font-size:11px; }
.bl-price-up { color:#2d6b3f; } .bl-price-down { color:#6b2d2d; }

/* News Feed */
.bl-feed { padding:0 32px; }
.bl-feed-item { display:flex; align-items:baseline; gap:16px; padding:18px 0; border-bottom:1px solid #282724; transition:background .12s; }
.bl-feed-item:hover { background:#171615; margin:0 -12px; padding-left:12px; padding-right:12px; border-radius:3px; }
.bl-feed-time { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:1px; color:#3d3a36; min-width:72px; flex-shrink:0; }
.bl-feed-title { font-family:'Plus Jakarta Sans',sans-serif; font-weight:500; font-size:15px; color:#999; letter-spacing:-0.2px; line-height:1.4; flex:1; transition:color .15s; text-decoration:none; }
.bl-feed-item:hover .bl-feed-title { color:#e5e5e5; }
.bl-feed-src { font-family:'Space Mono',monospace; font-size:8px; letter-spacing:2px; text-transform:uppercase; color:#4a4740; flex-shrink:0; }
.bl-feed-tag { font-family:'Space Mono',monospace; font-size:8px; letter-spacing:1.5px; text-transform:uppercase; color:#5a5854; padding:2px 7px; border:1px solid #2e2c28; border-radius:2px; flex-shrink:0; }

/* Event List */
.bl-ev-list { padding:0 32px; }
.bl-ev-item { display:flex; align-items:center; gap:20px; padding:20px 0; border-bottom:1px solid #282724; transition:background .12s; }
.bl-ev-item:hover { background:#171615; margin:0 -12px; padding-left:12px; padding-right:12px; border-radius:3px; }
.bl-ev-date { min-width:56px; text-align:center; flex-shrink:0; }
.bl-ev-date-d { font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:24px; letter-spacing:-1px; color:#ccc; line-height:1; }
.bl-ev-date-m { font-family:'Space Mono',monospace; font-size:8px; letter-spacing:2px; text-transform:uppercase; color:#4a4740; margin-top:3px; }
.bl-ev-sep { width:1px; height:32px; background:#2e2c28; flex-shrink:0; }
.bl-ev-body { flex:1; min-width:0; }
.bl-ev-name { font-family:'Plus Jakarta Sans',sans-serif; font-weight:600; font-size:15px; color:#bbb; letter-spacing:-0.2px; margin-bottom:3px; transition:color .15s; text-decoration:none; display:block; }
.bl-ev-item:hover .bl-ev-name { color:#fff; }
.bl-ev-detail { font-family:'DM Sans',sans-serif; font-size:13px; color:#5a5854; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bl-ev-right { flex-shrink:0; text-align:right; }
.bl-ev-time { font-family:'Space Mono',monospace; font-size:11px; color:#6a665f; }
.bl-ev-venue { font-family:'Space Mono',monospace; font-size:8px; letter-spacing:2px; text-transform:uppercase; color:#3d3a36; margin-top:2px; }
.bl-ev-genre { font-family:'Space Mono',monospace; font-size:8px; letter-spacing:1.5px; text-transform:uppercase; color:#5a5854; padding:2px 7px; border:1px solid #2e2c28; border-radius:2px; flex-shrink:0; }

/* Status */
@keyframes bl-pulse { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
.bl-loading { display:flex; justify-content:center; padding:40px 24px; }
.bl-loading-text { font-family:'Space Mono',monospace; font-size:11px; letter-spacing:2px; color:#5a5854; }
.bl-loading-text span { display:inline-block; animation:bl-pulse 1.4s infinite ease-in-out; }
.bl-loading-text span:nth-child(2) { animation-delay:.2s; }
.bl-loading-text span:nth-child(3) { animation-delay:.4s; }
.bl-error { color:#5a5854; font-family:'Space Mono',monospace; font-size:10px; padding:40px 24px; text-align:center; cursor:pointer; line-height:1.6; }
.bl-empty { color:#3d3a36; font-family:'Space Mono',monospace; font-size:10px; padding:40px 24px; text-align:center; }
.bl-section-end { height:80px; }

/* === Event Modal === */
.bl-modal-overlay {
  position:fixed; inset:0; z-index:9700; background:rgba(0,0,0,0.75);
  display:flex; align-items:center; justify-content:center; padding:24px;
  opacity:0; visibility:hidden; transition:opacity .25s, visibility .25s;
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
}
.bl-modal-overlay.open { opacity:1; visibility:visible; }
.bl-modal {
  background:#1a1918; border:1px solid #2a2926; border-radius:6px;
  width:100%; max-width:440px; position:relative;
  transform:translateY(16px) scale(0.97); transition:transform .3s cubic-bezier(.16,1,.3,1);
  overflow:hidden;
}
.bl-modal-overlay.open .bl-modal { transform:translateY(0) scale(1); }

.bl-modal-header {
  display:flex; align-items:flex-start; gap:20px; padding:28px 28px 0;
}
.bl-modal-date {
  min-width:56px; text-align:center; flex-shrink:0;
  background:rgba(255,255,255,0.03); border:1px solid #2a2926;
  border-radius:4px; padding:10px 8px;
}
.bl-modal-date-d { font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:28px; letter-spacing:-1px; color:#e5e5e5; line-height:1; }
.bl-modal-date-m { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:#6a665f; margin-top:4px; }
.bl-modal-title-area { flex:1; min-width:0; }
.bl-modal-name { font-family:'Plus Jakarta Sans',sans-serif; font-weight:700; font-size:20px; color:#e5e5e5; letter-spacing:-0.5px; line-height:1.25; margin-bottom:6px; }
.bl-modal-genre { display:inline-block; font-family:'Space Mono',monospace; font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:#8a8580; padding:3px 9px; border:1px solid #2e2c28; border-radius:20px; }

.bl-modal-close {
  position:absolute; top:16px; right:16px; background:none; border:none;
  color:#4a4740; font-size:20px; cursor:pointer; padding:4px 8px; line-height:1;
  transition:color .15s; font-family:'Space Mono',monospace;
}
.bl-modal-close:hover { color:#a09a92; }

.bl-modal-body { padding:24px 28px; }
.bl-modal-row {
  display:flex; align-items:center; gap:12px; padding:12px 0;
  border-bottom:1px solid #232220;
}
.bl-modal-row:last-child { border-bottom:none; }
.bl-modal-icon {
  width:32px; height:32px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  background:rgba(255,255,255,0.025); border-radius:4px;
  font-size:14px;
}
.bl-modal-label { font-family:'Space Mono',monospace; font-size:8px; letter-spacing:2px; text-transform:uppercase; color:#4a4740; margin-bottom:2px; }
.bl-modal-value { font-family:'DM Sans',sans-serif; font-size:14px; color:#bbb; line-height:1.35; }

.bl-modal-actions { padding:0 28px 28px; display:flex; gap:10px; }
.bl-modal-btn {
  flex:1; display:flex; align-items:center; justify-content:center; gap:8px;
  font-family:'Space Mono',monospace; font-size:10px; letter-spacing:1.5px; text-transform:uppercase;
  padding:12px 16px; border-radius:4px; cursor:pointer; transition:all .15s;
  text-decoration:none; text-align:center;
}
.bl-modal-btn-primary {
  background:rgba(255,255,255,0.06); border:1px solid #3d3a36; color:#e5e5e5;
}
.bl-modal-btn-primary:hover { background:rgba(255,255,255,0.1); border-color:#5a5854; }
.bl-modal-btn-secondary {
  background:transparent; border:1px solid #2a2926; color:#6a665f;
}
.bl-modal-btn-secondary:hover { color:#a09a92; border-color:#3d3a36; }

/* Responsive */
@media(max-width:768px) {
  .bl-letter { font-size:clamp(38px,14vw,64px)!important; letter-spacing:-2px!important; }
  .bl-info { display:none; }
  .bl-concept-text { font-size:10px!important; letter-spacing:1.5px!important; }
  .bl-topbar { padding:12px 16px; }
  .bl-topbar-tab::after { bottom:-13px; }
  .bl-price-bar { top:0; }
  .bl-filters { padding:8px 16px; gap:5px; }
  .bl-filters.layer-filters { top:0; }
  .bl-filters.bass-filters { top:0; }
  .bl-filter-chip { font-size:8px; padding:4px 10px; }
  .bl-feed, .bl-ev-list { padding:0 16px; }
  .bl-feed-src { display:none; }
  .bl-feed-item { gap:10px; }
  .bl-feed-time { min-width:40px; font-size:8px; }
  .bl-ev-item { gap:12px; }
  .bl-ev-right { display:none; }
  .bl-ev-date { min-width:44px; }
  .bl-choose-text { font-size:8px; letter-spacing:3px; }
  .bl-topbar-meta { display:none; }
  .bl-price-item { padding:12px 20px; gap:8px; }
  .bl-price-sym { font-size:10px; } .bl-price-val { font-size:13px; }
  .bl-modal { max-width:100%; border-radius:0; }
  .bl-modal-header { padding:24px 20px 0; gap:14px; }
  .bl-modal-body { padding:20px; }
  .bl-modal-actions { padding:0 20px 24px; flex-direction:column; }
  .bl-modal-name { font-size:18px; }
}
`;

// ── Canvas Animation ─────────────────────

function useHomeCanvas(canvasRef, bassI, layerI) {
  const tRef = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    function draw() {
      tRef.current++;
      const t = tRef.current, w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const bi = bassI.current, li = layerI.current;
      // Bass waveform (left side)
      if (bi > 0.005) {
        const bars = 60, bw = 2, gap = (w * 0.4) / bars, sx = w * 0.05, cy = h / 2;
        for (let i = 0; i < bars; i++) {
          const x = sx + i * gap, env = Math.sin((i / bars) * Math.PI);
          const amp = env * (Math.sin(t * 0.08 + i * 0.18) + Math.sin(t * 0.05 + i * 0.3) * 0.5) * (h * 0.22) * bi;
          ctx.fillStyle = `rgba(255,255,255,${(0.03 + env * 0.06) * bi})`;
          ctx.fillRect(x, cy - Math.abs(amp) / 2, bw, Math.max(1, Math.abs(amp)));
        }
      }
      // Layer grid + falling chars (right side)
      if (li > 0.005) {
        const gs = 50, ox = w * 0.55;
        ctx.strokeStyle = `rgba(255,255,255,${0.013 * li})`; ctx.lineWidth = 0.5;
        for (let x = ox; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.fillStyle = `rgba(255,255,255,${0.04 * li})`;
        ctx.font = '9px "Space Mono",monospace';
        const ch = "01$₿ΞΔ#><".split("");
        for (let i = 0; i < 20; i++) {
          ctx.fillText(ch[i % ch.length], ox + ((i * 73 + t * 0.15) % (w - ox)), ((t * (0.25 + (i % 5) * 0.12) + i * 137) % (h + 40)) - 20);
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
}

// ── Sub-Components ───────────────────────

function Preloader({ done }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setP((v) => { const n = v + Math.random() * 15 + 8; if (n >= 100) { clearInterval(iv); return 100; } return n; }), 20);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => { if (p >= 100) { const t = setTimeout(done, 200); return () => clearTimeout(t); } }, [p]);
  return (
    <div className="bl-preloader" style={p >= 100 ? { opacity: 0, visibility: "hidden", pointerEvents: "none" } : {}}>
      <div className="bl-pre-count">{String(Math.floor(p)).padStart(3, "0")}</div>
      <div className="bl-pre-bar"><div className="bl-pre-bar-inner" style={{ width: p + "%" }} /></div>
    </div>
  );
}

function PriceTicker({ prices }) {
  if (!prices.length) return null;
  const items = prices.map((p) => (
    <div className="bl-price-item" key={p.id}>
      <span className="bl-price-sym">{p.sym}</span>
      <span className="bl-price-val">{formatPrice(p.usd)}</span>
      <span className={`bl-price-chg ${p.change >= 0 ? "bl-price-up" : "bl-price-down"}`}>
        {p.change >= 0 ? "+" : ""}{p.change}%
      </span>
    </div>
  ));
  return <div className="bl-price-bar"><div className="bl-price-track">{items}{items}</div></div>;
}

function FilterBar({ items, active, onChange, className }) {
  return (
    <div className={`bl-filters ${className}`}>
      {items.map((item) => (
        <button key={item} className={`bl-filter-chip${active === item ? " active" : ""}`} onClick={() => onChange(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

function LoadingDots({ text }) {
  return <div className="bl-loading"><span className="bl-loading-text">{text} <span>.</span><span>.</span><span>.</span></span></div>;
}

function LayerFeed({ news, loading, error, onRetry, filter, onFilter }) {
  const tags = ["All", "BTC", "ETH", "SOL", "DeFi", "L2", "Reg", "AI", "NFT", "Stable", "Crypto"];
  const filtered = filter === "All" ? news : news.filter((n) => n.tag === filter);
  return (
    <>
      <FilterBar items={tags} active={filter} onChange={onFilter} className="layer-filters" />
      {loading ? <div className="bl-feed"><LoadingDots text="LOADING NEWS" /></div>
        : error ? <div className="bl-feed"><div className="bl-error" onClick={onRetry}>{error}</div></div>
        : filtered.length === 0 ? <div className="bl-feed"><div className="bl-empty">No news for "{filter}". Try another filter.</div></div>
        : <div className="bl-feed">
            {filtered.map((item, i) => (
              <div className="bl-feed-item" key={i}>
                <span className="bl-feed-time">{item.time}</span>
                <span className="bl-feed-tag">{item.tag}</span>
                {item.url ? <a className="bl-feed-title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                  : <span className="bl-feed-title">{item.title}</span>}
                <span className="bl-feed-src">{item.source}</span>
              </div>
            ))}
          </div>}
    </>
  );
}

function EventModal({ event, onClose }) {
  if (!event) return null;

  function ticketUrl() {
    if (event.url) return event.url;
    return `https://www.google.com/search?q=${encodeURIComponent(event.name + " " + event.venue + " Buenos Aires entradas tickets")}`;
  }

  function raSearchUrl() {
    return `https://ra.co/events/ar/buenosaires?search=${encodeURIComponent(event.name)}`;
  }

  // Parse artists: prefer artists array, fallback to parsing detail
  const artists = event.artists?.length
    ? event.artists.join(", ")
    : (event.detail?.split(" · ").slice(1).join(", ") || null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bl-modal">
        <button className="bl-modal-close" onClick={onClose}>✕</button>

        <div className="bl-modal-header">
          <div className="bl-modal-date">
            <div className="bl-modal-date-d">{event.day}</div>
            <div className="bl-modal-date-m">{event.month}</div>
          </div>
          <div className="bl-modal-title-area">
            <div className="bl-modal-name">{event.name}</div>
            <span className="bl-modal-genre">{event.genre}</span>
          </div>
        </div>

        <div className="bl-modal-body">
          <div className="bl-modal-row">
            <div className="bl-modal-icon">🕐</div>
            <div>
              <div className="bl-modal-label">Hora</div>
              <div className="bl-modal-value">{event.time} hs</div>
            </div>
          </div>

          <div className="bl-modal-row">
            <div className="bl-modal-icon">📍</div>
            <div>
              <div className="bl-modal-label">Venue</div>
              <div className="bl-modal-value">{event.venue}</div>
            </div>
          </div>

          {artists && (
            <div className="bl-modal-row">
              <div className="bl-modal-icon">🎧</div>
              <div>
                <div className="bl-modal-label">Line-up</div>
                <div className="bl-modal-value">{artists}</div>
              </div>
            </div>
          )}
        </div>

        <div className="bl-modal-actions">
          <a className="bl-modal-btn bl-modal-btn-primary" href={ticketUrl()} target="_blank" rel="noopener noreferrer">
            Buscar entradas →
          </a>
        </div>
      </div>
    </div>
  );
}

function BassFeed({ events, loading, error, onRetry, filter, onFilter, onSelect }) {
  const genres = ["All", "Techno", "House", "Deep House", "Tech House", "Progressive", "Melodic", "Minimal", "Festival", "Electronic"];
  const filtered = filter === "All" ? events : events.filter((e) => e.genre === filter);

  return (
    <>
      <FilterBar items={genres} active={filter} onChange={onFilter} className="bass-filters" />
      {loading ? <div className="bl-ev-list"><LoadingDots text="LOADING EVENTS" /></div>
        : error ? <div className="bl-ev-list"><div className="bl-error" onClick={onRetry}>{error}</div></div>
        : filtered.length === 0 ? <div className="bl-ev-list"><div className="bl-empty">No events for "{filter}". Try another filter.</div></div>
        : <div className="bl-ev-list">
            {filtered.map((item, i) => (
              <div className="bl-ev-item" key={i} onClick={() => onSelect(item)} style={{ cursor: "pointer" }}>
                <div className="bl-ev-date">
                  <div className="bl-ev-date-d">{item.day}</div>
                  <div className="bl-ev-date-m">{item.month}</div>
                </div>
                <div className="bl-ev-sep" />
                <div className="bl-ev-body">
                  <div className="bl-ev-name">{item.name}</div>
                  <div className="bl-ev-detail">{item.detail}</div>
                </div>
                <span className="bl-ev-genre">{item.genre}</span>
                <div className="bl-ev-right">
                  <div className="bl-ev-time">{item.time}</div>
                  <div className="bl-ev-venue">{item.venue}</div>
                </div>
              </div>
            ))}
          </div>}
    </>
  );
}

// ── Main App ─────────────────────────────

export default function BassLayer() {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("home");
  const [circleStyle, setCircleStyle] = useState({});
  const [circleExpand, setCircleExpand] = useState(false);

  // Data state
  const [prices, setPrices] = useState([]);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);
  const [newsFilter, setNewsFilter] = useState("All");
  const [newsUpdated, setNewsUpdated] = useState(0);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState(null);
  const [eventsFilter, setEventsFilter] = useState("All");
  const [eventsUpdated, setEventsUpdated] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const newsLoadedRef = useRef(false);
  const eventsLoadedRef = useRef(false);

  // Home hover
  const [bassHov, setBassHov] = useState(false);
  const [layerHov, setLayerHov] = useState(false);
  const bassI = useRef(0);
  const layerI = useRef(0);
  const canvasRef = useRef(null);
  const bassLetters = useRef([]);
  const layerLetters = useRef([]);
  const tRef = useRef(0);
  const decodeTimers = useRef(Array(5).fill(0));
  const wasLayerHov = useRef(false);

  // Force re-render for "updated X ago"
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(iv); }, []);

  useHomeCanvas(canvasRef, bassI, layerI);

  // Letter animation
  useEffect(() => {
    const glyphs = "01#$₿ΞΔ>|_⟨⟩∞≈".split("");
    let raf;
    function animate() {
      tRef.current++;
      const t = tRef.current;
      bassI.current += ((bassHov ? 1 : 0) - bassI.current) * (bassHov ? 0.12 : 0.06);
      layerI.current += ((layerHov ? 1 : 0) - layerI.current) * (layerHov ? 0.12 : 0.06);
      if (layerHov && !wasLayerHov.current) decodeTimers.current.fill(0);
      wasLayerHov.current = layerHov;

      bassLetters.current.forEach((el, i) => {
        if (!el) return;
        const bi = bassI.current;
        if (bi > 0.01) {
          const w = Math.sin(t * 0.1 + i * 1.2), y = w * 10 * bi, b = Math.round(229 + w * 26 * bi);
          el.style.transform = `translateY(${y}px) scaleY(${1 + w * 0.025 * bi})`;
          el.style.color = `rgb(${b},${b},${b})`;
          el.style.textShadow = `0 ${Math.abs(y) * 0.4}px ${8 * bi}px rgba(255,255,255,${0.04 * bi})`;
        } else { el.style.transform = ""; el.style.color = ""; el.style.textShadow = ""; }
      });

      layerLetters.current.forEach((el, i) => {
        if (!el) return;
        const li = layerI.current, orig = "Layer"[i];
        if (li > 0.01) {
          const sf = i * 14;
          decodeTimers.current[i]++;
          const dt = decodeTimers.current[i];
          if (dt < sf) {
            el.textContent = orig; el.style.opacity = 0.12 * li; el.style.color = "#444"; el.style.textShadow = "none"; el.style.transform = "";
          } else if (dt < sf + 35) {
            if ((dt - sf) % 4 === 0) el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
            el.style.opacity = (0.35 + Math.random() * 0.25) * li; el.style.color = "#777";
            el.style.transform = `translateY(${(Math.random() - 0.5) * 1.5}px)`;
            el.style.textShadow = `0 0 ${10 * li}px rgba(255,255,255,${0.05 * li})`;
          } else {
            el.textContent = orig; el.style.opacity = 1; el.style.color = "#fff"; el.style.transform = "";
            el.style.textShadow = `0 0 ${8 * li}px rgba(255,255,255,${0.04 * li})`;
            if (Math.random() < 0.006) { el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)]; el.style.opacity = 0.6; }
          }
        } else {
          el.style.transform = ""; el.style.color = ""; el.style.opacity = ""; el.style.textShadow = "";
          el.textContent = orig; decodeTimers.current[i] = 0;
        }
      });
      raf = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(raf);
  }, [bassHov, layerHov]);

  // Prices — load on mount, refresh 30s
  useEffect(() => {
    const load = () => api.prices().then(setPrices).catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Navigation — Home uses circle wipe, sections use swipe
  const [activePanel, setActivePanel] = useState(0); // 0=bass, 1=layer
  const swipeRef = useRef(null);
  const touchStart = useRef({ x: 0, y: 0 });
  const touchDelta = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef(null);

  const navigateToSections = useCallback((e, startPanel = 0) => {
    if (view !== "home") return;
    setActivePanel(startPanel);
    const cx = e?.clientX || e?.touches?.[0]?.clientX || innerWidth / 2;
    const cy = e?.clientY || e?.touches?.[0]?.clientY || innerHeight / 2;
    const sz = Math.max(innerWidth, innerHeight) * 2.5;
    setCircleStyle({ width: sz, height: sz, left: cx, top: cy, background: "#1F1E1D" });
    setCircleExpand(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setCircleExpand(true)));
    setTimeout(() => {
      setView("sections");
      setTimeout(() => setCircleExpand(false), 100);
      // Load both feeds
      if (!newsLoadedRef.current) { newsLoadedRef.current = true; loadNews(); }
      if (!eventsLoadedRef.current) { eventsLoadedRef.current = true; loadEvents(); }
    }, 500);
  }, [view]);

  const navigateHome = useCallback((e) => {
    if (view !== "sections") return;
    const cx = e?.clientX || e?.touches?.[0]?.clientX || innerWidth / 2;
    const cy = e?.clientY || e?.touches?.[0]?.clientY || innerHeight / 2;
    const sz = Math.max(innerWidth, innerHeight) * 2.5;
    setCircleStyle({ width: sz, height: sz, left: cx, top: cy, background: "#000" });
    setCircleExpand(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setCircleExpand(true)));
    setTimeout(() => {
      setView("home");
      setTimeout(() => setCircleExpand(false), 100);
    }, 500);
  }, [view]);

  // Swipe between Bass ↔ Layer
  const swipeTo = useCallback((panel) => {
    setActivePanel(panel);
    if (containerRef.current) {
      containerRef.current.classList.remove("dragging");
    }
  }, []);

  // Touch handlers for swipe
  const onTouchStart = useCallback((e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchDelta.current = 0;
    isDragging.current = false;
  }, []);

  const onTouchMove = useCallback((e) => {
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;

    // Only start horizontal drag if clearly horizontal
    if (!isDragging.current) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        isDragging.current = true;
        if (containerRef.current) containerRef.current.classList.add("dragging");
      } else return;
    }

    e.preventDefault();
    touchDelta.current = dx;

    // Live drag feedback
    if (containerRef.current) {
      const base = -(activePanel * 50);
      const pct = (dx / innerWidth) * 50;
      const clamped = Math.max(-50, Math.min(0, base + pct));
      containerRef.current.style.transform = `translateX(${clamped}%)`;
    }
  }, [activePanel]);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const threshold = innerWidth * 0.2;
    if (touchDelta.current > threshold && activePanel === 1) {
      swipeTo(0); // swipe right → Bass
    } else if (touchDelta.current < -threshold && activePanel === 0) {
      swipeTo(1); // swipe left → Layer
    } else {
      // Snap back
      swipeTo(activePanel);
    }

    // Reset inline style, let CSS transition handle it
    if (containerRef.current) {
      containerRef.current.classList.remove("dragging");
      containerRef.current.style.transform = "";
    }
  }, [activePanel, swipeTo]);

  // Keyboard navigation (left/right arrows)
  useEffect(() => {
    if (view !== "sections") return;
    const handler = (e) => {
      if (e.key === "ArrowLeft" && activePanel === 1) swipeTo(0);
      if (e.key === "ArrowRight" && activePanel === 0) swipeTo(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view, activePanel, swipeTo]);

  // Feed loaders
  async function loadNews() {
    setNewsLoading(true); setNewsError(null);
    try {
      const items = await api.news();
      if (items.length > 0) { setNews(items); setNewsUpdated(Date.now()); }
      else setNewsError("Sin noticias. Tocá para reintentar.");
    } catch { setNewsError("Error cargando noticias. ¿Está corriendo el backend?"); }
    finally { setNewsLoading(false); }
  }

  async function loadEvents() {
    setEventsLoading(true); setEventsError(null);
    try {
      const items = await api.events();
      if (items.length > 0) { setEvents(items); setEventsUpdated(Date.now()); }
      else setEventsError("Sin eventos. Tocá para reintentar.");
    } catch { setEventsError("Error cargando eventos. ¿Está corriendo el backend?"); }
    finally { setEventsLoading(false); }
  }

  // Auto-refresh feeds
  useEffect(() => {
    if (view !== "sections") return;
    const iv = setInterval(() => {
      if (newsLoadedRef.current) loadNews();
      if (eventsLoadedRef.current) loadEvents();
    }, 5 * 60_000);
    return () => clearInterval(iv);
  }, [view]);

  // ── Render ──

  const swipeTransform = `translateX(${-(activePanel * 50)}%)`;

  return (
    <div className="bl-root">
      <style>{styles}</style>
      <div className="bl-grain" />
      {!loaded && <Preloader done={() => setLoaded(true)} />}

      <div className="bl-circle">
        <div className={`bl-circle-inner${circleExpand ? " expand" : ""}`}
          style={{ width: circleStyle.width || 0, height: circleStyle.height || 0, left: circleStyle.left || 0, top: circleStyle.top || 0, background: circleStyle.background || "#1F1E1D" }} />
      </div>

      {/* HOME */}
      <div className={`bl-view bl-home-view${view === "home" ? " active" : ""}`}>
        <div className={`bl-home${layerHov ? " layer-active" : ""}`}>
          <div className="bl-scanlines" />
          <canvas className="bl-canvas" ref={canvasRef} />
          <div className="bl-info bl-info-tl">BassLayer</div>
          <div className="bl-info bl-info-tr">—— 2026</div>
          <div className="bl-info bl-info-bl">Buenos Aires</div>
          <div className="bl-info bl-info-br">Elegí tu lado</div>

          <div className={`bl-word-wrap${bassHov ? " bass-hovered" : ""}${layerHov ? " layer-hovered" : ""}`}>
            <div className="bl-word-half bl-word-bass"
              onMouseEnter={isMobile ? undefined : () => setBassHov(true)}
              onMouseLeave={isMobile ? undefined : () => setBassHov(false)}
              onClick={(e) => navigateToSections(e, 0)}
              onTouchEnd={isMobile ? (e) => { e.preventDefault(); navigateToSections(e, 0); } : undefined}>
              {"Bass".split("").map((ch, i) => <span key={i} className="bl-letter" ref={(el) => (bassLetters.current[i] = el)}>{ch}</span>)}
            </div>
            <div className="bl-word-half bl-word-layer"
              onMouseEnter={isMobile ? undefined : () => setLayerHov(true)}
              onMouseLeave={isMobile ? undefined : () => setLayerHov(false)}
              onClick={(e) => navigateToSections(e, 1)}
              onTouchEnd={isMobile ? (e) => { e.preventDefault(); navigateToSections(e, 1); } : undefined}>
              {"Layer".split("").map((ch, i) => <span key={i} className="bl-letter" ref={(el) => (layerLetters.current[i] = el)}>{ch}</span>)}
            </div>
            <div className="bl-concepts bl-concepts-bass">
              <div className={`bl-concept-text${bassHov || isMobile ? " show" : ""}`}>Electronic music · Events · Clubs</div>
            </div>
            <div className="bl-concepts bl-concepts-layer">
              <div className={`bl-concept-text${layerHov || isMobile ? " show" : ""}`}>Blockchain · Crypto · Markets</div>
            </div>
          </div>

          <div className="bl-choose">
            <div className="bl-choose-text">{isMobile ? "Tap to enter" : "Hover to explore"}</div>
            <div className="bl-choose-line" />
          </div>
        </div>
      </div>

      {/* SECTIONS — Bass & Layer side by side */}
      <div className={`bl-swipe-wrap${view === "sections" ? " active" : ""}`}>
        {/* Unified topbar */}
        <div className="bl-topbar">
          <div className="bl-topbar-left">
            <button className="bl-topbar-back" onClick={navigateHome}>← Home</button>
            <span className="bl-topbar-sep">|</span>
            <div className="bl-topbar-tabs">
              <button className={`bl-topbar-tab${activePanel === 0 ? " active" : ""}`} onClick={() => swipeTo(0)}>Bass</button>
              <span className="bl-topbar-tab-sep">/</span>
              <button className={`bl-topbar-tab${activePanel === 1 ? " active" : ""}`} onClick={() => swipeTo(1)}>Layer</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="bl-swipe-dots">
              <div className={`bl-swipe-dot${activePanel === 0 ? " active" : ""}`} />
              <div className={`bl-swipe-dot${activePanel === 1 ? " active" : ""}`} />
            </div>
            <span className="bl-topbar-meta">
              {activePanel === 0 && eventsUpdated ? `Updated ${timeAgo(eventsUpdated)}` : ""}
              {activePanel === 1 && newsUpdated ? `Updated ${timeAgo(newsUpdated)}` : ""}
            </span>
          </div>
        </div>

        {/* Swipeable container */}
        <div
          ref={containerRef}
          className="bl-swipe-container"
          style={{ transform: swipeTransform }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Panel 0: BASS */}
          <div className="bl-swipe-panel">
            <BassFeed events={events} loading={eventsLoading} error={eventsError} onRetry={loadEvents} filter={eventsFilter} onFilter={setEventsFilter} onSelect={setSelectedEvent} />
            <div className="bl-section-end" />
          </div>

          {/* Panel 1: LAYER */}
          <div className="bl-swipe-panel">
            <PriceTicker prices={prices} />
            <LayerFeed news={news} loading={newsLoading} error={newsError} onRetry={loadNews} filter={newsFilter} onFilter={setNewsFilter} />
            <div className="bl-section-end" />
          </div>
        </div>
      </div>

      {/* EVENT MODAL */}
      {selectedEvent && <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";

export function Preloader({ done }) {
  const [p, setP] = useState(0);
  const canvasRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => setP((v) => { const n = v + Math.random() * 15 + 8; if (n >= 100) { clearInterval(iv); return 100; } return n; }), 20);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { if (p >= 100) { const t = setTimeout(done, 300); return () => clearTimeout(t); } }, [p, done]);

  // Generative pattern
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf, t = 0;
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    function draw() {
      t++;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // Subtle grid
      ctx.strokeStyle = "rgba(255,255,255,0.015)";
      ctx.lineWidth = 0.5;
      const gs = 60;
      for (let x = 0; x < w; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Floating particles
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let i = 0; i < 15; i++) {
        const x = ((i * 137 + t * 0.2) % w);
        const y = ((i * 97 + t * (0.1 + i * 0.02)) % h);
        const r = 1 + Math.sin(t * 0.03 + i) * 0.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div className="bl-preloader" role="progressbar" aria-valuenow={Math.floor(p)} aria-valuemin={0} aria-valuemax={100} aria-label="Cargando BassLayer" style={p >= 100 ? { opacity: 0, visibility: "hidden", pointerEvents: "none" } : {}}>
      <canvas className="bl-pre-canvas" ref={canvasRef} />
      <div className="bl-pre-count">{String(Math.floor(p)).padStart(3, "0")}</div>
      <div className="bl-pre-bar"><div className="bl-pre-bar-inner" style={{ width: p + "%" }} /></div>
      <div className="bl-pre-brand">
        <span className="bl-pre-bass">Bass</span>
        <span className="bl-pre-layer">Layer</span>
      </div>
    </div>
  );
}

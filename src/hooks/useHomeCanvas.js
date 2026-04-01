import { useRef, useEffect } from "react";

export function useHomeCanvas(canvasRef, bassI, layerI, view) {
  const tRef = useRef(0);
  useEffect(() => {
    if (view !== "home") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    function isDayMode() {
      return document.querySelector(".bl-root")?.classList.contains("day-mode");
    }

    function draw() {
      tRef.current++;
      const t = tRef.current, w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const bi = bassI.current, li = layerI.current;
      const day = isDayMode();

      if (bi > 0.005) {
        const bars = 80, bw = 2, gap = (w * 0.45) / bars, sx = w * 0.03, cy = h / 2;
        const kick = Math.sin(t * 0.06) * 0.5 + 0.5;
        for (let i = 0; i < bars; i++) {
          const x = sx + i * gap, env = Math.sin((i / bars) * Math.PI);
          const amp = env * (Math.sin(t * 0.08 + i * 0.18) + Math.sin(t * 0.05 + i * 0.3) * 0.5 + kick * Math.sin(t * 0.12 + i * 0.08) * 0.6) * (h * 0.28) * bi;
          const alpha = (0.03 + env * 0.07 + kick * 0.03) * bi;
          if (day) {
            const r = 40, g = Math.round(35 + kick * 15), b2 = Math.round(30 + kick * 25);
            ctx.fillStyle = `rgba(${r},${g},${b2},${alpha * 0.7})`;
          } else {
            const r = 255, g = Math.round(250 - kick * 20), b2 = Math.round(245 - kick * 40);
            ctx.fillStyle = `rgba(${r},${g},${b2},${alpha})`;
          }
          ctx.fillRect(x, cy - Math.abs(amp) / 2, bw, Math.max(1, Math.abs(amp)));
        }
        if (kick > 0.7) {
          ctx.strokeStyle = day ? `rgba(40,30,20,${0.03 * bi * kick})` : `rgba(255,240,220,${0.04 * bi * kick})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w * 0.5, cy); ctx.stroke();
        }
      }
      if (li > 0.005) {
        const gs = 50, ox = w * 0.55;
        ctx.strokeStyle = day ? `rgba(0,0,0,${0.015 * li})` : `rgba(255,255,255,${0.013 * li})`;
        ctx.lineWidth = 0.5;
        for (let x = ox; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.fillStyle = day ? `rgba(0,0,0,${0.05 * li})` : `rgba(255,255,255,${0.04 * li})`;
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
  }, [view]);
}

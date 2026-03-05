import { useRef, useEffect } from "react";

export function useHomeCanvas(canvasRef, bassI, layerI) {
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
      if (bi > 0.005) {
        const bars = 60, bw = 2, gap = (w * 0.4) / bars, sx = w * 0.05, cy = h / 2;
        for (let i = 0; i < bars; i++) {
          const x = sx + i * gap, env = Math.sin((i / bars) * Math.PI);
          const amp = env * (Math.sin(t * 0.08 + i * 0.18) + Math.sin(t * 0.05 + i * 0.3) * 0.5) * (h * 0.22) * bi;
          ctx.fillStyle = `rgba(255,255,255,${(0.03 + env * 0.06) * bi})`;
          ctx.fillRect(x, cy - Math.abs(amp) / 2, bw, Math.max(1, Math.abs(amp)));
        }
      }
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

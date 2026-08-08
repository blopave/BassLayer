import { useRef, useEffect } from "react";

// Atmósfera del home: un resplandor cálido (mundo Bass, izquierda) y uno frío
// (mundo Layer, derecha) siempre presentes, reactivos a la posición del cursor,
// con "bloom" cuando se hace hover sobre cada palabra. Micro-respiración para
// que se sienta vivo pero sereno. Un solo gesto — sin waveform ni grilla.
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

    // posición horizontal del cursor (0 izq · 0.5 centro · 1 der)
    let px = 0.5;
    const onMove = (e) => { px = e.clientX / innerWidth; };
    window.addEventListener("pointermove", onMove);

    const isDayMode = () => document.querySelector(".bl-root")?.classList.contains("day-mode");
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // intensidades suavizadas (lerp)
    let warmA = 0.16, coolA = 0.14;

    function glow(x, y, r, rgb, a) {
      if (a <= 0.001) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    function vignette() {
      const w = canvas.width, h = canvas.height;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    function draw() {
      tRef.current++;
      const t = tRef.current, w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const bi = bassI.current, li = layerI.current;   // intensidades de hover 0..1
      const day = isDayMode();

      // base + tirón del cursor + bloom del hover + respiración
      const pull = clamp((0.5 - px) * 0.9, -0.45, 0.45);
      let warm = 0.16 + pull * 0.15 + bi * 0.28 + Math.sin(t * 0.021) * 0.024;
      let cool = 0.14 - pull * 0.15 + li * 0.26 + Math.sin(t * 0.037 + 1.7) * 0.011;
      warm = clamp(warm, 0.02, 0.5);
      cool = clamp(cool, 0.02, 0.5);
      warmA += (warm - warmA) * 0.06;
      coolA += (cool - coolA) * 0.06;

      const cy = h * 0.52;
      const wx = w * (0.35 + (px - 0.35) * 0.05);
      const lx = w * (0.65 + (px - 0.65) * 0.05);
      const R = Math.max(w, h) * 0.62;
      const warmC = day ? "160,113,77" : "200,147,114";  // cobre (día/noche)
      const coolC = day ? "77,138,154" : "108,184,200";   // cian  (día/noche)
      const scale = day ? 0.5 : 1;                          // el día es más tenue

      glow(wx, cy, R, warmC, warmA * scale);
      glow(lx, cy, R, coolC, coolA * scale);
      if (!day) vignette();

      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [view]);
}

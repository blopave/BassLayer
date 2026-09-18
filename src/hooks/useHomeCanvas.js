import { useRef, useEffect } from "react";

// Canvas del home (desktop): atmósfera SIEMPRE presente — resplandor cálido
// (Bass, izq) y frío (Layer, der), reactivo a la posición del cursor +
// micro-respiración. El tinte por hover de cada mundo lo hace el cursor-glow
// de HomeFusion, no este canvas.
export function useHomeCanvas(canvasRef, view) {
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

    let warmA = 0.16, coolA = 0.14;   // intensidades suavizadas (lerp)

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
      const day = isDayMode();

      // ── Atmósfera: glow cálido/frío según la posición del cursor + respiración ──
      const pull = clamp((0.5 - px) * 0.9, -0.45, 0.45);
      let warm = 0.16 + pull * 0.15 + Math.sin(t * 0.021) * 0.024;
      let cool = 0.14 - pull * 0.15 + Math.sin(t * 0.037 + 1.7) * 0.011;
      warm = clamp(warm, 0.02, 0.5);
      cool = clamp(cool, 0.02, 0.5);
      warmA += (warm - warmA) * 0.06;
      coolA += (cool - coolA) * 0.06;
      const gy = h * 0.52;
      const wx = w * (0.35 + (px - 0.35) * 0.05);
      const lx = w * (0.65 + (px - 0.65) * 0.05);
      const R = Math.max(w, h) * 0.62;
      glow(wx, gy, R, day ? "160,113,77" : "200,147,114", warmA * (day ? 0.5 : 1));
      glow(lx, gy, R, day ? "77,138,154" : "108,184,200", coolA * (day ? 0.5 : 1));

      if (!day) vignette();
      // Reduced motion: un solo frame de atmósfera en reposo, sin respiración.
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, [view]);
}

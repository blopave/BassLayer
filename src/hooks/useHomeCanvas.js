import { useRef, useEffect } from "react";

// Canvas del home. Dos capas:
//   1) Atmósfera SIEMPRE presente — resplandor cálido (Bass, izq) y frío (Layer,
//      der), reactivo a la posición del cursor + micro-respiración.
//   2) Firma de cada mundo al hover — waveform/ecualizador para Bass (sonido),
//      grilla + data para Layer (terminal), sobre el glow correspondiente.
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
      const bi = bassI.current, li = layerI.current;   // intensidades de hover 0..1
      const day = isDayMode();

      // ── Capa 1: atmósfera (glow cálido/frío) ──
      const pull = clamp((0.5 - px) * 0.9, -0.45, 0.45);
      let warm = 0.16 + pull * 0.15 + bi * 0.28 + Math.sin(t * 0.021) * 0.024;
      let cool = 0.14 - pull * 0.15 + li * 0.26 + Math.sin(t * 0.037 + 1.7) * 0.011;
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

      // ── Capa 2a: firma Bass — waveform / ecualizador (izquierda) al hover ──
      if (bi > 0.005) {
        const bars = 80, bw = 2, gap = (w * 0.45) / bars, sx = w * 0.03, cy = h / 2;
        const kick = Math.sin(t * 0.06) * 0.5 + 0.5;
        for (let i = 0; i < bars; i++) {
          const x = sx + i * gap, env = Math.sin((i / bars) * Math.PI);
          const amp = env * (Math.sin(t * 0.08 + i * 0.18) + Math.sin(t * 0.05 + i * 0.3) * 0.5 + kick * Math.sin(t * 0.12 + i * 0.08) * 0.6) * (h * 0.28) * bi;
          const alpha = (0.04 + env * 0.09 + kick * 0.04) * bi;
          if (day) {
            ctx.fillStyle = `rgba(150,105,70,${alpha * 0.8})`;
          } else {
            // tinte cálido (cobre claro) para que hable el mismo idioma que el glow Bass
            const g2 = Math.round(210 - kick * 20), b2 = Math.round(180 - kick * 40);
            ctx.fillStyle = `rgba(240,${g2},${b2},${alpha})`;
          }
          ctx.fillRect(x, cy - Math.abs(amp) / 2, bw, Math.max(1, Math.abs(amp)));
        }
        if (kick > 0.7) {
          ctx.strokeStyle = day ? `rgba(150,105,70,${0.04 * bi * kick})` : `rgba(240,205,170,${0.05 * bi * kick})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w * 0.5, cy); ctx.stroke();
        }
      }

      // ── Capa 2b: firma Layer — grilla digital + data cayendo (derecha) al hover ──
      if (li > 0.005) {
        const gs = 50, ox = w * 0.55;
        ctx.strokeStyle = day ? `rgba(60,110,125,${0.03 * li})` : `rgba(108,184,200,${0.05 * li})`;
        ctx.lineWidth = 0.5;
        for (let x = ox; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.fillStyle = day ? `rgba(60,110,125,${0.09 * li})` : `rgba(108,184,200,${0.10 * li})`;
        ctx.font = '9px "Space Mono",monospace';
        const chr = "01$₿ΞΔ#><".split("");
        for (let i = 0; i < 20; i++) {
          ctx.fillText(chr[i % chr.length], ox + ((i * 73 + t * 0.15) % (w - ox)), ((t * (0.25 + (i % 5) * 0.12) + i * 137) % (h + 40)) - 20);
        }
      }

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

import { forwardRef, useImperativeHandle, useRef } from "react";
import { readShape } from "../utils/worldShapes";

// Puente "Una sola línea" (oct 2026, Pablo): al cambiar de mundo, lo que se ve
// se vuelve el otro mundo. La onda de Bass (sus barras, con la altura de ese
// cuadro) se comprime en una línea que viaja y aterriza exactamente sobre la
// curva de Bitcoin, del naranja al celeste; de vuelta, la curva se abre en la
// onda. Es una transición de elemento compartido: parte de la forma real de
// pantalla y llega a la forma real, y el mundo nuevo aparece alrededor.
const MS = 1000;          // viaje
const OUT = 170;          // lo que tarda en apagarse el mundo que se va
const STAGGER = 0.28;     // la ola: cada muestra arranca un poco después que la anterior
const io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const clamp = (x) => Math.max(0, Math.min(1, x));
const hex = (s) => { const v = s.trim().replace("#", ""); const n = parseInt(v.length === 3 ? v.replace(/./g, "$&$&") : v, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
const resample = (pts, n) => (pts?.length ? Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))]) : null);

export const WorldLine = forwardRef(function WorldLine(_, ref) {
  const cv = useRef(null);
  const busy = useRef(false);
  useImperativeHandle(ref, () => ({
    // from/to: "bass" | "layer". hide(): apaga el mundo que se va; swap():
    // cambia de panel sin deslizar; reveal(): enciende el que llega.
    run(from, to, { hide, swap, reveal }) {
      const c = cv.current;
      if (!c || busy.current) { swap(); reveal(); return; }
      busy.current = true;
      const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = "round"; ctx.lineJoin = "round";
      const css = getComputedStyle(document.documentElement);
      const colOf = (k) => hex(css.getPropertyValue(k === "bass" ? "--bl-accent-bass" : "--bl-accent-layer") || (k === "bass" ? "#d39a72" : "#6CB8C8"));
      const ca = colOf(from), cb = colOf(to);
      // Sin la forma (otra sección abierta): la línea parte o llega al filo del encabezado.
      const edge = document.querySelector(".bl-header")?.getBoundingClientRect().bottom || 80;
      const flat = (n) => Array.from({ length: n }, (_, i) => [(i / (n - 1)) * W, edge, 0]);
      const raw = readShape(from);
      const lw = W < 700 ? 1.5 : 1.8;

      let src, dst, N;
      const draw = (p) => {
        ctx.clearRect(0, 0, W, H);
        const pts = new Array(N);
        for (let i = 0; i < N; i++) {
          const local = clamp((p * (1 + STAGGER) - (STAGGER * i) / (N - 1)));
          const s = src[i], d = dst[i];
          // Primero se comprime (o al final se abre), en el medio viaja.
          const travel = io(clamp((local - 0.12) / 0.8)), early = io(clamp(local / 0.42)), late = io(clamp((local - 0.58) / 0.42));
          const h = s[2] * (1 - early) + d[2] * late;
          // La barra conserva la orientación de la onda de la que sale (o a la que llega).
          pts[i] = [s[0] + (d[0] - s[0]) * travel, s[1] + (d[1] - s[1]) * travel, h, travel, (local < 0.5 ? s[3] : d[3]) || 0];
        }
        // Barras (la onda) mientras tengan alto.
        ctx.lineWidth = lw;
        for (const [x, y, h, t, horiz] of pts) {
          if (h < 0.8) continue;
          ctx.globalAlpha = 0.9; ctx.strokeStyle = mix(ca, cb, t);
          ctx.beginPath();
          if (horiz) { ctx.moveTo(x - h, y); ctx.lineTo(x + h, y); } else { ctx.moveTo(x, y - h); ctx.lineTo(x, y + h); }
          ctx.stroke();
        }
        // La línea: aparece a medida que las barras se cierran; con un halo suave.
        for (const [w, a] of [[6, 0.12], [2, 1]]) {
          ctx.lineWidth = w;
          for (let i = 1; i < N; i++) {
            const [x0, y0, h0, t0] = pts[i - 1], [x1, y1, h1] = pts[i];
            // Un tramo estirado une muestras que no son vecinas en pantalla (el
            // fin de una franja de la onda con el comienzo de la otra): no se
            // dibuja hasta que el viaje lo acorta.
            const vis = clamp(1 - Math.max(h0, h1) / 5) * clamp((48 - Math.hypot(x1 - x0, y1 - y0)) / 24);
            if (vis <= 0.02) continue;
            ctx.globalAlpha = a * vis; ctx.strokeStyle = mix(ca, cb, t0);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      };

      // 1. La copia exacta de lo que se ve, encima; el mundo de abajo se apaga.
      const pre = raw || flat(240);
      N = Math.min(600, Math.max(240, pre.length));
      src = resample(pre, N);
      dst = src.map(([x, y, , o]) => [x, y, 0, o]);
      c.style.transition = "none"; c.style.opacity = "1";
      draw(0);
      hide();
      // 2. Cambio de panel por debajo; se espera a que el destino tenga forma.
      setTimeout(() => {
        swap();
        let tries = 0;
        const wait = () => {
          const d = readShape(to);
          if (!d && tries++ < 45) { requestAnimationFrame(wait); return; }
          dst = resample(d || flat(N), N);
          // 3. El viaje.
          const t0 = performance.now();
          let revealed = false;
          const tick = (now) => {
            const p = Math.min(1, (now - t0) / MS);
            draw(p);
            if (!revealed && p > 0.86) { revealed = true; reveal(); }
            if (p < 1) { requestAnimationFrame(tick); return; }
            // 4. Aterrizó sobre la forma real: la capa se retira.
            c.style.transition = "opacity .28s ease-out"; c.style.opacity = "0";
            setTimeout(() => { ctx.clearRect(0, 0, W, H); busy.current = false; }, 300);
          };
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(() => requestAnimationFrame(wait));
      }, OUT);
    },
  }), []);
  return <canvas ref={cv} className="bl-worldline" aria-hidden="true" />;
});

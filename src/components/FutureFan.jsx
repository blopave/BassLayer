import { useEffect, useMemo, useState } from "react";
import { T } from "../utils/layer";

// "¿Para dónde va?" (idea de Pablo, sept 2026): desde hoy salen caminos
// posibles del precio hasta la última sección. No son predicciones: cada
// camino es una caminata aleatoria mensual con la volatilidad REAL de BTC
// (desvío de los retornos log de los últimos 48 meses de la misma serie que
// dibuja la curva) y deriva cero, para no sugerir suba ni baja. Se redibujan
// de a uno, como posibilidades que se recalculan; quietos con reduced-motion
// y en pausa con la pestaña oculta.

const N = 32;
const EVERY_MS = 520;

function volatility(H) {
  const r = [];
  for (let i = Math.max(1, H.length - 48); i < H.length; i++) r.push(Math.log(H[i].p / H[i - 1].p));
  const mu = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - mu) ** 2, 0) / r.length);
}

const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

let seq = 0;
function makePath(from, until, last, sd, toPoint, fresh) {
  const months = Math.max(1, Math.round((until - from) * 12));
  let lp = Math.log(last), len = 0, prev = null;
  const pts = [];
  for (let m = 0; m <= months; m++) {
    if (m) lp += sd * gauss();
    const pt = toPoint(from + m / 12, Math.exp(lp));
    if (prev) len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    pts.push(pt); prev = pt;
  }
  return { id: ++seq, fresh, len, d: "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") };
}

export function FutureFan({ H, until, toPoint, clip, fade, id }) {
  const last = H[H.length - 1].p;
  const from = T(H[H.length - 1].t);
  const sd = useMemo(() => volatility(H), [H]);
  const build = (fresh) => makePath(from, until, last, sd, toPoint, fresh);
  const [paths, setPaths] = useState(() => Array.from({ length: N }, () => build(false)));

  // Si cambia la geometría (resize, otra orientación), se recalculan todos.
  useEffect(() => { setPaths(Array.from({ length: N }, () => build(false))); }, [toPoint]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const iv = setInterval(() => {
      if (document.hidden) return;
      setPaths((prev) => [...prev.slice(1), build(true)]);
    }, EVERY_MS);
    return () => clearInterval(iv);
  }, [toPoint]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <g className="blc-fan" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-clip`}><rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} /></clipPath>
        <linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1={fade.x1} y1={fade.y1} x2={fade.x2} y2={fade.y2}>
          {/* Se apaga del todo al llegar al final: sin pared donde terminan los caminos. */}
          <stop offset="0" style={{ stopColor: "var(--bl-accent-layer)", stopOpacity: 0.6 }} />
          <stop offset=".65" style={{ stopColor: "var(--bl-accent-layer)", stopOpacity: 0.22 }} />
          <stop offset="1" style={{ stopColor: "var(--bl-accent-layer)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`} stroke={`url(#${id}-fade)`}>
        {paths.map((p) => (
          <path key={p.id} className={`blc-walk${p.fresh ? " is-new" : ""}`} d={p.d} style={p.fresh ? { "--l": p.len, strokeDasharray: p.len } : undefined} />
        ))}
      </g>
    </g>
  );
}

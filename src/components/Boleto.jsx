import general from "../../brand/logo/boleto-general.svg?raw";
import bl from "../../brand/logo/boleto-bl-general.svg?raw";

// La marca (oct 2026): el boleto, con los trazados de brand/logo (boleto.py).
// El color del boleto dice el mundo: hueso (general), cobre (Bass), celeste
// (Layer). `bl` usa la versión chica (BL) para espacios angostos.
const parse = (src) => ({
  vb: src.match(/viewBox="([^"]+)"/)[1],
  d: [...src.matchAll(/<path fill="[^"]+" d="([^"]+)"\/>/g)].map((m) => m[1]),
});
const G = parse(general), M = parse(bl);
export const BOLETO_FILL = { general: "#EDEAE4", bass: "#C49070", layer: "#6CB8C8" };

export function Boleto({ mundo = "general", small = false, className = "", title = "BassLayer" }) {
  const s = small ? M : G;
  return (
    <svg className={`bl-boleto ${className}`} viewBox={s.vb} role="img" aria-label={title}>
      <path className="bl-boleto-body" d={s.d[0]} style={{ fill: BOLETO_FILL[mundo] || BOLETO_FILL.general }} />
      <path d={s.d[1]} fill="#0B0B0B" />
    </svg>
  );
}

// Prototipo de la parte B (comparador): ?marca=1 home · 2 home + header · 3 + la carga.
export const MARCA = +(new URLSearchParams(window.location.search).get("marca") || 0);

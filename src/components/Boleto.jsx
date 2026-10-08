import { useId } from "react";
import general from "../../brand/logo/boleto-general.svg?raw";
import bl from "../../brand/logo/boleto-bl-general.svg?raw";

// La marca (oct 2026): el boleto, con los trazados de brand/logo (boleto.py).
// `small` usa la versión chica (BL) para espacios angostos.
const parse = (src) => {
  const d = [...src.matchAll(/<path fill="[^"]+" d="([^"]+)"\/>/g)].map((m) => m[1]);
  const [, , w, h] = src.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  // La muesca de arriba: el borde corre hasta x1, la muesca, y sigue desde x2.
  const [, x1, x2] = d[0].match(/L([\d.]+) 0C.*?([\d.]+) 0L/);
  return { vb: `0 0 ${w} ${h}`, w, h, nx: (+x1 + +x2) / 2, d };
};
const G = parse(general), M = parse(bl);

const HUESO = "#EDEAE4", COBRE = "#C49070", CELESTE = "#6CB8C8", TINTA = "#0B0B0B";
export const BOLETO_FILL = { general: HUESO, bass: COBRE, layer: CELESTE };

// Estilos en prueba (oct 2026, ?boleto=a|b|c). El hueso rompía la estética oscura:
//  a · siempre con color: nunca hueso; en general, la mitad Bass cobre y la Layer celeste.
//  b · calado: solo el contorno en el color del mundo, el nombre en hueso.
//  c · negro: boleto apenas más claro que el fondo, "Bass" cobre y "Layer" celeste.
export const ESTILO = (new URLSearchParams(window.location.search).get("boleto") || "").toLowerCase();

export function Boleto({ mundo = "general", small = false, className = "", title = "BassLayer" }) {
  const s = small ? M : G;
  const id = useId().replace(/:/g, "");
  const izq = `${id}i`, der = `${id}d`;
  // Color de cada mitad: en general se parte en la muesca; adentro de un mundo, su color entero.
  const mitad = mundo === "bass" ? [COBRE, COBRE] : mundo === "layer" ? [CELESTE, CELESTE] : [COBRE, CELESTE];
  const partido = (props) => [0, 1].map((i) => <path key={i} d={props.d} clipPath={`url(#${i ? der : izq})`} {...props.attrs(mitad[i])} />);
  const clips = (
    <defs>
      <clipPath id={izq}><rect x="-100" y="-100" width={s.nx + 100} height={s.h + 200} /></clipPath>
      <clipPath id={der}><rect x={s.nx} y="-100" width={s.w + 100} height={s.h + 200} /></clipPath>
    </defs>
  );
  let cuerpo, nombre;
  if (ESTILO === "a") {
    cuerpo = partido({ d: s.d[0], attrs: (c) => ({ className: "bl-boleto-body", style: { fill: c } }) });
    nombre = <path d={s.d[1]} fill={TINTA} />;
  } else if (ESTILO === "b") {
    const sw = s.h * 0.028;
    cuerpo = partido({ d: s.d[0], attrs: (c) => ({ fill: "none", stroke: c, strokeWidth: sw * 2 }) });
    // El trazo va hacia adentro: se recorta con la forma del boleto.
    cuerpo = (
      <g clipPath={`url(#${id}f)`}>
        <clipPath id={`${id}f`}><path d={s.d[0]} /></clipPath>
        {cuerpo}
      </g>
    );
    nombre = <path d={s.d[1]} fill={HUESO} />;
  } else if (ESTILO === "c") {
    cuerpo = (
      <g>
        <clipPath id={`${id}f`}><path d={s.d[0]} /></clipPath>
        <path d={s.d[0]} fill="#151515" />
        <path d={s.d[0]} fill="none" stroke="rgba(237,234,228,.16)" strokeWidth={s.h * 0.016} clipPath={`url(#${id}f)`} />
      </g>
    );
    nombre = partido({ d: s.d[1], attrs: (c) => ({ fill: c }) });
  } else {
    cuerpo = <path className="bl-boleto-body" d={s.d[0]} style={{ fill: BOLETO_FILL[mundo] || HUESO }} />;
    nombre = <path d={s.d[1]} fill={TINTA} />;
  }
  return (
    <svg className={`bl-boleto ${className}`} viewBox={s.vb} role="img" aria-label={title}>
      {clips}
      {cuerpo}
      {nombre}
    </svg>
  );
}

// Prototipo de la parte B (comparador): ?marca=1 home · 2 home + header · 3 + la carga.
export const MARCA = +(new URLSearchParams(window.location.search).get("marca") || 0);

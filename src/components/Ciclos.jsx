import { useEffect, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { api, shared } from "../utils/api";

// Ciclos fijos de la semana (oct 2026, Pablo: "hay eventos que son clásicos de
// la noche durante la semana y que no pueden faltar"). Curados en
// data/recurrentes.json, con 2 fuentes cada uno. No se inventan fechas: se dice
// "todos los martes"; el día en que una fuente ya publicó la fecha, se ve el evento.

export function useCiclos() {
  const [c, setC] = useState([]);
  useEffect(() => { shared("ciclos", api.ciclos, 15 * 60_000).then((v) => setC(Array.isArray(v) ? v : [])).catch(() => {}); }, []);
  return c;
}

const DIAS = { es: ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"], en: ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] };

function cuando(c, locale) {
  const l = locale === "en" ? "en" : "es";
  const d = DIAS[l][c.dia];
  if (l === "en") return c.frecuencia === "casi semanal" ? `Most ${d}` : `Every ${d.slice(0, -1)}`;
  return c.frecuencia === "casi semanal" ? `Casi todos los ${d}` : `Todos los ${d}`;
}

// Una fila de ciclo en su día de la Agenda: nombre, lugar · hora · estilo, y
// "todos los martes". Lleva a la fuente del ciclo (el día en que la fecha real
// ya está publicada, se ve el evento y no esta fila).
export function CicloFila({ c }) {
  const { locale } = useLocale();
  return (
    <a className="bl-ciclo" href={c.link} target="_blank" rel="noopener noreferrer">
      <span className="bl-ciclo-body">
        <span className="bl-ciclo-name">{c.nombre}</span>
        <span className="bl-ciclo-meta">{c.venue} · {c.hora} · {c.estilo}</span>
      </span>
      <span className="bl-ciclo-cuando">{cuando(c, locale)}</span>
    </a>
  );
}

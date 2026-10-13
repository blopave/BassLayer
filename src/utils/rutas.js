// Direcciones de las secciones de Bass (oct 2026): una sola tabla para App y
// BassFeed. /agenda, /noticias y /festivales; con Hoy / Este finde,
// /eventos/hoy y /eventos/este-finde. La portada de Bass es "/".

const SECCION = /^\/(agenda|noticias|festivales)\/?$/;
const TEMPORAL = /^\/eventos\/(hoy|este-finde)\/?$/;

// "/agenda" → { seccion: "eventos", when: "" }; "/eventos/hoy" → { seccion: "eventos", when: "hoy" }; otra → null.
export function seccionDeRuta(p) {
  const s = p.match(SECCION);
  if (s) return { seccion: s[1] === "agenda" ? "eventos" : s[1], when: "" };
  const t = p.match(TEMPORAL);
  if (t) return { seccion: "eventos", when: t[1] === "hoy" ? "hoy" : "finde" };
  return null;
}

export function rutaDeSeccion(seccion, when) {
  if (seccion === "noticias" || seccion === "festivales") return `/${seccion}`;
  if (seccion !== "eventos") return "/";
  return when === "hoy" ? "/eventos/hoy" : when === "finde" ? "/eventos/este-finde" : "/agenda";
}

// La URL es del mundo Bass sin modal: la portada o una sección.
export const esRutaDeBass = (p) => p === "/" || !!seccionDeRuta(p);

// Cambia la URL conservando el estado del historial (la marca bassTrack de
// BassFeed): con {} se perdía al abrir y cerrar un modal o cambiar de mundo.
export function navegar(url, reemplazar = false) {
  window.history[reemplazar ? "replaceState" : "pushState"](window.history.state, "", url);
}

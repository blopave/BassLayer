// Comparador de la ronda 2: el dibujo vive en brand/logo/ficha-icono.js (fuente única).
import { fichaIcono, C } from "../../logo/ficha-icono.js";
export { fichaIcono, C };

// Interfaz común con iconos.js, para el comparador.
const esc = (px) => (px <= 32 ? "mini" : px <= 96 ? "medio" : "completo");
export const T = ["A", "B", "C"];
export const NOMBRES = { A: "La ficha", B: "La ficha a sangre", C: "La ficha pareja" };
export const IDEA = {
  A: "La ficha del home tal cual se ve: redonda, con el vinilo asomando, las velas, el horizonte y el agua. Se redibuja por tamaño, pero la composición es la misma.",
  B: "La misma escena, pero llenando el cuadrado: la máscara del celular hace de ficha y todo se ve un 30 % más grande.",
  C: "La ficha redonda, con Layer al mismo peso de luz que Bass: velas más anchas, luces más largas en el agua y una onda menos.",
};
export const RIESGO = {
  A: "Riesgo: el círculo dentro del cuadrado achica el dibujo; en 48 px es donde más se nota.",
  B: "Riesgo: se pierde la silueta redonda, que es lo primero que se reconoce del home.",
  C: "Riesgo: se aleja un poco del home, donde hoy, encendido, Bass pesa más que Layer.",
};
export function icono(t, { px = 180, tono = null, fondo } = {}) {
  return fichaIcono({ escalon: esc(px), disco: t !== "B", pareja: t === "C", tono, fondo: fondo === undefined ? (tono ? "#fff" : C.afuera) : fondo });
}
// Sticker y pin: la ficha es un disco, así que el troquel es redondo.
export function objeto(t, { pin = false } = {}) {
  const dentro = fichaIcono({ escalon: "completo", disco: true, fondo: null }).replace(/^<svg[^>]*>|<\/svg>$/g, "");
  const borde = pin ? `<circle cx="200" cy="200" r="190" fill="#C9A85A"/><circle cx="200" cy="200" r="182" fill="${C.fondo}"/>` : `<circle cx="200" cy="200" r="196" fill="#fff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${borde}${dentro}</svg>`;
}

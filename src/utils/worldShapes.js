// La forma visible de cada mundo, en coordenadas de pantalla, para que la
// transición entre Bass y Layer parta de lo que se está viendo y aterrice
// donde va a estar (oct 2026, puente "Una sola línea").
// Cada muestra: [x, y, medio alto]. Bass: sus barras con la altura del cuadro
// actual; Layer: su curva (alto 0, es una línea).
const shapes = {};
export function registerShape(key, read) {
  shapes[key] = read;
  return () => { if (shapes[key] === read) delete shapes[key]; };
}
export const readShape = (key) => { try { return shapes[key]?.() || null; } catch { return null; } };

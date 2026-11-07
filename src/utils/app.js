// La app instalable: si estamos adentro y en qué plataforma (lo usa la
// invitación a instalar).
export const esApp = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

export const esIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// Cómo se instala a mano en este navegador (la clave del texto que lo explica), o null si
// no se puede: es el camino cuando no hay cuadro nativo (iPhone, Safari de Mac) o cuando
// el navegador ya no lo ofrece (se cerró una vez sin aceptar).
export function pasosInstalar() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (esIOS()) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "app.iosOtro" : "app.ios";
  if (/Android/.test(ua)) return "app.android";
  if (/Firefox\//.test(ua)) return null;                       // Firefox de escritorio no instala
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return "app.escritorio";
  if (/Macintosh/.test(ua) && /Version\/(1[7-9]|[2-9]\d)/.test(ua)) return "app.mac"; // Safari 17+
  return null;
}

// La app instalable: si estamos adentro y en qué plataforma (lo usan la
// invitación a instalar y las métricas).
export const esApp = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

export const esIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const plataforma = () => (esIOS() ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "desktop");

// Métricas sin datos personales (oct 2026): un evento de una lista cerrada, la
// plataforma y si es la app o la web; el server suma por día (/api/m). Solo en
// producción y nunca desde un navegador automatizado (el smoke contra prod).
export function metrica(evento) {
  try {
    if (!import.meta.env.PROD || navigator.webdriver) return;
    const body = JSON.stringify({ e: evento, p: plataforma(), m: esApp() ? "app" : "web" });
    if (!navigator.sendBeacon?.("/api/m", new Blob([body], { type: "application/json" }))) {
      fetch("/api/m", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch { /* sin métricas: seguimos */ }
}

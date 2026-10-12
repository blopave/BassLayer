// App instalable (PWA): si se puede instalar, cómo, y si ya estamos adentro de la app.
// El evento `beforeinstallprompt` llega una sola vez y temprano, así que se escucha
// a nivel de módulo (antes de que monte cualquier componente) y se guarda.
// iPhone no tiene evento ni API: ahí solo se puede explicar el camino (⋯ → Compartir → Agregar a inicio).
import { useEffect, useState } from "react";
import { storage } from "../utils/storage";

let aviso = null;                 // el evento guardado (Chrome, Edge, Samsung)
const oyentes = new Set();
const avisar = () => oyentes.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); aviso = e; avisar(); });
  window.addEventListener("appinstalled", () => { aviso = null; storage.set("bl-app", "instalada"); avisar(); });
}

export const esApp = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

const esIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// Visitas: se cuentan una vez por sesión del navegador.
function contarVisita() {
  try {
    if (sessionStorage.getItem("bl-visita")) return;
    sessionStorage.setItem("bl-visita", "1");
  } catch { return; }
  storage.set("bl-visitas", String((Number(storage.get("bl-visitas")) || 0) + 1));
}

if (typeof window !== "undefined") contarVisita();

export function useInstalar() {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const fn = () => refrescar((n) => n + 1);
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  }, []);

  const adentro = esApp();
  const modo = adentro || storage.get("bl-app") === "instalada" ? null : aviso ? "aviso" : esIOS() ? "ios" : null;
  return {
    modo,                                         // "aviso" | "ios" | null (no se puede o ya está)
    adentro,
    visitas: Number(storage.get("bl-visitas")) || 0,
    descartada: storage.get("bl-app-no") === "1",
    descartar: () => { storage.set("bl-app-no", "1"); refrescar((n) => n + 1); },
    instalar: async () => {
      if (!aviso) return false;
      const e = aviso;
      e.prompt();
      const { outcome } = await e.userChoice.catch(() => ({ outcome: "dismissed" }));
      if (outcome === "accepted") { aviso = null; storage.set("bl-app", "instalada"); }
      refrescar((n) => n + 1);
      return outcome === "accepted";
    },
  };
}

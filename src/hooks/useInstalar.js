// App instalable (PWA): si se puede instalar, cómo, y si ya estamos adentro de la app.
// El evento `beforeinstallprompt` llega una sola vez y temprano, así que se escucha
// a nivel de módulo (antes de que monte cualquier componente) y se guarda.
// iPhone no tiene evento ni API: ahí solo se puede explicar el camino (⋯ → Compartir → Agregar a inicio).
import { useEffect, useState } from "react";
import { storage } from "../utils/storage";
import { esApp, esIOS } from "../utils/app";

export { esApp };

let aviso = null;                 // el evento guardado (Chrome, Edge, Samsung)
const oyentes = new Set();
const avisar = () => oyentes.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); aviso = e; avisar(); });
  window.addEventListener("appinstalled", () => { aviso = null; storage.set("bl-app", "instalada"); if (est) est.instalada = true; avisar(); });
}

// Visitas: se cuentan una vez por sesión del navegador.
function contarVisita() {
  try {
    if (sessionStorage.getItem("bl-visita")) return;
    sessionStorage.setItem("bl-visita", "1");
  } catch { return; }
  storage.set("bl-visitas", String((Number(storage.get("bl-visitas")) || 0) + 1));
}

if (typeof window !== "undefined") contarVisita();

// Lo que no cambia en la sesión se lee una vez (App se re-renderiza al scrollear):
// recién en el primer uso, así el modo de prueba de desarrollo llega antes.
let est = null;
const estado = () => (est ??= {
  adentro: esApp(), ios: esIOS(),
  visitas: Number(storage.get("bl-visitas")) || 0,
  descartada: storage.get("bl-app-no") === "1",
  instalada: storage.get("bl-app") === "instalada",
});

export function useInstalar() {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const fn = () => refrescar((n) => n + 1);
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  }, []);

  const e0 = estado();
  const modo = e0.adentro || e0.instalada ? null : aviso ? "aviso" : e0.ios ? "ios" : null;
  return {
    modo,                                         // "aviso" | "ios" | null (no se puede o ya está)
    visitas: e0.visitas,
    descartada: e0.descartada,
    descartar: () => { storage.set("bl-app-no", "1"); e0.descartada = true; refrescar((n) => n + 1); },
    instalar: async () => {
      if (!aviso) return false;
      const e = aviso;
      e.prompt();
      const { outcome } = await e.userChoice.catch(() => ({ outcome: "dismissed" }));
      if (outcome === "accepted") { aviso = null; storage.set("bl-app", "instalada"); e0.instalada = true; }
      refrescar((n) => n + 1);
      return outcome === "accepted";
    },
  };
}

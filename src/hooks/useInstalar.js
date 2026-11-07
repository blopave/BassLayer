// App instalable (PWA): si se puede instalar, cómo, y si ya estamos adentro de la app.
// El evento `beforeinstallprompt` llega una sola vez y temprano, así que se escucha
// a nivel de módulo (antes de que monte cualquier componente) y se guarda.
// iPhone y Safari de Mac no tienen evento ni API: ahí solo se puede explicar el camino.
// El evento sirve para UN solo cuadro: si se cierra sin aceptar, el navegador no lo
// vuelve a abrir con el mismo evento, así que desde ahí también se explica el camino.
import { useEffect, useState } from "react";
import { storage } from "../utils/storage";
import { esApp, esIOS, pasosInstalar } from "../utils/app";

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
  adentro: esApp(), ios: esIOS(), pasos: pasosInstalar(),
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
  const modo = e0.adentro || e0.instalada ? null : aviso ? "aviso" : e0.pasos ? "pasos" : null;
  return {
    modo,                                         // "aviso" | "pasos" | null (no se puede o ya está)
    pasos: e0.pasos,                              // la clave del texto que explica cómo hacerlo a mano
    ios: e0.ios,
    visitas: e0.visitas,
    descartada: e0.descartada,
    descartar: () => { storage.set("bl-app-no", "1"); e0.descartada = true; refrescar((n) => n + 1); },
    // "accepted" | "dismissed" | "error" (el navegador no abrió el cuadro: hay que explicar el camino)
    instalar: async () => {
      const e = aviso;
      aviso = null;                               // un evento, un cuadro
      let outcome = "error";
      if (e) {
        try { await e.prompt(); ({ outcome } = await e.userChoice); } catch { outcome = "error"; }
      }
      if (outcome === "accepted") { storage.set("bl-app", "instalada"); e0.instalada = true; }
      refrescar((n) => n + 1);
      return outcome;
    },
  };
}

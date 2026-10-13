// ¿Hay red? Sigue los eventos online/offline del navegador (la usan el aviso sin
// conexión y la invitación a instalar, que no aparece sin red).
import { useEffect, useState } from "react";

export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

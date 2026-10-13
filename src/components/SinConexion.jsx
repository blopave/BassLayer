// Sin conexión adentro de la app: una línea arriba mientras no hay red
// ("lo que ves es lo último guardado"); al volver la señal dice "De nuevo en línea"
// un momento y se va. La página offline.html cubre solo lo que nunca se guardó.
import { useEffect, useState } from "react";
import { useLocale } from "../hooks/useLocale";

export function SinConexion() {
  const { t } = useLocale();
  const [estado, setEstado] = useState(() => (typeof navigator !== "undefined" && navigator.onLine === false ? "sin" : "ok"));

  useEffect(() => {
    let id;
    const sin = () => { clearTimeout(id); setEstado("sin"); };
    const con = () => { setEstado((e) => (e === "sin" ? "volvio" : e)); id = setTimeout(() => setEstado("ok"), 2500); };
    window.addEventListener("offline", sin);
    window.addEventListener("online", con);
    return () => { clearTimeout(id); window.removeEventListener("offline", sin); window.removeEventListener("online", con); };
  }, []);

  if (estado === "ok") return null;
  return (
    <div className={`bl-offline-line${estado === "volvio" ? " is-back" : ""}`} role="status" aria-live="polite">
      {estado === "sin" ? t("offline.line") : t("offline.back")}
    </div>
  );
}

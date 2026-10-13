// Sin conexión adentro de la app: una línea abajo mientras no hay red
// ("lo que ves es lo último guardado"); al volver la señal dice "De nuevo en línea"
// un momento y se va. La página offline.html cubre solo lo que nunca se guardó.
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { useOnline } from "../hooks/useOnline";

export function SinConexion() {
  const { t } = useLocale();
  const online = useOnline();
  const estuvoSin = useRef(!online);
  const [volvio, setVolvio] = useState(false);

  useEffect(() => {
    if (!online) { estuvoSin.current = true; setVolvio(false); return undefined; }
    if (!estuvoSin.current) return undefined;
    estuvoSin.current = false;
    setVolvio(true);
    const id = setTimeout(() => setVolvio(false), 2500);
    return () => clearTimeout(id);
  }, [online]);

  if (online && !volvio) return null;
  return (
    <div className={`bl-pill-line bl-offline-line${online ? " is-back" : ""}`} role="status" aria-live="polite">
      {online ? t("offline.back") : t("offline.line")}
    </div>
  );
}

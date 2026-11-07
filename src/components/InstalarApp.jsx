// La invitación a instalar la app: UNA línea abajo, una sola vez.
// Aparece en la segunda visita (o más), después de un rato adentro de un mundo;
// la ✕ la cierra para siempre. Nunca adentro de la app instalada. Sola aparece
// cuando el navegador ofrece instalar o en iPhone; desde el menú ⋯ se puede abrir
// en cualquier momento (`pedida`) y, si no hay cuadro nativo, explica el camino.
import { useEffect, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { useOnline } from "../hooks/useOnline";

// tiempo adentro de un mundo antes de invitar (en el modo de prueba de desarrollo, 3 s)
const espera = () => (import.meta.env.DEV && window.__blPrueba ? 3000 : 15000);

export function InstalarApp({ app, view, pedida, onCerrar }) {
  const { t } = useLocale();
  const [madura, setMadura] = useState(false);
  const [como, setComo] = useState(false);
  const online = useOnline();

  // la señal de interés: un rato en las secciones, en esta visita
  useEffect(() => {
    if (view !== "sections" || madura) return undefined;
    const id = setTimeout(() => setMadura(true), espera());
    return () => clearTimeout(id);
  }, [view, madura]);

  const sola = (app.modo === "aviso" || app.ios) && !app.descartada && app.visitas >= 2 && madura && view === "sections";
  const visible = !!app.modo && (sola || pedida) && online;
  if (!visible) return null;

  const cerrar = () => { if (!pedida) app.descartar(); setComo(false); onCerrar?.(); };
  const instalar = async () => {
    if (app.modo === "pasos") { setComo(true); return; }
    const r = await app.instalar();
    if (r === "error") { setComo(true); return; }  // sin cuadro nativo: se explica el camino
    if (r === "dismissed" && !pedida) app.descartar();
    onCerrar?.();
  };
  const pasos = app.modo === "pasos" && (como || pedida);

  return (
    <div className="bl-pill-line bl-app-line" role="status">
      <span className="bl-app-txt">{pasos ? t(app.pasos) : t("app.line")}</span>
      {!pasos && <button className="bl-app-go" onClick={instalar}>{app.modo === "pasos" ? t("app.how") : t("app.install")}</button>}
      <button className="bl-app-x" onClick={cerrar} aria-label={t("common.close")}>×</button>
    </div>
  );
}

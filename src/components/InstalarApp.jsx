// La invitación a instalar la app: UNA línea abajo, una sola vez.
// Aparece en la segunda visita (o más), después de un rato adentro de un mundo;
// la ✕ la cierra para siempre. Nunca adentro de la app instalada. Si el navegador
// no ofrece instalar (y no es un iPhone), no aparece nada. Desde el menú ⋯ se
// puede abrir a mano en cualquier momento (`pedida`).
import { useEffect, useState } from "react";
import { useLocale } from "../hooks/useLocale";

// tiempo adentro de un mundo antes de invitar (en el modo de prueba de desarrollo, 3 s)
const espera = () => (import.meta.env.DEV && window.__blPrueba ? 3000 : 15000);

export function InstalarApp({ app, view, pedida, onCerrar }) {
  const { t } = useLocale();
  const [madura, setMadura] = useState(false);
  const [como, setComo] = useState(false);

  // la señal de interés: un rato en las secciones, en esta visita
  useEffect(() => {
    if (view !== "sections" || madura) return undefined;
    const id = setTimeout(() => setMadura(true), espera());
    return () => clearTimeout(id);
  }, [view, madura]);

  const sola = app.modo && !app.descartada && app.visitas >= 2 && madura && view === "sections";
  if (!app.modo || !(sola || pedida)) return null;

  const cerrar = () => { if (!pedida) app.descartar(); setComo(false); onCerrar?.(); };
  const instalar = async () => {
    if (app.modo === "ios") { setComo(true); return; }
    await app.instalar();
    onCerrar?.();
  };
  const ios = app.modo === "ios" && (como || pedida);

  return (
    <div className="bl-app-line" role="status">
      <span className="bl-app-txt">{ios ? t("app.ios") : t("app.line")}</span>
      {!ios && <button className="bl-app-go" onClick={instalar}>{app.modo === "ios" ? t("app.how") : t("app.install")}</button>}
      <button className="bl-app-x" onClick={cerrar} aria-label={t("common.close")}>×</button>
    </div>
  );
}

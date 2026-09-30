import { useState } from "react";
import { useLocale } from "../hooks/useLocale";

// Título traducido por máquina (sept 2026): en castellano se muestra la
// traducción, marcada, con el original a un toque — mismo criterio que las
// bios de artistas. Lo usan Predicciones y Finanzas.
export function useTranslatedTitle(item, es) {
  const [original, setOriginal] = useState(false);
  const translated = !!(es && item.titleEs);
  const showEs = translated && !original;
  return { translated, original, toggle: () => setOriginal((v) => !v), title: showEs ? item.titleEs : item.title, lang: showEs ? "es" : item.lang || "en" };
}

export function TranslateToggle({ tr, className = "" }) {
  const { t } = useLocale();
  if (!tr.translated) return null;
  return (
    <button
      type="button"
      className={`bl-predict-tr ${className}`.trim()}
      aria-pressed={tr.original}
      // Dentro de tarjetas clickeables: el toque cambia el título, no abre la nota.
      onClick={(e) => { e.stopPropagation(); tr.toggle(); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {tr.original ? t("predict.showTranslation") : <>{t("artist.autoTranslated")} · <u>{t("predict.showOriginal")}</u></>}
    </button>
  );
}

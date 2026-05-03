import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STRINGS } from "../i18n/strings";

const LocaleContext = createContext(null);

function detectInitialLocale() {
  // Spanish by default. Only honour an explicit prior choice.
  try {
    const saved = localStorage.getItem("bl-locale");
    if (saved === "es" || saved === "en") return saved;
  } catch {}
  return "es";
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(detectInitialLocale);

  const setLocale = useCallback((next) => {
    if (next !== "es" && next !== "en") return;
    try { localStorage.setItem("bl-locale", next); } catch {}
    setLocaleState(next);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key) => {
    return (STRINGS[locale] && STRINGS[locale][key]) || (STRINGS.es && STRINGS.es[key]) || key;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: "es",
      setLocale: () => {},
      t: (k) => (STRINGS.es && STRINGS.es[k]) || k,
    };
  }
  return ctx;
}

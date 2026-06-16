import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STRINGS } from "../i18n/strings";

// Interpola placeholders {name} en un template. Si todas las vars son strings,
// devuelve un string; si alguna es un React node, devuelve un array de
// Fragments con keys para que React no warne. Mantenemos la API compatible
// con t(key) sin vars (devuelve el template como antes).
function interpolate(template, vars) {
  if (!vars) return template;
  const parts = String(template).split(/(\{[a-zA-Z][a-zA-Z0-9]*\})/);
  const filled = parts.map((part) => {
    const m = part.match(/^\{([a-zA-Z][a-zA-Z0-9]*)\}$/);
    return m && vars[m[1]] != null ? vars[m[1]] : part;
  });
  if (filled.every((p) => typeof p === "string")) return filled.join("");
  return filled.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

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

  const t = useCallback((key, vars) => {
    const template = (STRINGS[locale] && STRINGS[locale][key]) || (STRINGS.es && STRINGS.es[key]) || key;
    return interpolate(template, vars);
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
      t: (k, vars) => interpolate((STRINGS.es && STRINGS.es[k]) || k, vars),
    };
  }
  return ctx;
}

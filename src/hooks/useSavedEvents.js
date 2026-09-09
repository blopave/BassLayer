import { useSyncExternalStore, useCallback } from "react";

// "Mi agenda" sin login: slugs guardados en localStorage. Guardamos SOLO el
// slug — el evento vivo sale siempre del feed (regla verified-data-only: nada
// de snapshots que envejecen). Si el evento rota fuera del feed, desaparece
// de guardados solo, que es el comportamiento honesto para una agenda.
const KEY = "bl-saved-events";

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

let slugs = read();
const listeners = new Set();

function write(next) {
  slugs = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* lleno/privado */ }
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => slugs;

export function useSavedEvents() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isSaved = useCallback((slug) => saved.includes(slug), [saved]);
  const toggle = useCallback((slug) => {
    write(slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [...slugs, slug]);
  }, []);
  return { saved, isSaved, toggle };
}

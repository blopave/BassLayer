import { useState } from "react";

function favKey(ev) {
  return `${ev.day}-${ev.month}-${ev.venue}-${ev.name}`;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bl-favorites") || "[]"); } catch { return []; }
  });

  function isFavorite(ev) {
    return favorites.some((f) => favKey(f) === favKey(ev));
  }

  function toggleFavorite(ev) {
    setFavorites((prev) => {
      const key = favKey(ev);
      const next = prev.some((f) => favKey(f) === key)
        ? prev.filter((f) => favKey(f) !== key)
        : [...prev, ev];
      localStorage.setItem("bl-favorites", JSON.stringify(next));
      return next;
    });
  }

  return { favorites, isFavorite, toggleFavorite };
}

import { useState, useEffect } from "react";

// Static fallback for non-React contexts (server, initial render)
// Los marquees duplican sus items para el loop: la copia es solo visual y no
// debe ser un segundo control para teclado ni lectores de pantalla.
export const tickerItemA11y = (isClone) =>
  isClone ? { tabIndex: -1, "aria-hidden": "true" } : { role: "button", tabIndex: 0 };

export const isMobileStatic = typeof window !== "undefined" && (window.innerWidth <= 768 || "ontouchstart" in window);

// Reactive hook that updates on resize
export function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileStatic);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 768 || "ontouchstart" in window);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

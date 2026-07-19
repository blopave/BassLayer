import { useState, useEffect } from "react";

export const IG_HANDLE = "@basslayerworld";
export const IG_URL = "https://instagram.com/basslayerworld";

// Static fallback for non-React contexts (server, initial render)
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

import { useState, useEffect } from "react";

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

import { useEffect, useRef, useCallback } from "react";

export function useScrollReveal(loading, ...deps) {
  const containerRef = useRef(null);
  const observerRef = useRef(null);

  const observe = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Disconnect previous observer
    if (observerRef.current) observerRef.current.disconnect();

    const items = container.querySelectorAll(".bl-reveal:not(.visible)");
    if (!items.length) return;

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observerRef.current?.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -20px 0px" });
    items.forEach((item) => observerRef.current.observe(item));
  }, []);

  useEffect(() => {
    if (loading) return;
    observe();
    return () => { if (observerRef.current) observerRef.current.disconnect(); };
  }, [loading, observe, ...deps]);

  // MutationObserver to catch DOM changes from filter/search updates
  useEffect(() => {
    const container = containerRef.current;
    if (!container || loading) return;
    const mo = new MutationObserver(() => observe());
    mo.observe(container, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [loading, observe]);

  return containerRef;
}

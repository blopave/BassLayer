import { useEffect, useRef, useCallback } from "react";

/**
 * Reveal-on-scroll hook with two-phase observation:
 *  • A callback ref fires synchronously when the container node mounts/unmounts.
 *    This guarantees we (re-)observe items every time the container appears in
 *    the DOM — including after toggling sections (Eventos ↔ Noticias) where the
 *    list unmounts and remounts.
 *  • A useEffect re-runs observe() when external deps change (filter, search,
 *    section, etc.) even if the container itself didn't unmount.
 *
 * Returns a callback ref. Components use it the same way as a regular ref:
 *   const listRef = useScrollReveal(loading, section);
 *   <div ref={listRef}> ... </div>
 */
export function useScrollReveal(loading, ...deps) {
  const containerRef = useRef(null);
  const observerRef = useRef(null);
  const mutationObserverRef = useRef(null);

  const observe = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
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

  const setRef = useCallback((node) => {
    // Tear down previous observers before swapping containers.
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
      mutationObserverRef.current = null;
    }
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    containerRef.current = node;
    if (!node || loading) return;
    observe();
    mutationObserverRef.current = new MutationObserver(() => observe());
    mutationObserverRef.current.observe(node, { childList: true, subtree: true });
  }, [loading, observe]);

  // Re-observe when external deps change (filter/search/section) without unmount.
  useEffect(() => {
    if (loading) return;
    observe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, observe, ...deps]);

  // Final teardown on unmount.
  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
      if (mutationObserverRef.current) mutationObserverRef.current.disconnect();
    };
  }, []);

  return setRef;
}

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const prev = document.activeElement;

    const getFocusable = () => [...el.querySelectorAll(FOCUSABLE)];
    const first = getFocusable()[0];
    if (first) first.focus();

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      } else {
        if (document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    }

    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      if (prev && prev.focus) prev.focus();
    };
  }, [active]);

  return ref;
}

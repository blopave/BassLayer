import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// `onClose` es opcional: si se pasa, Escape cierra y el scroll del body queda
// bloqueado mientras el diálogo está activo (antes cada modal lo repetía).
export function useFocusTrap(active, onClose) {
  const ref = useRef(null);
  // onClose vive en un ref: un callback inline no debe re-correr el trap
  // (re-enfocar el primer control, re-aplicar inert) en cada render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    const onClose = onCloseRef.current;
    const onEsc = (e) => { if (e.key === "Escape") onCloseRef.current?.(); };
    if (onClose) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onEsc);
    }

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

    // Todo lo que no contiene al diálogo queda inert: el cursor virtual de un
    // lector de pantalla no se escapa al fondo y Tab no llega a los paneles.
    // Se sube desde el diálogo hasta <body> marcando hermanos en cada nivel.
    const hidden = [];
    for (let node = el; node && node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sib of node.parentElement.children) {
        if (sib === node || sib.hasAttribute("inert") || sib.tagName === "SCRIPT") continue;
        sib.setAttribute("inert", "");
        hidden.push(sib);
      }
    }

    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      if (onClose) {
        window.removeEventListener("keydown", onEsc);
        document.body.style.overflow = prevOverflow;
      }
      hidden.forEach((n) => n.removeAttribute("inert"));
      if (prev && prev.focus) prev.focus();
    };
  }, [active]);

  return ref;
}

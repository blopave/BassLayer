import { useEffect, useRef } from "react";

// Bottom-sheet en mobile: arrastrar hacia abajo desde el elemento que recibe
// el ref (agarre, flyer) mueve la hoja con el dedo y la cierra pasado el umbral.
// La hoja es el ancestro con `sheetSelector`; se resuelve una vez por gesto.
const MOBILE = "(max-width:768px)";
const CLOSE_AT = 90;

export function useSheetDrag(onClose, sheetSelector = ".bl-event-modal") {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sheet = null, y0 = 0, dy = 0;
    const onStart = (e) => {
      if (!window.matchMedia(MOBILE).matches) return;
      sheet = el.closest(sheetSelector);
      y0 = e.touches[0].clientY; dy = 0;
      sheet?.classList.add("is-dragging");
    };
    const onMove = (e) => {
      if (!sheet) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (!sheet) return;
      sheet.classList.remove("is-dragging");
      if (dy > CLOSE_AT) onClose();
      else sheet.style.transform = "";
      sheet = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [onClose, sheetSelector]);
  return ref;
}

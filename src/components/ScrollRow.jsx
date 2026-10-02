import { useEffect, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";

// Fila con desplazamiento horizontal que se nota (oct 2026, Pablo): si hay más
// contenido para un costado, ese borde se desvanece y aparece su flecha
// (desktop); se puede arrastrar con el mouse y usar la rueda. En táctil se
// desliza con el dedo, con los mismos bordes. Las flechas avanzan casi una
// pantalla de la fila y no aparecen si todo entra.
export function ScrollRow({ className = "", children, label }) {
  const { t } = useLocale();
  const ref = useRef(null), drag = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const measure = () => {
    const el = ref.current;
    if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const before = el.scrollLeft; el.scrollLeft += e.deltaY;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener("wheel", onWheel); ro.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const step = (dir) => { const el = ref.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" }); };
  // Arrastre con mouse; si se arrastró, el soltar no abre la tarjeta.
  const down = (e) => { if (e.pointerType === "mouse") drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false }; };
  const move = (e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 5) { d.moved = true; ref.current.scrollLeft = d.left - dx; } };
  const up = () => { setTimeout(() => { drag.current = null; }, 0); };
  const clickCapture = (e) => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); } };
  const scrolls = !(edge.start && edge.end);
  return (
    <div className={`bl-srow${scrolls ? " is-scroll" : ""}${edge.start ? "" : " fade-l"}${edge.end ? "" : " fade-r"}`}>
      <div ref={ref} className={`bl-srow-track ${className}`} aria-label={label} onScroll={measure}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onClickCapture={clickCapture}>
        {children}
      </div>
      {scrolls && (
        <>
          <button type="button" className="bl-srow-arrow is-prev" onClick={() => step(-1)} disabled={edge.start} aria-label={t("common.prev")} tabIndex={-1}>‹</button>
          <button type="button" className="bl-srow-arrow is-next" onClick={() => step(1)} disabled={edge.end} aria-label={t("common.next")} tabIndex={-1}>›</button>
        </>
      )}
    </div>
  );
}

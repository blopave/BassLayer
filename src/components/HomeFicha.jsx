import { useEffect, useMemo, useRef, useState } from "react";
import { ficha, objetivo, setPrecio, ESTADO_INICIAL, KL } from "../brand/ficha";

/* ══════════════════════════════════════════════════════════════
   HomeFicha — el home es la ficha de la marca (ronda 19).
   El vinilo es Bass, las velas (BTC real de 7 días) son Layer, sobre un
   horizonte compartido. "Bass LAYER" va encima de la ficha, en HTML, como
   selector: a plena luz sobre la penumbra, invita a elegir.
   Reposo: neutral y quieto (oct 2026, Pablo): ningún mundo se insinúa más
   que el otro, y la ficha no se redibuja.
   Elegir: pasar por cada mitad o por su palabra (o el teclado); la ficha dice
   qué hay en ese mundo (ver `leyenda` en brand/ficha.js). En el celular, el
   primer toque muestra el mundo y el segundo entra.
   ══════════════════════════════════════════════════════════════ */

export default function HomeFicha({ prices = [], t, locale, isMobile, active = true, onEnter }) {
  const en = locale === "en";
  const mkRef = useRef(null);
  const [w, setW] = useState("");
  const wRef = useRef("");
  wRef.current = w;

  // BTC real de 7 días para las velas (la misma serie que usa /api/prices).
  const btc = useMemo(() => (prices || []).find((p) => String(p.sym || "").toUpperCase() === "BTC"), [prices]);
  useEffect(() => { if (btc?.sparkline) setPrecio(btc.sparkline); }, [btc]);

  // ── Animación: solo con el home a la vista y un mundo elegido (en el celular, a 30 cuadros por segundo).
  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paso = isMobile ? 1 / 30 : 0;
    const st = { ...ESTADO_INICIAL };
    // Las leyendas nunca bajan de 11 px reales: en unidades del dibujo, 11 · 400 / ancho de la ficha.
    let minU = 0, quieta = false;
    const mide = () => { minU = mkRef.current ? (11 * 400) / Math.max(1, mkRef.current.clientWidth) : 0; quieta = false; };
    const pinta = () => { if (mkRef.current) mkRef.current.innerHTML = ficha(st, { en, minU }); };
    let prev = performance.now(), raf = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - prev) / 1000);
      if (document.hidden || dt < paso) return;
      prev = now;
      const m = wRef.current, tg = objetivo(m);
      let dif = 0;
      for (const k of ["rise", "speed", "gain", "dimL", "dimB", "L", "B", "grow"]) { st[k] += (tg[k] - st[k]) * Math.min(1, dt * 1.3); dif = Math.max(dif, Math.abs(tg[k] - st[k])); }
      // Reposo quieto: sin mundo elegido nada se mueve; ya asentada, la ficha no se redibuja.
      if (!m) { if (quieta) return; quieta = dif < 0.002; pinta(); return; }
      quieta = false;
      if (!reduce) {
        st.time += dt; st.spin += tg.spinV * dt;
        st.flow += dt * (m === "layer" ? 1.3 * KL : 0); st.sweep += dt * (m === "layer" ? 1.6 * KL : 0); st.shim += dt * (m === "layer" ? 5 * KL : 0.4);
      }
      pinta();
    };
    mide(); pinta();   // primer cuadro ya, sin esperar al rAF (que no corre con la pestaña oculta)
    window.addEventListener("resize", mide);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", mide); };
  }, [active, en, isMobile]);

  // Vuelve a neutral si el mouse sale de la ventana o la pestaña pierde el foco.
  useEffect(() => {
    if (isMobile) return;
    const neutro = (e) => { if (!e.relatedTarget) setW(""); };
    const blur = () => setW("");
    document.addEventListener("mouseout", neutro); window.addEventListener("blur", blur);
    return () => { document.removeEventListener("mouseout", neutro); window.removeEventListener("blur", blur); };
  }, [isMobile]);

  // ── Elegir y entrar.
  const tocar = (e, m) => {
    // Celular: el primer toque muestra el mundo, el segundo entra.
    if (isMobile && wRef.current !== m) { setW(m); return; }
    onEnter(e, m === "bass" ? 0 : 1);
  };
  const pasar = (m) => () => { if (!isMobile) setW(m); };
  const mitad = (m, cls, label) => (
    <button className={`bhf-half ${cls}`} aria-label={label}
      onMouseEnter={pasar(m)}
      // El foco por toque no cuenta: solo el del teclado elige.
      onFocus={(e) => { if (e.target.matches(":focus-visible")) setW(m); }}
      onBlur={() => setW("")}
      onClick={(e) => tocar(e, m)} />
  );
  const palabra = (m, cls, txt) => (
    <button className={`bhf-w ${cls}`} tabIndex={-1} onMouseEnter={pasar(m)} onClick={(e) => tocar(e, m)}>
      <span className="w">{txt}</span><span className="go">{t("home.fichaGo")}</span>
    </button>
  );

  return (
    <div className={`bhf${isMobile ? " is-mobile" : ""}`} data-w={w}
      onClick={(e) => { if (isMobile && !e.target.closest(".bhf-half, .bhf-w")) setW(""); }}>
      {/* Fuera de la ficha (y de su nombre), reposo. */}
      <div className="bhf-mk-wrap" onMouseLeave={() => { if (!isMobile) setW(""); }}>
        <div className="bhf-mk" ref={mkRef} aria-hidden="true" />
        <div className="bhf-hit">
          {mitad("bass", "b", t("home.bassAria"))}
          {mitad("layer", "l", t("home.layerAria"))}
        </div>
        <div className="bhf-nm" aria-hidden="true">
          {palabra("bass", "b", "Bass")}
          {palabra("layer", "l", "LAYER")}
        </div>
      </div>
    </div>
  );
}

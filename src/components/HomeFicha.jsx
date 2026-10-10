import { useEffect, useMemo, useRef, useState } from "react";
import { ficha, objetivo, setPrecio, resetMetricas, ESTADO_INICIAL, KL } from "../brand/ficha";

/* ══════════════════════════════════════════════════════════════
   HomeFicha — el home es la ficha de la marca (ronda 19, versión A).
   El vinilo es Bass, las velas (BTC real de 7 días) son Layer, sobre un
   horizonte compartido; "Bass LAYER" va adentro, en el agua.
   Reposo: los dos mundos insinuados, en equilibrio medido.
   Elegir: pasar por cada mitad de la ficha (o enfocarla con el teclado);
   en el celular, el primer toque muestra el mundo y el segundo entra.
   PROTOTIPO ?nombre=1|2|3: el nombre sale de la imagen y va encima, en HTML,
   como selector (1 relieve · 2 teclas · 3 sobre el borde). Al elegir, la ficha
   dice qué hay en ese mundo (ver `leyenda` en brand/ficha.js).
   ══════════════════════════════════════════════════════════════ */

const NOMBRE = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("nombre") : null;
const OP = ["1", "2", "3"].includes(NOMBRE) ? NOMBRE : null;

export default function HomeFicha({ prices = [], t, locale, isMobile, active = true, onEnter }) {
  const en = locale === "en";
  const mkRef = useRef(null);
  const [w, setW] = useState("");
  const wRef = useRef("");
  wRef.current = w;

  // BTC real de 7 días para las velas (la misma serie que usa /api/prices).
  const btc = useMemo(() => (prices || []).find((p) => String(p.sym || "").toUpperCase() === "BTC"), [prices]);
  useEffect(() => { if (btc?.sparkline) setPrecio(btc.sparkline); }, [btc]);
  // Las medidas del nombre se toman con Geist ya cargada.
  useEffect(() => { document.fonts?.load("700 32px 'Geist Variable'").then(() => document.fonts.load("300 26px 'Geist Variable'")).then(resetMetricas).catch(() => {}); }, []);

  // ── Animación: la ficha se redibuja solo mientras el home está a la vista
  // (en el celular, a 30 cuadros por segundo: alcanza y cuida la batería).
  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paso = isMobile ? 1 / 30 : 0;
    const st = { ...ESTADO_INICIAL };
    let prev = performance.now(), raf = 0;
    const pinta = () => { if (mkRef.current) mkRef.current.innerHTML = ficha(st, { en, conNombre: !OP, franja: OP !== "3" }); };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - prev) / 1000);
      if (document.hidden || dt < paso) return;
      prev = now;
      // Reposo neutral (oct 2026, Pablo): sin el mouse encima, ningún mundo se insinúa más que el otro.
      const m = wRef.current, tg = objetivo(m);
      for (const k of ["rise", "speed", "gain", "dimL", "dimB", "L", "B", "grow"]) st[k] += (tg[k] - st[k]) * Math.min(1, dt * 1.3);
      if (!reduce) {
        st.time += dt; st.spin += tg.spinV * dt;
        st.flow += dt * (m === "layer" ? 1.3 * KL : 0); st.sweep += dt * (m === "layer" ? 1.6 * KL : 0); st.shim += dt * (m === "layer" ? 5 * KL : 0.4);
      }
      pinta();
    };
    pinta();   // primer cuadro ya, sin esperar al rAF (que no corre con la pestaña oculta)
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, en, isMobile]);

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
  const mitad = (m, cls, label) => (
    <button className={`bhf-half ${cls}`} aria-label={label}
      onMouseEnter={() => { if (!isMobile) setW(m); }}
      // El foco por toque no cuenta: solo el del teclado elige.
      onFocus={(e) => { if (e.target.matches(":focus-visible")) setW(m); }}
      onBlur={() => setW("")}
      onClick={(e) => tocar(e, m)} />
  );

  return (
    <div className={`bhf${isMobile ? " is-mobile" : ""}`} data-w={w}
      onClick={(e) => { if (isMobile && !e.target.closest(".bhf-half, .bhf-w")) setW(""); }}>
      <span className="bhf-esq bhf-tl"><i />Bass</span>
      <span className="bhf-esq bhf-tr">Layer<i /></span>

      {/* Fuera de la ficha (y de su nombre), reposo. */}
      <div className="bhf-mk-wrap" onMouseLeave={() => { if (!isMobile) setW(""); }}>
        <div className="bhf-mk" ref={mkRef} aria-hidden="true" />
        <div className="bhf-hit">
          {mitad("bass", "b", t("home.bassAria"))}
          {mitad("layer", "l", t("home.layerAria"))}
        </div>
        {OP && (
          <div className={`bhf-nm bhf-nm-${OP}`} aria-hidden="true">
            <button className="bhf-w b" tabIndex={-1} onMouseEnter={() => { if (!isMobile) setW("bass"); }} onClick={(e) => tocar(e, "bass")}>
              <span className="w">Bass</span><span className="go">{t("home.fichaGo")}</span>
            </button>
            <button className="bhf-w l" tabIndex={-1} onMouseEnter={() => { if (!isMobile) setW("layer"); }} onClick={(e) => tocar(e, "layer")}>
              <span className="w">LAYER</span><span className="go">{t("home.fichaGo")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

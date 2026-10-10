import { useEffect, useMemo, useRef, useState } from "react";
import { ficha, objetivo, setPrecio, resetMetricas, btc7, ESTADO_INICIAL, KL } from "../brand/ficha";

/* ══════════════════════════════════════════════════════════════
   HomeFicha — el home con la ficha de la marca (ronda 19). PROTOTIPO,
   solo con ?home=a|b|c; sin el parámetro el sitio sigue con HomeFusion.
   A · Portada: la ficha sola, con el nombre adentro (como en la ronda 19).
   B · Nombre debajo: la ficha y, debajo, "Bass LAYER" grande como selector.
   C · Con el pulso: la portada A + un dato vivo de cada mundo en sus esquinas.
   Elegir: pasar por cada mitad de la ficha (o enfocarla con el teclado);
   en el celular, el primer toque muestra el mundo y el segundo entra.
   ══════════════════════════════════════════════════════════════ */

export default function HomeFicha({ variante = "a", events = [], prices = [], t, locale, isMobile, active = true, onEnter }) {
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

  // ── Animación: la ficha se redibuja por cuadro solo mientras el home está a la vista.
  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const st = { ...ESTADO_INICIAL };
    let prev = performance.now(), raf = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (!document.hidden && mkRef.current) {
        const m = wRef.current, tg = objetivo(m, reduce ? 0 : Math.sin(st.time * 0.55));
        for (const k of ["rise", "speed", "gain", "dimL", "dimB", "L", "B", "grow"]) st[k] += (tg[k] - st[k]) * Math.min(1, dt * 1.3);
        if (!reduce) {
          st.time += dt; st.spin += tg.spinV * dt;
          st.flow += dt * (m === "layer" ? 1.3 * KL : 0); st.sweep += dt * (m === "layer" ? 1.6 * KL : 0); st.shim += dt * (m === "layer" ? 5 * KL : 0.4);
        }
        mkRef.current.innerHTML = ficha(st, { conNombre: variante !== "b", en });
      }
      raf = requestAnimationFrame(frame);
    };
    // Primer cuadro ya, sin esperar al rAF (que no corre con la pestaña oculta): nunca queda vacío.
    if (mkRef.current) mkRef.current.innerHTML = ficha(st, { conNombre: variante !== "b", en });
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, variante, en]);

  // ── Elegir y entrar.
  const panel = (m) => (m === "bass" ? 0 : 1);
  const tocar = (e, m) => {
    // Celular: el primer toque muestra el mundo, el segundo entra.
    if (isMobile && wRef.current !== m) { setW(m); return; }
    onEnter(e, panel(m));
  };
  const elegir = (m) => { if (!isMobile) setW(m); };

  const n = (events || []).length;
  const precio = btc ? "$" + Number(btc.usd ?? btc.price).toLocaleString(en ? "en-US" : "es", { maximumFractionDigits: 0 }) : null;
  const cambio = btc7();
  const fmtCambio = cambio == null ? "" : `${cambio >= 0 ? "+" : "−"}${Math.abs(cambio).toFixed(1).replace(".", en ? "." : ",")}% · 7 d`;

  const mitades = (
    <div className="bhf-hit">
      <button className="bhf-half b" aria-label={t("home.bassAria")}
        onMouseEnter={() => elegir("bass")} onFocus={(e) => { if (e.target.matches(":focus-visible")) setW("bass"); }} onBlur={() => setW("")}
        onClick={(e) => tocar(e, "bass")} />
      <button className="bhf-half l" aria-label={t("home.layerAria")}
        onMouseEnter={() => elegir("layer")} onFocus={(e) => { if (e.target.matches(":focus-visible")) setW("layer"); }} onBlur={() => setW("")}
        onClick={(e) => tocar(e, "layer")} />
    </div>
  );

  return (
    <div className={`bhf bhf-${variante}${isMobile ? " is-mobile" : ""}`} data-w={w}
      onMouseLeave={() => { if (!isMobile) setW(""); }}
      onClick={(e) => { if (isMobile && !e.target.closest(".bhf-half, .bhf-wm button")) setW(""); }}>
      <span className="bhf-esq bhf-tl"><i />{isMobile ? "Bass" : `Bass · ${t("home.bass")}`}
        {variante === "c" && <em>{n ? `${n} ${n === 1 ? t("home.evento") : t("home.eventos")}${isMobile ? "" : " " + t("home.enAgenda")}` : ""}</em>}</span>
      <span className="bhf-esq bhf-tr">{isMobile ? "Layer" : `${t("home.blockchain")} · Layer`}<i />
        {variante === "c" && precio && <em>BTC {precio}{fmtCambio && !isMobile ? ` · ${fmtCambio}` : ""}</em>}</span>

      <div className="bhf-center">
        <div className="bhf-mk-wrap">
          <div className="bhf-mk" ref={mkRef} aria-hidden="true" />
          {mitades}
        </div>
        {variante === "b" && (
          <div className="bhf-wm">
            <button className="b" onMouseEnter={() => elegir("bass")} onClick={(e) => tocar(e, "bass")} tabIndex={-1}>
              <span className="w">Bass</span><span className="go">{en ? "The night" : "La noche"} · {en ? "enter" : "entrar"} →</span>
            </button>
            <button className="l" onMouseEnter={() => elegir("layer")} onClick={(e) => tocar(e, "layer")} tabIndex={-1}>
              <span className="w">LAYER</span><span className="go">{fmtCambio ? `BTC ${fmtCambio} · ` : ""}{en ? "enter" : "entrar"} →</span>
            </button>
          </div>
        )}
      </div>

      <span className="bhf-hint">{isMobile
        ? (en ? "Tap a world to see it · tap again to enter" : "Tocá un mundo para verlo · tocá de nuevo para entrar")
        : (en ? "The record is Bass, the market is Layer" : "El vinilo es Bass, el mercado es Layer")}</span>
    </div>
  );
}

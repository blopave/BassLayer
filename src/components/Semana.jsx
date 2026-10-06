import { useEffect, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { api } from "../utils/api";
import { BlThumb } from "./BlThumb";
import { formatPct as pct } from "../utils/format";
import { dismissCurtain } from "../utils/curtain";

// La semana (oct 2026, Pablo eligió la "Edición"): el resumen semanal en un
// link fijo, /semana. Lo que viene en la noche de Buenos Aires (las fiestas de
// lunes a domingo) y lo que hizo el mercado en los últimos 7 días. Se renueva
// cada lunes; los datos salen de /api/semana (lib/semana.js).

const usd = (v) => (v >= 100 ? Math.round(v).toLocaleString("es-AR") : v.toLocaleString("es-AR", { maximumFractionDigits: 2 }));

function Spark({ serie, color, h = 60, w = 300 }) {
  const lo = Math.min(...serie), hi = Math.max(...serie);
  const pts = serie.map((v, i) => `${((i / (serie.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - lo) / ((hi - lo) || 1)) * (h - 8)).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
}

export function Semana() {
  const { t, locale } = useLocale();
  const [S, setS] = useState(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { dismissCurtain(); api.semana().then(setS).catch(() => setError(true)); }, []);
  const dfmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
  const fd = (iso) => dfmt.format(new Date(`${iso}T12:00:00Z`)).replace(/\./g, "");
  const share = async () => {
    const url = "https://basslayer.io/semana";
    try {
      if (navigator.share) await navigator.share({ title: `BassLayer · ${t("semana.title")}`, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* cancelado */ }
  };

  return (
    <div className="bl-sem">
      <div className="bl-sem-wrap">
        <header className="bl-sem-mast">
          <a className="bl-sem-brand" href="/" aria-label={t("semana.back")}>Bass<span>Layer</span></a>
          {S && <span className="bl-sem-k">{t("semana.title")} · Nº {S.semana.numero} · {fd(S.semana.desde)} → {fd(S.semana.hasta)}</span>}
        </header>
        {error && <p className="bl-sem-sub">{t("semana.error")}</p>}
        {!S && !error && <p className="bl-sem-k" aria-busy="true">…</p>}
        {S && (() => {
          const N = S.noche, M = S.mercado, B = M.btc;
          const max = Math.max(1, ...N.porDia.map((d) => d.fiestas));
          return (
            <>
              <h1 className="bl-sem-h1"><span className="c">{t("semana.parties", { n: N.fiestas })}</span>{B && <> {t("semana.andBtc")} <span className="y">{pct(B.cambio7d)}</span></>}</h1>
              <p className="bl-sem-sub">{t("semana.sub")}</p>

              <section className="bl-sem-sec">
                <h2 className="bl-sem-h c">{t("semana.days")}</h2>
                <div className="bl-sem-dias">
                  {N.porDia.map((d) => (
                    <div key={d.fecha} className={`bl-sem-dia${d.fiestas ? "" : " is-empty"}${d.fiestas === max ? " is-hot" : ""}`}>
                      <span className="n">{d.fiestas}</span>
                      <span className="bar" style={{ height: `${8 + (d.fiestas / max) * 90}px` }} />
                      <span className="d">{new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-AR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d.fecha}T12:00:00Z`)).replace(".", "")}</span>
                    </div>
                  ))}
                </div>
              </section>

              {N.finde.length > 0 && (
                <section className="bl-sem-sec">
                  <h2 className="bl-sem-h c">{t("semana.finde")}</h2>
                  <div className="bl-sem-picks">
                    {N.finde.map((e) => (
                      <div className="bl-sem-pick" key={`${e.nombre}-${e.dia}`}>
                        <div className="bl-sem-flyer"><BlThumb image={e.imagen} artistImage={e.imagenArtista} poster={{ text: e.artistas[0] || e.nombre, family: e.familia }} width={200} /></div>
                        <div className="nm">{e.nombre}</div>
                        <div className="mt">{e.dia} {e.mes}{e.hora ? ` · ${e.hora}` : ""} · {e.venue}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {N.gira.length > 0 && (
                <section className="bl-sem-sec">
                  <h2 className="bl-sem-h c">{t("semana.tour")}</h2>
                  <div className="bl-sem-rows">
                    {N.gira.map((g) => (
                      <div className="bl-sem-row" key={g.artista}>
                        <span className="a">{g.evento.dia} {g.evento.mes}</span>
                        <span className="b">{g.artista}<small>{g.evento.venue}</small></span>
                        <span className="c">{t("semana.tourBefore", { cities: g.ciudades.join(" · ") })}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {N.festivales.length > 0 && (
                <section className="bl-sem-sec">
                  <h2 className="bl-sem-h c">{t("semana.fests")}</h2>
                  <div className="bl-sem-rows">
                    {N.festivales.map((f) => (
                      <div className="bl-sem-row" key={f.slug}><span className="a">{fd(f.desde)}</span><span className="b">{f.nombre}<small>{f.ciudad}</small></span><span className="c" /></div>
                    ))}
                  </div>
                </section>
              )}

              {N.salas.length > 0 && (
                <section className="bl-sem-sec">
                  <h2 className="bl-sem-h c">{t("semana.salas")}</h2>
                  <div className="bl-sem-rows">
                    {N.salas.map((s) => (
                      <div className="bl-sem-row" key={`${s.titulo}-${s.fecha}`}><span className="a">{fd(s.fecha)}</span><span className="b">{s.titulo}<small>{s.sala}{s.hora ? ` · ${s.hora}` : ""}</small></span><span className="c" /></div>
                    ))}
                  </div>
                </section>
              )}

              {M.activos.length > 0 && (
                <section className="bl-sem-sec">
                  <h2 className="bl-sem-h y">{t("semana.market")}</h2>
                  {B && (
                    <div className="bl-sem-btc">
                      <div><div className="bl-sem-k y">{t("semana.btc7")}</div><div className="v">US$ {usd(B.usd)}</div><div className={`p ${B.cambio7d >= 0 ? "up" : "down"}`}>{pct(B.cambio7d)}</div></div>
                      <Spark serie={B.serie} color="var(--bl-accent-layer)" w={600} h={120} />
                    </div>
                  )}
                  <div className="bl-sem-acts">
                    {M.activos.filter((a) => a.sym !== "BTC").map((a) => (
                      <div className="bl-sem-act" key={a.sym}>
                        <div className="h"><span>{a.sym}</span><span className={a.cambio7d >= 0 ? "up" : "down"}>{pct(a.cambio7d)}</span></div>
                        <Spark serie={a.serie} color={a.cambio7d >= 0 ? "var(--bl-up)" : "var(--bl-down)"} h={44} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {M.eventos.length > 0 && (
                <section className="bl-sem-sec">
                  <h2 className="bl-sem-h y">{t("semana.crypto")}</h2>
                  <div className="bl-sem-rows">
                    {M.eventos.map((e) => (
                      <div className="bl-sem-row" key={`${e.titulo}-${e.fecha}`}><span className="a">{fd(e.fecha)}</span><span className="b">{e.titulo}<small>{e.lugar}</small></span><span className="c">{e.enBA ? t("semana.inBA") : ""}</span></div>
                    ))}
                  </div>
                </section>
              )}

              <footer className="bl-sem-foot">
                <a className="bl-sem-btn is-primary" href="/eventos/este-finde">{t("semana.toAgenda")}</a>
                <a className="bl-sem-btn" href="webcal://basslayer.io/finde.ics">{t("semana.toCal")}</a>
                <button type="button" className="bl-sem-btn" onClick={share}>{copied ? t("semana.copied") : t("semana.share")}</button>
              </footer>
            </>
          );
        })()}
      </div>
    </div>
  );
}

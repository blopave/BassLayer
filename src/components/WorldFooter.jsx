import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { getEventDate } from "../i18n/strings";
import { api, shared } from "../utils/api";

// Colofón de cada mundo (oct 2026, Pablo: "que esté a la altura del resto").
// Reemplaza al "> about_basslayer" de terminal, que quedó de otra época del
// sitio. Dice qué es el mundo, de dónde salen sus datos (las fuentes reales,
// leídas de lo que se está mostrando — nada inventado) y cruza al otro mundo:
// desde Bass, Layer con la semana de Bitcoin; desde Layer, Bass con las
// fiestas de los próximos días. Es el puente Bass ↔ Layer. Abajo deja aire
// para el botón flotante de mobile.

const EVENT_SOURCES = { ra: "Resident Advisor", buenosaliens: "Buenos Aliens", quehacemos: "QuéHacemos" };

// Las fuentes que más aportan, por cantidad, sin repetir.
const topSources = (items, label = (x) => x, n = 4) => {
  const count = new Map();
  for (const it of items) { const k = label(it); if (k) count.set(k, (count.get(k) || 0) + 1); }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
};

// Mini curva de Bitcoin (7 días) para cruzar a Layer.
function Spark({ points }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), W = 120, H = 40;
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / (max - min || 1)) * (H - 6)).toFixed(1)}`).join(" ");
  return <svg className="wf-viz" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true"><path d={d} /></svg>;
}

// Mini onda de Bass (fiestas por día, próximas dos semanas) para cruzar a Bass.
function Wave({ perDay }) {
  const max = Math.max(1, ...perDay), W = 120, H = 40, step = W / perDay.length;
  return (
    <svg className="wf-viz" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {perDay.map((v, i) => { const h = 2 + (v / max) * (H / 2 - 3); return <line key={i} x1={i * step + step / 2} x2={i * step + step / 2} y1={H / 2 - h} y2={H / 2 + h} />; })}
    </svg>
  );
}

export function WorldFooter({ world, events = [], news = [], prices, onCross, onAbout }) {
  const { t, locale } = useLocale();
  const bass = world === "bass";
  const [bassNews, setBassNews] = useState([]);
  useEffect(() => {
    if (!bass) return undefined;
    let on = true;
    shared("bassNews", api.bassNews).then((d) => on && setBassNews(Array.isArray(d) ? d : [])).catch(() => {});
    return () => { on = false; };
  }, [bass]);

  const sources = useMemo(() => (bass
    ? [...topSources(events, (e) => EVENT_SOURCES[e.source], 3), ...topSources(bassNews, (n) => n.source, 3)]
    : topSources(news, (n) => n.source, 5)), [bass, events, bassNews, news]);

  // Lo que muestra el cruce: desde Bass, Bitcoin hoy; desde Layer, las fiestas.
  const cross = useMemo(() => {
    if (bass) {
      const btc = (prices || []).find((p) => p.sym === "BTC");
      const usd = btc ? new Intl.NumberFormat(locale === "es" ? "es-AR" : "en-US", { maximumFractionDigits: 0 }).format(btc.usd) : null;
      const chg = btc && typeof btc.change === "number" ? `${btc.change >= 0 ? "+" : ""}${btc.change.toLocaleString(locale === "es" ? "es-AR" : "en-US", { maximumFractionDigits: 1 })} %` : null;
      return { name: "Layer", meta: usd ? `BTC $${usd}${chg ? ` · ${chg}` : ""}` : t("home.blockchain"), viz: <Spark points={btc?.sparkline} /> };
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const perDay = Array(14).fill(0);
    for (const e of events) {
      if (e.area !== "amba") continue;
      const d = getEventDate(e);
      if (!d) continue;
      const o = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 864e5);
      if (o >= 0 && o < 14) perDay[o]++;
    }
    return { name: "Bass", meta: t("footer.todayParties", { n: perDay[0] }), viz: <Wave perDay={perDay} /> };
  }, [bass, prices, events, locale, t]);

  return (
    <footer className={`bl-wfoot is-${world}`}>
      <div className="wf-main">
        <div className="wf-brand">
          <span className="wf-mark">{bass ? "Bass" : "Layer"}</span>
          <p className="wf-tag">{bass ? `${t("home.bass")} · ${t("home.city")}` : t("home.blockchain")}</p>
          {sources.length > 0 && (
            <div className="wf-sources"><span className="wf-k">{t("footer.sources")}</span><ul>{sources.map((x) => <li key={x}>{x}</li>)}</ul></div>
          )}
        </div>
        <button type="button" className={`wf-cross is-to-${bass ? "layer" : "bass"}`} onClick={onCross}>
          <span className="wf-cross-txt">
            <span className="wf-k">{t("footer.cross")}</span>
            <span className="wf-cross-name">{cross.name}<span className="wf-arrow" aria-hidden="true">→</span></span>
            <span className="wf-cross-meta">{cross.meta}</span>
          </span>
          {cross.viz}
        </button>
      </div>
      <div className="wf-meta">
        <button type="button" className="wf-about" onClick={onAbout}>{t("footer.about")}</button>
        <span>BassLayer · {t("home.city")} · {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}

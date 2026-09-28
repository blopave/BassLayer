import { useEffect, useState } from "react";
import { api, shared } from "../utils/api";
import { useLocale } from "../hooks/useLocale";

// Portada de Layer: una tarjeta por sección con su dato vivo, para ver de un
// vistazo qué hay en cada una y entrar (grilla 2×3 en mobile, una fila en
// desktop). Elegida por Pablo entre 4 alternativas (sept 2026). Si un dato no
// llega, la tarjeta muestra solo el nombre: nunca un número inventado.

const ICONS = {
  eventos: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  ciclos: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  etfs: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  acciones: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  finanzas: <><path d="M4 20h16" /><path d="M6 20V9M11 20V5M16 20v-8" /></>,
  historia: <><path d="M4 18l4-5 3 2 5-7 4 3" /><path d="M4 21h16" /><circle cx="16" cy="8" r="1.3" /></>,
  predicciones: <><path d="M4 19V5" /><path d="M4 15l5-5 4 3 7-7" /><circle cx="20" cy="6" r="1.2" /></>,
};
const ORDER = [["eventos", "section.events"], ["ciclos", "section.cycles"], ["historia", "section.history"], ["etfs", "section.etfs"], ["acciones", "section.stocks"], ["finanzas", "section.finance"], ["predicciones", "section.predictions"]];

const Pct = ({ v }) => <span className={v >= 0 ? "up" : "down"}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
const list = (d) => (Array.isArray(d) ? d : d?.items || d?.data || []);

function useLayerSnapshot() {
  const [s, setS] = useState({});
  useEffect(() => {
    let alive = true;
    const set = (k) => (v) => alive && setS((p) => ({ ...p, [k]: v }));
    shared("markets", api.markets).then(set("markets")).catch(() => {});
    shared("btcCycles", api.btcCycles).then(set("cycles")).catch(() => {});
    shared("cryptoEvents", api.cryptoEvents).then(set("events")).catch(() => {});
    shared("financeNews", api.financeNews).then(set("finance")).catch(() => {});
    shared("predictions", api.predictionMarkets).then(set("predictions")).catch(() => {});
    return () => { alive = false; };
  }, []);
  return s;
}

// variant="grid": tarjetas (portada mobile). variant="index": lista vertical
// para la columna lateral de desktop, fija al scrollear, con Noticias arriba y
// la sección abierta marcada.
export function LayerDoors({ onGo, variant = "grid", active, newsCount }) {
  const { t, locale } = useLocale();
  const s = useLayerSnapshot();
  const all = (s.markets?.groups || []).flatMap((g) => g.items || []);
  const sym = (x) => all.find((i) => i.symbol === x);
  const stocks = (s.markets?.groups || []).find((g) => g.kind === "stock")?.items || [];
  const mover = stocks.reduce((a, b) => (!a || Math.abs(b.changePct) > Math.abs(a.changePct) ? b : a), null);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = list(s.events).filter((e) => (e.date || "") >= today).sort((a, b) => a.date.localeCompare(b.date));
  const cur = s.cycles?.current;
  const phaseKey = cur?.phase ? `cycles.phase.${cur.phase}` : null;
  const phase = phaseKey && t(phaseKey) !== phaseKey ? t(phaseKey) : cur?.phaseLabel;
  const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short" });

  const content = {
    eventos: s.events && { v: <>{upcoming.length} <small>{t("doors.upcoming")}</small></>, sub: upcoming[0] && `${upcoming[0].title} · ${fmtDay(upcoming[0].date)}` },
    ciclos: cur && { v: <span className={cur.phase === "markdown" ? "down" : cur.phase === "markup" ? "up" : ""}>{cur.phase === "markdown" ? "▼ " : cur.phase === "markup" ? "▲ " : ""}{phase}</span>, sub: `${t("aside.confluence")} ${cur.confluence}/100` },
    etfs: sym("IBIT") && { v: <>IBIT <Pct v={sym("IBIT").changePct} /></>, sub: sym("QQQ") && <>QQQ <Pct v={sym("QQQ").changePct} /></> },
    acciones: mover && { v: <>{mover.symbol} <Pct v={mover.changePct} /></>, sub: sym("NVDA") && mover.symbol !== "NVDA" ? <>NVDA <Pct v={sym("NVDA").changePct} /></> : null },
    historia: s.cycles && { v: <>{(s.cycles.newsEvents || []).length} <small>{t("history.events")}</small></>, sub: t("history.doorSub") },
    finanzas: s.finance && { v: <>{list(s.finance).length} <small>{t("doors.notes")}</small></>, sub: t("doors.financeSub") },
    predicciones: s.predictions && (list(s.predictions).length
      ? { v: <>{list(s.predictions).length} <small>{t("doors.markets")}</small></>, sub: null }
      : { v: "—", sub: t("doors.noMarkets") }),
  };

  const NEWS_ICON = <><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 8h3v9a2 2 0 0 1-2 2" /><path d="M7 9h7M7 12h7M7 15h4" /></>;
  if (variant === "index") {
    const rows = [["noticias", "section.news", NEWS_ICON], ...ORDER.map(([k, l]) => [k, l, ICONS[k]])];
    return (
      <nav className="bl-idx" aria-label={t("aside.sections")}>
        <div className="bl-doors-lab"><span>{t("aside.sections")}</span><span>{t("doors.live")}</span></div>
        {rows.map(([key, label, icon]) => {
          const c = key === "noticias" ? { v: newsCount ? <>{newsCount}</> : null, sub: t("doors.newsSub") } : content[key];
          return (
            <button key={key} type="button" className={`bl-idx-row${active === key ? " is-on" : ""}`} onClick={() => onGo(key)} aria-current={active === key ? "page" : undefined}>
              <span className="bl-idx-ic"><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg></span>
              <span className="bl-idx-n">{t(label)}<small>{c?.sub || "\u00A0"}</small></span>
              <span className={`bl-idx-v${c ? "" : " is-loading"}`}>{c ? c.v : "\u00A0"}</span>
              <span className="bl-idx-ch" aria-hidden="true">›</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <section className="bl-doors" aria-label={t("aside.sections")}>
      <div className="bl-doors-lab"><span>{t("aside.sections")}</span><span>{t("doors.live")}</span></div>
      <div className="bl-doors-grid">
        {ORDER.map(([key, label]) => {
          const c = content[key];
          return (
            <button key={key} type="button" className="bl-door" onClick={() => onGo(key)}>
              <span className="bl-door-t">
                <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[key]}</svg>{t(label)}
              </span>
              <span className={`bl-door-v${c ? "" : " is-loading"}`}>{c ? c.v : "\u00A0"}</span>
              <span className="bl-door-s">{c?.sub || "\u00A0"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

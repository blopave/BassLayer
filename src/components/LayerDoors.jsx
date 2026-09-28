import { useLocale } from "../hooks/useLocale";
import { SECTION_LABEL, Pct, Phase, fmtDay, list, layerStats, useLayerData } from "../utils/layer";

// Índice de secciones de Layer para la columna lateral de desktop: fijo al
// scrollear, Noticias arriba, la sección abierta marcada y el dato vivo de
// cada una. Si un dato no llega, la fila muestra solo el nombre: nunca un
// número inventado.

const ICONS = {
  noticias: <><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 8h3v9a2 2 0 0 1-2 2" /><path d="M7 9h7M7 12h7M7 15h4" /></>,
  eventos: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  ciclos: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  etfs: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  acciones: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  finanzas: <><path d="M4 20h16" /><path d="M6 20V9M11 20V5M16 20v-8" /></>,
  historia: <><path d="M4 18l4-5 3 2 5-7 4 3" /><path d="M4 21h16" /><circle cx="16" cy="8" r="1.3" /></>,
  predicciones: <><path d="M4 19V5" /><path d="M4 15l5-5 4 3 7-7" /><circle cx="20" cy="6" r="1.2" /></>,
};
const ORDER = ["noticias", "eventos", "ciclos", "historia", "etfs", "acciones", "finanzas", "predicciones"];

export function LayerDoors({ onGo, active, newsCount }) {
  const { t, locale } = useLocale();
  const s = useLayerData();
  const { sym, mover, upcoming, cur, phase, preds } = layerStats(s, t);
  const P = (x) => <Pct v={x.changePct} locale={locale} />;

  const content = {
    noticias: { v: newsCount ? <>{newsCount}</> : null, sub: t("doors.newsSub") },
    eventos: s.events && { v: <>{upcoming.length} <small>{t("doors.upcoming")}</small></>, sub: upcoming[0] && `${upcoming[0].title} · ${fmtDay(upcoming[0].date, locale)}` },
    ciclos: cur && { v: <Phase cur={cur} label={phase} />, sub: `${t("aside.confluence")} ${cur.confluence}/100` },
    etfs: sym("IBIT") && { v: <>IBIT {P(sym("IBIT"))}</>, sub: sym("QQQ") && <>QQQ {P(sym("QQQ"))}</> },
    acciones: mover && { v: <>{mover.symbol} {P(mover)}</>, sub: sym("NVDA") && mover.symbol !== "NVDA" ? <>NVDA {P(sym("NVDA"))}</> : null },
    historia: s.cycles && { v: <>{(s.cycles.newsEvents || []).length} <small>{t("history.events")}</small></>, sub: t("history.doorSub") },
    finanzas: s.finance && { v: <>{list(s.finance).length} <small>{t("doors.notes")}</small></>, sub: t("doors.financeSub") },
    predicciones: s.predictions && (preds.length
      ? { v: <>{preds.length} <small>{t("doors.markets")}</small></>, sub: null }
      : { v: "—", sub: t("doors.noMarkets") }),
  };

  return (
    <nav className="bl-idx" aria-label={t("aside.sections")}>
      <div className="bl-doors-lab"><span>{t("aside.sections")}</span><span>{t("doors.live")}</span></div>
      {ORDER.map((key) => {
        const c = content[key];
        return (
          <button key={key} type="button" className={`bl-idx-row${active === key ? " is-on" : ""}`} onClick={() => onGo(key)} aria-current={active === key ? "page" : undefined}>
            <span className="bl-idx-ic"><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[key]}</svg></span>
            <span className="bl-idx-n">{t(SECTION_LABEL[key])}<small>{c?.sub || "\u00A0"}</small></span>
            <span className={`bl-idx-v${c ? "" : " is-loading"}`}>{c ? c.v : "\u00A0"}</span>
            <span className="bl-idx-ch" aria-hidden="true">›</span>
          </button>
        );
      })}
    </nav>
  );
}

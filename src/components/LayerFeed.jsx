import { useEffect, useRef, useState, Suspense } from "react";
import { CryptoBATimeline } from "./CryptoBATimeline";
import { CryptoIRL } from "./CryptoIRL";
import { PredictionMarkets } from "./PredictionMarkets";
import { FinanceNews } from "./FinanceNews";
import { MarketList } from "./MarketList";
import { LayerCurve } from "./LayerCurve";
import { BtcHistory } from "./BtcHistory";
import { lazyNamed } from "../utils/lazy";
import { LayerNotas } from "./LayerNotas";
import { useLocale } from "../hooks/useLocale";

// El dashboard de ciclos (charts SVG + data horneada) solo carga al abrir su
// sección — es el módulo más pesado de Layer y la mayoría no llega hasta ahí.
const BtcCycles = lazyNamed(() => import("./BtcCycles"), "BtcCycles");

// Pestañas en el orden de la curva (oct 2026): lo que se ve en la portada
// es lo que se recorre adentro.
const SECTIONS = [
  ["noticias", "section.news"], ["finanzas", "section.finance"], ["acciones", "section.stocks"], ["etfs", "section.etfs"],
  ["ciclos", "section.cycles"], ["predicciones", "section.predictions"], ["eventos", "section.events"], ["historia", "section.history"],
];
// Los temas cripto en el orden en que se ofrecen como filtro.
const NEWS_ORDER = ["BTC", "ETH", "SOL", "XRP", "DeFi", "L2", "Stable", "Reg", "AI", "NFT", "Mining", "Crypto"];

export function LayerFeed({ news, loading, error, onRetry, filter, onFilter, onSelectNews }) {
  const { t } = useLocale();
  const [section, setSection] = useState("portada"); // portada = la curva // crypto: noticias|eventos|predicciones|ciclos · mercados: finanzas|etfs|acciones

  // Desde la curva: cambia de sección y lleva la vista a la barra de sección
  // (flecha para volver + pestañas).
  const backRef = useRef(null);
  const goSection = (key) => {
    setSection(key);
    requestAnimationFrame(() => backRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  };

  // Pestañas más grandes (30-sep): en mobile no entran todas; la activa se
  // centra sola para que siempre se vea dónde estás.
  // Corrida, la fila se funde también a la izquierda (data-corrida).
  const tabsRef = useRef(null);
  useEffect(() => {
    const nav = tabsRef.current, on = nav?.querySelector(".bl-layer-tab.active");
    if (!nav) return;
    if (on) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
    const marcar = () => nav.toggleAttribute("data-corrida", nav.scrollLeft > 4);
    marcar();
    nav.addEventListener("scroll", marcar, { passive: true });
    return () => nav.removeEventListener("scroll", marcar);
  }, [section]);

  // Portada: la curva de Bitcoin como mapa de secciones. Al entrar a una
  // sección se ve Layer como siempre, con "← Volver a la curva" arriba.
  if (section === "portada") {
    return <LayerCurve news={news} onEnter={goSection} />;
  }

  return (
    <>
      {/* Barra de sección: flecha para volver a la curva + pestañas en una fila.
          Al entrar desde la curva la vista arranca acá. */}
      <div className="bl-layer-bar" ref={backRef}>
        <button type="button" className="bl-layer-back" onClick={() => setSection("portada")} aria-label={t("curve.back")} title={t("curve.back")}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13 8H3m4-4L3 8l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <nav className="bl-layer-tabs" aria-label={t("aside.sections")} ref={tabsRef}>
          {SECTIONS.map(([key, labelKey]) => (
            <button
              key={key}
              type="button"
              className={`bl-layer-tab${section === key ? " active" : ""}`}
              aria-current={section === key ? "page" : undefined}
              onClick={() => setSection(key)}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </div>

      <div className="bl-layer-main">
      {/* Noticias section */}
      {section === "noticias" && (
        <div className="bl-layer-content">
          <h2 className="bl-sr-only">{t("section.news")}</h2>
          <LayerNotas items={news} loading={loading} error={error} onRetry={onRetry} onSelect={onSelectNews} order={NEWS_ORDER} ariaLabel={t("section.news")} filter={filter} onFilter={onFilter} />
        </div>
      )}

      {/* Finanzas: noticias financieras generales (macro, mercados, empresas) */}
      {section === "finanzas" && <FinanceNews onSelect={onSelectNews} />}

      {/* ETFs y Acciones — cotizaciones agrupadas por lo que son */}
      {section === "etfs" && <MarketList kind="etf" titleKey="markets.etfs.title" />}
      {section === "acciones" && <MarketList kind="stock" titleKey="markets.stocks.title" />}

      {/* Eventos section */}
      {section === "eventos" && (
        <div className="bl-layer-content">
          <h2 className="bl-sr-only">{t("section.events")}</h2>
          <CryptoIRL />
        </div>
      )}

      {/* Predicciones section */}
      {section === "predicciones" && (
        <div className="bl-layer-content">
          <h2 className="bl-sr-only">{t("section.predictions")}</h2>
          <PredictionMarkets />
        </div>
      )}

      {/* Ciclos section — POC dashboard de ciclos de halving BTC */}
      {section === "historia" && (
        <div className="bl-layer-content">
          <BtcHistory />
          {/* La memoria del ecosistema local vive con la historia. */}
          <div className="bl-layer-tools">
            <CryptoBATimeline />
          </div>
        </div>
      )}

      {section === "ciclos" && (
        <div className="bl-layer-content">
          <h2 className="bl-sr-only">{t("section.cycles")}</h2>
          <Suspense fallback={<div className="bl-empty">{t("common.loading")}</div>}>
            <BtcCycles />
          </Suspense>
        </div>
      )}
      </div>
    </>
  );
}

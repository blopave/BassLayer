import { useRef, useState, Suspense } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";
import { CryptoBATimeline } from "./CryptoBATimeline";
import { CryptoIRL } from "./CryptoIRL";
import { PredictionMarkets } from "./PredictionMarkets";
import { FinanceNews } from "./FinanceNews";
import { MarketList } from "./MarketList";
import { MarketPulse } from "./MarketPulse";
import { LayerCurve } from "./LayerCurve";
import { BtcHistory } from "./BtcHistory";
import { lazyNamed } from "../utils/lazy";
import { BlThumb } from "./BlThumb";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";

// El dashboard de ciclos (charts SVG + data horneada) solo carga al abrir su
// sección — es el módulo más pesado de Layer y la mayoría no llega hasta ahí.
const BtcCycles = lazyNamed(() => import("./BtcCycles"), "BtcCycles");

// Orden del toggle: crypto primero, mercados tradicionales después (identidad Layer).
const SECTIONS = [
  ["noticias", "section.news"], ["eventos", "section.events"], ["predicciones", "section.predictions"],
  ["ciclos", "section.cycles"], ["historia", "section.history"], ["finanzas", "section.finance"], ["etfs", "section.etfs"], ["acciones", "section.stocks"],
];

function LayerNewsItem({ item, idx, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPill = !!(item.tag && item.image && !imgFailed);
  return (
    <article
      className="bl-layer-news-item bl-reveal"
      onClick={() => onSelect?.(item)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect?.(item))}
      tabIndex={0}
      role="button"
      aria-label={`${item.title}${item.tag ? ` — ${item.tag}` : ""}`}
      style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <BlThumb image={item.image} onImgFail={() => setImgFailed(true)} />
      <div className="bl-layer-news-body">
        <h3 className="bl-layer-news-title">{item.title}</h3>
        {showPill && <span className="bl-layer-news-tag-pill">{item.tag}</span>}
      </div>
    </article>
  );
}

// Sin señal, en la voz de la terminal y con salida: un tag vacío ofrece volver
// al feed completo; un feed vacío ofrece reintentar. Antes era una línea
// perdida en un panel enorme, sin nada para hacer.
function LayerEmptySignal({ filter, hasAnyNews, onFilter, onRetry }) {
  const { t } = useLocale();
  const tagLabel = filter === "All" ? t("common.all") : filter;
  return (
    <div className="bl-layer-empty" role="status">
      {/* Cromo de terminal, no contenido: el mensaje real es la línea de abajo */}
      <div aria-hidden="true">
        <span className="bl-terminal-prompt-user">bl@layer</span>
        <span className="bl-terminal-prompt-sep"> : </span>
        <span className="bl-terminal-prompt-path">~/news</span>
        <span className="bl-terminal-prompt-cmd"> $ fetch --tag={tagLabel.toLowerCase()}</span>
      </div>
      <div className="bl-layer-empty-line">
        &gt; {t("feed.empty.news")} &ldquo;{tagLabel}&rdquo;. {t("feed.empty.newsHint")}
        <span className="bl-terminal-prompt-cursor" aria-hidden="true" />
      </div>
      {hasAnyNews ? (
        <button type="button" className="bl-layer-empty-btn" onClick={() => onFilter("All")}>
          {t("feed.empty.viewAll")}
        </button>
      ) : (
        <button type="button" className="bl-layer-empty-btn" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function LayerFeed({ news, loading, error, onRetry, filter, onFilter, onSelectNews }) {
  const { t } = useLocale();
  const tags = ["All", "BTC", "ETH", "SOL", "DeFi", "L2", "Reg", "AI", "NFT", "Stable", "Crypto"];
  const [section, setSection] = useState("portada"); // portada = la curva // crypto: noticias|eventos|predicciones|ciclos · mercados: finanzas|etfs|acciones

  const filtered = filter === "All" ? news : news.filter((n) => n.tag === filter);

  const listRef = useScrollReveal(loading, section);
  // Desde la curva: cambia de sección y lleva la vista a la barra de sección
  // (flecha para volver + pestañas).
  const backRef = useRef(null);
  const goSection = (key) => {
    setSection(key);
    requestAnimationFrame(() => backRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  };

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
        <nav className="bl-layer-tabs" aria-label={t("aside.sections")}>
          {SECTIONS.map(([key, labelKey]) => (
            <button
              key={key}
              type="button"
              className={`bl-layer-tab${section === key ? " active" : ""}`}
              aria-current={section === key ? "page" : undefined}
              onClick={() => setSection(key)}
            >
              {t(labelKey)}
              {key === "noticias" && news.length > 0 && <span className="bl-layer-tab-cnt">{news.length}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Desktop: contenido a la izquierda, pulso del mercado a la derecha.
          Mobile: el pulso va primero, como tira desplegable bajo las pestañas. */}
      <div className="bl-layer-grid">
      <div className="bl-layer-main">
      {/* Noticias section */}
      {section === "noticias" && (
        <div className="bl-layer-content">
          <h2 className="bl-layer-h">{t("section.news")}</h2>
          <FilterBar items={tags} active={filter} onChange={onFilter} className="layer-filters" />
          {loading ? <NewsSkeleton />
            : error ? <div className="bl-feed"><div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onRetry()}>{error}</div></div>
            : filtered.length === 0 ? (
              <LayerEmptySignal filter={filter} hasAnyNews={news.length > 0} onFilter={onFilter} onRetry={onRetry} />
            )
            : <div className="bl-layer-news-list" role="region" aria-label={t("section.news")} ref={listRef}>
                {filtered.map((item, idx) => (
                  <LayerNewsItem
                    key={`${item.source}-${(item.title || "").slice(0,40)}-${idx}`}
                    item={item}
                    idx={idx}
                    onSelect={onSelectNews}
                  />
                ))}
                <div className="bl-end-of-feed">
                  <span aria-hidden="true">{t("feed.endOfFeed")}</span>
                  <span className="bl-end-cursor" aria-hidden="true" />
                </div>
              </div>}
        </div>
      )}

      {/* Finanzas section — noticias financieras generales (macro/mercados/empresas) */}
      {section === "finanzas" && <FinanceNews />}

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
      <aside className="bl-layer-aside"><MarketPulse /></aside>
      </div>
    </>
  );
}

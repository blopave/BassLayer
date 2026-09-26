import { useState, Suspense } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";
import { CryptoDashboard } from "./CryptoDashboard";
import { CryptoBATimeline } from "./CryptoBATimeline";
import { DolarCripto } from "./DolarCripto";
import { CryptoIRL } from "./CryptoIRL";
import { PredictionMarkets } from "./PredictionMarkets";
import { FinanceNews } from "./FinanceNews";
import { MarketList } from "./MarketList";
import { LayerAside } from "./LayerAside";
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
  ["ciclos", "section.cycles"], ["finanzas", "section.finance"], ["etfs", "section.etfs"], ["acciones", "section.stocks"],
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
  const [section, setSection] = useState("noticias"); // crypto: noticias|eventos|predicciones|ciclos · mercados: finanzas|etfs|acciones

  const filtered = filter === "All" ? news : news.filter((n) => n.tag === filter);

  const listRef = useScrollReveal(loading, section);

  return (
    <>
      <CryptoDashboard />
      <DolarCripto />
      <div className="bl-layer-tools">
        <CryptoBATimeline />
      </div>

      {/* Secciones como tabs: una línea, Noticias abierta por defecto. */}
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

      {/* Desktop: contenido a la izquierda, mercado y ciclo a la derecha. */}
      <div className="bl-layer-grid">
      <div className="bl-layer-main">
      {/* Noticias section */}
      {section === "noticias" && (
        <div className="bl-layer-content">
          <h2 className="bl-sr-only">{t("section.news")}</h2>
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

      {/* ETFs section — cotizaciones de ETFs (índices + Bitcoin) */}
      {section === "etfs" && (
        <MarketList
          kinds={["etf"]}
          titleKey="markets.etfs.title"
          subtitleKey="markets.etfs.subtitle"
        />
      )}

      {/* Acciones section — tech mega-caps + ADRs LATAM */}
      {section === "acciones" && (
        <MarketList
          kinds={["stock", "adr"]}
          titleKey="markets.stocks.title"
          labels={{ stock: "markets.group.tech", adr: "markets.group.latam" }}
        />
      )}

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
      {section === "ciclos" && (
        <div className="bl-layer-content">
          <h2 className="bl-sr-only">{t("section.cycles")}</h2>
          <Suspense fallback={<div className="bl-empty">{t("common.loading")}</div>}>
            <BtcCycles />
          </Suspense>
        </div>
      )}
      </div>
      <LayerAside onGo={setSection} />
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";
import { BlThumb } from "./BlThumb";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";
import { api } from "../utils/api";
import { TranslateToggle, useTranslatedTitle } from "./TranslatedTitle";

// Temas por contenido del server (detectFinanceTag) → labels vía i18n.
const FINANCE_TAGS = ["All", "argentina", "wallstreet", "companies", "world"];

// Titulares en inglés: traducidos y marcados (TranslatedTitle).
function FinanceNewsItem({ item, idx, tagLabel, es }) {
  const [imgFailed, setImgFailed] = useState(false);
  const tr = useTranslatedTitle(item, es), title = tr.title;
  const showPill = !!(item.tag && item.image && !imgFailed);
  // Link directo a la fuente (atribución + fair use): el titular lleva al medio.
  const open = () => item.url && window.open(item.url, "_blank", "noopener,noreferrer");
  return (
    <article
      className="bl-layer-news-item bl-reveal"
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
      tabIndex={0}
      role="button"
      aria-label={`${title} — ${item.source}`}
      style={{ cursor: "pointer", transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <BlThumb image={item.image} onImgFail={() => setImgFailed(true)} />
      <div className="bl-layer-news-body">
        <h3 className="bl-layer-news-title" lang={tr.lang}>{title}</h3>
        <div className="bl-finance-news-meta">
          <span className="bl-finance-news-source">{item.source}</span>
          {item.lang && item.lang !== (es ? "es" : "en") && !tr.translated && <span className="bl-finance-news-lang">{item.lang.toUpperCase()}</span>}
          {item.time && <span className="bl-finance-news-time">{item.time}</span>}
        </div>
        <TranslateToggle tr={tr} className="bl-finance-tr" />
        {showPill && <span className="bl-layer-news-tag-pill">{tagLabel}</span>}
      </div>
    </article>
  );
}

export function FinanceNews() {
  const { t, locale } = useLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("All");

  const load = () => {
    setLoading(true);
    setError(null);
    api.financeNews()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setError(t("finance.error")))
      .then(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === "All" ? items : items.filter((n) => n.tag === filter);
  const listRef = useScrollReveal(loading, filter);

  const tagLabels = useMemo(() => Object.fromEntries(
    FINANCE_TAGS.slice(1).map((tg) => [tg, t(`finance.tag.${tg}`)])
  ), [t]);
  // Solo ofrecer tags que hoy tienen items (evita filtros que devuelven vacío).
  const tags = useMemo(() => {
    const present = new Set(items.map((n) => n.tag));
    return FINANCE_TAGS.filter((tg) => tg === "All" || present.has(tg));
  }, [items]);

  return (
    <div className="bl-layer-content">
      <h2 className="bl-sr-only">{t("finance.title")}</h2>
      <FilterBar items={tags} active={filter} onChange={setFilter} labels={tagLabels} className="layer-filters" />
      {loading ? <NewsSkeleton />
        : error ? <div className="bl-feed"><div className="bl-error" onClick={load} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && load()}>{error}</div></div>
        : filtered.length === 0 ? <div className="bl-empty">{t("finance.empty")}</div>
        : <div className="bl-layer-news-list" role="region" aria-label={t("finance.title")} ref={listRef}>
            {filtered.map((item, idx) => (
              <FinanceNewsItem key={`${item.source_slug || item.source}-${(item.title || "").slice(0, 40)}-${idx}`} item={item} idx={idx} tagLabel={tagLabels[item.tag] || item.tag} es={locale === "es"} />
            ))}
          </div>}
    </div>
  );
}

import { useMemo, useState } from "react";
import { FilterBar } from "./FilterBar";
import { NewsSkeleton } from "./SkeletonLoader";
import { SectionHead } from "./SectionHead";
import { BlThumb } from "./BlThumb";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useLocale } from "../hooks/useLocale";
import { useTranslatedTitle } from "./TranslatedTitle";
import { haceCuanto } from "../utils/format";
import { notasPorDia } from "../utils/notas";

// Notas de Layer en filas (oct 2026, Pablo eligió "B · Filas"): cuándo y el
// medio en mono a la izquierda, el titular, la foto chica a la derecha. El
// mismo idioma que la Agenda — filtros de texto con conteo, apertura con el
// número, rótulos por día y un pie útil —, en el registro digital de Layer.
// Lo usan Noticias y Finanzas.

function LayerNota({ item, idx, tema, onSelect }) {
  const { t, locale } = useLocale();
  const tr = useTranslatedTitle(item, locale === "es");
  return (
    <article
      className="bl-lnota bl-reveal"
      onClick={() => onSelect(item)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(item))}
      tabIndex={0}
      role="button"
      aria-label={`${tr.title} — ${item.source}${tema ? `, ${tema}` : ""}`}
      style={{ transitionDelay: `${Math.min(idx * 0.04, 0.3)}s` }}
    >
      <div className="bl-lnota-when">
        {item.time && <span>{haceCuanto(item.time, t)}</span>}
        <span className="bl-lnota-src">{item.source}</span>
      </div>
      <div className="bl-lnota-body">
        <div className="bl-lnota-t" lang={tr.lang}>{tr.title}</div>
        {tema && <div className="bl-lnota-tag">{tema}</div>}
      </div>
      <BlThumb image={item.image} width={160} sizes="(max-width: 768px) 88px, 132px" poster={{ text: tema || item.source, seed: item.url || item.title, family: "layer" }} />
    </article>
  );
}

// order: los temas en el orden en que se ofrecen; los que no estén ahí van al
// final. Solo se ofrecen los que hoy tienen notas.
export function LayerNotas({ items, loading, error, onRetry, onSelect, order = [], ariaLabel, filter, onFilter }) {
  const { t, locale } = useLocale();
  const [own, setOwn] = useState("All");
  const tag = filter ?? own, setTag = onFilter ?? setOwn;
  const all = Array.isArray(items) ? items : [];
  const label = (x) => { const k = `newsTag.${x}`, v = t(k); return v === k ? x : v; };

  const { tags, counts, labels } = useMemo(() => {
    const c = {};
    for (const n of all) if (n.tag) c[n.tag] = (c[n.tag] || 0) + 1;
    const rank = (x) => (order.includes(x) ? order.indexOf(x) : order.length);
    const present = Object.keys(c).sort((a, b) => rank(a) - rank(b) || c[b] - c[a]);
    const tg = ["All", ...present];
    return { tags: tg, counts: { all: all.length, ...c }, labels: Object.fromEntries(tg.map((x) => [x, label(x)])) };
  }, [all, order, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = tag === "All" || !counts[tag] ? all : all.filter((n) => n.tag === tag);
  const dias = useMemo(() => notasPorDia(list, t, locale), [list, locale, t]);
  const listRef = useScrollReveal(loading, tag);

  // El pie dice de dónde sale todo y si los titulares se tradujeron.
  const fuentes = [...new Set(list.map((n) => n.source).filter(Boolean))];
  const traducidas = locale === "es" && list.some((n) => n.titleEs);

  if (loading) return <NewsSkeleton />;
  if (error) {
    return (
      <div className="bl-feed">
        <div className="bl-error" onClick={onRetry} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRetry())}>{error}</div>
      </div>
    );
  }
  if (!all.length) {
    return (
      <div className="bl-empty" role="status">
        {t("feed.empty.layerNews")}
        {onRetry && <button type="button" className="bl-empty-action" onClick={onRetry}>{t("common.retry")}</button>}
      </div>
    );
  }

  let idx = 0;
  return (
    <>
      {tags.length > 2 && <FilterBar items={tags} active={counts[tag] ? tag : "All"} onChange={setTag} className="layer-filters" counts={counts} labels={labels} />}
      <SectionHead n={list.length} word={t("feed.newsWord")} />
      <div className="bl-lnotas" role="region" aria-label={ariaLabel} ref={listRef}>
        {dias.map((d) => (
          <section key={d.key} className="bl-lnotas-dia">
            <h3 className="bl-day-header">
              <span className="bl-day-label">{d.label}</span>
              <span className="bl-day-date">{d.fecha}</span>
              <span className="bl-day-line" aria-hidden="true" />
            </h3>
            {d.items.map((item) => (
              <LayerNota key={`${item.source_slug || item.source}-${item.url || item.title}`} item={item} idx={idx++} tema={item.tag ? labels[item.tag] || label(item.tag) : ""} onSelect={onSelect} />
            ))}
          </section>
        ))}
      </div>
      <p className="bl-lpie">
        {t("news.sources")}: {fuentes.join(" · ")}
        {traducidas && <> · {t("news.autoTr")}</>}
      </p>
    </>
  );
}

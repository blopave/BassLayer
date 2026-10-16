import { useLocale } from "../hooks/useLocale";

// dots: un color por ítem, cuando el filtro es también la leyenda de un gráfico (Hitos).
export function FilterBar({ items, active, onChange, className, labels, counts, dots }) {
  const { t } = useLocale();
  const display = (item) => labels?.[item] || (item === "All" ? t("common.all") : item);
  const countFor = (item) => (counts ? counts[item === "All" ? "all" : item] : undefined);
  return (
    <div className={`bl-filters ${className}`} role="tablist" aria-label={t("aria.filters")}>
      {items.map((item) => {
        const isActive = active === item;
        const count = countFor(item);
        return (
          <button
            key={item}
            className={`bl-filter-chip${isActive ? " active" : ""}`}
            onClick={() => onChange(item)}
            role="tab"
            aria-selected={isActive}
          >
            {dots?.[item] && <i className="bl-filter-dot" style={{ "--c": dots[item] }} aria-hidden="true" />}
            {display(item)}
            {count != null && <span className="bl-filter-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

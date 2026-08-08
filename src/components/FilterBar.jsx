import { useLocale } from "../hooks/useLocale";

export function FilterBar({ items, active, onChange, className, labels, counts }) {
  const { t } = useLocale();
  const display = (item) => (item === "All" ? t("common.all") : (labels && labels[item]) || item);
  const countFor = (item) => (counts ? counts[item === "All" ? "all" : item] : undefined);
  return (
    <div className={`bl-filters ${className}`} role="tablist" aria-label="Filtros">
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
            {display(item)}
            {count != null && <span className="bl-filter-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

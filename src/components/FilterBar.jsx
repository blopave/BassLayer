import { useLocale } from "../hooks/useLocale";

export function FilterBar({ items, active, onChange, className }) {
  const { t } = useLocale();
  const display = (item) => (item === "All" ? t("common.all") : item);
  return (
    <div className={`bl-filters ${className}`} role="tablist" aria-label="Filtros">
      {items.map((item) => (
        <button
          key={item}
          className={`bl-filter-chip${active === item ? " active" : ""}`}
          onClick={() => onChange(item)}
          role="tab"
          aria-selected={active === item}
        >
          {display(item)}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ items, active, onChange, className }) {
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
          {item}
        </button>
      ))}
    </div>
  );
}

import { useLocale } from "../hooks/useLocale";

// Tintes por género — solo aplican en Bass y solo al chip activo. Fondo al ~12%
// y borde/texto en el tinte. Formato "r,g,b" para poder componer rgba() en CSS.
const GENRE_TINTS = {
  "Techno":      "108,126,176",
  "House":       "196,144,112",
  "Deep House":  "95,110,156",
  "Tech House":  "143,128,180",
  "Progressive": "126,167,159",
  "Melodic":     "176,136,128",
  "Minimal":     "168,172,180",
  "Trance":      "163,143,183",
  "Festival":    "201,164,106",
};

export function FilterBar({ items, active, onChange, className }) {
  const { t } = useLocale();
  const display = (item) => (item === "All" ? t("common.all") : item);
  const isBass = (className || "").includes("bass-filters");
  return (
    <div className={`bl-filters ${className}`} role="tablist" aria-label="Filtros">
      {items.map((item) => {
        const isActive = active === item;
        const tint = isBass && isActive ? GENRE_TINTS[item] : null;
        return (
          <button
            key={item}
            className={`bl-filter-chip${isActive ? " active" : ""}`}
            onClick={() => onChange(item)}
            role="tab"
            aria-selected={isActive}
            style={tint ? { "--bl-genre-tint": tint } : undefined}
          >
            {display(item)}
          </button>
        );
      })}
    </div>
  );
}

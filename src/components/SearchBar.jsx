import { useRef } from "react";

export function SearchBar({ value, onChange }) {
  const inputRef = useRef(null);

  function handleClear() {
    onChange("");
    inputRef.current?.focus();
  }

  return (
    <div className="bl-search-wrap">
      <div className="bl-search-inner">
        <span className="bl-search-icon" aria-hidden="true">&#x2315;</span>
        <input
          ref={inputRef}
          className="bl-search-input"
          type="text"
          placeholder="Buscar eventos..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Buscar eventos"
        />
        <button
          className={`bl-search-clear${value ? " visible" : ""}`}
          onClick={handleClear}
          aria-label="Limpiar búsqueda"
          tabIndex={value ? 0 : -1}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}

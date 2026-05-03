import { useRef } from "react";
import { useLocale } from "../hooks/useLocale";

export function SearchBar({ value, onChange }) {
  const { t } = useLocale();
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
          placeholder={t("feed.searchPlaceholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("common.search")}
        />
        <button
          className={`bl-search-clear${value ? " visible" : ""}`}
          onClick={handleClear}
          aria-label={t("common.close")}
          tabIndex={value ? 0 : -1}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}

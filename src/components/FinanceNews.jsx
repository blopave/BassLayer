import { useEffect, useState } from "react";
import { LayerNotas } from "./LayerNotas";
import { useLocale } from "../hooks/useLocale";
import { api } from "../utils/api";

// Temas por contenido del server (detectFinanceTag), en este orden.
const FINANCE_ORDER = ["argentina", "wallstreet", "companies", "world"];

// Las mismas filas que Noticias (LayerNotas); la nota abre el mismo modal.
export function FinanceNews({ onSelect }) {
  const { t } = useLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.financeNews()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setError(t("finance.error")))
      .then(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bl-layer-content">
      <h2 className="bl-sr-only">{t("finance.title")}</h2>
      <LayerNotas items={items} loading={loading} error={error} onRetry={load} onSelect={onSelect} order={FINANCE_ORDER} ariaLabel={t("finance.title")} />
    </div>
  );
}

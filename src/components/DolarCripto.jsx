import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useLocale } from "../hooks/useLocale";

// Dólar cripto argentino — el módulo que ninguna terminal global tiene.
// Resumen siempre visible (blue/oficial/cripto/brecha) + tabla USDT/ARS por
// exchange al expandir. Data: CriptoYa + DolarAPI vía proxy propio, 5min.
export function DolarCripto() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.dolar().then((d) => { if (alive) setData(d); }).catch(() => {});
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // Sin señal → sin módulo. Nada de esqueletos permanentes.
  if (!data) return null;

  const fmt0 = (n) => (n != null ? `$${Math.round(n).toLocaleString("es-AR")}` : "—");
  const fmt2 = (n) => (n != null ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
  const d = data.dolares || {};
  const brecha = data.brecha;

  return (
    <section className="bl-dolar" aria-label={t("dolar.title")}>
      <button
        type="button"
        className="bl-dolar-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="bl-dolar-prompt"><span className="bl-terminal-prompt-user">&gt;</span> DOLAR --ars</span>
        <span className="bl-dolar-summary">
          {d.blue && <span className="bl-dolar-q">BLUE <b>{fmt0(d.blue.venta)}</b></span>}
          {d.oficial && <span className="bl-dolar-q">OFICIAL <b>{fmt0(d.oficial.venta)}</b></span>}
          {d.cripto && <span className="bl-dolar-q">CRIPTO <b>{fmt0(d.cripto.venta)}</b></span>}
          {brecha != null && (
            <span className="bl-dolar-q bl-dolar-brecha">{t("dolar.gap")} <b>{brecha > 0 ? "+" : ""}{brecha}%</b></span>
          )}
        </span>
        <svg className={`bl-dolar-chevron${open ? " open" : ""}`} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {open && data.usdt?.length > 0 && (
        <table className="bl-dolar-table">
          <thead>
            <tr>
              <th scope="col">USDT/ARS</th>
              <th scope="col">{t("dolar.bid")}</th>
              <th scope="col">{t("dolar.ask")}</th>
            </tr>
          </thead>
          <tbody>
            {data.usdt.map((q) => (
              <tr key={q.exchange}>
                <td>{q.exchange}</td>
                <td>{fmt2(q.bid)}</td>
                <td>{fmt2(q.ask)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

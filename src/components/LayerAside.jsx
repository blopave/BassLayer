import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useLocale } from "../hooks/useLocale";

// Columna derecha de Layer en desktop (debajo del contenido en mobile): el
// mercado y el ciclo en un golpe de vista, con salida a la sección completa.
// Cada tarjeta reserva su altura mientras carga para no mover el feed.

const WATCHLIST = ["IBIT", "SPY", "QQQ", "GLD", "NVDA", "MSFT", "META", "MELI"];

function fmtPrice(n) {
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toFixed(2);
}
function fmtPct(n) {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtDay(iso, locale) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short" });
}

function MarketsMini({ onGo }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api.markets().then((d) => alive && setData(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);
  if (failed) return null;

  const all = (data?.groups || []).flatMap((g) => g.items || []);
  const rows = WATCHLIST.map((s) => all.find((i) => i.symbol === s)).filter(Boolean);
  const asof = data?.asof ? new Date(data.asof) : null;

  return (
    <section className="bl-aside-card" aria-label={t("aside.markets")}>
      <div className="bl-aside-lab">
        <span>{t("aside.markets")}</span>
        {asof && <span className="bl-aside-cnt">· {asof.toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short" })}</span>}
        <button type="button" className="bl-aside-more" onClick={() => onGo("etfs")}>{t("aside.marketsMore")} &rarr;</button>
      </div>
      {!data ? (
        <div className="bl-aside-skel" style={{ height: 8 * 37 }} aria-hidden="true" />
      ) : (
        <ul className="bl-aside-rows">
          {rows.map((r) => (
            <li key={r.symbol} className="bl-aside-row">
              <span className="bl-aside-sym">{r.symbol}</span>
              <span className="bl-aside-name">{r.name}</span>
              <span className="bl-aside-price">{fmtPrice(r.price)}</span>
              <span className={`bl-aside-chg ${r.changePct >= 0 ? "up" : "down"}`}>{fmtPct(r.changePct)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CyclesMini({ onGo }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api.btcCycles().then((d) => alive && setData(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);
  if (failed) return null;

  const cur = data?.current;
  const next = data?.keyDates?.nextHalving;
  const daysToHalving = next ? Math.max(0, Math.round((new Date(`${next}T12:00:00`) - Date.now()) / 86400000)) : null;
  const peak = data?.keyDates?.peak;
  const daysSincePeak = peak ? Math.round((Date.now() - new Date(`${peak}T12:00:00`)) / 86400000) : null;
  const phaseKey = cur?.phase ? `cycles.phase.${cur.phase}` : null;
  const phaseLabel = phaseKey && t(phaseKey) !== phaseKey ? t(phaseKey) : cur?.phaseLabel;
  const confLabel = locale === "en" ? (cur?.confluenceLabelEn || cur?.confluenceLabel) : cur?.confluenceLabel;

  return (
    <section className="bl-aside-card" aria-label={t("section.cycles")}>
      <div className="bl-aside-lab">
        <span>{t("section.cycles")}</span>
        <button type="button" className="bl-aside-more" onClick={() => onGo("ciclos")}>{t("aside.cyclesMore")} &rarr;</button>
      </div>
      {!cur ? (
        <div className="bl-aside-skel" style={{ height: 4 * 31 }} aria-hidden="true" />
      ) : (
        <dl className="bl-aside-kvs">
          <div className="bl-aside-kv">
            <dt>{t("aside.phase")}</dt>
            <dd className={cur.phase === "markdown" ? "down" : cur.phase === "markup" ? "up" : ""}>
              {cur.phase === "markdown" ? "▼ " : cur.phase === "markup" ? "▲ " : ""}{phaseLabel}
              {daysSincePeak != null && <span className="bl-aside-sub"> · {t("aside.day")} {daysSincePeak}</span>}
            </dd>
          </div>
          {cur.price != null && (
            <div className="bl-aside-kv"><dt>{t("aside.price")}</dt><dd>~${Math.round(cur.price / 1000)}k</dd></div>
          )}
          {cur.confluence != null && (
            <div className="bl-aside-kv"><dt>{t("aside.confluence")}</dt><dd>{cur.confluence}/100{confLabel && <span className="bl-aside-sub"> · {confLabel}</span>}</dd></div>
          )}
          {daysToHalving != null && (
            <div className="bl-aside-kv"><dt>{t("aside.nextHalving")}</dt><dd>{daysToHalving} {t("aside.days")}<span className="bl-aside-sub"> · {fmtDay(next, locale)}</span></dd></div>
          )}
        </dl>
      )}
    </section>
  );
}

export function LayerAside({ onGo }) {
  return (
    <aside className="bl-layer-aside">
      <MarketsMini onGo={onGo} />
      <CyclesMini onGo={onGo} />
    </aside>
  );
}

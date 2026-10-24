import { storage } from "./storage";
import { fmtNum } from "./format";
const ARTIST_RULES_V = 3;

// Un mismo dato pedido por varios componentes a la vez (p. ej. mercados: la
// grilla de secciones y el panel lateral) viaja una sola vez; se reutiliza
// 60 s y un error no queda guardado.
const sharedCache = new Map();
export function shared(key, fn, ttl = 60_000) {
  const hit = sharedCache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.p;
  const p = fn();
  p.catch(() => sharedCache.delete(key));
  sharedCache.set(key, { p, ts: Date.now() });
  return p;
}
export const api = {
  prices:    () => fetch("/api/prices").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  news:      () => fetch("/api/news").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  financeNews: () => fetch("/api/finance-news").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  markets:   () => fetch("/api/markets").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  events:    () => fetch("/api/events").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  ciclos:    () => fetch("/api/ciclos").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  semana:    () => fetch("/api/semana").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  bassNews:  () => fetch("/api/bass-news").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  festivals: (region) => fetch(`/api/festivals${region && region !== "All" ? `?region=${encodeURIComponent(region)}` : ""}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  dashboard: () => fetch("/api/dashboard").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  dolar:     () => fetch("/api/dolar").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  btcNetwork:() => fetch("/api/btc-network").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  btcCycles: () => fetch("/api/btc-cycles").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  cryptoIrl: () => fetch("/api/crypto-irl").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  cryptoEvents: () => fetch("/api/crypto-events").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  predictionMarkets: () => fetch("/api/prediction-markets").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  // v: versión de las reglas de la ficha. La respuesta se cachea 12 h en el
  // browser; al cambiar qué se considera match (sept 2026: verificación por
  // género, previews) se sube para no servir fichas viejas durante medio día.
  artist:    (name, locale = "es", family = "") => fetch(`/api/artist?name=${encodeURIComponent(name)}&locale=${encodeURIComponent(locale)}${family ? `&family=${encodeURIComponent(family)}` : ""}&v=${ARTIST_RULES_V}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  submitCryptoIrl: (data) => fetch("/api/crypto-irl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => (r.ok ? r.json() : r.json().catch(() => ({ error: `Error ${r.status}` })).then(e => Promise.reject(e.error || `Error ${r.status}`)))),
};

export function formatPrice(p, locale = "es") {
  if (p == null || isNaN(p)) return "$—";
  return "$" + fmtNum(p, locale, p >= 1000 ? 0 : p >= 1 ? 2 : 4);
}


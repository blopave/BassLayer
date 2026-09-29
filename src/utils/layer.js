import { createElement, useEffect, useState } from "react";
import { api, shared } from "./api";
import { MONTHS_ABBR } from "../i18n/strings";

// Piezas compartidas del mundo Layer (portada curva, índice lateral, Historia).

// Nombre i18n de cada sección (clave interna → clave de strings.js).
export const SECTION_LABEL = {
  noticias: "section.news", eventos: "section.events", ciclos: "section.cycles", historia: "section.history",
  etfs: "section.etfs", acciones: "section.stocks", finanzas: "section.finance", predicciones: "section.predictions",
};

// "2021-11" → 2021.83 (año decimal, eje de tiempo de las curvas).
export const T = (s) => { const [y, m] = s.split("-").map(Number); return y + (m - 1) / 12; };
export const monthLabel = (tt, locale) => {
  const m = MONTHS_ABBR[locale === "en" ? "en" : "es"][Number(tt.slice(5, 7)) - 1];
  return `${locale === "en" ? m : m.toLowerCase()} ${tt.slice(0, 4)}`;
};
export const list = (d) => (Array.isArray(d) ? d : d?.items || d?.data || []);

export function fmtUsd(p, locale) {
  return p >= 1000 ? `$${Math.round(p).toLocaleString(locale === "en" ? "en-US" : "es-AR")}` : `$${p < 10 ? p.toFixed(1) : Math.round(p)}`;
}

export function Pct({ v, locale }) {
  const s = `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
  return createElement("span", { className: v >= 0 ? "up" : "down" }, `${locale === "en" ? s : s.replace(".", ",")}%`);
}

// Fase del ciclo con su flecha (▲ markup, ▼ markdown).
export function Phase({ cur, label }) {
  const dir = cur.phase === "markdown" ? "down" : cur.phase === "markup" ? "up" : "";
  return createElement("span", { className: dir }, `${dir === "down" ? "▼ " : dir === "up" ? "▲ " : ""}${label}`);
}

// Datos vivos de Layer; `shared()` deduplica entre componentes montados a la vez.
export function useLayerData() {
  const [d, setD] = useState({});
  useEffect(() => {
    let alive = true;
    const set = (k) => (v) => alive && setD((p) => ({ ...p, [k]: v }));
    shared("btcCycles", api.btcCycles).then(set("cycles")).catch(() => {});
    shared("markets", api.markets).then(set("markets")).catch(() => {});
    shared("financeNews", api.financeNews).then(set("finance")).catch(() => {});
    shared("cryptoEvents", api.cryptoEvents).then(set("events")).catch(() => {});
    shared("predictions", api.predictionMarkets).then(set("predictions")).catch(() => {});
    return () => { alive = false; };
  }, []);
  return d;
}

// Derivados comunes de los datos vivos (mercados, eventos próximos, fase del ciclo).
export function layerStats(d, t) {
  const groups = d.markets?.groups || [];
  const all = groups.flatMap((g) => g.items || []);
  const stocks = groups.filter((g) => g.kind === "stock").flatMap((g) => g.items || []);
  const today = new Date().toISOString().slice(0, 10);
  const cur = d.cycles?.current;
  const phaseKey = cur?.phase ? `cycles.phase.${cur.phase}` : null;
  return {
    sym: (s) => all.find((i) => i.symbol === s),
    mover: stocks.reduce((a, b) => (!a || Math.abs(b.changePct) > Math.abs(a.changePct) ? b : a), null),
    upcoming: list(d.events).filter((e) => (e.date || "") >= today).sort((a, b) => a.date.localeCompare(b.date)),
    cur,
    phase: phaseKey && t(phaseKey) !== phaseKey ? t(phaseKey) : cur?.phaseLabel,
    preds: list(d.predictions),
  };
}

export const fmtDay = (iso, locale) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { day: "numeric", month: "short" });

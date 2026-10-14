// Layer: dólar y USDT, on-chain, red de BTC, panel de mercado, ciclos de halving (con su admin) y predicciones.
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function montarLayer(app, d) {
  const { MONTHS_ES, PAPRIKA_ID, rootDir, cache, cached, eachLimit, fetchSafe, requireAdmin, requireAuth, safeText, setCache, supabase, swr, translateTitle } = d;

// ─────────────────────────────────────────────
//  GET /api/dolar — USDT/ARS por exchange (CriptoYa) + dólares AR (DolarAPI)
//  El módulo que ninguna terminal global tiene. Sin key, cache 5min.
// ─────────────────────────────────────────────

app.get("/api/dolar", async (req, res) => {
  const hit = cached("dolar");
  if (hit) return res.json(hit);
  try {
    const [cy, da] = await Promise.allSettled([
      fetchSafe("https://criptoya.com/api/usdt/ars/1").then(r => r.ok ? safeText(r).then(JSON.parse) : null),
      fetchSafe("https://dolarapi.com/v1/dolares").then(r => r.ok ? safeText(r).then(JSON.parse) : null),
    ]);
    const cyData = cy.status === "fulfilled" ? cy.value : null;
    const daData = da.status === "fulfilled" ? da.value : null;

    // CriptoYa: objeto exchange → {ask,bid,...}. Curamos a los exchanges que
    // la audiencia AR usa de verdad, orden fijo para que la tabla no baile.
    const EXCHANGES = ["binance", "buenbit", "ripio", "lemoncash", "belo", "fiwind", "letsbit", "satoshitango"];
    const usdt = [];
    if (cyData && typeof cyData === "object") {
      for (const ex of EXCHANGES) {
        const q = cyData[ex];
        if (q && Number(q.ask) > 0 && Number(q.bid) > 0) {
          usdt.push({ exchange: ex, ask: Math.round(q.ask * 100) / 100, bid: Math.round(q.bid * 100) / 100 });
        }
      }
    }

    const byCasa = {};
    if (Array.isArray(daData)) for (const d of daData) byCasa[d.casa] = { compra: d.compra, venta: d.venta };
    const oficialVenta = byCasa.oficial?.venta || null;
    const criptoVenta = byCasa.cripto?.venta || (usdt.length ? usdt.reduce((a, x) => a + x.ask, 0) / usdt.length : null);

    const dolar = {
      usdt,
      dolares: {
        oficial: byCasa.oficial || null,
        blue: byCasa.blue || null,
        mep: byCasa.bolsa || null,
        cripto: byCasa.cripto || null,
      },
      // Brecha cripto vs oficial — el número que la audiencia AR mira.
      brecha: oficialVenta && criptoVenta ? Math.round(((criptoVenta / oficialVenta) - 1) * 1000) / 10 : null,
      updated: Date.now(),
    };
    if (usdt.length === 0 && !daData) throw new Error("ambas fuentes vacías");
    setCache("dolar", dolar);
    res.json(dolar);
  } catch (e) {
    console.error("[dolar] error:", e.message);
    res.status(502).json({ error: "dolar unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/onchain — métricas de ciclo (bitcoin-data.com, sin key, diarias)
// ─────────────────────────────────────────────

async function loadOnchain() {
  const hit = cached("onchain");
  if (hit) return hit;
  const urls = [
    "https://bitcoin-data.com/v1/mvrv-zscore/last",
    "https://bitcoin-data.com/v1/nupl/last",
    "https://bitcoin-data.com/v1/puell-multiple/last",
    "https://bitcoin-data.com/v1/realized-price/last",
  ];
  const rs = await Promise.allSettled(urls.map(u =>
    fetchSafe(u).then(r => r.ok ? safeText(r).then(JSON.parse) : null)
  ));
  const val = (i, key) => {
    const d = rs[i].status === "fulfilled" ? rs[i].value : null;
    const n = d ? Number(d[key]) : NaN;
    return isFinite(n) ? n : null;
  };
  const onchain = {
    mvrvZ: val(0, "mvrvZscore"),
    nupl: val(1, "nupl"),
    puell: val(2, "puellMultiple"),
    realizedPrice: val(3, "realizedPrice"),
    date: rs[0].status === "fulfilled" ? rs[0].value?.d || null : null,
  };
  if (onchain.mvrvZ == null && onchain.realizedPrice == null) return null;
  setCache("onchain", onchain);
  return onchain;
}

app.get("/api/onchain", async (req, res) => {
  try {
    const onchain = await loadOnchain();
    if (!onchain) throw new Error("bitcoin-data vacío");
    res.json(onchain);
  } catch (e) {
    console.error("[onchain] error:", e.message);
    res.status(502).json({ error: "onchain unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/btc-network — fees + ajuste de dificultad (mempool.space, sin key)
// ─────────────────────────────────────────────

app.get("/api/btc-network", async (req, res) => {
  const hit = cached("btcNetwork");
  if (hit) return res.json(hit);
  try {
    const [fees, diff] = await Promise.allSettled([
      fetchSafe("https://mempool.space/api/v1/fees/recommended").then(r => r.ok ? safeText(r).then(JSON.parse) : null),
      fetchSafe("https://mempool.space/api/v1/difficulty-adjustment").then(r => r.ok ? safeText(r).then(JSON.parse) : null),
    ]);
    const f = fees.status === "fulfilled" ? fees.value : null;
    const d = diff.status === "fulfilled" ? diff.value : null;
    const network = {
      fees: f ? { fast: f.fastestFee, half: f.halfHourFee, hour: f.hourFee } : null,
      difficulty: d ? {
        progress: Math.round(d.progressPercent * 10) / 10,
        change: Math.round(d.difficultyChange * 100) / 100,
        remainingBlocks: d.remainingBlocks,
        retargetDate: d.estimatedRetargetDate || null,
      } : null,
    };
    if (!network.fees && !network.difficulty) throw new Error("mempool vacío");
    setCache("btcNetwork", network);
    res.json(network);
  } catch (e) {
    console.error("[btc-network] error:", e.message);
    res.status(502).json({ error: "btc-network unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/dashboard — BTC dominance, Fear & Greed, ETH gas
// ─────────────────────────────────────────────

// JSON de una fuente externa, o null si falla (sin tirar).
const fetchJson = (url) => fetchSafe(url).then((r) => (r.ok ? safeText(r).then(JSON.parse) : null)).catch(() => null);

// Pasa por swr (oct 2026): con el dato vencido o el snapshot se responde ya y
// la cadena CoinGecko → CoinPaprika corre atrás, una sola a la vez.
app.get("/api/dashboard", async (req, res) => {
  try {
    res.json(await swr("dashboard", buildDashboard));
  } catch (e) {
    console.error("[dashboard]", e.message);
    res.status(500).json({ error: "Dashboard data unavailable" });
  }
});

async function buildDashboard() {
  const [cgGlobal, fngData, gasData, trendingData] = await Promise.all([
    fetchJson("https://api.coingecko.com/api/v3/global"),
    fetchJson("https://api.alternative.me/fng/?limit=30"),
    fetchJson("https://api.etherscan.io/api?module=gastracker&action=gasoracle"),
    fetchJson("https://api.coingecko.com/api/v3/search/trending"),
  ]);

  let globalData = cgGlobal;
  // Respaldo (oct 2026): si CoinGecko no responde, CoinPaprika (sin key, el
  // mismo que respalda los precios) da capitalización, variación y dominancia.
  if (!globalData?.data?.market_cap_percentage?.btc) {
    const [g, eth] = await Promise.all([
      fetchJson("https://api.coinpaprika.com/v1/global"),
      fetchJson(`https://api.coinpaprika.com/v1/tickers/${PAPRIKA_ID.ethereum}`),
    ]);
    if (g?.market_cap_usd) {
      const ethCap = eth?.quotes?.USD?.market_cap;
      globalData = { data: {
        market_cap_percentage: { btc: g.bitcoin_dominance_percentage, eth: ethCap ? (ethCap / g.market_cap_usd) * 100 : null },
        total_market_cap: { usd: g.market_cap_usd },
        market_cap_change_percentage_24h_usd: g.market_cap_change_24h,
      } };
      console.log("[dashboard] global servido desde CoinPaprika");
    }
  }
  const dashboard = {
    btcDominance: globalData?.data?.market_cap_percentage?.btc
      ? Math.round(globalData.data.market_cap_percentage.btc * 10) / 10
      : null,
    ethDominance: globalData?.data?.market_cap_percentage?.eth
      ? Math.round(globalData.data.market_cap_percentage.eth * 10) / 10
      : null,
    totalMarketCap: globalData?.data?.total_market_cap?.usd || null,
    marketCapChange24h: globalData?.data?.market_cap_change_percentage_24h_usd
      ? Math.round(globalData.data.market_cap_change_percentage_24h_usd * 10) / 10
      : null,
    fearGreed: fngData?.data?.[0] ? {
      value: parseInt(fngData.data[0].value),
      label: fngData.data[0].value_classification,
      // Últimos 30 días (más reciente primero) — usados por el sparkline en el
      // dashboard de Layer. Invertimos a orden cronológico ascendente para que
      // el SVG del cliente pueda dibujar en la dirección natural.
      history: Array.isArray(fngData.data)
        ? fngData.data.slice(0, 30).map(d => parseInt(d.value)).filter(v => !isNaN(v)).reverse()
        : [],
    } : null,
    ethGas: gasData?.result?.ProposeGasPrice ? {
      low: parseInt(gasData.result.SafeGasPrice) || null,
      avg: parseInt(gasData.result.ProposeGasPrice) || null,
      high: parseInt(gasData.result.FastGasPrice) || null,
    } : null,
    // Trending: monedas más buscadas ahora en CoinGecko (top 7).
    trending: Array.isArray(trendingData?.coins)
      ? trendingData.coins.slice(0, 7).map(c => ({
          symbol: (c.item?.symbol || "").toUpperCase().slice(0, 8),
          name: c.item?.name || "",
          rank: c.item?.market_cap_rank ?? null,
          change24h: typeof c.item?.data?.price_change_percentage_24h?.usd === "number"
            ? Math.round(c.item.data.price_change_percentage_24h.usd * 10) / 10
            : null,
        })).filter(c => c.symbol)
      : [],
  };

  // Lo que esta vez no llegó se completa con el último dato bueno (antes se
  // cacheaban vacíos y el panel quedaba en blanco todo el TTL).
  const prev = cache.dashboard?.data;
  if (prev) for (const k of Object.keys(dashboard)) {
    const vacio = dashboard[k] == null || (Array.isArray(dashboard[k]) && !dashboard[k].length);
    if (vacio && prev[k] != null) dashboard[k] = prev[k];
  }
  return dashboard;
}

// ─────────────────────────────────────────────
//  GET /api/btc-cycles — Dashboard de ciclos de halving
//  Mergea datos curados (data/btc-cycles.json: histórico, lecturas on-chain,
//  proyección) con precio + media de 200 semanas EN VIVO. Precio: CoinGecko.
//  200W: SMA de 200 closes semanales de Binance (CoinGecko free no da ~4 años
//  de history). Fase A del dashboard dinámico.
// ─────────────────────────────────────────────
const BTC_CYCLES_FILE = join(rootDir, "data", "btc-cycles.json");
let btcCuratedCache = null;
let btcCuratedTs = 0;
const BTC_CURATED_TTL = 5 * 60_000;

function readBtcCyclesFile() {
  try {
    if (existsSync(BTC_CYCLES_FILE)) return JSON.parse(readFileSync(BTC_CYCLES_FILE, "utf-8"));
  } catch (e) { console.error("[btc-cycles] file read error:", e.message); }
  return null;
}

// Estado curado del dashboard: Supabase (editable desde el AdminPanel) con el
// JSON del repo como seed y fallback. En el primer arranque siembra la tabla
// desde el archivo; después manda lo que haya en Supabase. Fase B.
async function loadBtcCyclesCurated() {
  const now = Date.now();
  if (btcCuratedCache && (now - btcCuratedTs) < BTC_CURATED_TTL) return btcCuratedCache;

  if (supabase) {
    try {
      const { data, error } = await supabase.from("btc_cycles").select("data").eq("id", 1).maybeSingle();
      if (!error && data?.data) {
        btcCuratedCache = data.data; btcCuratedTs = now;
        return btcCuratedCache;
      }
      if (!error && !data) {
        // Vacío → sembrar desde el archivo del repo
        const seed = readBtcCyclesFile();
        if (seed) {
          await supabase.from("btc_cycles").upsert({ id: 1, data: seed, updated_at: new Date().toISOString() });
          btcCuratedCache = seed; btcCuratedTs = now;
          return btcCuratedCache;
        }
      }
    } catch (e) {
      console.error("[btc-cycles] supabase load error:", e.message);
    }
  }

  // Fallback: archivo del repo
  const file = readBtcCyclesFile();
  if (file) { btcCuratedCache = file; btcCuratedTs = now; }
  return btcCuratedCache;
}

function invalidateBtcCyclesCache() {
  btcCuratedCache = null; btcCuratedTs = 0;
  cache.btcCycles = { ...cache.btcCycles, data: null, ts: 0 };
}

app.get("/api/btc-cycles", async (req, res) => {
  const hit = cached("btcCycles");
  if (hit) return res.json(hit);

  const curated = await loadBtcCyclesCurated();
  if (!curated) return res.status(500).json({ error: "btc-cycles data unavailable" });

  try {
    const [priceRes, klinesRes, monthlyRes] = await Promise.allSettled([
      fetchSafe("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd")
        .then(r => r.ok ? safeText(r).then(JSON.parse) : null),
      fetchSafe("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=201")
        .then(r => r.ok ? safeText(r).then(JSON.parse) : null),
      fetchSafe("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1M&limit=200")
        .then(r => r.ok ? safeText(r).then(JSON.parse) : null),
    ]);

    const priceData = priceRes.status === "fulfilled" ? priceRes.value : null;
    const klines = klinesRes.status === "fulfilled" ? klinesRes.value : null;
    const monthly = monthlyRes.status === "fulfilled" ? monthlyRes.value : null;

    const price = typeof priceData?.bitcoin?.usd === "number" ? priceData.bitcoin.usd : null;

    // SMA de 200 semanas: promedio de los closes de las 200 semanas CERRADAS
    // (descartamos la última vela, que es la semana en formación).
    let sma200w = null;
    if (Array.isArray(klines) && klines.length >= 2) {
      const closes = klines.slice(0, -1).slice(-200).map(k => parseFloat(k[4])).filter(v => !isNaN(v));
      if (closes.length) sma200w = closes.reduce((a, b) => a + b, 0) / closes.length;
    }

    const live = {
      ok: price != null || sma200w != null,
      price: price != null ? Math.round(price) : null,
      support200w: sma200w != null ? Math.round(sma200w) : null,
      priceVs200wPct: (price != null && sma200w) ? Math.round((price / sma200w - 1) * 1000) / 10 : null,
      fetchedAt: new Date().toISOString(),
    };

    // Curva de precio (escala log): serie mensual curada completa (2012→hoy,
    // horneada en el JSON) como base, refrescada con los mensuales en vivo de
    // Binance sobre los últimos meses. Merge por mes: el live pisa al curado
    // cuando responde; si falla, la curva igual muestra toda la historia.
    const fileRef = readBtcCyclesFile() || {};
    const milestones = Array.isArray(fileRef.milestones) ? fileRef.milestones : [];
    const newsEvents = Array.isArray(fileRef.newsEvents) ? fileRef.newsEvents : [];
    const monthMap = new Map((fileRef.priceHistoryEarly || []).map(pt => [pt.t, pt.p]));
    if (Array.isArray(monthly)) {
      for (const k of monthly) {
        const d = new Date(Number(k[0]));
        const t = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const p = parseFloat(k[4]);
        if (!isNaN(p)) monthMap.set(t, Math.round(p));
      }
    }
    const priceHistory = [...monthMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([t, p]) => ({ t, p }));

    // Indicadores on-chain EN VIVO (bitcoin-data.com) pisan el snapshot curado
    // — los valores manuales envejecían mal (MVRV curado 0.34 vs 0.87 real).
    // status/pos: mecánicos, derivados de las bandas documentadas en cada nota.
    const oc = await loadOnchain().catch(() => null);
    const clampPos = (v) => Math.min(98, Math.max(2, Math.round(v)));
    const liveInd = {};
    if (oc) {
      if (oc.mvrvZ != null) liveInd.MVRV = {
        value: oc.mvrvZ.toFixed(2),
        status: oc.mvrvZ < 2 ? "green" : oc.mvrvZ < 6 ? "amber" : "red",
        pos: clampPos(((oc.mvrvZ + 1) / 8) * 100),
      };
      if (oc.nupl != null) liveInd.NUPL = {
        value: oc.nupl.toFixed(2),
        status: oc.nupl < 0.25 ? "green" : oc.nupl < 0.5 ? "amber" : "red",
        pos: clampPos(((oc.nupl + 0.25) / 1) * 100),
      };
      if (oc.puell != null) liveInd.PUELL = {
        value: oc.puell.toFixed(2),
        status: oc.puell < 1 ? "green" : oc.puell < 3 ? "amber" : "red",
        pos: clampPos(((oc.puell - 0.3) / 3.7) * 100),
      };
      if (oc.realizedPrice != null && live.price != null) {
        const ratio = live.price / oc.realizedPrice;
        liveInd.RPRICE = {
          value: `${ratio.toFixed(2)}x`,
          status: ratio < 1 ? "green" : ratio < 2.4 ? "amber" : "red",
          pos: clampPos(((ratio - 0.8) / 2.7) * 100),
        };
      }
    }

    // El indicador 200W del tablero también refleja el valor en vivo, para que
    // no contradiga al header. pos: mapa aproximado -10%..+200% -> 0..100 (fondo→techo).
    const indicators = Array.isArray(curated.indicators)
      ? curated.indicators.map((ind) => {
          if (ind.key === "P200W" && live.priceVs200wPct != null) {
            const p = live.priceVs200wPct;
            const pos = Math.min(98, Math.max(2, Math.round(((p + 10) / 210) * 100)));
            return { ...ind, value: `${p >= 0 ? "+" : ""}${p}%`, pos };
          }
          if (liveInd[ind.key]) return { ...ind, ...liveInd[ind.key] };
          return ind;
        })
      : curated.indicators;

    // Merge: si hay dato en vivo pisa el snapshot curado; si no, se mantiene.
    const merged = {
      ...curated,
      meta: { ...curated.meta, updated: live.fetchedAt.slice(0, 10), source: live.ok ? "live+curated" : "curated" },
      current: {
        ...curated.current,
        price: live.price ?? curated.current.price,
        support200w: live.support200w ?? curated.current.support200w,
        priceVs200wPct: live.priceVs200wPct ?? curated.current.priceVs200wPct,
      },
      indicators,
      priceHistory,
      milestones,
      newsEvents,
      live,
      // Para la línea de precio realizado en la curva log del cliente.
      onchain: oc || null,
    };

    setCache("btcCycles", merged);
    res.json(merged);
  } catch (e) {
    console.error("[btc-cycles]", e.message);
    if (cache.btcCycles?.data) return res.json(cache.btcCycles.data);
    res.json({ ...curated, live: { ok: false } });
  }
});


// Admin: leer/editar el estado curado de los ciclos (sin redeploy). Fase B.
app.get("/api/admin/btc-cycles", requireAuth, requireAdmin, async (req, res) => {
  const curated = await loadBtcCyclesCurated();
  if (!curated) return res.status(500).json({ error: "No hay datos de ciclos" });
  res.json(curated);
});

app.put("/api/admin/btc-cycles", requireAuth, requireAdmin, async (req, res) => {
  const data = req.body?.data ?? req.body;
  if (!data || typeof data !== "object" || Array.isArray(data) || !data.current || !Array.isArray(data.cycles)) {
    return res.status(400).json({ error: "Payload inválido: se esperaba un objeto con current y cycles" });
  }
  const { data: saved, error } = await supabase
    .from("btc_cycles")
    .upsert({ id: 1, data, updated_at: new Date().toISOString(), updated_by: req.user.id })
    .select("data")
    .single();
  if (error) return res.status(400).json({ error: error.message });

  invalidateBtcCyclesCache();
  await supabase.from("admin_log").insert({
    admin_id: req.user.id, action: "update", target_type: "btc_cycles", target_id: "1",
  });
  res.json(saved.data);
});

// ─────────────────────────────────────────────
//  GET /api/prediction-markets — Polymarket Gamma
// ─────────────────────────────────────────────

function parseMaybeJSONArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}

// Predicciones (sept 2026): un EVENTO de Polymarket = una tarjeta (la Fed de
// octubre con sus resultados, no tres tarjetas sueltas), agrupado por tema.
// Se pide a Polymarket por etiqueta (el listado general pesa 7+ MB por las
// elecciones con 128 mercados). Layer = inversiones ancladas en cripto y tech:
// cripto, la Fed, Argentina, tech/IA y macro/mercados; deportes, cultura,
// geopolítica y elecciones de otros países afuera (Pablo). Títulos traducidos
// (marcados) con el mismo traductor que las bios; sin cupo, van en el original.
const PRED_GROUPS = [
  ["crypto", "crypto"], ["fed", "fed"], ["argentina", "argentina"], ["tech", "ai"], ["macro", "economy"], ["macro", "finance"],
];
// El título manda sobre la etiqueta pedida: "Fed rate cut by…?" llega por
// economy pero es de la Fed; "Anthropic IPO" llega por finance pero es tech.
const PRED_BY_TITLE = [
  ["fed", /\b(fed|fomc)\b/i],
  ["tech", /\b(ipos?|ai|openai|anthropic|nvidia|apple|google|gemini|chatgpt|largest company)\b/i],
];
const PRED_OUT = /^(sports|esports|games|soccer|tennis|nba|nfl|mlb|nhl|ufc|f1|cricket|culture|awards|tweet markets|pop culture|movies|music|celebrities|weather|military)$/i;
const predTags = (e) => (e.tags || []).map((t) => String(t.label || "").trim());
const predAllowed = (e) => {
  const tags = predTags(e);
  if (tags.some((t) => PRED_OUT.test(t))) return false;
  // Elecciones: solo las de Argentina y EE.UU.
  return !tags.some((t) => /election/i.test(t)) || tags.some((t) => /^(argentina|united states|us election)$/i.test(t));
};

// Etiquetas de resultado: glosario fijo, no traductor (el traductor convierte
// "Anthropic" en "Antrópica" y "0 (0 bps)" en "bps"). Lo que no está en el
// glosario son nombres propios y quedan como vienen.
const MONTHS_EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const monthIdx = (m) => MONTHS_EN.indexOf(m.toLowerCase());
const monthEs = (m) => { const i = monthIdx(m); return i >= 0 ? MONTHS_ES[i].toLowerCase() : m; };
function predLabelEs(label) {
  let t = String(label).trim();
  if (/^no change$/i.test(t)) return "Sin cambios";
  t = t.replace(/^(\d+)\+? ?bps? (increase|hike)$/i, "Suba de $1 pb")
    .replace(/^(\d+)\+? ?bps? (decrease|cut)$/i, "Baja de $1 pb")
    .replace(/\((\d+) bps\)/i, "($1 pb)")
    .replace(/^no release by (\w+) (\d+)$/i, (_, m, d) => `Sin lanzamiento al ${d} ${monthEs(m)}`)
    .replace(/^(\w+) (\d{4}) meeting$/i, (_, m, y) => `Reunión de ${monthEs(m)} ${y}`)
    .replace(/^(\w+) (\d{1,2}),? (\d{4})$/i, (_, m, d, y) => `${d} ${monthEs(m)} ${y}`)
    .replace(/^(\w+) (\d{1,2})$/i, (_, m, d) => (monthIdx(m) >= 0 ? `${d} ${monthEs(m)}` : _))
    .replace(/(\d)\.(\d+)%/g, "$1,$2 %")
    .replace(/(\d),(\d{3})/g, "$1.$2");
  // "AXEL KICILLOF" → "Axel Kicillof" (siglas cortas como "xAI" o "BCE" no se tocan)
  if (/^[A-ZÁÉÍÓÚÑ ]{8,}$/.test(t)) t = t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return t;
}
// El traductor habla castellano de España y no conoce las marcas.
const PRED_TITLE_FIX = [
  [/Antrópic[ao]/g, "Anthropic"], [/Géminis/g, "Gemini"], [/\bsubidas?\b/g, (w) => w.replace("subida", "suba")],
  [/\b([Tt])ipos\b/g, (_, t) => (t === "T" ? "Tasas" : "tasas")],
];
const ellipsize = (t) => t.replace(/_{2,}|\.{3}/g, "…");
// "Gemini 4.0 released by...?" sale "¿Gemini 4.0 lanzado por…?": la pregunta
// es la fecha, así que se dice así ("Gemini 4.0 lanzado: ¿cuándo?").
const predTitleEs = (t) => PRED_TITLE_FIX.reduce((s, [rx, to]) => s.replace(rx, to), ellipsize(t))
  .replace(/^¿(.+?)(?:\s(?:por|para|en|antes del?))?\s?…\?$/, "$1: ¿cuándo?");

// Los resultados que vale la pena mostrar: los inciertos (3–97 %), los de más
// volumen del día, ordenados por probabilidad.
function predOutcomes(e) {
  const ms = (e.markets || []).filter((m) => m.active !== false && !m.closed);
  if (ms.length === 1) {
    const prices = parseMaybeJSONArray(ms[0].outcomePrices).map(Number);
    const outs = parseMaybeJSONArray(ms[0].outcomes);
    const yes = Math.round((prices[outs.findIndex((o) => /^yes$/i.test(o))] ?? prices[0]) * 100);
    return Number.isFinite(yes) && yes > 2 && yes < 98 ? [{ label: "Sí", pct: yes, binary: true }] : [];
  }
  return ms
    .map((m) => ({ label: m.groupItemTitle || m.question, pct: Math.round(Number(parseMaybeJSONArray(m.outcomePrices)[0]) * 100), vol: Number(m.volume24hr) || 0 }))
    .filter((o) => o.label && o.pct > 2 && o.pct < 98)
    .sort((a, b) => b.vol - a.vol).slice(0, 3)
    .sort((a, b) => b.pct - a.pct)
    .map(({ vol: _v, ...o }) => o);
}

app.get("/api/prediction-markets", async (req, res) => {
  const hit = cached("predictions");
  if (hit) return res.json(hit);
  try {
    // Un tema caído no tira los demás; si caen todos, queda el cache.
    const settled = await Promise.allSettled(PRED_GROUPS.map(async ([group, slug]) => {
      const r = await fetchSafe(`https://gamma-api.polymarket.com/events?closed=false&active=true&limit=12&order=volume24hr&ascending=false&tag_slug=${slug}`, { headers: { "Accept": "application/json" } }, 10000);
      if (!r.ok) throw new Error(`Polymarket ${slug} ${r.status}`);
      const list = JSON.parse(await safeText(r));
      return (Array.isArray(list) ? list : []).map((e) => ({ e, group }));
    }));
    const byTag = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (!byTag.length) throw new Error(settled[0].reason?.message || "Polymarket unavailable");
    const now = Date.now(), soon = now + 48 * 3600_000;
    const seen = new Set();
    // "Ohio/Indiana/Texas enacts data center moratorium" = una sola pregunta
    const seenTitle = new Set();
    const perGroup = new Map();
    const events = [];
    for (const { e, group: asked } of byTag.flat()) {
      const titleKey = String(e.title || "").toLowerCase().replace(/^\S+\s/, "");
      if (seen.has(e.id) || seenTitle.has(titleKey) || !predAllowed(e)) continue;
      const group = PRED_BY_TITLE.find(([, rx]) => rx.test(e.title))?.[0] || asked;
      const endTs = e.endDate ? new Date(e.endDate).getTime() : null;
      if (endTs && endTs < soon) continue;                  // vence en menos de 48 h
      if ((Number(e.volume24hr) || 0) < 2000) continue;
      const outcomes = predOutcomes(e);
      if (!outcomes.length) continue;
      if ((perGroup.get(group) || 0) >= 4) continue;       // hasta 4 por tema
      seen.add(e.id);
      seenTitle.add(titleKey);
      perGroup.set(group, (perGroup.get(group) || 0) + 1);
      events.push({
        id: String(e.id), group, title: e.title, endDate: e.endDate || null,
        volume24h: Math.round(Number(e.volume24hr) || 0), outcomes,
        url: e.slug ? `https://polymarket.com/event/${e.slug}` : "https://polymarket.com",
      });
    }
    // Títulos: traductor (una vez por texto, cacheado en disco) + arreglos
    // locales; etiquetas: glosario. Sin cupo de traducción, va el original.
    await eachLimit(events, 4, async (ev) => {
      const es = await translateTitle(ev.title, "en", "es");
      if (es) ev.titleEs = predTitleEs(es);
      ev.title = ellipsize(ev.title);
      for (const o of ev.outcomes) if (!o.binary) o.labelEs = predLabelEs(o.label);
    });
    setCache("predictions", events);
    res.json(events);
  } catch (e) {
    console.error("[prediction-markets]", e.message);
    if (cache.predictions.data) return res.json(cache.predictions.data);
    res.status(502).json({ error: "Prediction markets unavailable" });
  }
});
}

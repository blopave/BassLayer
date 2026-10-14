// Layer: precios (con su cadena de respaldo), noticias cripto con etiquetas, noticias financieras y mercados (ETFs y acciones).
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`.

import { COIN_IDS_STR, PAPRIKA_ID } from "./monedas.js";
import { xmlParser, cleanNewsTitle, relativeTime, timeToMins } from "./texto.js";
import { sameStoryOnce } from "../lib/content-rules.js";

export function montarLayerFuentes(app, d) {
  const { FINNHUB_KEY, TWELVEDATA_KEY, cache, cached, eachLimit, fetchSafe, fetchSourceWithFallback, htmlToText, pickItemImage, refreshItemAges, registerImages, safeText, sanitizeUrl, setCache, translateTitle } = d;

// ─────────────────────────────────────────────
//  GET /api/prices — CoinGecko
// ─────────────────────────────────────────────

const SYM_MAP = {
  bitcoin:"BTC", ethereum:"ETH", solana:"SOL", arbitrum:"ARB",
  chainlink:"LINK", aave:"AAVE", uniswap:"UNI", optimism:"OP",
};

// Precios del ticker con respaldo (sept 2026: CoinGecko devolvió 429/403 justo
// después de un deploy y la barra desapareció en producción):
//   1. CoinGecko (precio, 24 h, capitalización, serie 7 d)
//   2. Kraken, sin cuenta: ticker + velas de 1 h (serie 7 d y 24 h reales)
//   3. CoinPaprika, sin cuenta: precio y 24 h (sin serie)
// Si CoinGecko falla, se lo deja descansar 10 min en vez de pegarle en cada
// visita (eso agrava el límite). El último dato bueno queda en disco.
const KRAKEN_PAIR = { bitcoin: "XBTUSD", ethereum: "ETHUSD", solana: "SOLUSD", arbitrum: "ARBUSD", chainlink: "LINKUSD", aave: "AAVEUSD", uniswap: "UNIUSD", optimism: "OPUSD" };
const COIN_ORDER = COIN_IDS_STR.split(",");
const pct1 = (x) => Math.round(x * 10) / 10;
let coingeckoRestUntil = 0;

async function pricesCoinGecko() {
  if (Date.now() < coingeckoRestUntil) throw new Error("CoinGecko en pausa");
  const r = await fetchSafe(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COIN_IDS_STR}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`);
  if (!r.ok) {
    coingeckoRestUntil = Date.now() + 10 * 60_000;
    throw new Error(`CoinGecko ${r.status}`);
  }
  const raw = JSON.parse(await safeText(r));
  return raw.map((d) => ({
    id: d.id, sym: SYM_MAP[d.id] || d.id.toUpperCase(), name: d.id, usd: d.current_price,
    change: pct1(d.price_change_percentage_24h || 0),
    marketCap: d.market_cap || null,
    sparkline: d.sparkline_in_7d?.price || [],
  }));
}

async function pricesKraken() {
  const out = [];
  // De a uno: el límite público de Kraken castiga ráfagas; es solo el respaldo.
  for (const id of COIN_ORDER) {
    const r = await fetchSafe(`https://api.kraken.com/0/public/OHLC?pair=${KRAKEN_PAIR[id]}&interval=60`);
    const j = JSON.parse(await safeText(r));
    const candles = j.error?.length ? null : Object.entries(j.result || {}).find(([k]) => k !== "last")?.[1];
    if (!candles?.length) throw new Error(`Kraken ${id}: ${j.error?.join(", ") || "sin velas"}`);
    const closes = candles.map((c) => Number(c[4]));
    const last = closes[closes.length - 1], dayAgo = closes[Math.max(0, closes.length - 25)];
    out.push({ id, sym: SYM_MAP[id], name: id, usd: last, change: pct1((last / dayAgo - 1) * 100), marketCap: null, sparkline: closes.slice(-168) });
  }
  return out;
}

async function pricesPaprika() {
  return Promise.all(COIN_ORDER.map(async (id) => {
    const r = await fetchSafe(`https://api.coinpaprika.com/v1/tickers/${PAPRIKA_ID[id]}`);
    if (!r.ok) throw new Error(`CoinPaprika ${id} ${r.status}`);
    const q = JSON.parse(await safeText(r)).quotes?.USD;
    if (!q?.price) throw new Error(`CoinPaprika ${id}: sin precio`);
    return { id, sym: SYM_MAP[id], name: id, usd: q.price, change: pct1(q.percent_change_24h || 0), marketCap: q.market_cap || null, sparkline: [] };
  }));
}

// Una sola cadena en vuelo aunque lleguen varias visitas juntas.
// PRICES_OFF=coingecko,kraken apaga fuentes sin deploy (y sirve para probar).
const PRICES_OFF = new Set((process.env.PRICES_OFF || "").split(",").map((x) => x.trim()).filter(Boolean));
let pricesInflight = null;
async function freshPrices() {
  for (const [name, fn] of [["coingecko", pricesCoinGecko], ["kraken", pricesKraken], ["coinpaprika", pricesPaprika]]) {
    if (PRICES_OFF.has(name)) continue;
    try {
      const prices = await fn();
      if (!prices.length) continue;
      if (name !== "coingecko") console.warn(`[prices] servidos desde ${name}`);
      setCache("prices", prices);
      // El respaldo se cachea 2 min (cuota de las fuentes gratis); CoinGecko, 30 s.
      cache.prices.ttl = name === "coingecko" ? 30_000 : 120_000;
      return prices;
    } catch (e) { console.error(`[prices] ${name}:`, e.message); }
  }
  return null;
}

app.get("/api/prices", async (req, res) => {
  const hit = cached("prices");
  if (hit) return res.json(hit);
  pricesInflight ??= freshPrices().finally(() => { pricesInflight = null; });
  const prices = await pricesInflight;
  if (prices) return res.json(prices);
  if (cache.prices.data) return res.json(cache.prices.data); // último bueno (memoria o disco)
  res.status(502).json({ error: "Price data unavailable" });
});

// ─────────────────────────────────────────────
//  GET /api/news — RSS Feeds (?tag=BTC)
// ─────────────────────────────────────────────

const RSS_FEEDS = [
  // English
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk", lang: "en" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph", lang: "en" },
  { url: "https://decrypt.co/feed", source: "Decrypt", lang: "en" },
  { url: "https://thedefiant.io/feed", source: "The Defiant", lang: "en" },
  { url: "https://blockworks.co/feed", source: "Blockworks", lang: "en" },
  { url: "https://bitcoinmagazine.com/feed", source: "Bitcoin Mag", lang: "en" },
  { url: "https://cryptoslate.com/feed/", source: "CryptoSlate", lang: "en" },
  { url: "https://cryptobriefing.com/feed/", source: "CryptoBriefing", lang: "en" },
  { url: "https://u.today/rss", source: "U.Today", lang: "en" },
  { url: "https://dailyhodl.com/feed/", source: "Daily Hodl", lang: "en" },
  // Español / Latam
  { url: "https://diariobitcoin.com/feed/", source: "DiarioBitcoin", lang: "es" },
  { url: "https://criptotendencia.com/feed/", source: "CriptoTendencia", lang: "es" },
  { url: "https://news.bit2me.com/feed/", source: "Bit2Me", lang: "es" },
  { url: "https://es.beincrypto.com/feed/", source: "BeInCrypto", lang: "es" },
  { url: "https://observatorioblockchain.com/feed/", source: "Observatorio Blockchain", lang: "es" },
  // Removidos (audit 2026-06-16 / re-verificado 2026-07-29):
  //   The Block        → HTTP 403 (bloquea nuestro User-Agent)
  //   Unchained        → timeout consistente (>15s en fetchSafe)
  //   CT Español       → HTTP 410 Gone (feed retirado)
  //   CriptoNoticias   → HTTP 403 aun con browser-UA (Cloudflare bloquea IPs de datacenter)
];

// ─────────────────────────────────────────────
//  TAG_RULES — source of truth única
// ─────────────────────────────────────────────
// Cada entrada mapea un tag a sus patrones. El orden es la prioridad:
// si un item matchea BTC y ETH, gana BTC (consistente con el detectTag
// original que usaba un if-else chain).
//
// Esta tabla la consumen DOS funciones:
//   - detectTag(title): elige el primer tag que matchee, default "Crypto".
//     Iterates TODAS las reglas (incluyendo tagOnly).
//   - isCryptoOrFinance(title, description): admite si matchea cualquier
//     regla que NO sea tagOnly. Las reglas tagOnly (AI, Reg) solo sirven
//     para clasificar items que ya admitieron por otra señal — sin esto,
//     headlines como "OpenAI raises $38B" o "Regulators target X" pasarían
//     sin contexto cripto real.
//
// Convención: stems abiertos (sin \b final) para cubrir plurales/derivados
// españoles e ingleses (criptomonedas, blockchains, bitcoiner, etc.).
const TAG_RULES = [
  // Bitcoin family — incluye proxies institucionales (MicroStrategy, Saylor)
  // y compuestos típicos (bitcoin mining/wallet/treasury) que antes drift-eaban
  // a "Crypto" genérico.
  { tag: "BTC", pats: [
    /\bbtc\b/i, /\bbitc[oó]in/i, /\bsatoshi\b/i,
    /\bmicrostrategy\b/i, /\bsaylor\b/i,
    /\b(bitcoin|btc) (mining|miner|wallet|treasury|reserve|holdings)/i,
  ]},
  // Ethereum — vitalik incluido como proxy
  { tag: "ETH", pats: [
    /\beth\b/i, /\bethereum\b/i, /\bvitalik\b/i,
  ]},
  // Activos: usamos el nombre completo, no el ticker corto (sol=sun, ada=Ada Lovelace)
  { tag: "SOL",  pats: [/\bsolana\b/i] },
  { tag: "XRP",  pats: [/\bxrp\b/i, /\bripple\b/i] },
  { tag: "ADA",  pats: [/\bcardano\b/i] },
  { tag: "DOGE", pats: [/\bdoge(coin)?\b/i] },
  // SHIB — Shiba Inu + Shibarium (L2 propio). Sin el tag, U.Today drop-eaba
  // ~12 items SHIB por audit; ahora admiten y se clasifican.
  { tag: "SHIB", pats: [/\bshib(a inu)?\b/i, /\bshibarium\b/i] },
  // DeFi: lending/yield anclados a contexto cripto para no matchear
  // "yield curve" o "consumer lending" macro
  { tag: "DeFi", pats: [
    /\bdefi\b/i, /\baave\b/i, /\buniswap\b/i,
    /\b(crypto|defi) (lending|yield)/i,
  ]},
  // NFT
  { tag: "NFT", pats: [/\bnft/i, /\bopensea\b/i, /\bcollectible/i] },
  // Regulación — tagOnly: items con "SEC sues..." o "regulators target..."
  // sin otra señal cripto no garantizan que sean crypto news. Si hay
  // contexto cripto, otra regla los admite y este tag los clasifica.
  { tag: "Reg", tagOnly: true, pats: [
    /\bregulat/i, /\bsec\b/i, /\bgensler\b/i, /\bcongress\b/i,
    /\blegislation\b/i, /\blawsuit\b/i,
  ]},
  // L2 / Rollups — antes "layer" suelto matcheaba "Coinbase launches new
  // product layer"; ahora anclado a "L2", "Layer 2", "Layer2"
  { tag: "L2", pats: [
    /\bl(ayer)? ?2\b/i, /\brollup/i,
    /\barbitrum\b/i, /\boptimism\b/i, /\bzksync\b/i, /\bpolygon\b/i,
  ]},
  // AI — tagOnly: \bai\b y \bopenai\b son demasiado amplios para admitir
  // ("Y Combinator AI agent", "OpenAI losses"). Si el item tiene contexto
  // cripto (Bittensor + IA descentralizada), otra regla lo admite.
  // \bia\b cubre la abreviación española (Inteligencia Artificial).
  { tag: "AI", tagOnly: true, pats: [
    /\bai\b/i, /\bia\b/i, /\bartificial intelligence\b/i,
    /\binteligencia artificial\b/i, /\bmachine learn/i, /\bopenai\b/i,
  ]},
  // Stablecoins
  { tag: "Stable", pats: [
    /\bstablecoin/i, /\busdt\b/i, /\busdc\b/i, /\btether\b/i,
  ]},
  // Mining (sin "mining" suelto — chocaba con "gold mining"; queda en BTC
  // via bitcoin mining)
  { tag: "Mining", pats: [/\bhalving\b/i, /\bhashrate\b/i] },
  // Catch-all crypto: términos genéricos, exchanges, players, derivados.
  // Llega solo cuando ningún tag específico matcheó. Empareja "Bybit announces
  // new perpetual" → "Crypto" en vez de descartar.
  //
  // weakPats vs pats: las weak (crypto/cripto/blockchain) NO admiten por
  // description — solo por title o categories. CryptoBriefing escribe
  // "crypto"/"cryptocurrencies" como tag-along en cada description de notas
  // off-topic (SpaceX IPO, ECB rates, Trump-Iran). Sin esta restricción,
  // ~36% del feed eran items macro/equity admitidos por buzzword en desc.
  // Items legítimos casi siempre traen el asset/exchange/protocol en title
  // o como category del publisher.
  { tag: "Crypto",
    weakPats: [
      /\bcrypto/i,        // crypto, cryptocurrency, cryptocurrencies
      /\bcripto/i,        // cripto, criptomonedas, criptoactivos
      /\bblockchain/i,    // blockchain, blockchains
    ],
    pats: [
      /\baltcoin/i, /\bweb3\b/i,
      /\bon[- ]?chain\b/i, /\bairdrop/i, /\btokeniz/i, /\brwa\b/i,
      // Exchanges / infra que no merecen tag propio
      /\bbinance\b/i, /\bcoinbase\b/i, /\bkraken\b/i, /\bbybit\b/i,
      /\bokx\b/i, /\bbitget\b/i, /\bgemini\b/i, /\bpolymarket\b/i, /\bhyperliquid\b/i,
      /\bgrayscale\b/i, /\bondo\b/i, /\bblackrock\b/i,
      /\bavalanche\b/i, /\bchainlink\b/i, /\bpolkadot\b/i,
      // ETFs cripto (anclado a contexto para no matchear ETFs de equities)
      /\b(spot|bitcoin|eth|crypto) etf\b/i,
      /\bperpetual/i, /\bperp futures?\b/i,
      // Liquidaciones anclado a contexto cripto
      /\b(crypto|bitcoin|btc|eth|defi|leverage) liquidat/i,
      /\bliquidat\w* (the (long|short)|on (the )?(btc|eth|crypto))/i,
    ]},
];

// Helper: junta strong + weak patterns de una regla en un solo array
function allPats(rule) {
  return [...(rule.pats || []), ...(rule.weakPats || [])];
}

function detectTag(title, categories = []) {
  // Las categories del RSS son alta señal cuando el publisher las tagea
  // semánticamente (Cointelegraph manda "Bitcoin Price", "CFTC", "Robinhood";
  // CoinDesk manda "Prices", "News"). Las incluimos en el haystack del tagger
  // para que items con título críptico ("Here's what happened in crypto today")
  // se beneficien de los tags del publisher.
  const haystack = `${title} ${categories.join(" ")}`;
  for (const rule of TAG_RULES) {
    if (allPats(rule).some((p) => p.test(haystack))) return rule.tag;
  }
  return "Crypto";
}

// Algunos feeds "crypto" (CryptoBriefing, Cointelegraph) publican filler de
// macro pura, M&A no-cripto y hasta sports stories. Filtro:
//   1) Allowlist positiva (TAG_RULES): el item necesita matchear al menos
//      un patrón en título o descripción. Esto solo descarta items sin
//      contexto cripto (Pizza Hut M&A, SpaceX IPO, housing starts).
//   2) Solo unos pocos patrones de deny para casos donde el publisher
//      menciona crypto incidentalmente. NO usamos sport leagues como deny:
//      NBA Top Shot, fan tokens del Mundial, etc. son crypto válido.
const OFF_TOPIC_PATTERNS = [
  /\bnot a crypto story\b/i,  // CryptoBriefing autodelata sus filler items
];

function isCryptoOrFinance(title, description = "", categories = []) {
  // Las categories del RSS son señal positiva adicional: si el publisher
  // tagueó la nota como "Bitcoin Price" o "DeFi", se admite aunque el
  // título sea ambiguo. NO usamos categories como deny — son ruidosas
  // ("Technology" para SpaceX, "Mercados" para petróleo).
  //
  // Las weak patterns (crypto/cripto/blockchain) solo matchean title+cats
  // — ver comentario en la regla "Crypto" de TAG_RULES.
  const titleHaystack = `${title} ${categories.join(" ")}`;
  const fullHaystack = `${titleHaystack} ${description}`;
  for (const pat of OFF_TOPIC_PATTERNS) if (pat.test(fullHaystack)) return false;
  for (const rule of TAG_RULES) {
    if (rule.tagOnly) continue;
    for (const p of (rule.pats || [])) if (p.test(fullHaystack)) return true;
    for (const p of (rule.weakPats || [])) if (p.test(titleHaystack)) return true;
  }
  return false;
}


// Extrae las categories de un item RSS/Atom como array de strings normalizado.
// Cubre los 3 formatos comunes que emiten los publishers:
//   1) string suelto: <category>Technology</category>
//   2) array de strings: múltiples <category> tags
//   3) array de objetos: Atom-style <category term="..." /> o RSS con attrs
function extractCategories(item) {
  const raw = item.category ?? item["dc:subject"];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((c) => {
      if (typeof c === "string") return c.trim();
      if (c && typeof c === "object") return String(c["#text"] || c["@_term"] || "").trim();
      return "";
    })
    .filter(Boolean)
    .slice(0, 12);  // cap para evitar haystacks gigantes
}

async function fetchRSSFeed(feed) {
  try {
    const r = await fetchSafe(feed.url, { headers: { "User-Agent": "BassLayer/1.0" } });
    if (!r.ok) return [];
    const xml = await safeText(r, 2 * 1024 * 1024); // 2MB max for RSS
    const parsed = xmlParser.parse(xml);
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    if (!Array.isArray(items)) items = [items];
    return items.slice(0, 10).map((item) => {
      const rawTitle = item.title?.["#text"] || item.title || "";
      const title = cleanNewsTitle(rawTitle);
      const rawLink = item.link?.["@_href"] || item.link || "";
      const link = typeof rawLink === "object" ? (rawLink["@_href"] || "") : String(rawLink);
      const url = sanitizeUrl(link);
      const date = item.pubDate || item.published || item.updated || "";
      const rel = relativeTime(date);
      // Algunos feeds (CriptoNoticias y otros WordPress) ponen el resumen
      // útil en content:encoded y dejan <description> mínimo. Probamos varios
      // campos y nos quedamos con el texto más rico.
      const descCandidates = [
        item.description, item.summary, item["content:encoded"], item.content,
      ];
      let descStr = "";
      for (const c of descCandidates) {
        if (!c) continue;
        const s = typeof c === "object" ? (c["#text"] || "") : String(c);
        if (s.length > descStr.length) descStr = s;
      }
      const image = pickItemImage(item, descStr);
      const description = htmlToText(descStr)
        .replace(/\s*The post\s+.+?\s+appeared first on\s+.+?\.?\s*$/i, "")
        .replace(/\s*La entrada\s+.+?\s+apareci[óo] primero en\s+.+?\.?\s*$/i, "")
        .replace(/\s*L[''`]article\s+.+?\s+est apparu en premier sur\s+.+?\.?\s*$/i, "")
        .replace(/\s*Der Beitrag\s+.+?\s+erschien zuerst auf\s+.+?\.?\s*$/i, "")
        .replace(/\s*(?:Continue reading|Read more|Seguir leyendo|Leer más|Suite|Weiterlesen)\.{0,3}\s*$/i, "")
        .slice(0, 320);
      const categories = extractCategories(item);
      return {
        time: rel,
        _mins: timeToMins(rel),
        tag: detectTag(title, categories),
        title,
        description,
        categories,
        image: image ? sanitizeUrl(image) : null,
        source: feed.source,
        lang: feed.lang,
        url,
      };
    });
  } catch (e) {
    console.error(`[news] ${feed.source}:`, e.message);
    return [];
  }
}

app.get("/api/news", async (req, res) => {
  const rawTag = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const tagFilter = rawTag?.toUpperCase();
  // El caché guarda la lista sin filtrar para que findNewsBySlug pueda
  // resolver deep links históricos aunque el item ya no clasifique como
  // crypto/finanzas. El filtro de contenido + tag corre por request.
  const applyFilter = (arr) => {
    let out = sameStoryOnce(arr.filter((n) => isCryptoOrFinance(n.title, n.description, n.categories)));
    if (tagFilter && tagFilter !== "ALL") out = out.filter((n) => n.tag === tagFilter);
    return out;
  };

  const hit = cached("news");
  if (hit) return res.json(applyFilter(hit));

  try {
    const results = await Promise.allSettled(RSS_FEEDS.map(fetchRSSFeed));
    const news = results
      .filter((r) => r.status === "fulfilled").flatMap((r) => r.value)
      .filter((item) => item.title)
      .sort((a, b) => a._mins - b._mins)
      .slice(0, 50)
      .map(({ _mins, ...rest }) => rest);
    // Titulares en inglés: traducidos como en Finanzas (marcados en el cliente,
    // con el original a un toque). Cacheado por texto; sin cupo, el original.
    await eachLimit(news.filter((n) => n.lang === "en"), 4, async (n) => {
      const es = await translateTitle(n.title, "en", "es");
      if (es) n.titleEs = es;
    });
    // Cache negativo: si TODOS los feeds fallaron, allSettled no lanza y news
    // queda []. No lo guardamos como hit válido (taparía 5 min los datos buenos);
    // servimos el último cache bueno si existe.
    if (news.length) { registerImages(news); setCache("news", news); }
    const serve = news.length ? news : (cache.news.data || news);
    res.json(applyFilter(serve));
  } catch (e) {
    console.error("[news]", e.message);
    if (cache.news.data) return res.json(applyFilter(cache.news.data));
    res.status(502).json({ error: "News unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/finance-news — Noticias financieras generales (?lang=es|en, ?tag=)
//  Layer es un mundo de inversiones anclado en crypto+tech: esta sección suma
//  macro/mercados/empresas más allá de crypto. Feeds RSS (no APIs: las free
//  prohíben producción o tienen 12-24h de delay). Cada feed trae `lang` para
//  filtrar/badgear por locale; misma canería y fallback que /api/bass-news.
// ─────────────────────────────────────────────

const FINANCE_NEWS_FEEDS = [
  // ES / LATAM — núcleo (Argentina macro/mercados + regional)
  { url: "https://www.bloomberglinea.com/arc/outboundfeeds/rss/category/mercados/?outputType=xml", source: "Bloomberg Línea", slug: "bloomberglinea", lang: "es" },
  { url: "https://www.ambito.com/rss/pages/economia.xml", source: "Ámbito", slug: "ambito-eco", lang: "es" },
  { url: "https://www.ambito.com/rss/pages/finanzas.xml", source: "Ámbito", slug: "ambito-fin", lang: "es" },
  { url: "https://www.infobae.com/arc/outboundfeeds/rss/category/economia/?outputType=xml", source: "Infobae", slug: "infobae-eco", lang: "es" },
  // EN — contexto global
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC", slug: "cnbc-markets", lang: "en" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch", slug: "marketwatch", lang: "en" },
];

// Antigüedad máxima y tope por fuente (mismo criterio que bass-news: evita que
// Infobae —muy prolífico— eclipse a los demás y mantiene el feed fresco).
const FINANCE_NEWS_MAX_AGE_DAYS = 4;
const FINANCE_MAX_ITEMS_PER_SOURCE = 6;

// Temas por contenido (Pablo, sept 2026), en este orden: lo argentino
// primero (dólar, BCRA, bonos, Merval…), después empresas y tech, después
// Wall Street y la Fed. Lo que no encaja: Argentina si es un medio argentino,
// Mundo si no. El cliente traduce la clave.
const FINANCE_TAG_RULES = [
  { tag: "argentina",  rx: /\b(d[óo]lar(es)? (blue|oficial|mep|cripto|mayorista)|bcra|banco central|merval|riesgo pa[íi]s|inflaci[óo]n|indec|milei|caputo|arca|argentin\w*|reservas|cepo|licitaci[óo]n|bonos en d[óo]lares|adrs?)\b/i },
  { tag: "companies",  rx: /\b(earnings|ipo|ceo|netflix|apple|alphabet|google|microsoft|nvidia|meta|amazon|tesla|anthropic|openai|ai|ia|inteligencia artificial|tech|tecnol[óo]gic\w*|startups?|chips?|semiconductor\w*|fusi[óo]n|adquisici[óo]n|mergers?|acquisitions?|balances?|acci[óo]n de)\b/i },
  { tag: "wallstreet", rx: /\b(wall street|s&p|nasdaq|dow|fed|reserva federal|powell|bessent|treasur\w*|tesoro de ee|rendimientos?|yields?|tasas|rates?|stocks?|bonds?|bitcoin|cripto\w*|crypto|etfs?|americans|u\.s\.|us economy|estados unidos|ee\.? ?uu\.?)\b/i },
];
const FINANCE_AR_SOURCES = new Set(["ambito-eco", "ambito-fin", "infobae-eco"]);
function detectFinanceTag(title, slug) {
  return FINANCE_TAG_RULES.find((r) => r.rx.test(title))?.tag || (FINANCE_AR_SOURCES.has(slug) ? "argentina" : "world");
}
// Curaduría: Layer es inversiones, no finanzas personales ni consumo.
// Afuera: columnas en primera persona ("I'm 47 and buy bitcoin…", "My husband
// resents…"), consejos de consumo (tarjetas de viaje, cuotas del auto),
// aumentos de servicios/prepagas, autos, y la cotización diaria del dólar
// (ya está en el Pulso, con número y no titular).
const FINANCE_OUT = [
  /^[‘'"“].*[’'"”]:/,                                                        // cita en primera persona como título
  // primera persona: "Should I start one too?", "My friend’s…", "After I sold TOMS…"
  /\b(I'?m|I’m|I’d|I'd|should I|am I|can I|do I)\b/i,
  /(^|\s)my (friend|husband|wife|kids?|parents?|mom|dad|sister|brother|boss|partner)\b|^my\b/i,
  /\bI (sold|was|am|have|had|bought|lost|made|quit|retired|spent|paid|earn|make|want|need)\b/,
  /\b(travel cards?|credit cards?|points guy|retirement|social security|medicare|401\(k\)|mortgage|car payments?|car loans?)\b/i,
  /\b(aumentos?|prepagas?|colectivos|peajes|alquileres|sueldos?|0 ?km|autos?|pickups?|nafteras?|combustibles|surtidores|jubilaci\w*|aguinaldo|anses|tarifas?)\b/i,
  /^d[óo]lar( blue)?( hoy)?( y d[óo]lar blue hoy)?( minuto a minuto)?:/i,
];
const financeKeep = (title) => !FINANCE_OUT.some((rx) => rx.test(title));

async function fetchFinanceNewsRSSFeed(feed) {
  const r = await fetchSafe(feed.url, { headers: { "User-Agent": "BassLayer/1.0" } });
  if (!r.ok) return [];
  const xml = await safeText(r, 2 * 1024 * 1024);
  const parsed = xmlParser.parse(xml);
  let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
  if (!Array.isArray(items)) items = [items];
  return items.slice(0, 12).map((item) => {
    const title = cleanNewsTitle(item.title?.["#text"] || item.title || "");
    const rawLink = item.link?.["@_href"] || item.link || "";
    const link = typeof rawLink === "object" ? (rawLink["@_href"] || "") : String(rawLink);
    const url = sanitizeUrl(link);
    const date = item.pubDate || item.published || item.updated || "";
    const descCandidates = [item.description, item.summary, item["content:encoded"], item.content];
    let descStr = "";
    for (const c of descCandidates) {
      if (!c) continue;
      const s = typeof c === "object" ? (c["#text"] || "") : String(c);
      if (s.length > descStr.length) descStr = s;
    }
    const image = pickItemImage(item, descStr);
    const description = htmlToText(descStr).slice(0, 320);
    const rel = relativeTime(date);
    return {
      time: rel,
      _mins: timeToMins(rel),
      _pubDate: date,
      tag: detectFinanceTag(title, feed.slug),
      title,
      description,
      image: image ? sanitizeUrl(image) : null,
      source: feed.source,
      source_slug: feed.slug,
      lang: feed.lang,
      url,
    };
  });
}

app.get("/api/finance-news", async (req, res) => {
  const rawLang = Array.isArray(req.query.lang) ? req.query.lang[0] : req.query.lang;
  const langFilter = rawLang?.toLowerCase();
  const rawTag = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const tagFilter = rawTag && rawTag.toLowerCase() !== "all" ? rawTag.toLowerCase() : null;
  const applyFilter = (arr) => {
    let out = arr;
    if (langFilter === "es" || langFilter === "en") out = out.filter((n) => n.lang === langFilter);
    if (tagFilter) out = out.filter((n) => n.tag.toLowerCase() === tagFilter);
    return out;
  };

  const hit = cached("financeNews");
  if (hit) return res.json(applyFilter(hit));

  try {
    const results = await Promise.all(FINANCE_NEWS_FEEDS.map((feed) =>
      fetchSourceWithFallback(feed.slug, () => fetchFinanceNewsRSSFeed(feed), "finance-news")
    ));
    const maxAgeMins = FINANCE_NEWS_MAX_AGE_DAYS * 24 * 60;
    const all = refreshItemAges(results.flat())
      .filter((item) => item.title && item.url && item._mins < maxAgeMins && financeKeep(item.title))
      .sort((a, b) => a._mins - b._mins);

    // Quota por fuente para diversidad (ver FINANCE_MAX_ITEMS_PER_SOURCE).
    const perSource = new Map();
    const quotaApplied = [];
    for (const item of all) {
      const used = perSource.get(item.source_slug) || 0;
      if (used >= FINANCE_MAX_ITEMS_PER_SOURCE) continue;
      perSource.set(item.source_slug, used + 1);
      quotaApplied.push(item);
    }
    const news = quotaApplied.slice(0, 40).map(({ _mins, _pubDate, ...rest }) => rest);
    // Titulares en inglés: traducidos (marcados en el cliente, con el original
    // a un toque). Cacheado por texto; sin cupo, queda el original.
    await eachLimit(news.filter((n) => n.lang === "en"), 4, async (n) => {
      const es = await translateTitle(n.title, "en", "es");
      if (es) n.titleEs = es;
    });
    if (news.length) { registerImages(news); setCache("financeNews", news); }
    const serve = news.length ? news : (cache.financeNews.data || news);
    res.json(applyFilter(serve));
  } catch (e) {
    console.error("[finance-news]", e.message);
    if (cache.financeNews.data) return res.json(applyFilter(cache.financeNews.data));
    res.status(502).json({ error: "Finance news unavailable" });
  }
});

// ─────────────────────────────────────────────
//  GET /api/markets — Quotes ETFs + acciones (Twelve Data / Finnhub)
//  Curaduría con sesgo tech/crypto (Layer = inversiones ancladas en crypto):
//  ETFs de índices + BTC ETFs, tech mega-caps y ADRs LATAM (todos US-listed).
// ─────────────────────────────────────────────

// Grupos por lo que son (Pablo, sept 2026). `kind` define la sección (ETFs o
// Acciones); `group`, el bloque dentro de ella, en este orden.
const MARKET_SYMBOLS = [
  // ETFs — índices de EE.UU.
  { symbol: "SPY",  name: "S&P 500",            kind: "etf",   group: "index" },
  { symbol: "QQQ",  name: "Nasdaq 100",         kind: "etf",   group: "index" },
  { symbol: "DIA",  name: "Dow Jones",          kind: "etf",   group: "index" },
  // ETFs — spot de cripto (ancla de Layer)
  { symbol: "IBIT", name: "iShares Bitcoin",    kind: "etf",   group: "cryptoetf" },
  { symbol: "FBTC", name: "Fidelity Bitcoin",   kind: "etf",   group: "cryptoetf" },
  { symbol: "ETHA", name: "iShares Ethereum",   kind: "etf",   group: "cryptoetf" },
  // ETFs — refugio
  { symbol: "GLD",  name: "Oro",                kind: "etf",   group: "refuge" },
  { symbol: "SLV",  name: "Plata",              kind: "etf",   group: "refuge" },
  // ETFs — Argentina
  { symbol: "ARGT", name: "MSCI Argentina",     kind: "etf",   group: "aretf" },
  // Acciones — Big Tech e IA
  { symbol: "NVDA", name: "NVIDIA",             kind: "stock", group: "bigtech" },
  { symbol: "MSFT", name: "Microsoft",          kind: "stock", group: "bigtech" },
  { symbol: "GOOGL",name: "Alphabet",           kind: "stock", group: "bigtech" },
  { symbol: "META", name: "Meta",               kind: "stock", group: "bigtech" },
  { symbol: "AAPL", name: "Apple",              kind: "stock", group: "bigtech" },
  { symbol: "AMZN", name: "Amazon",             kind: "stock", group: "bigtech" },
  { symbol: "TSLA", name: "Tesla",              kind: "stock", group: "bigtech" },
  // Acciones — cripto en Wall Street
  { symbol: "COIN", name: "Coinbase",           kind: "stock", group: "crypto" },
  { symbol: "MSTR", name: "Strategy",           kind: "stock", group: "crypto" },
  { symbol: "HOOD", name: "Robinhood",          kind: "stock", group: "crypto" },
  // Acciones — Argentina (ADRs en NYSE/NASDAQ)
  { symbol: "GGAL", name: "Grupo Galicia",      kind: "stock", group: "ar" },
  { symbol: "YPF",  name: "YPF",                kind: "stock", group: "ar" },
  { symbol: "VIST", name: "Vista Energy",       kind: "stock", group: "ar" },
  { symbol: "BMA",  name: "Banco Macro",        kind: "stock", group: "ar" },
  { symbol: "PAM",  name: "Pampa Energía",      kind: "stock", group: "ar" },
  // Acciones — Latinoamérica sin Argentina
  { symbol: "MELI", name: "MercadoLibre",       kind: "stock", group: "latam" },
  { symbol: "NU",   name: "Nubank",             kind: "stock", group: "latam" },
];
const MARKET_GROUPS = [...new Set(MARKET_SYMBOLS.map((s) => s.group))];
const GROUP_OF = Object.fromEntries(MARKET_SYMBOLS.map((s) => [s.symbol, s]));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
// CNBC devuelve strings con separador de miles ("1,787.39") y % con signo
// ("+6.28%"): hay que sacar comas/símbolos antes de parsear.
const numLoose = (v) => { const n = parseFloat(String(v ?? "").replace(/[,%\s]/g, "")); return Number.isFinite(n) ? n : null; };

// CNBC quote webservice — SIN API key ni cuenta. Un batch para todos los
// símbolos (pipe-separados). Es el backend público de los widgets de cotización
// de CNBC: endpoint no oficial (sin TOS formal), mitigado con caché + fallback.
// Los datos numéricos (precio, %var) no son material con copyright.
async function fetchMarketsCNBC() {
  const symbols = MARKET_SYMBOLS.map((s) => s.symbol).join("|");
  const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${symbols}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  const r = await fetchSafe(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; BassLayer/1.0)" } }, 12000);
  if (!r.ok) throw new Error(`cnbc HTTP ${r.status}`);
  const j = JSON.parse(await safeText(r));
  let quotes = j?.FormattedQuoteResult?.FormattedQuote || [];
  if (!Array.isArray(quotes)) quotes = [quotes];
  const bySym = new Map(quotes.map((q) => [q.symbol, q]));
  const rows = [];
  for (const { symbol, name, kind } of MARKET_SYMBOLS) {
    const q = bySym.get(symbol);
    if (!q) continue;
    const price = numLoose(q.last);
    if (price == null) continue;
    rows.push({
      symbol,
      name: name || q.name,   // preferimos la curaduría local (más corta/limpia)
      price,
      changePct: numLoose(q.change_pct),
      currency: q.currencyCode || "USD",
      kind,
    });
  }
  return rows;
}

// Twelve Data — un solo batch para todos los símbolos (1 crédito por símbolo).
async function fetchMarketsTwelveData() {
  const symbols = MARKET_SYMBOLS.map((s) => s.symbol).join(",");
  const url = `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${TWELVEDATA_KEY}`;
  const r = await fetchSafe(url, {}, 12000);
  if (!r.ok) throw new Error(`twelvedata HTTP ${r.status}`);
  const j = JSON.parse(await safeText(r));
  // Respuesta batch: objeto keyed por símbolo. Si mandó un error global viene
  // { code, message, status:"error" } sin las claves de símbolo.
  if (j && j.status === "error") throw new Error(`twelvedata: ${j.message || j.code}`);
  const rows = [];
  for (const { symbol, name, kind } of MARKET_SYMBOLS) {
    const q = j[symbol];
    if (!q || q.status === "error") continue;
    const price = num(q.close);
    if (price == null) continue;
    rows.push({
      symbol,
      name: name || q.name,
      price,
      changePct: num(q.percent_change),
      currency: q.currency || "USD",
      kind,
    });
  }
  return rows;
}

// Finnhub — fallback per-símbolo (sin nombre: usamos la curaduría local).
async function fetchMarketsFinnhub() {
  const results = await Promise.all(MARKET_SYMBOLS.map(async ({ symbol, name, kind }) => {
    try {
      const r = await fetchSafe(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`, {}, 10000);
      if (!r.ok) return null;
      const q = JSON.parse(await safeText(r));
      const price = num(q.c);
      if (price == null || price === 0) return null; // Finnhub devuelve c:0 para símbolos sin dato
      return { symbol, name, price, changePct: num(q.dp), currency: "USD", kind };
    } catch { return null; }
  }));
  return results.filter(Boolean);
}

app.get("/api/markets", async (req, res) => {
  const hit = cached("markets");
  if (hit) return res.json(hit);

  // Cadena de fuentes: CNBC (sin key) primero; Twelve Data / Finnhub solo si
  // hay key configurada (mejor calidad/real-time, opcional). La primera que
  // devuelve filas gana.
  let rows = [];
  const errors = [];
  try { rows = await fetchMarketsCNBC(); }
  catch (e) { errors.push(e.message); console.error("[markets] cnbc:", e.message); }
  if (rows.length === 0 && TWELVEDATA_KEY) {
    try { rows = await fetchMarketsTwelveData(); }
    catch (e) { errors.push(e.message); console.error("[markets] twelvedata:", e.message); }
  }
  if (rows.length === 0 && FINNHUB_KEY) {
    try { rows = await fetchMarketsFinnhub(); }
    catch (e) { errors.push(e.message); console.error("[markets] finnhub:", e.message); }
  }

  if (rows.length === 0) {
    if (cache.markets.data) return res.json(cache.markets.data); // último bueno aunque vencido
    return res.status(502).json({ error: "Market data unavailable", detail: errors.join("; ") });
  }

  const payload = {
    asof: Date.now(),
    groups: MARKET_GROUPS.map((key) => ({
      key,
      kind: MARKET_SYMBOLS.find((s) => s.group === key).kind,
      items: rows.filter((r) => GROUP_OF[r.symbol]?.group === key),
    })).filter((g) => g.items.length > 0),
  };
  setCache("markets", payload);
  res.json(payload);
});

}

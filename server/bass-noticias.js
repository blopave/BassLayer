// Bass: noticias de música electrónica (Buenos Aliens, Mixmag Latam y medios del mundo), curadas y traducidas.
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`;
// devuelve buildBassNews para mantenerlas calientes.

import { cleanNewsTitle, fetchSourceWithFallback, htmlToText, pickItemImage, refreshItemAges, relativeTime, sanitizeUrl, timeToMins, xmlParser } from "./texto.js";

export function montarBassNoticias(app, d) {
  const { BROWSER_HEADERS, MONTH_MAP, TITLE_TR_V, eachLimit, fetchSafe, registerImages, safeText, swr, translateTitle } = d;

// ─────────────────────────────────────────────
//  GET /api/bass-news — Música electrónica BA + LatAm
//  Fuentes: Buenos Aliens (scrape) + Mixmag Latam (RSS)
//  Curaduría chica y local-first; ver memoria del proyecto.
// ─────────────────────────────────────────────

// Curaduría chica y deliberada: 1 BA (scrape) + 1 LatAm + 2 internacionales.
// Si una fuente cae, el cap de antigüedad mantiene el feed honesto en lugar de
// rellenar con notas viejas.
const BASS_NEWS_FEEDS = [
  // Curaduría: BA + LatAm + 12 internacionales, electrónica-first y excluyente.
  // `freshOnNoDate` se usa para fuentes cuyo RSS no expone pubDate; sin él el
  // filtro de 7 días los descartaría. Asume que items al tope del feed son
  // recientes (válido para publicaciones que rotan a diario).
  { url: "https://mixmaglatam.com/rss.xml",         source: "Mixmag Latam",     slug: "mixmaglatam",   region: "LatAm", lang: "es" },
  { url: "https://djmag.com/rss",                   source: "DJ Mag",           slug: "djmag",         region: "Intl"  },
  { url: "https://mixmag.net/rss.xml",              source: "Mixmag",           slug: "mixmaguk",      region: "Intl", freshOnNoDate: true },
  { url: "https://crackmagazine.net/feed/",         source: "Crack",            slug: "crack",         region: "Intl"  },
  { url: "https://daily.bandcamp.com/feed",         source: "Bandcamp",         slug: "bandcamp",      region: "Intl"  },
  { url: "https://www.attackmagazine.com/feed/",    source: "Attack Mag",       slug: "attackmag",     region: "Intl"  },
  { url: "https://www.5mag.net/feed/",              source: "5 Magazine",       slug: "5mag",          region: "Intl"  },
  { url: "https://magneticmag.com/feed",            source: "Magnetic",         slug: "magneticmag",   region: "Intl"  },
  { url: "https://inverted-audio.com/feed/",        source: "Inverted Audio",   slug: "invertedaudio", region: "Intl"  },
  { url: "https://www.theransomnote.com/feed/",     source: "Ransom Note",      slug: "ransomnote",    region: "Intl"  },
  { url: "https://www.decodedmagazine.com/feed/",   source: "Decoded",          slug: "decodedmag",    region: "Intl"  },
  { url: "https://www.tsugi.fr/feed/",              source: "Tsugi",            slug: "tsugi",         region: "Intl", lang: "fr" },
  { url: "https://www.groove.de/feed/",             source: "Groove",           slug: "groove",        region: "Intl", lang: "de" },
];

// Items publicados hace más de N días no aparecen en el feed.
// 7d = "esta semana en electrónica". Las fuentes weekly (Crack, Attack, 5 Mag)
// alcanzan a tener 1-2 ítems; las daily (DJ Mag, Bandcamp, Mixmag Latam) siempre
// están frescas. BA queda fuera la mayor parte del tiempo — decisión deliberada.
const MAX_NEWS_AGE_DAYS = 7;
// Tope de items por fuente. Garantiza diversidad: las fuentes que publican
// daily (DJ Mag, Bandcamp) no eclipsan a las que publican semanal (Attack
// Magazine) ni a Buenos Aliens (mensual).
const MAX_ITEMS_PER_SOURCE = 8;

function detectMusicTag(title) {
  const t = title.toLowerCase();
  if (t.includes("interview") || t.includes("entrevista") || t.includes("speaks") || t.includes("talks") || t.includes("habla") || t.includes("charla")) return "Interview";
  if (t.includes("festival") || t.includes("lineup") || t.includes("line-up") || t.includes("grilla") || t.includes("lollapalooza") || t.includes("creamfields")) return "Festival";
  if (t.includes("review") || t.includes("álbum") || t.includes("album") || t.includes("release") || t.includes("lanzamiento") || t.includes("estreno") || t.includes("track") || t.includes("remix") || t.includes(" ep ") || t.includes(" lp ") || t.includes("disco")) return "Music";
  if (t.includes("club") || t.includes("venue") || t.includes("boliche") || t.includes("closing") || t.includes("opening") || t.includes("fiesta")) return "Clubs";
  if (t.includes("tour") || t.includes("gira") || t.includes("dates") || t.includes("show") || t.includes("recital") || t.includes("concierto")) return "Tour";
  if (t.includes("mix") || t.includes("set") || t.includes("podcast") || t.includes("sesión") || t.includes("sesion")) return "Mix";
  if (t.includes("buenos aires") || t.includes("argentina") || t.includes("córdoba") || t.includes("rosario") || t.includes("mendoza")) return "Local";
  return "Scene";
}

async function fetchBassNewsRSSFeed(feed) {
  try {
    const r = await fetchSafe(feed.url, { headers: { "User-Agent": "BassLayer/1.0" } });
    if (!r.ok) return [];
    const xml = await safeText(r, 2 * 1024 * 1024);
    const parsed = xmlParser.parse(xml);
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    if (!Array.isArray(items)) items = [items];
    return items.slice(0, 15).map((item, idx) => {
      const title = item.title?.["#text"] || item.title || "";
      const rawLink = item.link?.["@_href"] || item.link || "";
      const link = typeof rawLink === "object" ? (rawLink["@_href"] || "") : String(rawLink);
      const url = sanitizeUrl(link);
      let date = item.pubDate || item.published || item.updated || "";
      // Algunos feeds (ej: Mixmag) no exponen pubDate. Los marcados con
      // freshOnNoDate asumen que el orden del RSS = orden cronológico real;
      // staggeo unos minutos por posición para preservar el orden al sortear.
      if (!date && feed.freshOnNoDate) {
        date = new Date(Date.now() - idx * 60_000).toISOString();
      }
      const rel = relativeTime(date);
      const descRaw = item.description || item.summary || "";
      const descStr = typeof descRaw === "object" ? (descRaw["#text"] || "") : String(descRaw);
      const image = pickItemImage(item, descStr);
      const description = htmlToText(descStr)
        // WordPress trailers in multiple languages
        .replace(/\s*The post\s+.+?\s+appeared first on\s+.+?\.?\s*$/i, "")            // EN
        .replace(/\s*La entrada\s+.+?\s+apareci[óo] primero en\s+.+?\.?\s*$/i, "")     // ES
        .replace(/\s*L[''`]article\s+.+?\s+est apparu en premier sur\s+.+?\.?\s*$/i, "") // FR
        .replace(/\s*Der Beitrag\s+.+?\s+erschien zuerst auf\s+.+?\.?\s*$/i, "")       // DE
        .replace(/\s*(?:Continue reading|Read more|Seguir leyendo|Leer más|Suite|Weiterlesen)\.{0,3}\s*$/i, "")
        .slice(0, 320);
      // Pasa por cleanNewsTitle como los feeds de Layer: antes sólo se le sacaba
      // el prefijo de marca y las entidades llegaban crudas a la pantalla.
      let cleanTitle = cleanNewsTitle(title).replace(/^(Mixmag|DJ Mag|RA|EDM\.com)\s*[:–—\-|]\s*/i, "").trim();
      cleanTitle = cleanTitle.replace(/\s{2,}/g, " ").slice(0, 140);
      return {
        time: rel,
        _mins: timeToMins(rel),
        _pubDate: date || null,
        tag: detectMusicTag(String(title) + " " + description),
        title: cleanTitle,
        description,
        image: image ? sanitizeUrl(image) : null,
        source: feed.source,
        source_slug: feed.slug,
        region: feed.region || "Intl",
        lang: feed.lang || "en",
        url,
      };
    });
  } catch (e) {
    console.error(`[bass-news] ${feed.source}:`, e.message);
    return [];
  }
}

// Scrape /notas page on Buenos Aliens. They publish editorial pieces about local
// artists, labels and venues. No RSS — but the listing is HTML-stable.
async function fetchBuenosAliensNotas() {
  try {
    const r = await fetchSafe("https://www.buenosaliens.com/notas", {
      headers: { ...BROWSER_HEADERS, Accept: "text/html" },
    }, 12000);
    if (!r.ok) { console.error(`[bass-news] BA Notas ${r.status}`); return []; }
    const html = await safeText(r, 2 * 1024 * 1024);

    // Each note is wrapped in <article class="card …"> with an inner <a href> + <img> + <h1 class="card__title">
    // and a <span class="tag__date"> like "MIE 29 ABR".
    const articles = html.split(/<article class="card[^"]*"[^>]*>/).slice(1);
    const items = [];
    for (const block of articles) {
      const end = block.indexOf("</article>");
      const seg = end >= 0 ? block.slice(0, end) : block;
      const hrefMatch = seg.match(/href="([^"]+notas\.cfm[^"]+)"/);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      const url = href.startsWith("http") ? href : `https://www.buenosaliens.com${href.startsWith("/") ? "" : "/"}${href}`;
      const imgMatch = seg.match(/<img[^>]+src="([^"]+)"/);
      const image = imgMatch ? sanitizeUrl(imgMatch[1]) : null;
      const dateMatch = seg.match(/<span class="tag__date">([^<]+)<\/span>/);
      const dateLabel = dateMatch ? dateMatch[1].trim() : "";
      const titleMatch = seg.match(/<h1 class="card__title[^"]*">([\s\S]*?)<\/h1>/);
      let titleHtml = titleMatch ? titleMatch[1] : "";
      // Title shape: "ARTIST<br/>Subtitle" — split into artist + subtitle.
      const parts = titleHtml.split(/<br\s*\/?>/i);
      const artist = htmlToText(parts[0] || "");
      const subtitle = htmlToText(parts.slice(1).join(" "));
      const title = subtitle ? `${artist} — ${subtitle}` : artist;
      if (!title) continue;

      // Convert "MIE 29 ABR" → mins-ago using current year
      let mins = 999_999;
      let pubDateISO = null;
      const dm = dateLabel.match(/(\d{1,2})\s+([A-Za-zñÑ]{3})/);
      if (dm) {
        const day = parseInt(dm[1], 10);
        const monIdx = MONTH_MAP[dm[2].toLowerCase().slice(0,3)];
        if (monIdx !== undefined) {
          const now = new Date();
          let d = new Date(now.getFullYear(), monIdx, day);
          if (d > now) d = new Date(now.getFullYear() - 1, monIdx, day);
          mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60_000));
          pubDateISO = d.toISOString();
        }
      }
      const time = mins < 60 ? `${mins}m` : mins < 24*60 ? `${Math.floor(mins/60)}h` : `${Math.floor(mins/(24*60))}d`;

      items.push({
        time,
        _mins: mins,
        _pubDate: pubDateISO,
        tag: detectMusicTag(title),
        title: title.slice(0, 140),
        description: subtitle ? `${artist}. ${subtitle}` : artist,
        image,
        source: "Buenos Aliens",
        source_slug: "buenosaliens",
        region: "BA",
        url,
        artist,
        date_label: dateLabel,
      });
    }
    console.log(`[bass-news] Buenos Aliens Notas: ${items.length} items`);
    return items;
  } catch (e) {
    console.error("[bass-news] BA Notas error:", e.message);
    return [];
  }
}

async function buildBassNews() {
  const [notas, ...rssResults] = await Promise.all([
    fetchSourceWithFallback("buenosaliens", fetchBuenosAliensNotas),
    ...BASS_NEWS_FEEDS.map((feed) =>
      fetchSourceWithFallback(feed.slug, () => fetchBassNewsRSSFeed(feed))
    ),
  ]);
  const maxAgeMins = MAX_NEWS_AGE_DAYS * 24 * 60;
  const all = refreshItemAges([...notas, ...rssResults.flat()])
    .filter((item) => item.title && item._mins < maxAgeMins)
    .sort((a, b) => a._mins - b._mins);

  // Quota por fuente para garantizar diversidad (ver MAX_ITEMS_PER_SOURCE).
  const perSource = new Map();
  const quotaApplied = [];
  for (const item of all) {
    const slug = item.source_slug || item.source;
    const used = perSource.get(slug) || 0;
    if (used >= MAX_ITEMS_PER_SOURCE) continue;
    perSource.set(slug, used + 1);
    quotaApplied.push(item);
  }

  const news = quotaApplied
    .slice(0, 40)
    .map(({ _mins, _pubDate, ...rest }) => ({ lang: "es", ...rest }));   // Buenos Aliens (sin feed) es castellano
  // Titulares que no están en castellano (inglés, francés, alemán): traducidos
  // como en Layer, marcados en el cliente con el original a un toque.
  await eachLimit(news.filter((n) => n.lang !== "es"), 4, async (n) => {
    const es = await translateTitle(n.title, n.lang, "es");
    if (es) { n.titleEs = es; n.trV = TITLE_TR_V; }
  });
  // No cachear vacío como hit válido (taparía el último cache bueno); si el
  // scrape volvió vacío, servimos el último bueno disponible.
  registerImages(news);
  return news; // vacío → swr conserva el último bueno
}

app.get("/api/bass-news", async (req, res) => {
  const tagFilter = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const applyFilter = (arr) => tagFilter && tagFilter.toLowerCase() !== "all"
    ? arr.filter((n) => n.tag.toLowerCase() === tagFilter.toLowerCase()) : arr;

  let news;
  try { news = await swr("bassNews", buildBassNews); }
  catch { return res.status(502).json({ error: "Bass news unavailable" }); }
  res.json(applyFilter(news));
});
  return { buildBassNews };
}

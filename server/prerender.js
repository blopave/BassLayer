// ═══════════════════════════════════════════════════════
//  Prerender para buscadores y vistas previas (solo en producción)
//  Cada ruta pública se sirve con su <title>, descripción, canonical, og:* y
//  JSON-LD, más el contenido real dentro de #root; React lo reemplaza al
//  montar. Separado de server.js en oct 2026: lo que necesita del server
//  llega en `d` (caches, slugs, festivales, semana).
// ═══════════════════════════════════════════════════════

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { slugify } from "../lib/slug.js";

export function montarPrerender(app, d) {
  const {
    PROD_ORIGIN,
    rootDir,
    cached,
    MONTH_MAP,
    GENRE_BLURBS,
    GENRE_LIST,
    genreLabel,
    genreSlug,
    genreFromSlug,
    eventSlug,
    newsSlug,
    festivalSlug,
    festivalStatus,
    findEventBySlug,
    findNewsBySlug,
    findFestivalBySlug,
    findGuiaBySlug,
    loadFestivals,
    icsDateParts,
    musicEventSchema,
    semanaData,
  } = d;
  const distIndex = join(rootDir, "dist", "index.html");
  if (!existsSync(distIndex)) {
    console.error("[FATAL] dist/index.html not found — run 'npm run build' before starting in production");
    process.exit(1);
  }
  const indexHtml = readFileSync(distIndex, "utf-8");

  // SEO: prerendered content visible y semántico dentro de #root.
  // React reemplaza el contenido al hidratar (createRoot.render() clears container),
  // así que es progressive enhancement honesto, no cloaking.
  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // Fecha del evento desde day+month (misma heurística que el JSON-LD de
  // abajo: si quedó >30 días en el pasado, es del año que viene).
  function seoEventDate(ev) {
    const m = MONTH_MAP[ev.month?.toLowerCase()] ?? -1;
    const d = parseInt(ev.day);
    if (m < 0 || !d) return null;
    const date = new Date(new Date().getFullYear(), m, d);
    if (date < new Date() - 30 * 86400000) date.setFullYear(date.getFullYear() + 1);
    return date;
  }

  // Destacados del finde — el mismo criterio del hero del cliente (featured >
  // con flyer > más próximo), para que Google y humanos lean la misma portada.
  function weekendPicks(events, max = 5) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = today.getDay();
    const fridayOffset = dow === 5 ? 0 : dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow;
    const friday = new Date(today); friday.setDate(friday.getDate() + fridayOffset);
    const monday = new Date(friday); monday.setDate(monday.getDate() + 3);
    const score = (ev) => (ev.featured ? 2 : 0) + (ev.image ? 1 : 0);
    return events
      .map((ev) => ({ ev, date: seoEventDate(ev) }))
      .filter((x) => x.date && x.date >= friday && x.date < monday)
      .sort((a, b) => score(b.ev) - score(a.ev) || a.date - b.date)
      .slice(0, max);
  }

  function buildSeoHtml() {
    const events = cached("events") || [];
    const news = cached("news") || [];

    if (events.length === 0 && news.length === 0) return "";

    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:1100px;margin:0 auto;padding:2.5rem 1.25rem";
    const h1Style = "font-size:1.85rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 0.75rem;color:#fff";
    const introStyle = "color:#a0a0a0;margin:0 0 2.5rem;max-width:62ch;line-height:1.55;font-size:1rem";
    const h2Style = "font-size:1.15rem;font-weight:500;color:#fff;margin:0 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid #222;letter-spacing:-0.01em";
    const ulStyle = "list-style:none;padding:0;margin:0";
    const liStyle = "padding:0.65rem 0;border-bottom:1px solid #141414;line-height:1.4;font-size:0.95rem";
    const linkStyle = "color:#7ec8ff;text-decoration:none";
    const metaStyle = "color:#888;font-size:0.88em";
    const sectionStyle = "margin-bottom:2.5rem";

    const lines = [`<main style="${wrapStyle}" aria-label="BassLayer">`, `<div style="${innerStyle}">`];

    lines.push(`<h1 style="${h1Style}">Eventos de música electrónica en Buenos Aires + cripto y mercados</h1>`);
    lines.push(`<p style="${introStyle}">Agenda completa de fiestas, festivales y boliches de música electrónica en Buenos Aires — techno, house, drum &amp; bass, DJs locales e internacionales. Precios en vivo de Bitcoin, Ethereum y noticias cripto en español. Actualizado cada hora.</p>`);

    // Navegación semántica
    lines.push('<nav aria-label="Secciones" style="margin-bottom:2.5rem;display:flex;gap:1rem;flex-wrap:wrap">');
    lines.push(`<a href="/" style="${linkStyle};padding:0.4rem 0.85rem;border:1px solid #333;border-radius:999px">Eventos</a>`);
    lines.push(`<a href="/layer" style="${linkStyle};padding:0.4rem 0.85rem;border:1px solid #333;border-radius:999px">Crypto</a>`);
    lines.push(`<a href="/?lang=en" style="${linkStyle};padding:0.4rem 0.85rem;border:1px solid #333;border-radius:999px">English</a>`);
    lines.push("</nav>");

    // Portada del finde — espejo del hero "El finde" del cliente.
    const finde = weekendPicks(events.filter((e) => (e.region || "AR") === "AR"));
    if (finde.length > 0) {
      lines.push(`<section style="${sectionStyle}" aria-labelledby="seo-weekend">`);
      lines.push(`<h2 id="seo-weekend" style="${h2Style}">Qué hay este finde en Buenos Aires</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      const DAY_ABBR = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
      for (const { ev, date } of finde) {
        const nameMarkup = ev.url
          ? `<a href="${escHtml(ev.url)}" rel="noopener" style="${linkStyle};font-weight:500">${escHtml(ev.name)}</a>`
          : `<strong style="color:#fff">${escHtml(ev.name)}</strong>`;
        const venue = ev.venue ? ` · <span>${escHtml(ev.venue)}</span>` : "";
        const artists = (ev.artists || []).slice(0, 3).map(escHtml).join(", ");
        const performers = artists ? ` · <span style="${metaStyle}">${artists}</span>` : "";
        lines.push(`<li style="${liStyle}"><span style="${metaStyle}">${DAY_ABBR[date.getDay()]}</span> ${nameMarkup}${venue}${performers}</li>`);
      }
      lines.push("</ul></section>");
    }

    if (events.length > 0) {
      lines.push(`<section style="${sectionStyle}" aria-labelledby="seo-events">`);
      lines.push(`<h2 id="seo-events" style="${h2Style}">Próximos eventos electrónicos en Buenos Aires</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      for (const ev of events.slice(0, 25)) {
        const artists = (ev.artists || []).slice(0, 3).map(escHtml).join(", ");
        const nameMarkup = ev.url
          ? `<a href="${escHtml(ev.url)}" rel="noopener" style="${linkStyle};font-weight:500">${escHtml(ev.name)}</a>`
          : `<strong style="color:#fff">${escHtml(ev.name)}</strong>`;
        const venue = ev.venue ? ` · <span>${escHtml(ev.venue)}</span>` : "";
        const genre = ev.genre ? ` · <em style="color:#7ec8ff;font-style:normal">${escHtml(ev.genre)}</em>` : "";
        const performers = artists ? ` · <span style="${metaStyle}">${artists}</span>` : "";
        lines.push(`<li style="${liStyle}">${nameMarkup} <span style="${metaStyle}">${escHtml(ev.day)} ${escHtml(ev.month)}</span>${venue}${genre}${performers}</li>`);
      }
      lines.push("</ul></section>");
    }

    if (news.length > 0) {
      lines.push(`<section style="${sectionStyle}" aria-labelledby="seo-news">`);
      lines.push(`<h2 id="seo-news" style="${h2Style}">Últimas noticias cripto y música electrónica</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      for (const n of news.slice(0, 15)) {
        const titleMarkup = n.url
          ? `<a href="${escHtml(n.url)}" rel="noopener nofollow" style="color:#e5e5e5;text-decoration:none">${escHtml(n.title)}</a>`
          : `<span>${escHtml(n.title)}</span>`;
        const source = n.source ? ` <span style="${metaStyle}">(${escHtml(n.source)})</span>` : "";
        lines.push(`<li style="${liStyle}">${titleMarkup}${source}</li>`);
      }
      lines.push("</ul></section>");
    }

    lines.push('<p style="color:#666;font-size:0.85rem;margin-top:3rem">Cargando experiencia interactiva…</p>');
    lines.push("</div></main>");

    // JSON-LD: ItemList con MusicEvent por evento (rich results en Google Events)
    const eventSchemas = events.slice(0, 25).map(ev =>
      musicEventSchema(ev, { "url": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}` })
    );

    if (eventSchemas.length > 0) {
      const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Próximos eventos electrónicos en Buenos Aires",
        "numberOfItems": eventSchemas.length,
        "itemListElement": eventSchemas.map((schema, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": schema
        }))
      };
      const jsonLd = JSON.stringify(itemList).replace(/<\//g, "<\\/");
      lines.push(`<script type="application/ld+json">${jsonLd}</script>`);
    }

    // BreadcrumbList — mejora apariencia en SERP
    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return lines.join("");
  }

  // Reemplazo selectivo de meta tags en el template del index.
  // Cuando una ruta tiene contenido propio (evento, noticia, etc), sobreescribimos
  // title/description/canonical/OG para que Google indexe la pieza correcta.
  function renderHtmlWithMeta(meta) {
    let html = indexHtml;
    // IMPORTANTE: los reemplazos usan replacers de FUNCIÓN (() => ...) en vez de
    // strings. Con un string, los patrones $&, $$, $`, $', $n del valor externo
    // (títulos/nombres con "$", frecuentes en crypto) se interpretan como
    // referencias de reemplazo y corrompen el HTML. escHtml no neutraliza "$".
    if (meta.title) {
      const t = escHtml(meta.title);
      html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${t}</title>`);
      html = html.replace(/<meta property="og:title"\s+content="[^"]*"\s*\/?>/, () => `<meta property="og:title" content="${t}" />`);
      html = html.replace(/<meta name="twitter:title"\s+content="[^"]*"\s*\/?>/, () => `<meta name="twitter:title" content="${t}" />`);
    }
    if (meta.description) {
      const d = escHtml(meta.description);
      html = html.replace(/<meta name="description"\s+content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${d}" />`);
      html = html.replace(/<meta property="og:description"\s+content="[^"]*"\s*\/?>/, () => `<meta property="og:description" content="${d}" />`);
      html = html.replace(/<meta name="twitter:description"\s+content="[^"]*"\s*\/?>/, () => `<meta name="twitter:description" content="${d}" />`);
    }
    if (meta.canonical) {
      const c = escHtml(meta.canonical);
      html = html.replace(/<link rel="canonical"\s+href="[^"]*"\s*\/?>/, () => `<link rel="canonical" href="${c}" />`);
      html = html.replace(/<meta property="og:url"\s+content="[^"]*"\s*\/?>/, () => `<meta property="og:url" content="${c}" />`);
    }
    if (meta.image) {
      const img = escHtml(meta.image);
      html = html.replace(/<meta property="og:image"\s+content="[^"]*"\s*\/?>/, () => `<meta property="og:image" content="${img}" />`);
      html = html.replace(/<meta name="twitter:image"\s+content="[^"]*"\s*\/?>/, () => `<meta name="twitter:image" content="${img}" />`);
    }
    if (meta.robots) {
      html = html.replace(/<meta name="robots"\s+content="[^"]*"\s*\/?>/, () => `<meta name="robots" content="${escHtml(meta.robots)}" />`);
    }
    if (meta.preloadImage) {
      // Preload del LCP image: arranca el download antes de que el parser HTML
      // llegue al <img>. Combinado con fetchpriority=high en el <img>, mejora
      // LCP significativamente en /eventos /festivales /noticias detail.
      html = html.replace("</head>", () => `  <link rel="preload" as="image" href="${escHtml(meta.preloadImage)}" fetchpriority="high" />\n</head>`);
    }
    if (meta.body) {
      html = html.replace('<div id="root"></div>', () => `<div id="root">${meta.body}</div>`);
    }
    if (meta.extraHead) {
      html = html.replace("</head>", () => `${meta.extraHead}\n</head>`);
    }
    return html;
  }

  // Construye el body SEO de una ficha de evento (lo que el crawler indexa,
  // y lo que el usuario ve durante el flash pre-hidratación).
  function buildEventPageBody(ev) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:780px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:1.9rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 1rem;color:#fff";
    const metaRow = "color:#a0a0a0;margin:0 0 1.5rem;font-size:0.95rem;line-height:1.6";
    const dlStyle = "display:grid;grid-template-columns:140px 1fr;gap:0.75rem 1rem;margin:1.5rem 0;font-size:0.95rem";
    const dtStyle = "color:#888";
    const ddStyle = "color:#e5e5e5;margin:0";
    const ctaStyle = "display:inline-block;margin-top:1.5rem;padding:0.75rem 1.5rem;background:#7ec8ff;color:#000;text-decoration:none;border-radius:6px;font-weight:600";

    const artists = (ev.artists || []).filter(a => a && a !== "TBA").slice(0, 8);
    const artistsLine = artists.map(escHtml).join(", ");
    const headliner = artists[0] || ev.name;
    const venueLabel = ev.venue || "Buenos Aires";
    const cityLabel = ev.city || "Buenos Aires";

    // Descripción en el formato pedido por la auditoría — informa al usuario en
    // los rich snippets de Google: quién toca, dónde, cuándo, género.
    const timePart = ev.time ? ` a las ${ev.time}` : "";
    const genrePart = ev.genre ? ` Género: ${ev.genre}.` : "";
    const desc = `${headliner} se presenta en ${venueLabel}, ${cityLabel}, el ${ev.day} de ${ev.month}${timePart}.${genrePart} Entradas e info en BassLayer.`;

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(ev.name)}">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Eventos</a> <span>›</span> <span>${escHtml(ev.name)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<h1 style="${h1Style}">${escHtml(ev.name)}</h1>`);
    lines.push(`<p style="${metaRow}">${escHtml(ev.day)} ${escHtml(ev.month)}${ev.venue ? ` · ${escHtml(ev.venue)}` : ""}${ev.city ? `, ${escHtml(ev.city)}` : ""}</p>`);

    if (ev.image) {
      lines.push(`<img src="${escHtml(ev.image)}" alt="Flyer de ${escHtml(ev.name)}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;max-width:600px;height:auto;border-radius:8px;margin-bottom:1.5rem" />`);
    }

    lines.push(`<p style="color:#bcbcbc;line-height:1.6;margin:0 0 1.5rem">${escHtml(desc)}</p>`);

    lines.push(`<dl style="${dlStyle}">`);
    lines.push(`<dt style="${dtStyle}">Fecha</dt><dd style="${ddStyle}">${escHtml(ev.day)} de ${escHtml(ev.month)}</dd>`);
    if (ev.venue) lines.push(`<dt style="${dtStyle}">Venue</dt><dd style="${ddStyle}">${escHtml(ev.venue)}</dd>`);
    if (ev.city) lines.push(`<dt style="${dtStyle}">Ciudad</dt><dd style="${ddStyle}">${escHtml(ev.city)}</dd>`);
    if (ev.genre) lines.push(`<dt style="${dtStyle}">Género</dt><dd style="${ddStyle}">${escHtml(ev.genre)}</dd>`);
    if (artistsLine) lines.push(`<dt style="${dtStyle}">Artistas</dt><dd style="${ddStyle}">${artistsLine}</dd>`);
    lines.push(`</dl>`);

    if (ev.url) {
      lines.push(`<a href="${escHtml(ev.url)}" rel="noopener" style="${ctaStyle}">Ver entradas / más info</a>`);
    }

    lines.push(`</article>`);
    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${crumbLink}">← Volver a la agenda completa</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD MusicEvent enriquecido — builder compartido (musicEventSchema)
    const eventSchema = {
      "@context": "https://schema.org",
      ...musicEventSchema(ev, {
        "description": desc,
        "url": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}`,
      }),
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(eventSchema).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Eventos", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": ev.name, "item": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc };
  }

  function renderEventPage(ev) {
    const { html: body, desc } = buildEventPageBody(ev);
    const slug = eventSlug(ev);
    const artists = (ev.artists || []).filter(a => a && a !== "TBA");
    const headliner = artists[0] || ev.name;
    // Título compacto (headliner en venue · fecha) — mismo patrón que usa el cliente
    // al abrir el modal, así share previews y title del navegador son coherentes.
    const title = `${headliner}${ev.venue ? ` en ${ev.venue}` : ""} · ${ev.day} ${ev.month} | BassLayer`;
    return renderHtmlWithMeta({
      title,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/eventos/${slug}`,
      // OG dinámica branded por evento (vs flyer crudo que puede no tener
      // contexto del sitio). El preload sí usa el flyer porque es el LCP
      // del usuario que aterriza, no del crawler social.
      image: `${PROD_ORIGIN}/og/event/${slug}.png`,
      preloadImage: ev.image || null,
      body,
    });
  }

  // Página de noticia: la canonical apunta a la fuente original (somos un
  // agregador, no creamos el contenido). Esto le dice a Google "esta es una
  // copia, indexá la fuente". Lo nuestro suma valor en share previews + UX
  // sin pelearle ranking al medio original.
  function buildNewsPageBody(n) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:720px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:1.85rem;font-weight:600;letter-spacing:-0.02em;line-height:1.25;margin:0 0 1rem;color:#fff";
    const metaRow = "color:#a0a0a0;margin:0 0 1.5rem;font-size:0.9rem;display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap";
    const sourcePill = "display:inline-block;padding:0.2rem 0.6rem;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:999px;color:#bcbcbc;font-size:0.8rem";
    const tagPill = "display:inline-block;padding:0.2rem 0.6rem;background:#7ec8ff;color:#000;border-radius:999px;font-size:0.78rem;font-weight:600";
    const ctaStyle = "display:inline-block;margin-top:1.5rem;padding:0.85rem 1.5rem;background:#7ec8ff;color:#000;text-decoration:none;border-radius:6px;font-weight:600";
    const noteStyle = "color:#666;font-size:0.85rem;margin-top:2.5rem;line-height:1.5;border-top:1px solid #1a1a1a;padding-top:1.5rem";

    const desc = String(n.description || "").slice(0, 500);
    const sourceName = n.source || "fuente original";

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(n.title)}">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Noticias</a> <span>›</span> <span>${escHtml(sourceName)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<p style="${metaRow}">`);
    lines.push(`<span style="${sourcePill}">${escHtml(sourceName)}</span>`);
    if (n.tag) lines.push(`<span style="${tagPill}">${escHtml(n.tag)}</span>`);
    if (n.time) lines.push(`<span>${escHtml(n.time)}</span>`);
    lines.push(`</p>`);

    lines.push(`<h1 style="${h1Style}">${escHtml(n.title)}</h1>`);

    if (n.image) {
      lines.push(`<img src="${escHtml(n.image)}" alt="${escHtml(n.title)}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;max-width:600px;height:auto;border-radius:8px;margin-bottom:1.5rem" />`);
    }

    if (desc) {
      lines.push(`<p style="color:#d0d0d0;line-height:1.65;margin:0 0 1.5rem;font-size:1.05rem">${escHtml(desc)}</p>`);
    }

    if (n.url) {
      lines.push(`<a href="${escHtml(n.url)}" rel="noopener" target="_blank" style="${ctaStyle}">Leer artículo completo en ${escHtml(sourceName)} →</a>`);
    }

    lines.push(`<p style="${noteStyle}">Esta es una vista resumen curada por BassLayer. El artículo completo y la atribución pertenecen a <strong>${escHtml(sourceName)}</strong>. Para más noticias y eventos, volvé a <a href="/" style="${crumbLink}">BassLayer</a>.</p>`);
    lines.push(`</article>`);
    lines.push(`</div></main>`);

    // JSON-LD NewsArticle — publisher = fuente original, mainEntityOfPage = source.
    // Esto comunica a Google que somos una vista derivada, no la fuente.
    const newsSchema = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": String(n.title || "").slice(0, 110),
      "description": desc,
      "url": n.url || `${PROD_ORIGIN}/noticias/${newsSlug(n)}`,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": n.url || `${PROD_ORIGIN}/noticias/${newsSlug(n)}`
      },
      "publisher": {
        "@type": "Organization",
        "name": sourceName
      },
      "isAccessibleForFree": true,
      "inLanguage": n.region === "Intl" ? "en" : "es"
    };
    if (n.image) newsSchema.image = [n.image];
    if (n.tag) newsSchema.keywords = n.tag;
    lines.push(`<script type="application/ld+json">${JSON.stringify(newsSchema).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Noticias", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": n.title, "item": `${PROD_ORIGIN}/noticias/${newsSlug(n)}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc };
  }

  // Página de festival: curado por nosotros → SÍ es indexable (no hay riesgo
  // de duplicate content). Schema MusicFestival (subtipo de MusicEvent reconocido
  // por Google Events) con startDate/endDate, location multi-país, tags, etc.
  function formatLongDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    return `${d.getUTCDate()} de ${months[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }
  function dateRange(start, end) {
    if (!start) return "fecha por confirmar";
    if (!end || end === start) return formatLongDate(start);
    const s = new Date(start), e = new Date(end);
    if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
      const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
      return `${s.getUTCDate()} – ${e.getUTCDate()} de ${months[s.getUTCMonth()]} de ${s.getUTCFullYear()}`;
    }
    return `${formatLongDate(start)} – ${formatLongDate(end)}`;
  }

  function buildFestivalPageBody(f) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:760px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:2rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 0.5rem;color:#fff";
    const subtitleStyle = "color:#a0a0a0;margin:0 0 1.5rem;font-size:1rem";
    const dlStyle = "display:grid;grid-template-columns:140px 1fr;gap:0.75rem 1rem;margin:1.5rem 0;font-size:0.95rem";
    const dtStyle = "color:#888";
    const ddStyle = "color:#e5e5e5;margin:0";
    const tagStyle = "display:inline-block;padding:0.25rem 0.7rem;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:999px;color:#bcbcbc;font-size:0.8rem;margin:0 0.4rem 0.4rem 0";
    const ctaStyle = "display:inline-block;margin-top:1.5rem;padding:0.85rem 1.5rem;background:#7ec8ff;color:#000;text-decoration:none;border-radius:6px;font-weight:600";
    const statusBadge = "display:inline-block;padding:0.25rem 0.7rem;border-radius:999px;font-size:0.8rem;font-weight:600;margin-left:0.5rem";

    const status = festivalStatus(f);
    const statusLabel = { live: "EN VIVO", upcoming: "PRÓXIMO", tba: "POR CONFIRMAR", past: "FINALIZADO" }[status] || "";
    const statusColor = { live: "background:#ff4444;color:#fff", upcoming: "background:#7ec8ff;color:#000", tba: "background:#444;color:#fff", past: "background:#333;color:#888" }[status] || "background:#333;color:#888";

    const range = dateRange(f.dates_start, f.dates_end);
    const location = [f.city, f.country].filter(Boolean).join(", ");
    const tags = Array.isArray(f.tags) ? f.tags : [];

    const desc = [
      f.description || `${f.name} en ${location}, ${range}.`,
      tags.length ? `Géneros: ${tags.join(", ")}.` : "",
      "Más festivales y agenda completa de música electrónica en BassLayer.",
    ].filter(Boolean).join(" ");

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(f.name)}">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Festivales</a> <span>›</span> <span>${escHtml(f.name)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<h1 style="${h1Style}">${escHtml(f.name)}${statusLabel ? `<span style="${statusBadge};${statusColor}">${statusLabel}</span>` : ""}</h1>`);
    lines.push(`<p style="${subtitleStyle}">${escHtml(range)}${location ? ` · ${escHtml(location)}` : ""}</p>`);

    if (f.image) {
      lines.push(`<img src="${escHtml(f.image)}" alt="Logo ${escHtml(f.name)}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;max-width:480px;height:auto;border-radius:8px;margin-bottom:1.5rem;background:#0a0a0a;padding:1rem" />`);
    }

    if (f.description) {
      lines.push(`<p style="color:#d0d0d0;line-height:1.65;margin:0 0 1.5rem;font-size:1.05rem">${escHtml(f.description)}</p>`);
    }

    lines.push(`<dl style="${dlStyle}">`);
    if (f.dates_start) lines.push(`<dt style="${dtStyle}">Fechas</dt><dd style="${ddStyle}">${escHtml(range)}</dd>`);
    if (f.city) lines.push(`<dt style="${dtStyle}">Ciudad</dt><dd style="${ddStyle}">${escHtml(f.city)}</dd>`);
    if (f.country) lines.push(`<dt style="${dtStyle}">País</dt><dd style="${ddStyle}">${escHtml(f.country)}</dd>`);
    if (f.region) lines.push(`<dt style="${dtStyle}">Región</dt><dd style="${ddStyle}">${escHtml(f.region)}</dd>`);
    if (tags.length) {
      lines.push(`<dt style="${dtStyle}">Géneros</dt><dd style="${ddStyle}">${tags.map(t => `<span style="${tagStyle}">${escHtml(t)}</span>`).join("")}</dd>`);
    }
    lines.push(`</dl>`);

    if (f.url) {
      lines.push(`<a href="${escHtml(f.url)}" rel="noopener" target="_blank" style="${ctaStyle}">Sitio oficial / entradas →</a>`);
    }

    lines.push(`</article>`);
    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${crumbLink}">← Ver todos los festivales y agenda completa</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD MusicFestival — Google Events lo entiende y lo muestra en rich
    // results con un panel especial de festivales.
    const eventStatusMap = {
      live: "https://schema.org/EventScheduled",
      upcoming: "https://schema.org/EventScheduled",
      tba: "https://schema.org/EventScheduled",
      past: "https://schema.org/EventScheduled",
    };
    const festivalSchema = {
      "@context": "https://schema.org",
      "@type": "MusicFestival",
      "name": f.name,
      "description": f.description || desc,
      "url": `${PROD_ORIGIN}/festivales/${festivalSlug(f)}`,
      "startDate": f.dates_start || undefined,
      "endDate": f.dates_end || f.dates_start || undefined,
      "eventStatus": eventStatusMap[status],
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "location": {
        "@type": "Place",
        "name": location || f.name,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": f.city || undefined,
          "addressCountry": f.country || undefined
        }
      },
      "organizer": { "@type": "Organization", "name": f.name, "url": f.url || undefined },
      "isAccessibleForFree": false
    };
    if (f.image) festivalSchema.image = [f.image];
    if (tags.length) festivalSchema.keywords = tags.join(", ");
    if (f.url) {
      festivalSchema.offers = {
        "@type": "Offer",
        "url": f.url,
        "availability": status === "past" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        "category": "primary"
      };
    }
    // Limpiar undefined (JSON.stringify ya los omite, pero por prolijidad)
    lines.push(`<script type="application/ld+json">${JSON.stringify(festivalSchema).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Festivales", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": f.name, "item": `${PROD_ORIGIN}/festivales/${festivalSlug(f)}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc };
  }

  // Hub por género: ataca queries de cola larga de alto volumen
  // ("techno buenos aires", "house buenos aires"). Cada hub es indexable y
  // tiene texto evergreen + lista actualizable de eventos del género.
  function buildGenrePageBody(genre, events) {
    const slug = genreSlug(genre);
    const label = genreLabel(genre);
    const blurb = GENRE_BLURBS[genre] || `${label} en Buenos Aires y Argentina: agenda de eventos, fiestas y festivales.`;
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:880px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:2rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 0.75rem;color:#fff";
    const introStyle = "color:#bcbcbc;line-height:1.65;margin:0 0 2.5rem;font-size:1rem;max-width:65ch";
    const h2Style = "font-size:1.2rem;font-weight:500;color:#fff;margin:2rem 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid #222;letter-spacing:-0.01em";
    const ulStyle = "list-style:none;padding:0;margin:0";
    const liStyle = "padding:0.7rem 0;border-bottom:1px solid #141414;line-height:1.5;font-size:0.95rem";
    const linkStyle = "color:#7ec8ff;text-decoration:none";
    const metaStyle = "color:#888;font-size:0.88em";
    const tagRow = "display:flex;flex-wrap:wrap;gap:0.4rem;margin:1.5rem 0 2rem";
    const tagPill = "padding:0.35rem 0.8rem;border-radius:999px;font-size:0.8rem;text-decoration:none";

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(label)} en Buenos Aires">`, `<div style="${innerStyle}">`];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Eventos</a> <span>›</span> <a href="/" style="${crumbLink}">Géneros</a> <span>›</span> <span>${escHtml(label)}</span></nav>`);

    lines.push(`<h1 style="${h1Style}">${escHtml(label)} en Buenos Aires — Próximos eventos</h1>`);
    lines.push(`<p style="${introStyle}">${escHtml(blurb)}</p>`);

    // Nav cruzado a otros géneros (internal linking = autoridad temática para Google)
    lines.push(`<nav aria-label="Otros géneros" style="${tagRow}">`);
    for (const g of GENRE_LIST) {
      if (g === genre || g === "Electronic") continue;
      lines.push(`<a href="/eventos/genero/${escHtml(genreSlug(g))}" style="${tagPill};background:#1a1a1a;color:#bcbcbc;border:1px solid #2a2a2a">${escHtml(genreLabel(g))}</a>`);
    }
    lines.push(`</nav>`);

    if (events.length > 0) {
      lines.push(`<section aria-labelledby="seo-genre-events">`);
      lines.push(`<h2 id="seo-genre-events" style="${h2Style}">Eventos de ${escHtml(label)} próximos</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      for (const ev of events.slice(0, 30)) {
        const evSlug = eventSlug(ev);
        const artists = (ev.artists || []).slice(0, 3).map(escHtml).join(", ");
        const name = `<a href="/eventos/${escHtml(evSlug)}" style="${linkStyle};font-weight:500">${escHtml(ev.name)}</a>`;
        const venue = ev.venue ? ` · ${escHtml(ev.venue)}` : "";
        const performers = artists ? ` · <span style="${metaStyle}">${artists}</span>` : "";
        lines.push(`<li style="${liStyle}">${name} <span style="${metaStyle}">${escHtml(ev.day)} ${escHtml(ev.month)}</span>${venue}${performers}</li>`);
      }
      lines.push(`</ul></section>`);
    } else {
      lines.push(`<p style="color:#888;line-height:1.5;margin:2rem 0;padding:1rem;background:#0a0a0a;border-radius:8px">No hay eventos de ${escHtml(label)} programados en este momento. Volvé a chequear pronto — actualizamos la agenda todos los días.</p>`);
    }

    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${linkStyle}">← Ver toda la agenda y otros géneros</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD ItemList de eventos del género
    if (events.length > 0) {
      const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": `Eventos de ${label} en Buenos Aires`,
        "numberOfItems": Math.min(events.length, 30),
        "itemListElement": events.slice(0, 30).map((ev, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "url": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}`,
          "name": ev.name
        }))
      };
      lines.push(`<script type="application/ld+json">${JSON.stringify(itemList).replace(/<\//g, "<\\/")}</script>`);
    }

    // CollectionPage describe el hub mismo (no la lista)
    const collection = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": `${label} en Buenos Aires`,
      "description": blurb,
      "url": `${PROD_ORIGIN}/eventos/genero/${slug}`,
      "inLanguage": "es-AR",
      "isPartOf": { "@type": "WebSite", "@id": `${PROD_ORIGIN}/#website` },
      "about": { "@type": "Thing", "name": label }
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(collection).replace(/<\//g, "<\\/")}</script>`);

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Eventos", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 3, "name": label, "item": `${PROD_ORIGIN}/eventos/genero/${slug}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc: blurb };
  }

  // Guía long-form — Markdown body con full SEO meta + Article JSON-LD + FAQ
  function buildGuiaPageBody(g) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:720px;margin:0 auto;padding:2.5rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:2.1rem;font-weight:600;letter-spacing:-0.025em;line-height:1.15;margin:0 0 1rem;color:#fff";
    const metaRow = "color:#888;font-size:0.85rem;margin:0 0 2rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center";
    const tldrBox = "background:#0f0f0f;border-left:3px solid #7ec8ff;padding:1.25rem 1.5rem;margin:1.5rem 0 2.5rem;border-radius:0 6px 6px 0;color:#d0d0d0;line-height:1.6;font-size:1rem";
    // Estilos para los nodos generados por marked (h2/h3/p/ul/li/a/strong/em)
    const proseCss = `
      .prose { line-height:1.7; font-size:1.05rem; color:#d5d5d5; }
      .prose h2 { font-size:1.55rem; font-weight:600; letter-spacing:-0.015em; margin:2.5rem 0 1rem; color:#fff; padding-bottom:0.4rem; border-bottom:1px solid #1f1f1f; }
      .prose h3 { font-size:1.2rem; font-weight:600; margin:2rem 0 0.75rem; color:#fff; }
      .prose p { margin:0 0 1.1rem; }
      .prose ul, .prose ol { margin:0 0 1.25rem 1.5rem; padding:0; }
      .prose li { margin:0.35rem 0; }
      .prose a { color:#7ec8ff; text-decoration:none; border-bottom:1px solid rgba(126,200,255,0.3); }
      .prose a:hover { border-bottom-color:#7ec8ff; }
      .prose strong { color:#fff; font-weight:700; }
      .prose em { font-style:italic; color:#bcbcbc; }
      .prose hr { border:0; border-top:1px solid #1f1f1f; margin:2.5rem 0; }
      .prose blockquote { border-left:3px solid #2a2a2a; padding:0.5rem 1rem; margin:1.25rem 0; color:#a0a0a0; font-style:italic; }
      .prose code { background:#1a1a1a; padding:0.15rem 0.4rem; border-radius:3px; font-size:0.92em; color:#e6c896; }
    `;

    const lines = [
      `<style>${proseCss}</style>`,
      `<main style="${wrapStyle}" aria-label="${escHtml(g.title)}">`,
      `<div style="${innerStyle}">`,
    ];

    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Guías</a> <span>›</span> <span>${escHtml(g.title)}</span></nav>`);

    lines.push(`<article>`);
    lines.push(`<h1 style="${h1Style}">${escHtml(g.title)}</h1>`);
    lines.push(`<p style="${metaRow}">`);
    lines.push(`<span>Por ${escHtml(g.author)}</span>`);
    if (g.publishedAt) lines.push(`<span>·</span><time datetime="${escHtml(g.publishedAt)}">Publicado ${escHtml(g.publishedAt)}</time>`);
    if (g.updatedAt && g.updatedAt !== g.publishedAt) {
      lines.push(`<span>·</span><span>Actualizado ${escHtml(g.updatedAt)}</span>`);
    }
    lines.push(`</p>`);

    if (g.tldr) {
      lines.push(`<aside style="${tldrBox}"><strong style="color:#7ec8ff;text-transform:uppercase;letter-spacing:0.08em;font-size:0.78rem;display:block;margin-bottom:0.5rem">TL;DR</strong>${escHtml(g.tldr)}</aside>`);
    }

    // marked.parse genera HTML seguro — los .md están en el repo (no input usuario)
    lines.push(`<div class="prose">${g.bodyHtml}</div>`);

    lines.push(`</article>`);
    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${crumbLink}">← Volver a BassLayer</a></p>`);
    lines.push(`</div></main>`);

    // JSON-LD Article — elegible para Top Stories y rich results
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": g.title,
      "description": g.description,
      "url": `${PROD_ORIGIN}/guias/${g.slug}`,
      "image": [`${PROD_ORIGIN}/og-image.png`],
      "datePublished": g.publishedAt,
      "dateModified": g.updatedAt || g.publishedAt,
      "author": { "@type": "Organization", "name": g.author, "url": PROD_ORIGIN },
      "publisher": {
        "@type": "Organization",
        "name": "BassLayer",
        "logo": { "@type": "ImageObject", "url": `${PROD_ORIGIN}/icon-512.png`, "width": 512, "height": 512 }
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": `${PROD_ORIGIN}/guias/${g.slug}` },
      "inLanguage": "es-AR",
      "keywords": Array.isArray(g.keywords) ? g.keywords.join(", ") : "",
      "articleSection": g.category
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(articleSchema).replace(/<\//g, "<\\/")}</script>`);

    // FAQPage JSON-LD — rich result que ocupa mucho espacio en SERP
    if (Array.isArray(g.faqs) && g.faqs.length > 0) {
      const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": g.faqs.map(f => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      };
      lines.push(`<script type="application/ld+json">${JSON.stringify(faqSchema).replace(/<\//g, "<\\/")}</script>`);
    }

    const breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": `${PROD_ORIGIN}/` },
        { "@type": "ListItem", "position": 2, "name": "Guías", "item": `${PROD_ORIGIN}/guias` },
        { "@type": "ListItem", "position": 3, "name": g.title, "item": `${PROD_ORIGIN}/guias/${g.slug}` }
      ]
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/<\//g, "<\\/")}</script>`);

    return { html: lines.join(""), desc: g.description || g.tldr || g.title };
  }

  function renderGuiaPage(g) {
    const { html: body, desc } = buildGuiaPageBody(g);
    return renderHtmlWithMeta({
      title: `${g.title} | BassLayer`,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/guias/${g.slug}`,
      image: `${PROD_ORIGIN}/og-image.png`,
      body,
    });
  }

  function renderGenrePage(genre) {
    const allEvents = cached("events") || [];
    // `genre` es la key de familia (club/live/…); filtramos por family, no por e.genre.
    const events = allEvents.filter(e => (e.family || "") === genre);
    const { html: body, desc } = buildGenrePageBody(genre, events);
    const count = events.length;
    const titleSuffix = count > 0 ? `${count} eventos próximos` : "Agenda";
    return renderHtmlWithMeta({
      title: `${genreLabel(genre)} en Buenos Aires — ${titleSuffix} | BassLayer`,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/eventos/genero/${genreSlug(genre)}`,
      image: `${PROD_ORIGIN}/og-image.png`,
      body,
    });
  }

  // ── Páginas programáticas temporales: /eventos/hoy · /eventos/este-finde ──
  // El playbook de RA/Songkick: la query "fiestas hoy buenos aires" tiene una
  // página exacta que la responde, con ItemList para el carrusel de Google.
  function temporalEvents(kind) {
    const all = (cached("events") || []).filter((e) => (e.region || "AR") === "AR");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from = today, to = new Date(today.getTime() + (kind === "agenda" ? 21 : 1) * 86400000);
    if (kind === "este-finde") {
      const dow = today.getDay();
      const fo = dow === 5 ? 0 : dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow;
      from = new Date(today); from.setDate(from.getDate() + fo);
      to = new Date(from); to.setDate(to.getDate() + 3);
    }
    return all
      .map((ev) => ({ ev, p: icsDateParts(ev) }))
      .filter((x) => x.p && x.p.sort >= from.getTime() && x.p.sort < to.getTime())
      .sort((a, b) => a.p.sort - b.p.sort)
      .map((x) => x.ev);
  }

  // Body genérico de página-listado (temporales y venues): mismo lenguaje
  // visual que las páginas de género.
  function buildListPageBody({ ariaLabel, crumb, h1, intro, listTitle, events, emptyMsg, extraNav }) {
    const wrapStyle = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0";
    const innerStyle = "max-width:880px;margin:0 auto;padding:2rem 1.25rem";
    const crumbStyle = "color:#888;font-size:0.85rem;margin-bottom:1.5rem";
    const crumbLink = "color:#7ec8ff;text-decoration:none";
    const h1Style = "font-size:2rem;font-weight:600;letter-spacing:-0.02em;line-height:1.2;margin:0 0 0.75rem;color:#fff";
    const introStyle = "color:#bcbcbc;line-height:1.65;margin:0 0 2rem;font-size:1rem;max-width:65ch";
    const h2Style = "font-size:1.2rem;font-weight:500;color:#fff;margin:2rem 0 1rem;padding-bottom:0.5rem;border-bottom:1px solid #222;letter-spacing:-0.01em";
    const ulStyle = "list-style:none;padding:0;margin:0";
    const liStyle = "padding:0.7rem 0;border-bottom:1px solid #141414;line-height:1.5;font-size:0.95rem";
    const linkStyle = "color:#7ec8ff;text-decoration:none";
    const metaStyle = "color:#888;font-size:0.88em";

    const lines = [`<main style="${wrapStyle}" aria-label="${escHtml(ariaLabel)}">`, `<div style="${innerStyle}">`];
    lines.push(`<nav aria-label="Ruta" style="${crumbStyle}"><a href="/" style="${crumbLink}">BassLayer</a> <span>›</span> <a href="/" style="${crumbLink}">Eventos</a> <span>›</span> <span>${escHtml(crumb)}</span></nav>`);
    lines.push(`<h1 style="${h1Style}">${escHtml(h1)}</h1>`);
    lines.push(`<p style="${introStyle}">${escHtml(intro)}</p>`);
    if (extraNav) lines.push(extraNav);
    if (events.length > 0) {
      lines.push(`<section aria-labelledby="seo-list">`);
      lines.push(`<h2 id="seo-list" style="${h2Style}">${escHtml(listTitle)} (${events.length})</h2>`);
      lines.push(`<ul style="${ulStyle}">`);
      for (const ev of events.slice(0, 40)) {
        const evSlug = eventSlug(ev);
        const artists = (ev.artists || []).filter((a) => a && a !== "TBA").slice(0, 3).map(escHtml).join(", ");
        const name = `<a href="/eventos/${escHtml(evSlug)}" style="${linkStyle};font-weight:500">${escHtml(ev.name)}</a>`;
        const venue = ev.venue ? ` · ${escHtml(ev.venue)}` : "";
        const performers = artists ? ` · <span style="${metaStyle}">${artists}</span>` : "";
        lines.push(`<li style="${liStyle}">${name} <span style="${metaStyle}">${escHtml(ev.day)} ${escHtml(ev.month)}${ev.time ? ` · ${escHtml(ev.time)}` : ""}</span>${venue}${performers}</li>`);
      }
      lines.push(`</ul></section>`);
    } else {
      lines.push(`<p style="color:#888;line-height:1.5;margin:2rem 0;padding:1rem;background:#0a0a0a;border-radius:8px">${escHtml(emptyMsg)}</p>`);
    }
    lines.push(`<p style="color:#666;font-size:0.85rem;margin-top:3rem"><a href="/" style="${linkStyle}">← Ver toda la agenda</a></p>`);
    lines.push(`</div></main>`);

    if (events.length > 0) {
      const itemList = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": listTitle,
        "numberOfItems": Math.min(events.length, 40),
        "itemListElement": events.slice(0, 40).map((ev, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": musicEventSchema(ev, { "url": `${PROD_ORIGIN}/eventos/${eventSlug(ev)}` }),
        })),
      };
      lines.push(`<script type="application/ld+json">${JSON.stringify(itemList).replace(/<\//g, "<\\/")}</script>`);
    }
    return lines.join("");
  }

  // ── /semana — el resumen semanal: versión para buscadores y para compartir.
  // La página de verdad la dibuja el cliente (src/components/Semana.jsx).
  function renderSemanaPage(S) {
    const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const fd = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MES[m - 1]}`; };
    const pct = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")}%`;
    const btc = S.mercado.btc;
    const h1 = `La semana Nº ${S.semana.numero}: ${S.noche.fiestas} fiestas${btc ? ` y el Bitcoin ${pct(btc.cambio7d)}` : ""}`;
    const intro = `Lo que viene en la noche de Buenos Aires y lo que hizo el mercado en los últimos 7 días (${fd(S.semana.desde)} → ${fd(S.semana.hasta)}). Se renueva cada lunes.`;
    const li = (t) => `<li>${t}</li>`;
    const body = `<main style="max-width:820px;margin:0 auto;padding:2rem 1.25rem;font-family:system-ui,sans-serif;color:#e5e5e5;background:#000">
      <h1>${escHtml(h1)}</h1><p>${escHtml(intro)}</p>
      <h2>El finde · los elegidos</h2><ul>${S.noche.finde.map((e) => li(`${escHtml(e.nombre)} — ${escHtml(e.dia)} ${escHtml(e.mes)}, ${escHtml(e.venue)}`)).join("")}</ul>
      ${S.noche.gira.length ? `<h2>De gira</h2><ul>${S.noche.gira.map((g) => li(`${escHtml(g.artista)} — ${escHtml(g.evento.venue)} (antes en ${escHtml(g.ciudades.join(", "))})`)).join("")}</ul>` : ""}
      ${S.noche.festivales.length ? `<h2>Festivales que se vienen</h2><ul>${S.noche.festivales.map((f) => li(`${escHtml(f.nombre)} — ${fd(f.desde)}, ${escHtml(f.ciudad)}`)).join("")}</ul>` : ""}
      <h2>El mercado</h2><ul>${S.mercado.activos.map((a) => li(`${escHtml(a.sym)}: ${pct(a.cambio7d)} en 7 días`)).join("")}</ul>
      <p><a href="/" style="color:#C49070">Ver la agenda completa en BassLayer</a></p></main>`;
    return renderHtmlWithMeta({
      title: `${h1} | BassLayer`,
      description: intro,
      canonical: `${PROD_ORIGIN}/semana`,
      image: `${PROD_ORIGIN}/og/semana.png?s=${S.semana.anio}-${S.semana.numero}`,
      body,
    });
  }

  function renderTemporalPage(kind) {
    const events = temporalEvents(kind);
    const isHoy = kind === "hoy";
    const h1 = isHoy ? "Eventos hoy en Buenos Aires" : "Qué hacer este finde en Buenos Aires";
    const intro = isHoy
      ? "Fiestas, recitales y eventos de música electrónica y más para hoy en Buenos Aires y alrededores. Actualizado todos los días con la agenda completa."
      : "La agenda del fin de semana en Buenos Aires: fiestas electrónicas, recitales en vivo, festivales y más — viernes, sábado y domingo, actualizada a diario.";
    const crossLink = isHoy
      ? `<p style="margin:0 0 2rem"><a href="/eventos/este-finde" style="color:#7ec8ff;text-decoration:none">→ Ver todo el finde</a></p>`
      : `<p style="margin:0 0 2rem"><a href="/eventos/hoy" style="color:#7ec8ff;text-decoration:none">→ Ver solo hoy</a></p>`;
    const body = buildListPageBody({
      ariaLabel: h1,
      crumb: isHoy ? "Hoy" : "Este finde",
      h1, intro,
      listTitle: isHoy ? "Los eventos de hoy" : "Los eventos del finde",
      events,
      emptyMsg: isHoy
        ? "No hay eventos cargados para hoy — mirá el finde completo o volvé mañana, la agenda se actualiza a diario."
        : "Todavía no hay eventos cargados para este finde. La agenda se actualiza todos los días.",
      extraNav: crossLink,
    });
    return renderHtmlWithMeta({
      title: `${h1} — ${events.length > 0 ? `${events.length} eventos` : "Agenda"} | BassLayer`,
      description: intro.slice(0, 300),
      canonical: `${PROD_ORIGIN}/eventos/${kind}`,
      image: `${PROD_ORIGIN}/og-image.png`,
      body,
    });
  }

  // ── /agenda · /noticias · /festivales (oct 2026): las secciones de Bass con
  // dirección propia. Para buscadores y para la vista previa al compartir: su
  // título, descripción y la lista real (los mismos caches que la API).
  function renderSeccionPage(sec) {
    const linkStyle = "color:#7ec8ff;text-decoration:none";
    const lista = (h1, intro, items) => `<main style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#e5e5e5;background:#000;min-height:100vh;margin:0" aria-label="${escHtml(h1)}"><div style="max-width:880px;margin:0 auto;padding:2rem 1.25rem">`
      + `<h1 style="font-size:2rem;font-weight:600;margin:0 0 0.75rem;color:#fff">${escHtml(h1)}</h1><p style="color:#bcbcbc;line-height:1.65;margin:0 0 2rem;max-width:65ch">${escHtml(intro)}</p>`
      + `<ul style="list-style:none;padding:0;margin:0">${items.map(([href, t, m]) => `<li style="padding:0.7rem 0;border-bottom:1px solid #141414;line-height:1.5"><a href="${escHtml(href)}" style="${linkStyle};font-weight:500">${escHtml(t)}</a>${m ? ` <span style="color:#888;font-size:0.88em">${escHtml(m)}</span>` : ""}</li>`).join("")}</ul>`
      + `<p style="margin-top:3rem"><a href="/" style="${linkStyle}">← BassLayer</a></p></div></main>`;
    if (sec === "agenda") {
      const events = temporalEvents("agenda");
      const h1 = "Agenda de música electrónica en Buenos Aires";
      const intro = "Fiestas, clubes y festivales de electrónica en Buenos Aires: las próximas tres semanas, día por día, actualizadas a diario.";
      return renderHtmlWithMeta({
        title: `${h1} | BassLayer`, description: intro, canonical: `${PROD_ORIGIN}/agenda`, image: `${PROD_ORIGIN}/og-image.png`,
        body: buildListPageBody({ ariaLabel: h1, crumb: "Agenda", h1, intro, listTitle: "Próximas fechas", events, emptyMsg: "La agenda se actualiza todos los días." }),
      });
    }
    if (sec === "noticias") {
      const news = (cached("bassNews") || []).slice(0, 30);
      const h1 = "Noticias de música electrónica";
      const intro = "Lo que pasa en la escena electrónica, de Buenos Aires y del mundo: clubes, artistas, lanzamientos y festivales.";
      return renderHtmlWithMeta({
        title: `${h1} | BassLayer`, description: intro, canonical: `${PROD_ORIGIN}/noticias`, image: `${PROD_ORIGIN}/og-image.png`,
        body: lista(h1, intro, news.map((n) => [`/noticias/${newsSlug(n)}`, n.title, n.source || ""])),
      });
    }
    const fests = loadFestivals().filter((f) => festivalStatus(f) !== "past");
    const h1 = "Festivales de música electrónica";
    const intro = "Los festivales de electrónica de Argentina y la región, con fechas y lugar.";
    return renderHtmlWithMeta({
      title: `${h1} | BassLayer`, description: intro, canonical: `${PROD_ORIGIN}/festivales`, image: `${PROD_ORIGIN}/og-image.png`,
      body: lista(h1, intro, fests.map((f) => [`/festivales/${festivalSlug(f)}`, f.name, [f.city, f.dates_start].filter(Boolean).join(" · ")])),
    });
  }

  // ── /layer — el mundo crypto con URL propia e indexable ──
  // Hasta ahora Layer vivía en /?view=layer con el title, description y
  // canonical del home: invisible para búsqueda. Esta página prerenderiza
  // titulares, precios y ETFs reales (los mismos caches que sirve la API).
  function renderLayerPage() {
    const news = (cached("news") || []).slice(0, 12);
    const fin = (cached("financeNews") || []).slice(0, 6);
    const prices = cached("prices") || [];
    const markets = cached("markets");
    const etfs = ((markets && markets.groups) || []).filter((g) => g.kind === "etf").flatMap((g) => g.items);
    const h1 = "Bitcoin, ETFs y noticias cripto en español";
    const intro = "Precios en vivo, noticias cripto y de mercados, ETFs de Bitcoin e índices, dólar cripto en Argentina y los ciclos de halving de Bitcoin. El mundo Layer de BassLayer, actualizado a cada hora.";
    const fmtUsd = (n) => n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${Number(n).toFixed(2)}`;
    const li = (n) => `<li style="margin:0 0 .6rem"><a href="${escHtml(n.url || `/noticias/${newsSlug(n)}`)}" rel="noopener" style="color:#e5e5e5;text-decoration:none">${escHtml(n.title)}</a> <span style="color:#7a8b98;font-size:.85em">— ${escHtml(n.source || "")}</span></li>`;
    const body = `
      <section aria-label="${escHtml(h1)}" style="max-width:820px;margin:0 auto;padding:2rem 1.25rem;font-family:system-ui,sans-serif;color:#e5e5e5">
        <nav aria-label="Migas" style="font-size:.85rem;color:#7a8b98;margin-bottom:1rem"><a href="/" style="color:#7a8b98;text-decoration:none">BassLayer</a> › Layer</nav>
        <h1 style="font-size:2rem;line-height:1.15;margin:0 0 .75rem">${escHtml(h1)}</h1>
        <p style="color:#aaa;line-height:1.55;margin:0 0 2rem">${escHtml(intro)}</p>
        ${prices.length ? `<h2 style="font-size:1.1rem;margin:0 0 .5rem">Precios ahora</h2><p style="color:#ccc;margin:0 0 1.5rem">${prices.slice(0, 8).map((p) => `${escHtml(p.sym)} ${fmtUsd(p.usd)} (${p.change >= 0 ? "+" : ""}${p.change}%)`).join(" · ")}</p>` : ""}
        ${etfs.length ? `<h2 style="font-size:1.1rem;margin:0 0 .5rem">ETFs</h2><p style="color:#ccc;margin:0 0 1.5rem">${etfs.map((e) => `${escHtml(e.symbol)} ${escHtml(e.name)} ${fmtUsd(e.price)} (${e.changePct >= 0 ? "+" : ""}${e.changePct}%)`).join(" · ")}</p>` : ""}
        ${news.length ? `<h2 style="font-size:1.1rem;margin:0 0 .5rem">Noticias crypto</h2><ul style="list-style:none;padding:0;margin:0 0 1.5rem">${news.map(li).join("")}</ul>` : ""}
        ${fin.length ? `<h2 style="font-size:1.1rem;margin:0 0 .5rem">Finanzas y mercados</h2><ul style="list-style:none;padding:0;margin:0 0 1.5rem">${fin.map(li).join("")}</ul>` : ""}
        <p style="margin:0"><a href="/" style="color:#7ec8ff;text-decoration:none">→ Ver la agenda de eventos (Bass)</a></p>
      </section>`;
    return renderHtmlWithMeta({
      title: `${h1} | BassLayer`,
      description: intro.slice(0, 300),
      canonical: `${PROD_ORIGIN}/layer`,
      image: `${PROD_ORIGIN}/og-image.png`,
      body,
    });
  }

  // ── Páginas de venue: /eventos/venue/:slug ──
  // "crobar eventos" tiene intención altísima y competencia local baja.
  function venueEvents(vslug) {
    const all = (cached("events") || []);
    return all
      .filter((e) => e.venue && slugify(e.venue) === vslug)
      .map((ev) => ({ ev, p: icsDateParts(ev) }))
      .filter((x) => x.p && x.p.sort > Date.now() - 86400000)
      .sort((a, b) => a.p.sort - b.p.sort)
      .map((x) => x.ev);
  }

  function renderVenuePage(vslug) {
    const events = venueEvents(vslug);
    if (events.length === 0) return null;
    const venueName = events[0].venue;
    const city = events[0].city || "Buenos Aires";
    const address = events.find((e) => e.address)?.address;
    const h1 = `${venueName} — Próximos eventos`;
    const intro = `Agenda de próximas fechas en ${venueName}${address ? ` (${address}, ${city})` : `, ${city}`}: fiestas, DJs y música en vivo, actualizada a diario.`;
    const body = buildListPageBody({
      ariaLabel: h1,
      crumb: venueName,
      h1, intro,
      listTitle: `Próximas fechas en ${venueName}`,
      events,
      emptyMsg: "",
    });
    return renderHtmlWithMeta({
      title: `${venueName}: próximos eventos y fechas — ${city} | BassLayer`,
      description: intro.slice(0, 300),
      canonical: `${PROD_ORIGIN}/eventos/venue/${vslug}`,
      image: `${PROD_ORIGIN}/og-image.png`,
      body,
    });
  }

  function renderFestivalPage(f) {
    const { html: body, desc } = buildFestivalPageBody(f);
    const range = dateRange(f.dates_start, f.dates_end);
    const slug = festivalSlug(f);
    const title = `${f.name} ${f.dates_start ? `(${range})` : ""} | BassLayer`.trim().replace(/\s+/g, " ");
    return renderHtmlWithMeta({
      title,
      description: desc.slice(0, 300),
      canonical: `${PROD_ORIGIN}/festivales/${slug}`,
      image: `${PROD_ORIGIN}/og/festival/${slug}.png`,
      preloadImage: f.image || null,
      body,
    });
  }

  function renderNewsPage(n) {
    const { html: body, desc } = buildNewsPageBody(n);
    const sourceName = n.source || "BassLayer";
    const slug = newsSlug(n);
    const title = `${n.title} — ${sourceName} | BassLayer`;
    // Canonical apunta a la fuente original cuando existe — somos derivados.
    const canonical = n.url || `${PROD_ORIGIN}/noticias/${slug}`;
    return renderHtmlWithMeta({
      title,
      description: (desc || `Resumen de ${n.title}, publicado por ${sourceName}.`).slice(0, 300),
      canonical,
      // OG dinámica branded para mejorar share previews en mensajería/redes.
      // Aunque la página es noindex, el OG sí afecta el preview cuando
      // alguien comparte el link de BassLayer (no el de la fuente).
      image: `${PROD_ORIGIN}/og/news/${slug}.png`,
      preloadImage: n.image || null,
      body,
      robots: "noindex, follow, max-image-preview:large",
    });
  }

  // Inserta el SEO block en el template con replacer de FUNCIÓN: evita que un "$"
  // en nombres de eventos/títulos active patrones de reemplazo ($&, $$, $n) y
  // rompa el HTML (mismo motivo que en renderHtmlWithMeta).
  const sinIndexar = (html) => html.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow" />');
  // Lo que no existe: 404 y noindex, con el sitio igual para quien llegó.
  const noExiste = (res) => res.status(404).set("Content-Type", "text/html").send(sinIndexar(injectSeo(buildSeoHtml())));
  const injectSeo = (seoBlock) => seoBlock
    ? indexHtml.replace('<div id="root"></div>', () => `<div id="root">${seoBlock}</div>`)
    : indexHtml;

  app.get("*", (req, res) => {
    try {
      // /eventos/genero/[slug] — hub por género (high-volume keywords)
      const genreMatch = req.path.match(/^\/eventos\/genero\/([^/]+)\/?$/);
      if (genreMatch) {
        const slug = decodeURIComponent(genreMatch[1]);
        const genre = genreFromSlug(slug);
        if (genre) {
          res.set("Content-Type", "text/html");
          return res.send(renderGenrePage(genre));
        }
        return noExiste(res);
      }

      // /semana — el resumen de la semana (link fijo, se renueva cada lunes)
      if (/^\/semana\/?$/.test(req.path)) {
        return semanaData().then((S) => res.set("Content-Type", "text/html").send(renderSemanaPage(S)))
          .catch(() => res.set("Content-Type", "text/html").send(injectSeo(buildSeoHtml())));
      }

      // /layer — mundo crypto con URL propia
      if (/^\/layer\/?$/.test(req.path)) {
        res.set("Content-Type", "text/html");
        return res.send(renderLayerPage());
      }

      // /agenda · /noticias · /festivales — las secciones de Bass
      const seccionMatch = req.path.match(/^\/(agenda|noticias|festivales)\/?$/);
      if (seccionMatch) {
        res.set("Content-Type", "text/html");
        return res.send(renderSeccionPage(seccionMatch[1]));
      }

      // /eventos/hoy · /eventos/este-finde — páginas temporales programáticas
      const temporalMatch = req.path.match(/^\/eventos\/(hoy|este-finde)\/?$/);
      if (temporalMatch) {
        res.set("Content-Type", "text/html");
        return res.send(renderTemporalPage(temporalMatch[1]));
      }

      // /eventos/venue/[slug] — próximas fechas por venue
      const venueMatch = req.path.match(/^\/eventos\/venue\/([^/]+)\/?$/);
      if (venueMatch) {
        const page = renderVenuePage(decodeURIComponent(venueMatch[1]));
        if (page) {
          res.set("Content-Type", "text/html");
          return res.send(page);
        }
        return noExiste(res);
      }

      // /eventos/[slug] — ficha individual indexable
      const eventMatch = req.path.match(/^\/eventos\/([^/]+)\/?$/);
      if (eventMatch) {
        const slug = decodeURIComponent(eventMatch[1]);
        const ev = findEventBySlug(slug);
        if (ev) {
          res.set("Content-Type", "text/html");
          return res.send(renderEventPage(ev));
        }
        return noExiste(res);
      }

      // /noticias/[slug] — ficha de noticia (noindex, canonical a la fuente)
      const newsMatch = req.path.match(/^\/noticias\/([^/]+)\/?$/);
      if (newsMatch) {
        const slug = decodeURIComponent(newsMatch[1]);
        const n = findNewsBySlug(slug);
        if (n) {
          res.set("Content-Type", "text/html");
          return res.send(renderNewsPage(n));
        }
        return noExiste(res);
      }

      // /guias/[slug] — guía editorial long-form (SÍ indexable, Article JSON-LD)
      const guiaMatch = req.path.match(/^\/guias\/([^/]+)\/?$/);
      if (guiaMatch) {
        const slug = decodeURIComponent(guiaMatch[1]);
        const g = findGuiaBySlug(slug);
        if (g) {
          res.set("Content-Type", "text/html");
          return res.send(renderGuiaPage(g));
        }
        return noExiste(res);
      }

      // /festivales/[slug] — ficha de festival curado (SÍ indexable)
      const festivalMatch = req.path.match(/^\/festivales\/([^/]+)\/?$/);
      if (festivalMatch) {
        const slug = decodeURIComponent(festivalMatch[1]);
        const f = findFestivalBySlug(slug);
        if (f) {
          res.set("Content-Type", "text/html");
          return res.send(renderFestivalPage(f));
        }
        return noExiste(res);
      }

      // Home (y /admin, que es del cliente). Cualquier otra dirección no
      // existe: 404 con noindex, pero con el sitio igual (oct 2026: devolvía
      // 200 y Google la tomaba como una copia del home).
      res.set("Content-Type", "text/html");
      if (req.path === "/") return res.send(injectSeo(buildSeoHtml()));
      if (req.path === "/admin") return res.send(sinIndexar(injectSeo(buildSeoHtml())));
      return noExiste(res);
    } catch (e) {
      // Un fallo puntual (p.ej. fecha inválida en un item cacheado) no debe
      // tumbar el SSR de todo el sitio: servimos el shell SPA sin prerender.
      console.error("[ssr]", req.path, e.message);
      res.set("Content-Type", "text/html").send(indexHtml);
    }
  });
}

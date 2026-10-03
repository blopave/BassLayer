// Carteleras de las salas (oct 2026, Pablo): además de la agenda electrónica,
// BassLayer publica la cartelera completa de un puñado de salas emblemáticas
// de Buenos Aires, de cualquier estilo. La curaduría la hace la sala; la
// fuente es su cartelera OFICIAL (web propia o su ticketera) y QuéHacemos se
// usa como cruce. Se buscan por sala, no se mezclan con la electrónica.
//
// Cada lector devuelve shows { date: "YYYY-MM-DD", time: "HH:MM" | "", title,
// url, image, kind } con fecha local de Buenos Aires. `get(url, opts)` lo pone
// quien llama (el server usa fetchSafe; los scripts, fetch).

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "Accept-Language": "es-AR,es;q=0.9" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const pad = (n) => String(n).padStart(2, "0");
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, " ");
const clean = (s) => decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
const monthIdx = (s) => { const k = String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3); return MES3.indexOf(k === "set" ? "sep" : k); };
// Año de una fecha sin año. Si ya pasó hace menos de seis meses es una función
// vieja que quedó en la web ("15 de Mayo (Agotado)") y se descarta al armar;
// si pasó hace más, es del año que viene ("6 de marzo" anunciado en octubre).
const yearFor = (m, d, now = new Date()) => { const y = now.getFullYear(), t = new Date(y, m, d); return t < new Date(now.getTime() - 183 * 864e5) ? y + 1 : y; };
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

async function text(get, url, opts = {}) {
  const r = await get(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
}

// ── Niceto Club (+ Humboldt + Niceto Bar): WordPress con la agenda en el HTML.
async function niceto(get) {
  const h = await text(get, "https://nicetoclub.com/agenda/");
  const out = [];
  for (const sec of h.split('class="day-section"').slice(1)) {
    const date = (sec.match(/data-date="(\d{4}-\d{2}-\d{2})"/) || [])[1];
    if (!date) continue;
    for (const card of sec.split('class="event-card"').slice(1)) {
      const title = decode((card.match(/data-name="([^"]*)"/) || [])[1]);
      const room = decode((card.match(/data-lugar="([^"]*)"/) || [])[1]);
      const kind = clean((card.match(/font-weight: normal;">([^<]+)<\/div>/) || [])[1]);
      const hm = card.match(/font-size: 32px; font-weight: bold;">\d+<\/div>[\s\S]*?font-size: 32px; font-weight: bold;">(\d{1,2})<\/div>[\s\S]*?>(\d{2})<br>/);
      out.push({ date, time: hm ? `${pad(hm[1])}:${hm[2]}` : "", title, room, kind, url: (card.match(/href="(https?:\/\/venti\.live\/[^"]+)"/) || [])[1] || "", image: (card.match(/data-lazy-src="([^"]+)"/) || card.match(/src="(https:[^"]+\.(?:jpg|png|webp))"/) || [])[1] || "" });
    }
  }
  return out;
}

// ── Livepass (Café Berlín): la página de la productora lista cada show con su
// fecha (data-date-filter MM/DD/AAAA), link e imagen. Los títulos largos vienen
// cortados con "..."; el carrusel de arriba trae varios completos en el alt.
function livepass(company) {
  return async (get) => {
    const h = await text(get, `https://livepass.com.ar/companies/${company}`);
    const full = new Map([...h.matchAll(/<a href="(\/events\/[^"]+)"[^>]*>\s*<div class="item[^"]*">\s*<img[^>]*alt="([^"]+)"/g)].map((m) => [m[1], decode(m[2])]));
    const out = [];
    for (const b of h.split('class="col-xs-6 col-md-3 event-box').slice(1)) {
      const md = b.match(/data-date-filter="(\d{2})\/(\d{2})\/(\d{4})"/), href = (b.match(/href="(\/events\/[^"]+)"/) || [])[1];
      if (!md || !href) continue;
      let title = clean((b.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
      if (/\.\.\.$/.test(title) && full.get(href)) title = full.get(href);
      out.push({ date: `${md[3]}-${md[1]}-${md[2]}`, time: "", title: title.replace(/\s*\.\.\.$/, "…"), url: `https://livepass.com.ar${href}`, image: (b.match(/<img src="([^"]+)"/) || [])[1] || "" });
    }
    return out;
  };
}

// ── TuEntrada (Teatro Gran Rex): la API del listado de la sala devuelve cada
// show con su estado (READY / CANCELLED) y un rango de fechas; las funciones
// exactas están en la página del show (eventSessions, con hora y zona).
function tuentrada(venueId, venuePath) {
  return async (get) => {
    const shows = [];
    let cursor = null;
    for (let page = 0; page < 6; page++) {
      const r = await get("https://www.tuentrada.com/api/proxy/venue/list-events", { method: "POST", headers: { ...UA, "content-type": "text/plain", Referer: `https://www.tuentrada.com/${venuePath}` }, body: JSON.stringify({ venueId, model: "venue", cursor }) });
      if (!r.ok) throw new Error(`tuentrada ${r.status}`);
      const j = JSON.parse(await r.text());
      shows.push(...(j.data?.events || []));
      cursor = j.meta?.next_cursor || null;
      if (!cursor) break;
    }
    const out = [];
    for (const ev of shows.filter((e) => e.status !== "CANCELLED")) {
      const h = await text(get, `https://www.tuentrada.com/${ev.slug}`).catch(() => "");
      // Solo las funciones: objetos {"id":N,"date":"…-03:00"} (la página trae también la fecha de inicio de venta).
      const dates = [...new Set([...h.matchAll(/\{\\?"id\\?":\d+,\\?"date\\?":\\?"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/g)].map((m) => `${m[1]} ${m[2]}`))];
      for (const d of dates) out.push({ date: d.slice(0, 10), time: d.slice(11), title: decode(ev.name), url: `https://www.tuentrada.com/${ev.slug}`, image: ev.imageMainNew?.src || "" });
    }
    return out;
  };
}

// ── Konex: calendario mensual en el HTML (WordPress); cada show trae su
// categoría en la clase del link — se toma "musica" y "trasnoche" (fiestas).
async function konex(get) {
  const now = new Date(), out = [];
  for (let k = 0; k < 2; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const h = await text(get, k ? `https://www.cckonex.org/agenda/fecha/${pad(d.getMonth() + 1)}-${d.getFullYear()}/` : "https://www.cckonex.org/agenda/");
    for (const m of h.matchAll(/data-fecha="(\d{4}-\d{2}-\d{2})"([\s\S]*?)<\/li>\s*(?=<li class="fecha|<\/ul>\s*<\/div>\s*<\/div>)/g)) {
      for (const a of m[2].matchAll(/<a href="([^"]+)" class="([^"]*)"><span class="nombre">([\s\S]*?)<\/span><span class="hora">(\d{1,2}):(\d{2})/g)) {
        if (!/musica|trasnoche/i.test(a[2])) continue;   // música y fiestas ("trasnoche"); afuera danza, ideas, experiencias
        out.push({ date: m[1], time: `${pad(a[4])}:${a[5]}`, title: clean(a[3]), url: a[1], image: "", kind: a[2] });
      }
    }
  }
  return [...new Map(out.map((x) => [`${x.date} ${x.time} ${x.title}`, x])).values()];
}

// ── Uniclub: Webflow con la cartelera en el HTML ("Octubre 03, 2026" + link a
// Alpogo). El año a veces viene mal (2025 por 2026): si es anterior al actual
// se corrige al actual.
async function uniclub(get) {
  const h = await text(get, "https://www.uniclub.com.ar/");
  const out = [];
  for (const b of h.split('class="cart-shows-post"').slice(1)) {
    const m = b.match(/<a href="([^"]+)"[^>]*class="link-cart-shows[^"]*"><h4 class="heading-shows">([\s\S]*?)<\/h4><div class="text-block-5">([^<]+)<\/div>/);
    if (!m) continue;
    const dm = m[3].match(/([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{1,2}),?\s*(\d{4})?/), mi = dm ? monthIdx(dm[1]) : -1;
    if (mi < 0) continue;
    // El año publicado, salvo que sea anterior al actual (error de la web); lo pasado se descarta al armar.
    const day = +dm[2], year = Math.max(+dm[3] || 0, new Date().getFullYear()), imgs = [...b.matchAll(/class="div-block-12"><img[^>]*src="([^"]+)"/g)];
    out.push({ date: ymd(year, mi, day), time: "", title: clean(m[2]), url: m[1], image: imgs[0]?.[1] || "" });
  }
  return out;
}

// Fechas en castellano libre: "Domingos 11 y 25 de Octubre - 20:00 hs.",
// "Sábado 31 de Octubre y Domingo 1 de Noviembre - 21 hs".
function freeDates(str) {
  const t = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hm = t.match(/(\d{1,2})[:.](\d{2})\s*h/) || t.match(/(\d{1,2})\s*h(?:s|oras)?\b/);
  const time = hm ? `${pad(hm[1])}:${hm[2] || "00"}` : "";
  const out = [];
  for (const m of t.matchAll(/((?:\d{1,2}\s*(?:,|y|e)\s*)*\d{1,2})\s+de\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?/g)) {
    const mi = monthIdx(m[2]);
    for (const d of m[1].match(/\d{1,2}/g)) out.push({ date: ymd(yearFor(mi, +d), mi, +d), time });
  }
  return out;
}

// ── CAFF (Club Atlético Fernández Fierro): HTML con fechas en texto libre.
async function caff(get) {
  const h = await text(get, "https://caff.ar/");
  const out = [];
  for (const b of h.split('class="index-show col').slice(1)) {
    const name = clean((b.match(/<h2 class="index-show-artist">([\s\S]*?)<\/h2>/) || [])[1]);
    const sub = clean((b.match(/<h3 class="index-show-artist">([\s\S]*?)<\/h3>/) || [])[1]);
    const when = clean((b.match(/class="index-show-date[^"]*">([\s\S]*?)<\/div>/) || [])[1]);
    const id = (b.match(/href="shows\/(\d+)"/) || [])[1];
    const tickets = (b.match(/class="index-show-tickets" href="([^"]+)"/) || [])[1];
    for (const d of freeDates(when)) out.push({ ...d, title: sub ? `${name} · ${sub}` : name, url: tickets || (id ? `https://caff.ar/shows/${id}` : "https://caff.ar/"), image: id ? `https://caff.ar/shows-img/${id}.jpg` : "" });
  }
  return out;
}

// ── La Trastienda: Squarespace; cada show es un bloque de texto con el
// título en un h2 y debajo "⟡30 de Octubre" y "•21:00 hs".
async function trastienda(get) {
  const h = await text(get, "https://www.latrastienda.com/");
  const out = [];
  for (const b of h.split("data-sqsp-text-block-content").slice(1)) {
    const block = b.split(/<style id="container-styles"|data-sqsp-text-block-content/)[0];
    // Título: todos los encabezados del bloque ("Ligia Piro" + "presenta Supernova").
    const title = [...block.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g)].map((m) => clean(m[1])).filter(Boolean).join(" ");
    const rest = clean(block.replace(/<h[1-3][\s\S]*?<\/h[1-3]>/g, " "));
    if (!title || !/\bde\s+[a-záéíóú]+/i.test(rest)) continue;
    for (const d of freeDates(rest)) out.push({ ...d, title, url: "https://www.latrastienda.com/", image: "" });
  }
  return [...new Map(out.map((x) => [`${x.date} ${x.time} ${x.title}`, x])).values()];
}

// Fecha y hora de Buenos Aires a partir de un instante (UTC o con zona).
const BA_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function baDateTime(iso) {
  const p = Object.fromEntries(BA_PARTS.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// ── Club Cultural Matienzo: Next.js; los eventos vienen en __NEXT_DATA__ con
// categoría y fechas en UTC. Se toman recitales, fiestas y festivales.
async function matienzo(get) {
  const h = await text(get, "https://ccmatienzo.com.ar/");
  const j = JSON.parse((h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || "{}");
  const out = [];
  for (const e of j.props?.pageProps?.events || []) {
    if (!/recital|fiesta|festival/i.test(e.Category?.name || "")) continue;
    for (const d of e.Dates || []) out.push({ ...baDateTime(d.start), title: decode(e.title).replace(/\s*-\s*\d{1,2}\/\d{1,2}$/, ""), url: `https://ccmatienzo.com.ar/event/${e.slug}`, image: e.banner || e.Images?.[0]?.url || "", kind: e.Category?.name });
  }
  return out;
}

// ── Ticketek (Teatro Ópera): la API de su CMS lista todo lo que está a la
// venta con sala y categoría; el detalle de cada show trae sus funciones. Ojo:
// el "epoch" es la hora LOCAL codificada como UTC (21 h → 21:00Z), no se resta.
function ticketek(venueRe) {
  return async (get) => {
    const home = JSON.parse(await text(get, "https://prod-cms-api.ticketek.com.ar/api/1.0/node%3Fpath%3Dhome"));
    const items = new Map();
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      if (o.type === "tkt-artist-list-item" && venueRe.test(o.venue?.title || "") && (o.categories || []).some((c) => /m[uú]sica/i.test(c.title))) items.set(o.url, o);
      Object.values(o).forEach(walk);
    })(home);
    const out = [];
    for (const it of items.values()) {
      const d = await text(get, `https://prod-cms-api.ticketek.com.ar/api/1.0/node%3Fpath%3D${encodeURIComponent(it.url.replace(/\//g, "--"))}`).catch(() => "");
      for (const m of d.matchAll(/"perf_id":\d+,"date":(\d+)/g)) {
        const t = new Date(+m[1] * 1000);
        out.push({ date: ymd(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()), time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`, title: decode(it.name), url: `https://www.ticketek.com.ar/${it.url}`, image: it.image ? `https:${it.image}` : "" });
      }
    }
    return [...new Map(out.map((x) => [`${x.date} ${x.time} ${x.title}`, x])).values()];
  };
}

export const SALAS = [
  { slug: "niceto-club", name: "Niceto Club", address: "Niceto Vega 5510, Palermo", qh: /niceto/i, read: niceto },
  { slug: "teatro-gran-rex", name: "Teatro Gran Rex", address: "Av. Corrientes 857", qh: /gran rex/i, read: tuentrada(27, "teatro-gran-rex") },
  { slug: "ciudad-cultural-konex", name: "Ciudad Cultural Konex", address: "Sarmiento 3131, Abasto", qh: /konex/i, read: konex },
  { slug: "uniclub", name: "Uniclub", address: "Guardia Vieja 3360, Almagro", qh: /uniclub/i, read: uniclub },
  { slug: "caff", name: "CAFF", address: "Sánchez de Bustamante 772, Almagro", qh: /(?<!\p{L})caff(?!\p{L})|fern[aá]ndez fierro/iu, read: caff },
  { slug: "la-trastienda", name: "La Trastienda", address: "Balcarce 460, San Telmo", qh: /trastienda/i, read: trastienda },
  { slug: "club-cultural-matienzo", name: "Club Cultural Matienzo", address: "Pringles 1249, Almagro", qh: /matienzo/i, read: matienzo },
  { slug: "teatro-opera", name: "Teatro Ópera", address: "Av. Corrientes 860", qh: /teatro [oó]pera(?! la plata| lp)/i, read: ticketek(/teatro [oó]pera(?! la plata)/i) },
  { slug: "cafe-berlin", name: "Café Berlín", address: "Av. San Martín 6656, Villa Devoto", qh: /caf[eé] berl[ií]n/i, read: livepass("cafe-berlin") },
];

// Movistar Arena se lee con un navegador (scripts/scrape-movistar.mjs, en
// GitHub Actions) y llega por POST /api/salas/ingest: acá solo su ficha.
export const SALAS_INGESTED = [
  { slug: "movistar-arena", name: "Movistar Arena", address: "Humboldt 450, Villa Crespo", qh: /movistar arena/i, urlPrefix: "https://www.movistararena.com.ar/" },
];

// Lo que no es un show de música aunque esté en la cartelera de una sala.
export const NOT_MUSIC = /\b(meet\s*(?:&|and|y)?\s*greet|stand ?up|ballet|lago de los cisnes|cascanueces|charla|conferencia|podcast|teatro|obra de|humor|late night|bingo|cine|infantil|ni[nñ]os|magia|disney|entrevista|seminario|taller|clase)\b/i;
// Casos verificados que la cartelera de la sala lista pero no son música
// (oct 2026): charlas de Gabriel Rolón, el show del youtuber Bobicraft y el
// musical teatral Drácula II.
export const NOT_MUSIC_TITLES = /^(gabriel rol[oó]n|bobicraft|dr[aá]cula ii\b)/i;

export { UA, MESES, MES3, pad, decode, clean, monthIdx, yearFor, ymd, text };

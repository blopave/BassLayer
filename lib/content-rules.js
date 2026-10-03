// Reglas de limpieza de contenido compartidas: las aplica server.js al armar
// los datos y scripts/check-content.mjs verifica que se hayan aplicado (sin
// copiar las reglas, que vivirían desactualizadas).

// Qué NO es un artista en un line-up: escenarios/salas y placeholders. Solo
// matchea el nombre entero ("Terraza", "Main Stage", "Room 2", "Open Air"),
// nunca una parte ("Terrace Sessions" o "Roomful" quedan).
const LINEUP_STAGE = /^(?:(?:main|second|third|big|small|outdoor|indoor|club|dance|techno|house|upper|lower|back|front)\s+)?(?:stage|room|floor|arena|tent|carpa|escenario|sala|terrace|terraza|rooftop|patio|jard[ií]n|garden|lounge|pool|beach|area|área)(?:\s+(?:\d+|[ivx]+|[a-z]))?$|^(?:main|open[\s-]?air|warm[\s-]?up|closing|opening)$/i;
const LINEUP_PLACEHOLDER = /^(?:tba|tbd|tbc|b2b|m[aá]s a confirmar|line-?up|varios artistas|dj set|special guests?|guests?|invitados?|y m[aá]s|and more|residentes|residents)$/i;
export function cleanLineup(list) {
  const seen = new Set();
  return (list || []).filter((a) => {
    if (typeof a !== "string" || isNotArtist(a)) return false;
    const k = a.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Plantillas sin completar del CMS de origen ("…del mercado [FECHA]",
// "{{title}}"). Lista explícita de tokens para no comerse tickers legítimos
// como "[QNT]".
export const TEMPLATE_TOKEN = /\[(?:fecha|date|hora|time|t[ií]tulo|title|nombre|name|precio|price|autor|author|ciudad|city|pa[ií]s|country|link|url|placeholder)\]|\{\{[^}]*\}\}/i;
const TEMPLATE_TOKEN_G = new RegExp(`\\s*(?:${TEMPLATE_TOKEN.source})\\s*`, "gi");
export function stripTemplateTokens(t) {
  return String(t).replace(TEMPLATE_TOKEN_G, " ");
}

// true si el nombre de un line-up no es un artista (escenario o placeholder).
export function isNotArtist(name) {
  const t = String(name || "").trim();
  return !t || LINEUP_STAGE.test(t) || LINEUP_PLACEHOLDER.test(t);
}

// Actividades que no son shows, detectables por el título: la fuente
// (QuéHacemos) las publica tipeadas como "recital" (sept 2026: un desayuno en
// una panadería, fútbol y visitas guiadas en "El finde"). Solo señales
// inequívocas; "humor" o "cuento" sueltos sacaban a músicos (Albert Pla).
export const NOT_A_SHOW_TITLE = /\b(visita guiada|visitas guiadas|desayuno|brunch|degustaci[oó]n|cata de vinos?|panader[ií]a|f[uú]tbol|yoga|meditaci[oó]n|se hace cuento|cuentacuentos|paranormal)\b/i;

// Una historia, una nota (oct 2026): varios medios cuentan lo mismo ("EE.UU.
// sumó 29.000 empleos" en CoinDesk, CriptoTendencia y BeInCrypto). Se comparan
// las palabras con peso del titular en castellano (traducido si hace falta,
// así también se cruzan idiomas) y de cada grupo queda una: la de un medio en
// castellano si la hay, si no la más reciente. Corre por request: el caché
// guarda todo para que los deep links viejos sigan resolviendo.
const STORY_STOP = new Set("the and for with that this from into over after says said will have more than what your just about como para con que los las del una por sus mas pero sobre este esta entre".split(" "));
export function storyWords(t) {
  return new Set(String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d)[.,](\d{3})/g, "$1$2")                       // 29.000 = 29,000 = 29000
    .replace(/[^a-z0-9$%]+/g, " ").split(" ")
    .filter((w) => (w.length >= 4 || /\d/.test(w)) && !STORY_STOP.has(w))
    .map((w) => w.replace(/s$/, "")));
}
// Misma historia: comparten al menos un tercio de las palabras con peso del titular más corto.
export function sameStory(a, b) {
  let i = 0; for (const x of a) if (b.has(x)) i++;
  return a.size > 0 && b.size > 0 && i / Math.min(a.size, b.size) >= 0.34;
}
export function sameStoryOnce(items) {
  // Una pasada: cada nota contra las que ya quedaron; si es la misma historia y
  // está en castellano, reemplaza a la que estaba.
  let changed;
  const pass = (list) => {
    const kept = [];
    for (const it of list) {
      const w = storyWords(it.titleEs || it.title);
      const twin = kept.find((k) => sameStory(w, k.w));
      if (!twin) { kept.push({ it, w }); continue; }
      changed = true;
      if (it.lang === "es" && twin.it.lang !== "es") { twin.it = it; twin.w = w; }   // mejor en castellano
    }
    return kept.map((k) => k.it);
  };
  // Un reemplazo puede dejar juntas dos que antes no se parecían: se repite
  // mientras se una algo (como mucho 5 vueltas).
  let out = items;
  for (let n = 0; n < 5; n++) { changed = false; out = pass(out); if (!changed) break; }
  return out;
}

// Nombres propios en titulares que se traducen (oct 2026, Pablo: "los nombres
// son originales de cada evento"). Antes de traducir se apartan — las palabras
// con mayúscula en medio de un titular en minúscula, lo que va entre comillas
// y las marcas conocidas — y después se vuelven a poner tal cual.
const NAME_GLOSSARY = [
  "The Warehouse Project", "Boiler Room", "Resident Advisor", "Awakenings", "Dekmantel", "Berghain", "Panorama Bar", "Tresor",
  "Printworks", "Fabric", "Creamfields", "Tomorrowland", "Sónar", "Sonar", "Movement", "DGTL", "Primavera Sound", "Time Warp",
  "Kappa FuturFestival", "Ultra Music Festival", "Burning Man", "Cercle", "Defected", "Drumcode", "Afterlife", "Pacha", "Amnesia",
  "DC-10", "Hï Ibiza", "Ushuaïa", "Lost Village", "Glastonbury", "Coachella", "Mutek", "Mixmag", "DJ Mag", "Bandcamp",
];
// Gentilicios e idiomas: en inglés van con mayúscula pero no son nombres.
const DEMONYMS = /^(African|American|Argentine|Argentinian|Asian|Australian|Brazilian|British|Canadian|Chinese|Colombian|Dutch|English|European|French|German|Irish|Italian|Japanese|Korean|Latin|Mexican|Portuguese|Scottish|Spanish|Swedish|UK|US|EU)$/;
// Entre comillas solo si empieza con mayúscula (título de tema o disco: “Revolution”);
// una cita común ("quick") se traduce.
const QUOTED = /“\p{Lu}[^”]{1,60}”|"\p{Lu}[^"]{1,60}"|‘\p{Lu}[^’]{1,60}’/gu;
export function protectNames(text) {
  const names = [];
  const keep = (m) => { names.push(m); return `0X${names.length}`; };
  let t = String(text || "");
  t = t.replace(QUOTED, keep);
  for (const n of NAME_GLOSSARY) t = t.replace(new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "gu"), keep);
  // Mayúsculas en medio del titular: solo si el titular está escrito en
  // minúscula (en "Title Case" todas las palabras van con mayúscula).
  const words = t.split(/\s+/).filter((w) => /\p{L}/u.test(w)).slice(1);
  const caps = words.filter((w) => /^\p{Lu}/u.test(w)).length;
  if (words.length && caps / words.length <= 0.5) {
    t = t.replace(/(?<=\S\s)(\p{Lu}[\p{L}\p{N}.\-]*(?:\s+(?:&|x|de|of|the|\p{Lu}[\p{L}\p{N}.\-]*))*)/gu, (m) => {
      // El posesivo inglés ("Shimza’s") queda afuera: el traductor lo vuelve "de Shimza".
      const name = m.replace(/\s+(?:&|x|de|of|the)$/i, "").replace(/['’]s$/, "");
      if (DEMONYMS.test(name)) return m;      // "African", "British": se traducen
      return keep(name) + m.slice(name.length);
    });
  }
  return { masked: t, names };
}
export function restoreNames(text, names) {
  return String(text).replace(/0X(\d+)/gi, (m, i) => names[Number(i) - 1] ?? m);
}

// La noche de Buenos Aires (oct 2026): hasta las 7 de la mañana la fiesta de
// anoche sigue siendo "hoy". Se mide en hora de Buenos Aires y no del server
// (Railway corre en UTC: a las 21 h de BA ya borraba las fiestas de esa noche).
export const NIGHT_END_H = 7;
const BA_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
export function notPast(list, now = Date.now()) {
  const [y, m, d] = BA_YMD.format(new Date(now - NIGHT_END_H * 36e5)).split("-").map(Number);
  const night = (m - 1) * 31 + d;
  return list.filter((ev) => {
    const mi = MONTHS[String(ev.month || "").toLowerCase()] ?? -1, day = parseInt(ev.day);
    if (mi === -1 || isNaN(day)) return true; // mes desconocido: se conserva
    const k = mi * 31 + day;
    return k >= night || k < night - 31;      // más de un mes atrás = el año que viene
  });
}

// Evidencia de escena (oct 2026, Pablo): de QuéHacemos entra a la agenda solo
// lo que diga en su propio título o descripción que es electrónica — DJ, set,
// techno, house, rave… El rótulo de la fuente no alcanza: "Evento de música
// electrónica: X" es una plantilla que se pegaba también a recitales de rock
// (Chapterhouse) o a bandas de cumbia en un parador (Los Totora).
const QH_TEMPLATE = /evento de m[uú]sica electr[oó]nica:?/gi;
const ELECTRONIC = /\b(djs?|dj set|b2b|set|techno|tech ?house|house|rave|boiler ?room|electr[oó]nica|electronic|trance|minimal|progressive|melodic|drum ?(?:&|and|n) ?bass|dnb|edm|afro ?house|hardstyle|breaks?|garage|club night)\b/i;
export function hasElectronicEvidence(ev) {
  const text = `${ev.name || ev.title || ""} ${ev.description || ""}`.replace(QH_TEMPLATE, " ");
  return ELECTRONIC.test(text);
}

#!/usr/bin/env node
// Chequeo de sanidad del contenido servido.
//
// Este proyecto casi no se rompe por su propia lógica: se rompe cuando cambia
// una fuente externa. Los dos bugs de agosto 2026 —teatro entrando al feed de
// música, y entidades HTML crudas en los títulos— nacieron los dos ahí, y
// ninguno lo habría visto un test unitario. Así que en vez de mockear, esto
// pega contra los endpoints reales y valida invariantes estructurales.
//
// Deliberadamente NO duplica reglas de negocio (qué es "musical", qué familia
// va cada evento): eso viviría desactualizado respecto del server. Valida lo
// que tiene que ser cierto siempre, venga la data como venga.
//
//   npm run check:content                        # contra localhost:3001
//   npm run check:content -- https://basslayer.io
//   npm run check:content -- --json              # salida para CI

import { isNotArtist, TEMPLATE_TOKEN, NOT_A_SHOW_TITLE, storyWords, sameStory, notPast, hasElectronicEvidence } from "../lib/content-rules.js";
import { namesOtherCity, detectCity } from "../lib/places.js";
import { NOT_MUSIC, NOT_MUSIC_TITLES } from "../lib/salas.js";
import { readFileSync } from "node:fs";
import { weekendWindow } from "../lib/finde.js";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3001";
const JSON_OUT = process.argv.includes("--json");
const TIMEOUT_MS = 180_000;

// Entidad HTML que sobrevivió hasta el JSON: se vería literal en pantalla.
const ENTITY = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,8});/;

// minItems: por debajo de esto, o cayeron las fuentes o el filtro se comió todo.
// Los mínimos son holgados a propósito — la idea es detectar el colapso, no
// alertar por un día flojo.
const ENDPOINTS = [
  { path: "/api/events",        minItems: 40, required: ["name", "day", "month", "venue"] },
  { path: "/api/news",          minItems: 10, required: ["title"] },
  { path: "/api/bass-news",     minItems: 10, required: ["title"] },
  { path: "/api/festivals",     minItems: 3,  required: ["name"] },
  { path: "/api/crypto-events", minItems: 3,  required: ["title", "date"] },
  // La barra de precios: con respaldo (CoinGecko → Kraken → CoinPaprika →
  // último guardado) nunca debería quedar vacía (sept 2026).
  { path: "/api/prices",        minItems: 6,  required: ["sym", "usd"] },
  // Predicciones y Finanzas por tema (sept 2026).
  { path: "/api/prediction-markets", minItems: 5, required: ["title", "group", "url"] },
  { path: "/api/finance-news",  minItems: 10, required: ["title", "tag", "url"] },
  // Carteleras de las salas (oct 2026): la fuente es la cartelera oficial.
  { path: "/api/salas",         minItems: 100, required: ["title", "date", "sala", "salaName"] },
];

const problems = [];
const stats = [];
const fail = (endpoint, kind, detail) => problems.push({ endpoint, kind, detail });

function walkStrings(value, path, visit) {
  if (typeof value === "string") visit(path, value);
  else if (Array.isArray(value)) value.forEach((v) => walkStrings(v, path, visit));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, visit);
  }
}

// Salas: todas las carteleras leídas (una que falla es una web que cambió),
// nada pasado y nada que no sea música.
function checkSalas(body) {
  const path = "/api/salas";
  const caidas = (body.salas || []).filter((s) => !s.ok || !s.count).map((s) => s.name);
  if (caidas.length) fail(path, "cartelera", `sin datos: ${caidas.join(", ")} (¿cambió la web o no llegó la carga?)`);
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() - 7 * 36e5)).split("-");
  const pasados = (body.shows || []).filter((s) => s.date < `${y}-${m}-${d}`);
  if (pasados.length) fail(path, "pasado", `${pasados.length} shows ya pasados: ${pasados.slice(0, 3).map((s) => `${s.title} (${s.date})`).join(" | ")}`);
  const noMusica = (body.shows || []).filter((s) => NOT_MUSIC.test(s.title) || NOT_MUSIC_TITLES.test(s.title));
  if (noMusica.length) fail(path, "no-musica", noMusica.slice(0, 3).map((s) => s.title).join(" | "));
}

async function checkEndpoint({ path, minItems, required }) {
  let items;
  try {
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return fail(path, "http", `HTTP ${res.status}`);
    const body = await res.json();
    items = Array.isArray(body) ? body : (body.items ?? body.data ?? body.shows ?? []);
    if (path === "/api/salas") checkSalas(body);
  } catch (e) {
    return fail(path, "fetch", e.message);
  }

  if (!Array.isArray(items)) return fail(path, "shape", "la respuesta no es una lista");
  stats.push({ path, count: items.length });

  if (items.length < minItems) {
    fail(path, "vacio", `${items.length} items, se esperaban al menos ${minItems}`);
  }

  // Entidades HTML crudas — el bug de las comillas en los títulos.
  const entityFields = new Map();
  for (const item of items) {
    walkStrings(item, "", (field, str) => {
      if (!ENTITY.test(str)) return;
      if (!entityFields.has(field)) entityFields.set(field, str.slice(0, 90));
    });
  }
  for (const [field, sample] of entityFields) {
    fail(path, "entidad", `${field} → ${JSON.stringify(sample)}`);
  }

  // Campos que sin contenido dejan una tarjeta rota en pantalla.
  for (const field of required) {
    const vacios = items.filter((it) => !String(it?.[field] ?? "").trim()).length;
    if (vacios > 0) fail(path, "campo-vacio", `${field}: ${vacios}/${items.length} sin valor`);
  }

  // Line-ups: nombres de escenario o placeholders colados como artistas
  // (sept 2026: "Main Stage" de headliner, "Terraza" con foto de otro).
  const noArtistas = new Set();
  for (const item of items) for (const a of item?.artists || []) if (isNotArtist(a)) noArtistas.add(a);
  if (noArtistas.size) fail(path, "line-up", `no son artistas: ${[...noArtistas].slice(0, 5).join(", ")}`);

  // Agenda musical: nada de fútbol, desayunos, visitas guiadas ni yoga, venga
  // de la fuente que venga (sept 2026: QuéHacemos los tipea como "recital" y
  // RA listó "Techno Yoga").
  if (path === "/api/events") {
    // Mismo show dos veces (oct 2026: Victoria Whynot de RA y de QuéHacemos):
    // mismo día y hora y el nombre arranca igual.
    const head = (n) => String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
    const vistos = new Map(), dobles = [];
    for (const it of items) {
      if (it?.area !== "amba" || !it.time) continue;
      const k = `${it.day}-${it.month}-${it.time}-${head(it.name)}`;
      if (vistos.has(k)) dobles.push(`${it.name} (${it.day} ${it.month})`); else vistos.set(k, it);
    }
    if (dobles.length) fail(path, "duplicado", dobles.slice(0, 3).join(" | "));
    const noShows = items.filter((it) => NOT_A_SHOW_TITLE.test(it?.name || ""));
    if (noShows.length) fail(path, "no-musical", noShows.slice(0, 3).map((it) => it.name).join(" | "));

    // Superficie porteña (sept 2026): lo marcado AMBA no puede decir que es de
    // otra ciudad del país ("La Fabrica, Córdoba"). Misma regla que el server
    // (lib/places.js), sin copiarla.
    const fuera = items.filter((it) => it?.area === "amba" && namesOtherCity(`${it.venue || ""} ${it.address || ""}`));
    if (fuera.length) fail(path, "amba", `marcados AMBA pero de otra ciudad: ${fuera.slice(0, 3).map((it) => `${it.name} (${it.venue})`).join(" | ")}`);
    // Fecha válida: el mes es un mes (oct 2026: Buenos Aliens escribe "SAB 03 18hs"
    // sin mes y "18h" quedaba como mes → evento sin fecha, fuera de la onda).
    const sinFecha = items.filter((it) => !/^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$/i.test(it?.month || ""));
    if (sinFecha.length) fail(path, "fecha", `${sinFecha.length} sin mes válido: ${sinFecha.slice(0, 3).map((it) => `${it.name} (${it.month})`).join(" | ")}`);

    // Solo escena electrónica (oct 2026, Pablo): de QuéHacemos (cartelera
    // general) entra solo lo que es club; nada de rock, folklore, jazz, tango,
    // reggaetón, stand-up ni "festivales" como Burgerpalusa.
    // Y con evidencia propia (oct 2026): la plantilla "Evento de música
    // electrónica" de la fuente no alcanza.
    const fueraDeEscena = items.filter((it) => it?.source === "quehacemos" && (it?.family !== "club" || !hasElectronicEvidence(it)));
    if (fueraDeEscena.length) fail(path, "escena", `${fueraDeEscena.length} fuera de la escena electrónica: ${fueraDeEscena.slice(0, 3).map((it) => `${it.name} (${it.family})`).join(" | ")}`);
    const amba = items.filter((it) => it?.area === "amba").length;
    if (amba < 30) fail(path, "amba", `solo ${amba} eventos AMBA: ¿se perdió la clasificación por ciudad?`);
  }

  // Noticias de Bass (oct 2026): cada nota dice su idioma y, si se tradujo,
  // los nombres propios del original siguen en la traducción (no se traducen).
  if (path === "/api/bass-news") {
    const sinIdioma = items.filter((it) => !it?.lang);
    if (sinIdioma.length) fail(path, "idioma", `${sinIdioma.length} sin idioma`);
    const KEEP = ["The Warehouse Project", "Boiler Room", "Berghain", "Awakenings", "Dekmantel", "Creamfields", "Tomorrowland", "Pacha"];
    const rotos = items.filter((it) => it?.titleEs && KEEP.some((k) => it.title.includes(k) && !it.titleEs.includes(k)));
    if (rotos.length) fail(path, "nombres", `se tradujo un nombre propio: ${rotos.slice(0, 2).map((it) => it.titleEs).join(" | ")}`);
  }

  // Noticias de Layer (oct 2026): cada nota dice su idioma (para traducir y
  // marcar los titulares en inglés) y una historia aparece una sola vez.
  if (path === "/api/news") {
    const sinIdioma = items.filter((it) => it?.lang !== "es" && it?.lang !== "en");
    if (sinIdioma.length) fail(path, "idioma", `${sinIdioma.length} sin idioma: ${sinIdioma.slice(0, 2).map((it) => it.source).join(", ")}`);
    const W = items.map((it) => storyWords(it?.titleEs || it?.title));
    const repes = [];
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) if (sameStory(W[i], W[j])) repes.push(`${items[i].source} = ${items[j].source}`);
    if (repes.length) fail(path, "repetida", `misma historia dos veces: ${repes.slice(0, 3).join(" | ")}`);
  }

  // Predicciones: un evento por tarjeta, en los temas de Layer, hasta 4 por
  // tema, nada que venza en horas, y las etiquetas en castellano del glosario
  // (el traductor automático las rompía: "Antrópica", "bps" solo).
  if (path === "/api/prediction-markets") {
    const GROUPS = new Set(["crypto", "fed", "macro", "tech", "argentina"]);
    const per = {};
    for (const it of items) per[it.group] = (per[it.group] || 0) + 1;
    const raros = Object.keys(per).filter((g) => !GROUPS.has(g));
    if (raros.length) fail(path, "tema", `temas fuera de Layer: ${raros.join(", ")}`);
    if (Object.keys(per).length < 3) fail(path, "tema", `solo ${Object.keys(per).length} temas`);
    const llenos = Object.entries(per).filter(([, n]) => n > 4);
    if (llenos.length) fail(path, "tema", `más de 4 por tema: ${llenos.map(([g, n]) => `${g}=${n}`).join(", ")}`);
    const sinResultados = items.filter((it) => !it.outcomes?.length);
    if (sinResultados.length) fail(path, "resultados", `${sinResultados.length} sin resultados`);
    const pronto = items.filter((it) => it.endDate && new Date(it.endDate).getTime() < Date.now() + 24 * 3600_000);
    if (pronto.length) fail(path, "vence", pronto.slice(0, 3).map((it) => it.title).join(" | "));
    const malas = items.flatMap((it) => it.outcomes || []).filter((o) => /Antrópic|^bps$|\bbps\b/.test(o.labelEs || ""));
    if (malas.length) fail(path, "etiqueta", malas.slice(0, 3).map((o) => o.labelEs).join(" | "));
  }

  // Finanzas: temas por contenido y sin finanzas personales ni consumo.
  if (path === "/api/finance-news") {
    const TAGS = new Set(["argentina", "wallstreet", "companies", "world"]);
    const raros = [...new Set(items.map((it) => it.tag).filter((t) => !TAGS.has(t)))];
    if (raros.length) fail(path, "tema", `temas viejos o desconocidos: ${raros.join(", ")}`);
    const fuera = items.filter((it) => /\b(I'?m|I’m|my (husband|wife|friend)|should I|am I|prepagas?|aumentos?)\b|\bI (sold|was|bought|lost|quit)\b/i.test(it.title || ""));
    if (fuera.length) fail(path, "curaduria", fuera.slice(0, 3).map((it) => it.title.slice(0, 70)).join(" | "));
  }

    // Plantillas sin completar del CMS de origen en títulos ("… [FECHA]").
  const plantillas = items.filter((it) => TEMPLATE_TOKEN.test(it?.title || it?.name || ""));
  if (plantillas.length) fail(path, "plantilla", JSON.stringify((plantillas[0].title || plantillas[0].name).slice(0, 90)));

  // Las URLs que van a href/src tienen que ser absolutas y https.
  const malas = new Set();
  for (const item of items) {
    for (const field of ["url", "image", "ticket_url", "link"]) {
      const v = item?.[field];
      if (v && typeof v === "string" && !/^https?:\/\//.test(v)) malas.add(`${field} → ${v.slice(0, 60)}`);
    }
  }
  for (const m of [...malas].slice(0, 3)) fail(path, "url", m);
}

await Promise.all(ENDPOINTS.map(checkEndpoint));

// Ciudades (oct 2026): RA escribe "Venue, Localidad, Buenos Aires" y la
// localidad del GBA tiene que ganarle a "Buenos Aires" (si no, el show cae en
// CABA y se duplica con el de otra fuente); las calles homónimas de CABA no.
{
  const casos = [
    [["TBA - Area Costanera, Quilmes", "TBA - Area Costanera, Quilmes, Buenos Aires"], "Quilmes"],
    [["Tribu", "Calle 5, Lanus, Buenos Aires"], "Lanús"],
    [["Club X", "Av. Avellaneda 1200, CABA"], "CABA"],
    [["New Park, Pergamino", "Pergamino, Pcia. de Buenos Aires"], "Pergamino"],
    [["Crobar", "Marcelino Freyre s/n, Paseo de La Infanta, Palermo, Ciudad de Buenos Aires"], "CABA"],
  ];
  const malos = casos.filter(([[v, a], c]) => detectCity(v, a) !== c).map(([[v]]) => v);
  stats.push({ path: "ciudades (GBA)", count: casos.length });
  if (malos.length) fail("ciudades (GBA)", "ciudad", malos.join(", "));
}

// El finde en tu calendario (oct 2026): /finde.ics es un calendario válido con
// los elegidos (la persona se suscribe y su app lo vuelve a pedir sola), y el
// finde se calcula en hora de BA pase lo que pase con la zona del server.
{
  const path = "/finde.ics";
  try {
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.text();
    const n = (body.match(/BEGIN:VEVENT/g) || []).length;
    stats.push({ path, count: n });
    if (!res.ok || !/text\/calendar/.test(res.headers.get("content-type") || "")) fail(path, "http", `HTTP ${res.status} ${res.headers.get("content-type")}`);
    else if (!body.startsWith("BEGIN:VCALENDAR") || !body.includes("END:VCALENDAR")) fail(path, "formato", "no es un calendario");
    else if (body.split("\r\n").some((l) => Buffer.byteLength(l) > 75)) fail(path, "formato", "líneas de más de 75 octetos (RFC 5545)");
    else if (!n) fail(path, "vacio", "el finde no tiene ningún elegido");
  } catch (e) { fail(path, "fetch", e.message); }
  const casos = [
    ["2026-10-07T15:00:00-03:00", "2026-10-09"],   // miércoles → el viernes que viene
    ["2026-10-03T03:00:00-03:00", "2026-10-02"],   // la noche del viernes sigue siendo ese finde
    ["2026-10-04T10:00:00-03:00", "2026-10-02"],   // domingo a la mañana: todavía este
    ["2026-10-04T13:00:00-03:00", "2026-10-09"],   // domingo al mediodía: ya el próximo
    ["2026-10-05T05:00:00-03:00", "2026-10-02"],   // la noche del domingo termina a las 7
  ];
  const malos = casos.filter(([now, fri]) => new Date(weekendWindow(Date.parse(now)).fri).toISOString() !== `${fri}T03:00:00.000Z`);
  stats.push({ path: "finde (BA)", count: casos.length });
  if (malos.length) fail("finde (BA)", "ventana", malos.map(([n]) => n).join(", "));
}

// La semana (oct 2026): /api/semana arma el resumen de /semana — la noche día
// por día suma lo mismo que el total, y el mercado trae el Bitcoin con su serie.
{
  const path = "/api/semana";
  try {
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const S = res.ok ? await res.json() : null;
    stats.push({ path, count: S?.noche?.fiestas ?? 0 });
    if (!S) fail(path, "http", `HTTP ${res.status}`);
    else if (!(S.semana?.numero >= 1 && S.semana.numero <= 53)) fail(path, "semana", `número inválido (${S.semana?.numero})`);
    else if (!S.noche.porDia.length || S.noche.porDia.length > 7) fail(path, "noche", `${S.noche.porDia.length} días`);
    else if (S.noche.porDia.reduce((n, d) => n + d.fiestas, 0) !== S.noche.fiestas) fail(path, "noche", "los días no suman el total de fiestas");
    else if (!S.mercado.btc || S.mercado.btc.serie.length < 10 || !Number.isFinite(S.mercado.btc.cambio7d)) fail(path, "mercado", "falta el Bitcoin de la semana");
  } catch (e) { fail(path, "fetch", e.message); }
}

// Eventos cripto curados (oct 2026): solo fechas confirmadas en el sitio
// oficial. "Fechas estimadas" dejó en la semana una conferencia que ya había
// pasado (Permissionless IV, junio 2025) y otra con fecha inventada.
{
  const { events = [] } = JSON.parse(readFileSync(new URL("../data/crypto-events-curated.json", import.meta.url), "utf8"));
  const estimados = events.filter((e) => /estimad|confirmar/i.test(e.description || "")).map((e) => e.id);
  stats.push({ path: "cripto curados", count: events.length });
  if (estimados.length) fail("cripto curados", "sin confirmar", estimados.join(", "));
}

// Cache en el borde (oct 2026): Cloudflare cachea /api respetando el header
// del origen. Lo público tiene que salir "public"; lo privado, "no-store" —
// si no, una respuesta con datos de alguien quedaría servida a todos.
{
  const casos = [["/api/events", /public/], ["/api/salas", /public/], ["/api/admin/events", /no-store/], ["/api/venue/events", /no-store/]];
  const mal = [];
  for (const [path, re] of casos) {
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    const cc = res?.headers.get("cache-control") || "(sin header)";
    if (!re.test(cc)) mal.push(`${path}: ${cc}`);
  }
  stats.push({ path: "cache (borde)", count: casos.length });
  if (mal.length) fail("cache (borde)", "header", mal.join(" | "));
}

// Voz de los textos en español (oct 2026, Pablo): voseo en todo ("Tocá", no
// "Toca") y "cripto", no "crypto".
{
  const { STRINGS } = await import("../src/i18n/strings.js");
  const es = Object.entries(STRINGS.es).filter(([, v]) => typeof v === "string");
  const TU = /^(Toca|Pasa|Elige|Busca|Mira|Descubre|Explora|Haz|Suscríbete|Únete|Agrega|Guarda|Comparte|Abre|Desliza|Prueba|Vuelve|Entra|Filtra|Escribe|Selecciona)\b|\b(puedes|quieres|tienes|eres|necesitas)\b/;
  const tuteo = es.filter(([, v]) => TU.test(v)).map(([k]) => k);
  const crypto = es.filter(([, v]) => /\bcrypto\b/i.test(v.replace(/\{\w+\}/g, ""))).map(([k]) => k);   // {crypto} es una variable, no texto
  stats.push({ path: "textos (es)", count: es.length });
  if (tuteo.length) fail("textos (es)", "voseo", `en tú: ${tuteo.slice(0, 5).join(", ")}`);
  if (crypto.length) fail("textos (es)", "cripto", `dice "crypto": ${crypto.slice(0, 5).join(", ")}`);
}

// Escalas (oct 2026, Pablo: "A · Fiel"): en styles.css todo tamaño de letra
// (salvo títulos de 40 px o más), tracking y radio sale de las variables
// --fs-*, --tr-* y --r-*. Un valor suelto es un paso afuera del sistema.
{
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const sueltos = [
    ...[...css.matchAll(/font-size:\s*([\d.]+)px/g)].filter((m) => +m[1] < 40).map((m) => m[0]),
    ...[...css.matchAll(/font:\s*(?:italic\s+)?\d{3}\s+([\d.]+)px/g)].filter((m) => +m[1] < 40).map((m) => m[0]),
    ...[...css.matchAll(/letter-spacing:\s*-?[\d.]*[1-9][\d.]*(px|em)/g)].map((m) => m[0]),
    ...[...css.matchAll(/border-radius:\s*([\d.]+)px\s*[;}]/g)].filter((m) => +m[1] > 0 && +m[1] < 100).map((m) => m[0]),
  ];
  // Grilla de 4 (etapa 2): padding/margin/gap en múltiplos de 4 (0–2 px valen: filetes y ajustes ópticos).
  for (const m of css.matchAll(/(?:padding|margin|gap|row-gap|column-gap|inset)[a-z-]*\s*:([^;}]*)/g)) {
    for (const n of m[1].replace(/(calc|clamp|min|max)\([^)]*\)/g, "").matchAll(/(-?[\d.]+)px/g)) { const v = Math.abs(+n[1]); if (v > 2 && v % 4) sueltos.push(m[0].trim()); }
  }
  const bajo = Object.entries({ ...[...css.matchAll(/--fs-(\d+):\s*([\d.]+)px/g)].reduce((o, m) => ({ ...o, [m[1]]: +m[2] }), {}) }).filter(([, v]) => v < 10);
  stats.push({ path: "escalas (css)", count: sueltos.length });
  if (sueltos.length) fail("escalas (css)", "fuera de escala", `${sueltos.length}: ${[...new Set(sueltos)].slice(0, 5).join(" | ")}`);
  if (bajo.length) fail("escalas (css)", "piso", `tamaños bajo 10 px: ${bajo.map(([k]) => k).join(", ")}`);
}

// Evidencia de escena (oct 2026): casos reales que la plantilla de la fuente
// hacía pasar como electrónica, y uno que sí lo es.
{
  const casos = [
    [{ name: "Chapterhouse", description: "Evento de música electrónica: Chapterhouse. En Club TRI, Mar del Plata." }, false],
    [{ name: "Los Totora", description: "Waketon: sol, wakeboard y música con Los Totora." }, false],
    [{ name: "Olympo Sunset 03-10 | Dramer", description: "BA SUNSET 17 a 23HS Junto a Ivo Rubio Luna Picon" }, false],
    [{ name: "PIZZA RAVE 90 & 2000", description: "el auténtico sonido House + Techno de los 80s" }, true],
  ];
  const mal = casos.filter(([ev, ok]) => hasElectronicEvidence(ev) !== ok).map(([ev]) => ev.name);
  stats.push({ path: "evidencia de escena", count: casos.length });
  if (mal.length) fail("evidencia de escena", "regla", `mal clasificados: ${mal.join(" | ")}`);
}

// La noche (oct 2026): la fiesta del viernes 2/10 sigue a las 21:30 y a las
// 00:30 de BA (en UTC ya es sábado) y se va recién a las 8 del sábado.
{
  const viernes = [{ day: "02", month: "Oct" }], noche = [];
  for (const [iso, queda] of [["2026-10-03T00:30:00Z", true], ["2026-10-03T03:30:00Z", true], ["2026-10-03T11:00:00Z", false], ["2026-10-02T12:00:00Z", true]]) {
    if (notPast(viernes, Date.parse(iso)).length !== (queda ? 1 : 0)) noche.push(`${iso} → ${queda ? "la borra" : "la deja"}`);
  }
  if (notPast([{ day: "02", month: "Ene" }], Date.parse("2026-12-31T15:00:00Z")).length !== 1) noche.push("cruce de año: borra enero");
  stats.push({ path: "noche de BA", count: 5 });
  if (noche.length) fail("noche de BA", "corte", noche.join(" | "));
}

if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE, ok: problems.length === 0, stats, problems }, null, 2));
} else {
  console.log(`\n  chequeo de contenido — ${BASE}\n`);
  for (const s of stats.sort((a, b) => a.path.localeCompare(b.path))) {
    const suyos = problems.filter((p) => p.endpoint === s.path);
    const marca = suyos.length === 0 ? "ok  " : "FALLA";
    console.log(`  ${marca} ${s.path.padEnd(22)} ${String(s.count).padStart(4)} items`);
    for (const p of suyos) console.log(`        ${p.kind}: ${p.detail}`);
  }
  const rotos = ENDPOINTS.filter((e) => !stats.some((s) => s.path === e.path));
  for (const e of rotos) {
    console.log(`  FALLA ${e.path.padEnd(22)}   sin respuesta`);
    for (const p of problems.filter((p) => p.endpoint === e.path)) console.log(`        ${p.kind}: ${p.detail}`);
  }
  console.log(problems.length === 0 ? "\n  todo limpio\n" : `\n  ${problems.length} problema(s)\n`);
}

process.exit(problems.length === 0 ? 0 : 1);

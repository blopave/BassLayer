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

import { isNotArtist, TEMPLATE_TOKEN, NOT_A_SHOW_TITLE } from "../lib/content-rules.js";
import { namesOtherCity } from "../lib/places.js";

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

async function checkEndpoint({ path, minItems, required }) {
  let items;
  try {
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return fail(path, "http", `HTTP ${res.status}`);
    const body = await res.json();
    items = Array.isArray(body) ? body : (body.items ?? body.data ?? []);
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
    const fueraDeEscena = items.filter((it) => it?.source === "quehacemos" && it?.family !== "club");
    if (fueraDeEscena.length) fail(path, "escena", `${fueraDeEscena.length} fuera de la escena electrónica: ${fueraDeEscena.slice(0, 3).map((it) => `${it.name} (${it.family})`).join(" | ")}`);
    const amba = items.filter((it) => it?.area === "amba").length;
    if (amba < 30) fail(path, "amba", `solo ${amba} eventos AMBA: ¿se perdió la clasificación por ciudad?`);
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

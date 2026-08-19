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

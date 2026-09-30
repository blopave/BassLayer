#!/usr/bin/env node
// Ubica los venues del AMBA para el Mapa de Bass (sept 2026) a partir de la
// dirección que publica cada fuente de eventos. Dos fuentes, sin cuentas:
//   1. Georef (datos.gob.ar, API oficial de direcciones del Estado): la
//      dirección con altura → punto. Es la fuente principal.
//   2. OpenStreetMap (Nominatim; 1 pedido por segundo y User-Agent propio,
//      según su política de uso): la dirección y el nombre del venue.
// Reglas (datos verificados): una calle sin altura no alcanza; si Georef y
// OSM coinciden a menos de 300 m, queda "verified"; sin Georef, solo vale un
// lugar de OSM cuyo nombre sea el del venue. Lo que no se puede ubicar no se
// inventa: queda fuera del mapa.
// Uso: node scripts/geocode-venues.mjs [http://localhost:3001]  (reusa lo ya ubicado)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { venueKey } from "../lib/venues.js";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://localhost:3001";
const OUT = new URL("../data/venues-geo.json", import.meta.url);
const UA = "BassLayer/1.6 (https://basslayer.io)";
const AMBA = { lat: [-35.1, -34.3], lng: [-59.1, -58.1] };
const POI = new Set(["amenity", "leisure", "tourism", "building", "shop", "club"]);

const firstWord = (v) => venueKey(v).split(" ").find((w) => w.length > 2 && !["club", "the", "bar", "teatro", "centro", "cultural", "la", "el", "los", "las"].includes(w)) || "";
const inAmba = (lat, lng) => lat > AMBA.lat[0] && lat < AMBA.lat[1] && lng > AMBA.lng[0] && lng < AMBA.lng[1];
const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Georef: "Calle 123" (lo anterior al primer " - " o coma) en CABA o en la
// provincia de Buenos Aires (con el partido si la ciudad lo nombra).
async function georef(address, city) {
  const street = String(address || "").split(/\s+-\s+|,/)[0].replace(/\blocal\s*\w+/i, "").trim();
  if (!/\d/.test(street)) return null;
  const caba = !city || /^caba$|ciudad de buenos aires|capital federal/i.test(city);
  // Georef no entiende títulos encadenados ("Av. Cnel. Niceto Vega"): se
  // prueba también sin "Av." y sin títulos (Cnel., Gral., Dr.…).
  const variants = [...new Set([
    street,
    street.replace(/^(av(enida)?|avda)\.?\s+/i, ""),
    street.replace(/\b(av|avda|avenida|cnel|coronel|gral|general|dr|pres|pte|ing|tte|cap)\.?\s+/gi, ""),
  ])];
  for (const direccion of variants) {
    const qs = new URLSearchParams({ direccion, provincia: caba ? "02" : "06", max: "1" });
    if (!caba) qs.set("departamento", city);
    await sleep(250);
    const r = await fetch(`https://apis.datos.gob.ar/georef/api/direcciones?${qs}`);
    if (!r.ok) continue;
    const d = (await r.json()).direcciones?.[0];
    const lat = d?.ubicacion?.lat, lng = d?.ubicacion?.lon;
    if (lat && lng && inAmba(lat, lng)) return { lat, lng };
  }
  return null;
}

async function search(q) {
  await sleep(1100);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&countrycodes=ar&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es" } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  return r.json();
}

// Dirección → punto preciso (con número) dentro del AMBA.
async function byAddress(address) {
  if (!address || !/\d/.test(address)) return null;          // sin número: no alcanza
  const q = /buenos aires|caba|capital federal/i.test(address) ? address.replace(/\s+-\s+/g, ", ") : `${address}, Buenos Aires`;
  for (const r of await search(q)) {
    const lat = Number(r.lat), lng = Number(r.lon);
    if (inAmba(lat, lng) && (r.address?.house_number || POI.has(r.category))) return { lat, lng };
  }
  return null;
}
// Nombre del venue → lugar con ese nombre dentro del AMBA.
async function byName(venue) {
  if (!firstWord(venue)) return null;
  for (const r of await search(`${venue}, Buenos Aires`)) {
    const lat = Number(r.lat), lng = Number(r.lon);
    // Sin Georef, el nombre tiene que ser el del venue (no alcanza una palabra).
    if (inAmba(lat, lng) && POI.has(r.category) && venueKey(r.name || "") === venueKey(venue)) return { lat, lng };
  }
  return null;
}

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : {};
const events = await (await fetch(`${BASE}/api/events`)).json();
const venues = new Map();
for (const e of events) if (e.area === "amba" && e.venue && !venues.has(venueKey(e.venue))) venues.set(venueKey(e.venue), e);

let added = 0, skipped = 0;
for (const [key, e] of venues) {
  if (out[key]) continue;
  try {
    const address = e.address !== e.venue ? e.address : "";
    const g = await georef(address, e.city);
    const osm = (await byAddress(address)) || (await byName(e.venue));
    const pick = g || osm;
    if (!pick) { skipped++; console.log("  ✗", e.venue, "·", e.address || "sin dirección"); continue; }
    out[key] = { venue: e.venue, lat: +pick.lat.toFixed(5), lng: +pick.lng.toFixed(5), verified: !!(g && osm && km(g, osm) < 0.3), by: g ? "georef" : "osm-name" };
    added++;
    console.log(out[key].verified ? "  ✓✓" : "  ✓ ", e.venue);
  } catch (err) { console.log("  !", e.venue, err.message); }
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`\n${added} ubicados nuevos, ${skipped} sin ubicación, ${Object.keys(out).length} en total`);

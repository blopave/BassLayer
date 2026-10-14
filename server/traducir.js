// Traducción sin cuenta (MyMemory): titulares con los nombres propios
// protegidos, bios y textos sueltos. Cada texto se traduce UNA vez y queda en
// disco (data/cache/translations.json). Separado de server.js en oct 2026.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { protectNames, restoreNames } from "../lib/content-rules.js";
import { decodeHtmlEntities } from "./texto.js";

export function crearTraductor({ SNAPSHOT_DIR, saveSnapshot, fetchSafe, safeText }) {
// ── Traducción de bios (Wikipedia en el otro idioma) ──
// MyMemory: sin cuenta ni key; cupo anónimo ~5.000 caracteres/día, así que
// cada bio se traduce UNA vez y queda en disco. Sin cupo o con error se
// muestra el original (nunca un mensaje del servicio como si fuera la bio).
let translations = {};
try {
  const raw = JSON.parse(readFileSync(join(SNAPSHOT_DIR, "translations.json"), "utf-8"));
  translations = raw.data || raw;
} catch {}
let translationsSaveTimer = null;
function saveTranslationsSoon() {
  clearTimeout(translationsSaveTimer);
  translationsSaveTimer = setTimeout(() => saveSnapshot("translations", translations), 2000);
  translationsSaveTimer.unref?.();
}
let translateQuotaUntil = 0;

// Titulares: los nombres propios (eventos, clubes, artistas, marcas) no se
// traducen — se apartan antes y se reponen después (oct 2026, Pablo).
async function translateTitle(text, from, to) {
  const { masked, names } = protectNames(text);
  const out = await translateText(masked, from, to);
  return out ? restoreNames(out, names) : null;
}

async function translateText(text, from, to) {
  if (!text || from === to) return null;
  const key = `${from}>${to}:${crypto.createHash("md5").update(text).digest("hex")}`;
  if (translations[key]) return to === "es" ? tidyEs(translations[key], text) : translations[key];
  if (Date.now() < translateQuotaUntil) return null;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${from}|${to === "es" ? "es-AR" : to}`;
    const r = await fetchSafe(url, {}, 8000);
    if (!r.ok) return null;
    const j = JSON.parse(await safeText(r));
    const out = j?.responseData?.translatedText;
    if (j.quotaFinished || j.responseStatus !== 200 || !out || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) {
      if (j.quotaFinished) translateQuotaUntil = Date.now() + 6 * 60 * 60_000;
      return null;
    }
    translations[key] = decodeHtmlEntities(out);
    saveTranslationsSoon();
    return to === "es" ? tidyEs(translations[key], text) : translations[key];
  } catch { return null; }
}

// Prolijidad de la traducción al castellano (oct 2026): el traductor deja los
// números en formato inglés ("$ 80,000,000") y a veces grita una palabra
// ("$ 440 MILLONES"). Números a formato local, el "$" pegado y las palabras en
// mayúsculas que no venían así en el original, en minúscula (las siglas del
// original, como USD o ETF, quedan).
function tidyEs(es, original) {
  const caps = new Set(String(original).match(/\b[A-Z]{2,}\b/g) || []);
  return String(es)
    .replace(/\b(\d{1,3}(?:,\d{3})+)(\.\d+)?\b/g, (_, int, dec) => int.replace(/,/g, ".") + (dec ? "," + dec.slice(1) : ""))
    .replace(/(US)?\$\s+(?=\d)/g, (m, us) => (us ? "US$" : "$"))
    .replace(/#\s+(?=\w)/g, "#")                                  // "# WinkTheNightBack" → "#WinkTheNightBack"
    .replace(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g, (w) => (caps.has(w) ? w : w.toLowerCase()));
}

  return { translateTitle, translateText };
}

// Recorre `items` con hasta `n` tareas a la vez (traducciones: sin esperar
// una por una ni saturar el servicio gratuito).
export async function eachLimit(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

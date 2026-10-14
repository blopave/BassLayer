// Chequeo del server partido en módulos (oct 2026): ningún archivo puede usar
// un nombre que no declara ni importa. Al mover código de server.js a server/,
// un nombre olvidado no rompe al arrancar: falla recién cuando se usa, y a
// veces en silencio (crypto.createHash con el `crypto` web de Node 22 dejó las
// fotos de artista en 0/52 sin un solo error en el log).
import { readFileSync, readdirSync } from "node:fs";

let parse, traverse;
try {
  ({ parse } = await import("@babel/parser"));
  const t = await import("@babel/traverse");
  traverse = t.default.default || t.default;
} catch {
  console.log("  check:modulos — sin @babel/parser, se saltea");
  process.exit(0);
}

// Solo lo que el lenguaje y Node dan de verdad en todos lados. Fuera: fetch,
// crypto, navigator, performance (existen como globales web, pero el server
// usa node-fetch y node:crypto, con otra API).
const PROPIOS = new Set(["console", "process", "Buffer", "URL", "URLSearchParams", "AbortController", "TextEncoder", "TextDecoder",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "queueMicrotask", "structuredClone",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "globalThis", "undefined", "arguments"]);
const esPropio = (n) => PROPIOS.has(n) || (/^[A-Z]/.test(n) && n in globalThis);

const archivos = ["server.js", ...readdirSync("server").filter((f) => f.endsWith(".js")).map((f) => `server/${f}`), "og.js",
  ...readdirSync("lib").filter((f) => f.endsWith(".js")).map((f) => `lib/${f}`)];
let malos = 0;
for (const f of archivos) {
  const ast = parse(readFileSync(f, "utf8"), { sourceType: "module", plugins: ["jsx", "topLevelAwait"] });
  let libres = [];
  traverse(ast, { Program(p) { libres = Object.keys(p.scope.globals).filter((n) => !esPropio(n)); } });
  if (libres.length) { malos++; console.log(`  FALLA ${f}: usa sin declarar ni importar → ${libres.join(", ")}`); }
}
if (malos) { console.log(`\n✗ check:modulos: ${malos} archivo(s)`); process.exit(1); }
console.log(`  ok   módulos del server      ${archivos.length} archivos, todos los nombres declarados`);

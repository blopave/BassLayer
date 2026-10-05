// Exporta la marca al sitio (public/): favicon, íconos de la app e imagen para
// compartir, todo desde los SVG de brand/logo (que genera boleto.py).
//
//   node brand/logo/web.mjs
//
// Favicon: el boleto BL; en pestañas claras va el negro (el hueso se pierde
// sobre blanco). Íconos de app: el boleto BL sobre negro; el maskable deja el
// boleto entero dentro del círculo seguro de Android (80 % del lado).
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const here = (f) => new URL(f, import.meta.url);
const pub = (f) => new URL(`../../public/${f}`, import.meta.url);
const read = (f) => readFileSync(here(f), "utf8");

// Los dos trazados del BL (boleto y letras) y su caja.
const bl = read("boleto-bl-general.svg");
const [, , bw, bh] = bl.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
const [boleto, letras] = [...bl.matchAll(/<path fill="[^"]+" d="([^"]+)"\/>/g)].map((m) => m[1]);

// Cuadrado de `S` con el BL centrado ocupando `frac` del ancho.
function cuadrado(S, frac, { fondo = null, colores = ["#EDEAE4", "#0B0B0B"], favicon = false } = {}) {
  const s = (S * frac) / bw, x = (S - bw * s) / 2, y = (S - bh * s) / 2;
  const estilo = favicon ? `<style>.b{fill:${colores[0]}}.l{fill:${colores[1]}}@media (prefers-color-scheme:light){.b{fill:#0B0B0B}.l{fill:#EDEAE4}}</style>` : "";
  const fill = (i) => (favicon ? `class="${i ? "l" : "b"}"` : `fill="${colores[i]}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${estilo}${fondo ? `<rect width="${S}" height="${S}" fill="${fondo}"/>` : ""}<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(5)})"><path ${fill(0)} d="${boleto}"/><path ${fill(1)} d="${letras}"/></g></svg>\n`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer();

// favicon.ico con un PNG de 32 adentro (formato ICO con PNG embebido).
function ico(png32) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png32.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png32]);
}

const app = read("boleto-app.svg");
// El maskable: el boleto entero dentro del círculo del 80 % (su diagonal manda).
const diag = Math.hypot(bw, bh) / bw;              // diagonal / ancho
const fracMask = 0.78 / diag;

writeFileSync(pub("favicon.svg"), cuadrado(64, 0.96, { favicon: true }));
writeFileSync(pub("favicon.ico"), ico(await png(cuadrado(64, 0.96), 32)));
writeFileSync(pub("apple-touch-icon.png"), await png(app, 180));
writeFileSync(pub("icon-192.png"), await png(app, 192));
writeFileSync(pub("icon-512.png"), await png(app, 512));
writeFileSync(pub("icon-maskable-512.png"), await png(cuadrado(512, fracMask, { fondo: "#000" }), 512));
writeFileSync(pub("og-image.png"), await sharp(Buffer.from(read("og.svg")), { density: 150 }).resize(1200, 630).png().toBuffer());
console.log("✓ favicon.svg/.ico, apple-touch-icon, icon-192/512, icon-maskable-512, og-image →", new URL("../../public/", import.meta.url).pathname);

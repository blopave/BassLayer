// Exporta el ícono de BassLayer al sitio (public/): favicon, íconos de la app
// instalable y accesos directos, todo desde brand/logo/ficha-icono.js.
//
//   node brand/logo/web.mjs
//
// El escalón sale del tamaño en que se VE, no de los píxeles: el inicio del
// celular muestra el ícono a ~60 pt (medio, aunque el PNG sea de 180 o 512);
// la pestaña del navegador lo muestra a 16 (mini).
// Arte a sangre y opaco (iOS pinta de negro lo transparente y redondea solo).
// La imagen para compartir (og-image.png) no sale de acá.
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { fichaIcono } from "./ficha-icono.js";

const pub = (f) => new URL(`../../public/${f}`, import.meta.url);
const png = (svg, size) => sharp(Buffer.from(svg), { density: 400 }).resize(size, size).flatten({ background: "#000" }).png().toBuffer();

// favicon.ico con un PNG de 32 adentro (formato ICO con PNG embebido).
function ico(png32) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png32.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png32]);
}

const app = fichaIcono({ escalon: "medio" });
const grande = fichaIcono({ escalon: "completo" });
// Maskable: la ficha (radio 0,44 del lado) entra en el círculo seguro de Android (0,40).
const maskable = fichaIcono({ escalon: "medio", margen: 0.88 });
const mini = fichaIcono({ escalon: "mini", esquina: 0.2 });

writeFileSync(pub("favicon.svg"), mini + "\n");
writeFileSync(pub("favicon.ico"), ico(await sharp(Buffer.from(mini), { density: 400 }).resize(32, 32).png().toBuffer()));
writeFileSync(pub("apple-touch-icon.png"), await png(app, 180));
writeFileSync(pub("icon-192.png"), await png(app, 192));
writeFileSync(pub("icon-512.png"), await png(app, 512));
writeFileSync(pub("icon-maskable-512.png"), await png(maskable, 512));
writeFileSync(pub("icon-1024.png"), await png(grande, 1024));
writeFileSync(pub("icon-96.png"), await png(app, 96));
console.log("✓ favicon.svg/.ico, apple-touch-icon, icon-96/192/512/1024, icon-maskable-512 →", new URL("../../public/", import.meta.url).pathname);

// Emite el pase de esta semana con los datos del sitio.
//
//   node brand/sistema/exportar.mjs                    → usa http://localhost:3001
//   node brand/sistema/exportar.mjs https://basslayer.io
//
// Escribe brand/exportados/pases/pase-AAAA-SS-{noche,dia}.svg y el isotipo de
// esa semana. El texto va en Geist: para imprenta, pasar a curvas al exportar
// a PDF (paso "exportados" del README).
import { writeFileSync, mkdirSync } from "node:fs";
import { datosDeSemana, pase, isotipo } from "./pase.mjs";

const BASE = process.argv[2] || "http://localhost:3001";
const [events, prices] = await Promise.all([fetch(`${BASE}/api/events`).then((r) => r.json()), fetch(`${BASE}/api/prices`).then((r) => r.json())]);
const btc = prices.find((p) => p.sym === "BTC");
if (!btc?.sparkline?.length) { console.error("Sin serie del BTC: no se puede emitir el pase."); process.exit(1); }
const D = datosDeSemana(events, btc.sparkline);
const dir = new URL("../exportados/pases/", import.meta.url);
mkdirSync(dir, { recursive: true });
const tag = `${D.numero.anio}-${String(D.numero.semana).padStart(2, "0")}`;
writeFileSync(new URL(`pase-${tag}-noche.svg`, dir), pase(D, { tema: "noche" }));
writeFileSync(new URL(`pase-${tag}-dia.svg`, dir), pase(D, { tema: "dia" }));
writeFileSync(new URL(`isotipo-${tag}.svg`, dir), isotipo(D));
writeFileSync(new URL(`isotipo-${tag}-chico.svg`, dir), isotipo(D, { chico: true }));
console.log(`✓ pase Nº ${tag}: ${D.fiestas} fiestas, BTC ${Math.round(D.btc.ultimo)} (${D.btc.cambio.toFixed(1)}%)`);

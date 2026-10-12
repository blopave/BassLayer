import { ficha, objetivo, ESTADO_INICIAL } from "/Users/vela/Desktop/Proyects/BassLayer/src/brand/ficha.js";
import { chromium } from "/Users/vela/Desktop/Proyects/BassLayer/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const st = { ...ESTADO_INICIAL, ...objetivo(""), time: 0, spin: 0 };
const rep = ficha(st);
const sb = ficha({ ...st, ...objetivo("bass") });
const sl = ficha({ ...st, ...objetivo("layer"), sweep: 4.4, flow: 3 });
// Símbolo B · Ficha de la ronda 21 (geometría copiada de la lámina)
const CU="#C49070",CY="#6CB8C8",PAPEL="#EDEAE4",FONDO="#0E0E0F";
const HZ=60,VX=33,VR=22,HOLE=6.5,VELAS=[{x:63,h:14},{x:74,h:23},{x:85,h:33}];
const vwF=(sin)=>(Math.PI*VR*VR/2-(sin?0:Math.PI*HOLE*HOLE/2))/VELAS.reduce((s,v)=>s+v.h,0);
const B=(chico)=>{const vw=vwF(chico);return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><circle cx="50" cy="50" r="46"/></clipPath></defs><circle cx="50" cy="50" r="48" fill="#17171A" stroke="rgba(237,234,228,.22)" stroke-width="1.4"/><g clip-path="url(#c)"><path d="M${VX-VR} ${HZ} A${VR} ${VR} 0 0 1 ${VX+VR} ${HZ} Z" fill="${CU}"/>${chico?"":`<path d="M${VX-HOLE} ${HZ} A${HOLE} ${HOLE} 0 0 1 ${VX+HOLE} ${HZ} Z" fill="${FONDO}"/>`}${VELAS.map(v=>`<rect x="${v.x-vw/2}" y="${HZ-v.h}" width="${vw}" height="${v.h}" fill="${CY}"/>`+(chico?"":`<rect x="${v.x-.9}" y="${HZ-v.h-6}" width="1.8" height="6" fill="${CY}"/>`)).join("")}<rect x="6" y="${HZ}" width="88" height="2.6" fill="${PAPEL}"/></g></svg>`};
const cell=(svg,px,extra="")=>`<div style="display:inline-block;margin:8px;vertical-align:middle;${extra}"><div style="width:${px}px;height:${px}px">${svg.replace("<svg ",'<svg width="100%" height="100%" ')}</div></div>`;
const row=(t,items)=>`<div style="color:#999;font:12px monospace;margin:10px 8px 0">${t}</div><div>${items}</div>`;
const html=`<body style="margin:0;background:#000;padding:10px">
${row("Ficha (home) · reposo / Bass / Layer · 240 px",cell(rep,240)+cell(sb,240)+cell(sl,240))}
${row("Ficha reposo · 180 · 96 · 48 · 32 · 16 px  |  desenfocada (retina) · gris",cell(rep,180)+cell(rep,96)+cell(rep,48)+cell(rep,32)+cell(rep,16)+cell(rep,120,"filter:blur(5px)")+cell(rep,120,"filter:grayscale(1)"))}
${row("Ronda 21 · B Ficha · 180 · 96 · 48 · 32(chico) · 16(chico) | retina | gris",cell(B(false),180)+cell(B(false),96)+cell(B(false),48)+cell(B(true),32)+cell(B(true),16)+cell(B(false),120,"filter:blur(5px)")+cell(B(false),120,"filter:grayscale(1)"))}
</body>`;
writeFileSync(process.argv[2]+"/lamina.html",html);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1100,height:820},deviceScaleFactor:1});
await p.setContent(html); await p.screenshot({path:process.argv[2]+"/lamina.png",fullPage:true});
// medir: fracción del círculo en reposo, colores dominantes a 48
await b.close();

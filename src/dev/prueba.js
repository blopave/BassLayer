// Solo en desarrollo (npm run dev; en el build de producción esto no existe):
// simula los estados de la app instalable para verlos en preview.html, mobile y desktop a la vez.
//   ?prueba=invitar → segunda visita y el navegador ofrece instalar (Chrome/Edge/Android)
//   ?prueba=iphone  → Safari de iPhone: no hay instalación con un toque, se explica el camino
//   ?prueba=app     → adentro de la app instalada: pantalla completa; en el celular, el reloj y la isla arriba
// Lo que no se puede simular acá: los modos del ícono de iOS (oscuro, transparente, tintado).

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

// El diálogo que abriría el navegador al tocar "Instalar" (acá es una maqueta).
function dialogoFalso() {
  return new Promise((resolve) => {
    const d = document.createElement("div");
    d.setAttribute("style", "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:system-ui");
    d.innerHTML = `<div style="background:#1E1F22;color:#eee;border-radius:16px;padding:20px;width:min(340px,90vw)">
      <div style="display:flex;gap:12px;align-items:center"><img src="/icon-192.png" style="width:48px;height:48px;border-radius:11px"><div><b style="font-size:16px">¿Instalar la app?</b><div style="font-size:12px;color:#9aa">BassLayer · basslayer.io</div></div></div>
      <p style="font-size:12px;color:#9aa;margin:14px 0">(Prueba: este es el diálogo que abre el navegador.)</p>
      <div style="display:flex;justify-content:flex-end;gap:14px"><button data-r="dismissed" style="background:none;border:0;color:#A8C7FA;font-size:14px;cursor:pointer">Cancelar</button><button data-r="accepted" style="background:#A8C7FA;color:#062e6f;border:0;border-radius:999px;padding:8px 18px;font-size:14px;cursor:pointer">Instalar</button></div></div>`;
    d.addEventListener("click", (e) => { const r = e.target.closest("[data-r]")?.dataset.r; if (r) { d.remove(); resolve({ outcome: r }); } });
    document.body.append(d);
  });
}

export function aplicarPrueba() {
  const p = new URLSearchParams(location.search).get("prueba");
  if (!p) return;
  window.__blPrueba = p;
  const ls = window.localStorage, celular = innerWidth <= 768;
  if (p === "invitar" || p === "iphone") {
    ls.setItem("bl-onboarded", "1"); ls.setItem("bl-visitas", "5"); ls.removeItem("bl-app-no"); ls.removeItem("bl-app");
  }
  if (p === "invitar") {
    let opcion;
    const ofrecer = () => {
      const e = new Event("beforeinstallprompt");
      e.prompt = () => { opcion = dialogoFalso(); };
      Object.defineProperty(e, "userChoice", { get: () => opcion });
      dispatchEvent(e);
    };
    setTimeout(ofrecer, 600);
  }
  if (p === "iphone") Object.defineProperty(navigator, "userAgent", { get: () => IPHONE_UA });
  if (p === "app") {
    ls.removeItem("bl-onboarded");   // para comprobar que adentro de la app no se repite la bienvenida
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q));
    if (celular) {
      // lo que iOS da con viewport-fit=cover: 59 px de zona segura arriba (iPhone 15/16/17)
      const st = document.createElement("style");
      st.textContent = ".bl-swipe-wrap{padding-top:59px!important}";
      document.head.append(st);
      const barra = document.createElement("div");
      barra.setAttribute("style", "position:fixed;top:0;left:0;right:0;height:59px;z-index:99999;pointer-events:none;display:flex;justify-content:space-between;align-items:center;padding:8px 34px 0;font:600 15px system-ui;color:#fff");
      barra.innerHTML = '<span>21:41</span><span style="position:absolute;left:50%;top:12px;width:120px;height:34px;transform:translateX(-50%);background:#000;border-radius:999px"></span><span style="letter-spacing:1px">●●● ▮</span>';
      addEventListener("DOMContentLoaded", () => document.body.append(barra));
      if (document.body) document.body.append(barra);
    }
  }
}

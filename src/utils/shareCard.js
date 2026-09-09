// Share de evento con story-card (1080×1920). La card la genera el SERVER
// (/og/story/event/:slug.png, satori+resvg): el flyer se fetchea allá sin CORS
// y el resultado se cachea por slug. Acá solo la bajamos (same-origin) y la
// entregamos al share sheet del sistema. Cadena de degradación:
// archivo → texto nativo → copiar link (sin apps de terceros hardcodeadas).

function toast(msg) {
  const el = document.querySelector(".bl-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

export async function shareEventCard(ev, { url, text, storyUrl, copiedLabel }) {
  // 1) Card como archivo, si el dispositivo comparte archivos.
  if (storyUrl && navigator.canShare) {
    try {
      const resp = await fetch(storyUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const file = new File([blob], "basslayer-evento.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: ev.name, text: `${text}\n${url}` });
          return "card";
        }
      }
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  // 2) Share nativo de texto (el sheet del sistema decide las apps).
  if (navigator.share) {
    try { await navigator.share({ title: ev.name, text, url }); return "native"; }
    catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  // 3) Copiar el link — desktop sin share sheet.
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast(copiedLabel || "Link copiado");
    return "copied";
  } catch {
    return "unavailable";
  }
}

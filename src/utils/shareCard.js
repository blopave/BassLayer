// Share de evento con story-card (1080×1920). La card la genera el SERVER
// (/og/story/event/:slug.png, satori+resvg): el flyer se fetchea allá sin CORS
// y el resultado se cachea por slug. Acá solo la bajamos (same-origin) y la
// entregamos al share sheet. Cadena de degradación: archivo → texto → wa.me.
export async function shareEventCard(ev, { url, text, storyUrl }) {
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
  // 2) Share nativo de texto.
  if (navigator.share) {
    try { await navigator.share({ title: ev.name, text, url }); return "native"; }
    catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  // 3) WhatsApp directo — el canal real de la escena.
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, "_blank", "noopener");
  return "wa";
}

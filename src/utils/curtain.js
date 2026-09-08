// La cortina de index.html tapa el prerender SEO hasta que React toma control.
// Vive fuera de #root (el server hace replace del div completo y createRoot lo
// vacía), así que React no la limpia solo: se retira desde acá, tanto en el
// primer commit exitoso (App) como en un crash previo (ErrorBoundary).
export function dismissCurtain() {
  document.getElementById("bl-curtain")?.remove();
}

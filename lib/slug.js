// slugify compartido por el server (prerender, rutas /eventos/[slug]) y el
// cliente (abrir el modal desde la URL). Una sola copia: cuando eran dos,
// divergieron ("Geøvhän" daba un slug en cada lado).
export function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/\p{Mn}/gu, "")
    .toLowerCase()
    // Letras que NFD no descompone: sin esto "Geøvhän" daba "ge-vhan".
    .replace(/[øœæßłđþðı]/g, (c) => ({ ø: "o", œ: "oe", æ: "ae", ß: "ss", ł: "l", đ: "d", þ: "th", ð: "d", ı: "i" })[c])
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

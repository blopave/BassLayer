// Qué cuenta como artista real en un line-up. Las fuentes traen placeholders
// ("TBA", "b2b", "más a confirmar") que no son nombres y no deben renderizarse
// ni pedirse a /api/artist. Un solo filtro para el modal, el picker y el share.
const PLACEHOLDER = /^(tba|tbd|tbc|b2b|más a confirmar|mas a confirmar|line-?up|varios artistas|dj set)$/i;

export function cleanArtists(list) {
  return (list || []).filter((a) => typeof a === "string" && a.trim() && !PLACEHOLDER.test(a.trim()));
}

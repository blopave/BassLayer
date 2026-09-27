// Qué cuenta como artista real en un line-up: misma regla que aplica el
// server (lib/content-rules.js) — placeholders ("TBA", "b2b") y nombres de
// escenario ("Main Stage") no se renderizan ni se piden a /api/artist.
import { isNotArtist } from "../../lib/content-rules.js";

export function cleanArtists(list) {
  return (list || []).filter((a) => typeof a === "string" && !isNotArtist(a));
}

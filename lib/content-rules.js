// Reglas de limpieza de contenido compartidas: las aplica server.js al armar
// los datos y scripts/check-content.mjs verifica que se hayan aplicado (sin
// copiar las reglas, que vivirían desactualizadas).

// Qué NO es un artista en un line-up: escenarios/salas y placeholders. Solo
// matchea el nombre entero ("Terraza", "Main Stage", "Room 2", "Open Air"),
// nunca una parte ("Terrace Sessions" o "Roomful" quedan).
export const LINEUP_STAGE = /^(?:(?:main|second|third|big|small|outdoor|indoor|club|dance|techno|house|upper|lower|back|front)\s+)?(?:stage|room|floor|arena|tent|carpa|escenario|sala|terrace|terraza|rooftop|patio|jard[ií]n|garden|lounge|pool|beach|area|área)(?:\s+(?:\d+|[ivx]+|[a-z]))?$|^(?:main|open[\s-]?air|warm[\s-]?up|closing|opening)$/i;
export const LINEUP_PLACEHOLDER = /^(?:tba|tbd|tbc|b2b|m[aá]s a confirmar|line-?up|varios artistas|dj set|special guests?|guests?|invitados?|y m[aá]s|and more|residentes|residents)$/i;
export function cleanLineup(list) {
  const seen = new Set();
  return (list || []).filter((a) => {
    if (typeof a !== "string" || isNotArtist(a)) return false;
    const k = a.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Plantillas sin completar del CMS de origen ("…del mercado [FECHA]",
// "{{title}}"). Lista explícita de tokens para no comerse tickers legítimos
// como "[QNT]".
export const TEMPLATE_TOKEN = /\[(?:fecha|date|hora|time|t[ií]tulo|title|nombre|name|precio|price|autor|author|ciudad|city|pa[ií]s|country|link|url|placeholder)\]|\{\{[^}]*\}\}/i;
export function stripTemplateTokens(t) {
  return String(t).replace(new RegExp(`\\s*(?:${TEMPLATE_TOKEN.source})\\s*`, "gi"), " ");
}

// true si el nombre de un line-up no es un artista (escenario o placeholder).
export function isNotArtist(name) {
  const t = String(name || "").trim();
  return !t || LINEUP_STAGE.test(t) || LINEUP_PLACEHOLDER.test(t);
}

// Actividades que no son shows, detectables por el título: la fuente
// (QuéHacemos) las publica tipeadas como "recital" (sept 2026: un desayuno en
// una panadería, fútbol y visitas guiadas en "El finde"). Solo señales
// inequívocas; "humor" o "cuento" sueltos sacaban a músicos (Albert Pla).
export const NOT_A_SHOW_TITLE = /\b(visita guiada|visitas guiadas|desayuno|brunch|degustaci[oó]n|cata de vinos?|panader[ií]a|f[uú]tbol|yoga|meditaci[oó]n|se hace cuento|cuentacuentos|paranormal)\b/i;

// Dónde es cada cosa: una sola regla para server.js (arma los datos), el
// front (Eventos cripto) y los chequeos (check-content, smoke). Antes vivía
// copiada en cuatro lugares con listas distintas (sept 2026).

export const normPlace = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Otras ciudades del país. Córdoba, Mendoza, Rosario y La Plata también son
// calles de CABA ("Av. Córdoba 5000", "Mendoza 2100"): cuentan como ciudad
// solo si no vienen tras "av./avenida/calle" ni antes de una altura.
const asCity = (name) => new RegExp(`(?<!\\b(?:av|avda|avenida|calle)\\.?\\s)\\b${name}\\b(?!\\s*\\d)`, "i");
export const OTHER_CITIES = [
  { city: "Mar del Plata", rx: /\bmar del plata\b/i },
  { city: "Córdoba", rx: asCity("c[oó]rdoba") },
  { city: "Rosario", rx: asCity("rosario") },
  { city: "Mendoza", rx: asCity("mendoza") },
  { city: "La Plata", rx: asCity("la plata") },
  { city: "Bariloche", rx: /\bbariloche\b/i },
];
const CABA_PATTERNS = [
  /\b(palermo|recoleta|san telmo|microcentro|belgrano|almagro|caballito|flores|villa crespo|villa urquiza|nuñez|colegiales|barracas|la boca|congreso|abasto|chacarita|constitución|monserrat|retiro|tribunales|costanera|puerto madero|costa salguero)\b/i,
  /\b(caba|capital federal)\b/i,
  /\bbuen(?:os\s)?aires\b(?!.*\bprovincia\b)/i,
];

// AMBA = CABA + los 40 municipios del Gran Buenos Aires (y sus localidades
// más frecuentes en las fuentes). Es la "superficie" de Bass: home, finde y
// agenda por defecto; el resto del país queda por filtro (Pablo, sept 2026).
export const AMBA = new Set([
  "caba", "ciudad de buenos aires", "capital federal",
  "almirante brown", "avellaneda", "berazategui", "berisso", "brandsen", "campana", "canuelas", "ensenada", "escobar",
  "esteban echeverria", "exaltacion de la cruz", "ezeiza", "florencio varela", "general las heras", "general rodriguez",
  "general san martin", "hurlingham", "ituzaingo", "jose c. paz", "la matanza", "lanus", "la plata", "lomas de zamora",
  "lujan", "marcos paz", "malvinas argentinas", "moreno", "merlo", "moron", "pilar", "presidente peron", "quilmes",
  "san fernando", "san isidro", "san miguel", "san vicente", "tigre", "tres de febrero", "vicente lopez", "zarate",
  "adrogue", "banfield", "bernal", "bernal oeste", "belen de escobar", "boulogne", "caseros", "castelar", "city bell",
  "del viso", "don torcuato", "florida", "haedo", "los cardales", "cardales", "martinez", "munro", "nordelta",
  "olivos", "ramos mejia", "san justo", "sarandi", "temperley", "tortuguitas", "villa ballester", "wilde", "acassuso",
  "beccar", "la lucila", "ingeniero maschwitz", "benavidez", "gonzalez catan", "villa adelina", "lomas del mirador",
]);
// En texto libre, nombres ambiguos no cuentan solos ("Miami, Florida", "San
// Miguel de Tucumán", el apellido Moreno): como campo de ciudad sí valen.
const AMBIGUOUS = new Set(["florida", "moreno", "merlo", "wilde", "munro", "bernal", "escobar", "martinez", "san miguel", "san justo", "san fernando", "san vicente", "caba", "capital federal", "ciudad de buenos aires"]);
const GBA_IN_TEXT = new RegExp(`\\b(${[...AMBA].filter((p) => p.length >= 5 && !AMBIGUOUS.has(p)).map((p) => p.replace(/\./g, "\\.")).join("|")})\\b`);

// Ciudad de un evento a partir de venue/dirección; el título solo desempata
// cuando no dicen nada ("Boris Brejcha La Fabrica Córdoba" con venue "La
// Fabrica"). null = no se sabe: el que llama decide el default.
export function detectCity(venue, address, title = "") {
  const text = `${venue || ""} ${address || ""}`;
  for (const { city, rx } of OTHER_CITIES) if (rx.test(text)) return city;
  if (CABA_PATTERNS.some((rx) => rx.test(text))) return "CABA";
  for (const { city, rx } of OTHER_CITIES) if (rx.test(title)) return city;
  return null;
}

// ¿Esta ciudad (campo ya normalizado de un evento) es AMBA?
export const isAmbaCity = (city) => AMBA.has(normPlace(city));

// ¿Este texto libre (una ubicación como "Costa Salguero, Buenos Aires") es
// AMBA? Nombra CABA o un municipio/localidad del GBA y ninguna otra ciudad.
// La Plata está en OTHER_CITIES (para no confundirla con la Av. La Plata de
// CABA) pero es AMBA: acá solo cuentan las ciudades de fuera del AMBA.
const OUTSIDE_AMBA = OTHER_CITIES.filter(({ city }) => !AMBA.has(normPlace(city)));
export function textIsAmba(text) {
  if (!text || OUTSIDE_AMBA.some(({ rx }) => rx.test(text))) return false;
  if (OTHER_CITIES.some(({ rx }) => rx.test(text))) return true;
  return CABA_PATTERNS.some((rx) => rx.test(text)) || GBA_IN_TEXT.test(normPlace(text));
}

// ¿Este texto nombra una ciudad de fuera del AMBA? (lo usa check-content)
export const namesOtherCity = (text) => OUTSIDE_AMBA.some(({ rx }) => rx.test(text || ""));

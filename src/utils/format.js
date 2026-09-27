// Capitalización de mercado compacta: $2.90T · $1694.1B → $1.69T · $512M.
// Una sola fuente para el terminal de Layer y el modal de precio.
export function formatMarketCap(n) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

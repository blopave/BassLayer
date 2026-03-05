export const api = {
  prices: () => fetch("/api/prices").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  news:   () => fetch("/api/news").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  events: () => fetch("/api/events").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
};

export function formatPrice(p) {
  if (p >= 1000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

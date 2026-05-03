function authHeaders() {
  const token = localStorage.getItem("bl-token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function authFetch(url, opts = {}) {
  return fetch(url, { ...opts, headers: { ...authHeaders(), ...opts.headers } })
    .then(r => {
      if (r.ok) return r.json();
      return r.json().catch(() => ({ error: `Error ${r.status}` })).then(e => Promise.reject(e.error || `Error ${r.status}`));
    });
}

export const venueApi = {
  getProfile:    () => authFetch("/api/venue/me"),
  updateProfile: (data) => authFetch("/api/venue/me", { method: "PUT", body: JSON.stringify(data) }),
  getPublic:     (slug) => fetch(`/api/venue/${slug}`).then(r => r.ok ? r.json() : Promise.reject("Not found")),
  getEvents:     () => authFetch("/api/venue/events"),
  createEvent:   (data) => authFetch("/api/venue/events", { method: "POST", body: JSON.stringify(data) }),
  updateEvent:   (id, data) => authFetch(`/api/venue/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteEvent:   (id) => authFetch(`/api/venue/events/${id}`, { method: "DELETE" }),
};

export const projectApi = {
  getProfile:        () => authFetch("/api/project/me"),
  updateProfile:     (data) => authFetch("/api/project/me", { method: "PUT", body: JSON.stringify(data) }),
  getAnnouncements:  () => authFetch("/api/project/announcements"),
  createAnnouncement:(data) => authFetch("/api/project/announcements", { method: "POST", body: JSON.stringify(data) }),
  updateAnnouncement:(id, data) => authFetch(`/api/project/announcements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAnnouncement:(id) => authFetch(`/api/project/announcements/${id}`, { method: "DELETE" }),
};

export const adminApi = {
  getEvents:        (status = "pending") => authFetch(`/api/admin/events?status=${status}`),
  approve:          (id) => authFetch(`/api/admin/events/${id}/approve`, { method: "PUT" }),
  reject:           (id, note) => authFetch(`/api/admin/events/${id}/reject`, { method: "PUT", body: JSON.stringify({ note }) }),
  feature:          (id) => authFetch(`/api/admin/events/${id}/feature`, { method: "PUT" }),
  getVenues:        () => authFetch("/api/admin/venues"),
  verifyVenue:      (id) => authFetch(`/api/admin/venues/${id}/verify`, { method: "PUT" }),
  getAnnouncements: (status = "pending") => authFetch(`/api/admin/announcements?status=${status}`),
  approveAnn:       (id) => authFetch(`/api/admin/announcements/${id}/approve`, { method: "PUT" }),
  rejectAnn:        (id, note) => authFetch(`/api/admin/announcements/${id}/reject`, { method: "PUT", body: JSON.stringify({ note }) }),
  pinAnn:           (id) => authFetch(`/api/admin/announcements/${id}/pin`, { method: "PUT" }),
};

export const api = {
  prices:    () => fetch("/api/prices").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  news:      () => fetch("/api/news").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  events:    () => fetch("/api/events").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  dashboard: () => fetch("/api/dashboard").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  cryptoIrl: () => fetch("/api/crypto-irl").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  cryptoEvents: () => fetch("/api/crypto-events").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  artist:    (name, locale = "es") => fetch(`/api/artist?name=${encodeURIComponent(name)}&locale=${encodeURIComponent(locale)}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  announcements: () => fetch("/api/announcements").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
  submitCryptoIrl: (data) => fetch("/api/crypto-irl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => (r.ok ? r.json() : r.json().catch(() => ({ error: `Error ${r.status}` })).then(e => Promise.reject(e.error || `Error ${r.status}`)))),
};

export function formatPrice(p) {
  if (p == null || isNaN(p)) return "$—";
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

// Métricas de la app instalable: contadores diarios sin datos personales (Supabase metricas_app).
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`;
// devuelve guardarMetricas para vaciar lo pendiente al apagar.

export function montarMetricas(app, d) {
  const { requireAdmin, requireAuth, supabase } = d;

// ─────────────────────────────────────────────
//  Métricas de la app instalable (oct 2026): contadores diarios sin datos
//  personales (sin IDs, IP ni cookies). El cliente manda un beacon por evento;
//  se suman en memoria y se guardan en Supabase cada minuto (metricas_app,
//  función sumar_metrica). Solo valores de una lista cerrada.
// ─────────────────────────────────────────────
const METRICAS = {
  evento: new Set(["inv_vista", "inv_cerrar", "inv_instalar", "ios_como", "menu_app", "instalada", "abre_app"]),
  plataforma: new Set(["android", "ios", "desktop"]),
  modo: new Set(["web", "app"]),
};
const metricasPend = new Map();
app.post("/api/m", (req, res) => {
  const { e, p, m } = req.body || {};
  if (!METRICAS.evento.has(e) || !METRICAS.plataforma.has(p) || !METRICAS.modo.has(m)) return res.status(400).end();
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const k = `${dia}|${e}|${p}|${m}`;
  metricasPend.set(k, (metricasPend.get(k) || 0) + 1);
  res.status(204).end();
});
async function guardarMetricas() {
  if (!supabase || !metricasPend.size) return;
  const lote = [...metricasPend];
  metricasPend.clear();
  for (const [k, n] of lote) {
    const [p_dia, p_evento, p_plataforma, p_modo] = k.split("|");
    const { error } = await supabase.rpc("sumar_metrica", { p_dia, p_evento, p_plataforma, p_modo, p_n: n });
    if (error) { console.error("[metricas]", error.message); metricasPend.set(k, (metricasPend.get(k) || 0) + n); }
  }
}
setInterval(() => guardarMetricas().catch(() => {}), 60_000).unref();

// Para el panel admin: los últimos 30 días.
app.get("/api/admin/metricas", requireAuth, requireAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("metricas_app").select("dia, evento, plataforma, modo, n").gte("dia", desde).order("dia", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
  return { guardarMetricas };
}

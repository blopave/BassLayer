// Venues: perfiles, eventos cargados por venues y su moderación desde el admin.
// Separado de server.js en oct 2026: lo que necesita del server llega en `d`.

export function montarVenues(app, d) {
  const { cache, requireAdmin, requireAuth, supabase } = d;

// ═══════════════════════════════════════════════════════
//  Venue System — auth, profiles, event management
// ═══════════════════════════════════════════════════════

// ── Venue Profile ──

app.get("/api/venue/me", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", req.user.id)
    .single();

  if (error) return res.status(404).json({ error: "Perfil no encontrado" });
  res.json(data);
});

app.put("/api/venue/me", requireAuth, async (req, res) => {
  const allowed = [
    "display_name", "slug", "description", "venue_type", "address",
    "barrio", "city", "capacity", "logo_url", "cover_url",
    "website", "ra_url",   // sin redes: Pablo no quiere WhatsApp ni Instagram en el sitio (sept 2026)
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Venue Events ──

app.post("/api/venue/events", requireAuth, async (req, res) => {
  const { name, description, date, time_start, time_end, genre, artists, flyer_url, ticket_url, ticket_price, min_age, status } = req.body;

  if (!name || !date || !time_start || !genre) {
    return res.status(400).json({ error: "name, date, time_start y genre son requeridos" });
  }

  const eventStatus = status === "draft" ? "draft" : "pending";

  const { data, error } = await supabase
    .from("venue_events")
    .insert({
      venue_id: req.user.id,
      name: String(name).slice(0, 80),
      description: description ? String(description).slice(0, 1000) : null,
      date,
      time_start,
      time_end: time_end || null,
      genre,
      artists: artists || [],
      flyer_url: flyer_url || null,
      ticket_url: ticket_url || null,
      ticket_price: ticket_price || null,
      min_age: min_age || 18,
      status: eventStatus,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.get("/api/venue/events", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("venue_events")
    .select("*")
    .eq("venue_id", req.user.id)
    .order("date", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/venue/events/:id", requireAuth, async (req, res) => {
  // First check ownership and status
  const { data: existing } = await supabase
    .from("venue_events")
    .select("venue_id, status")
    .eq("id", req.params.id)
    .single();

  if (!existing || existing.venue_id !== req.user.id) {
    return res.status(404).json({ error: "Evento no encontrado" });
  }
  if (!["draft", "rejected"].includes(existing.status)) {
    return res.status(400).json({ error: "Solo se pueden editar eventos en borrador o rechazados" });
  }

  const allowed = [
    "name", "description", "date", "time_start", "time_end", "genre",
    "artists", "flyer_url", "ticket_url", "ticket_price", "min_age", "status"
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  // If resubmitting, set to pending
  if (updates.status === "pending") updates.status = "pending";
  // Don't allow setting to approved directly
  if (updates.status === "approved") delete updates.status;

  const { data, error } = await supabase
    .from("venue_events")
    .update(updates)
    .eq("id", req.params.id)
    .eq("venue_id", req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete("/api/venue/events/:id", requireAuth, async (req, res) => {
  const { error } = await supabase
    .from("venue_events")
    .delete()
    .eq("id", req.params.id)
    .eq("venue_id", req.user.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── Venue Public Profile (must be after all /api/venue/* specific routes) ──
app.get("/api/venue/:slug", async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, slug, description, venue_type, address, barrio, city, capacity, logo_url, cover_url, website, ra_url, verified")
    .eq("slug", req.params.slug)
    .single();

  if (error) return res.status(404).json({ error: "Venue no encontrado" });
  res.json(data);
});

// ── Admin Moderation ──

app.get("/api/admin/events", requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || "pending";
  const { data, error } = await supabase
    .from("venue_events")
    .select("*, profiles(display_name, slug, logo_url, verified)")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/admin/events/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("venue_events")
    .update({ status: "approved", rejection_note: null })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Log action
  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "approve",
    target_type: "event",
    target_id: req.params.id,
  });

  // Invalidate events cache so approved event appears in feed
  cache.events.ts = 0;

  res.json(data);
});

app.put("/api/admin/events/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const note = req.body.note || "";

  const { data, error } = await supabase
    .from("venue_events")
    .update({ status: "rejected", rejection_note: note })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "reject",
    target_type: "event",
    target_id: req.params.id,
    note,
  });

  res.json(data);
});

app.put("/api/admin/events/:id/feature", requireAuth, requireAdmin, async (req, res) => {
  // Toggle featured
  const { data: current } = await supabase
    .from("venue_events")
    .select("featured")
    .eq("id", req.params.id)
    .single();

  const { data, error } = await supabase
    .from("venue_events")
    .update({ featured: !current?.featured })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "feature",
    target_type: "event",
    target_id: req.params.id,
  });

  cache.events.ts = 0;
  res.json(data);
});

app.get("/api/admin/venues", requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put("/api/admin/venues/:id/verify", requireAuth, requireAdmin, async (req, res) => {
  const { data: current } = await supabase
    .from("profiles")
    .select("verified")
    .eq("id", req.params.id)
    .single();

  const { data, error } = await supabase
    .from("profiles")
    .update({ verified: !current?.verified })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from("admin_log").insert({
    admin_id: req.user.id,
    action: "verify_venue",
    target_type: "venue",
    target_id: req.params.id,
  });

  res.json(data);
});

}

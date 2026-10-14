// Middlewares de sesión (Supabase): el panel de venues, los anuncios y el admin.
export function crearAuth(supabase) {
  // Auth middleware — extracts user from Bearer token
  async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token requerido" });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: "Token inválido" });

    req.user = user;
    next();
  }

  // Admin middleware — requires admin role
  async function requireAdmin(req, res, next) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ error: "Acceso denegado" });
    }
    next();
  }

  return { requireAuth, requireAdmin };
}

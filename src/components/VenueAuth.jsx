import { useState } from "react";
import { supabase } from "../utils/supabase";

export function VenueAuth({ onAuth, onBack }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("venue");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "register") {
        if (!displayName.trim()) { setError("Nombre es requerido"); setLoading(false); return; }
        const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;

        // Create profile
        if (data.user) {
          const safeRole = ["venue", "promoter"].includes(role) ? role : "venue";
          const { error: profileErr } = await supabase.from("profiles").insert({
            id: data.user.id,
            email,
            display_name: displayName.trim(),
            role: safeRole,
          });
          if (profileErr) throw profileErr;

          // Check if email confirmation is required
          if (data.session) {
            localStorage.setItem("bl-token", data.session.access_token);
            onAuth(data.user, data.session);
          } else {
            setConfirmSent(true);
          }
        }
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
        localStorage.setItem("bl-token", data.session.access_token);
        onAuth(data.user, data.session);
      }
    } catch (err) {
      setError(err.message || "Error de autenticación");
    } finally {
      setLoading(false);
    }
  }

  if (confirmSent) {
    return (
      <div className="bl-venue-auth">
        <div className="bl-venue-auth-card">
          <div className="bl-venue-auth-title">Revisá tu email</div>
          <p className="bl-venue-auth-desc">
            Te enviamos un link de confirmación a <strong>{email}</strong>.
            Confirmá tu cuenta y después volvé a iniciar sesión.
          </p>
          <button className="bl-venue-btn" onClick={() => { setConfirmSent(false); setMode("login"); }}>
            Ir a Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bl-venue-auth">
      <div className="bl-venue-auth-card">
        <div className="bl-venue-auth-title">
          {mode === "login" ? "Iniciar sesión" : "Registrar venue"}
        </div>
        <p className="bl-venue-auth-desc">
          {mode === "login"
            ? "Accedé a tu panel para gestionar eventos."
            : "Creá tu cuenta para publicar eventos en BassLayer."}
        </p>

        <form onSubmit={handleSubmit} className="bl-venue-form">
          {mode === "register" && (
            <>
              <label className="bl-venue-label">
                Nombre del venue / promotora
                <input
                  className="bl-venue-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej: Crobar, Boiler Room BA..."
                  required
                />
              </label>
              <label className="bl-venue-label">
                Tipo
                <select className="bl-venue-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="venue">Venue (club, bar, espacio)</option>
                  <option value="promoter">Promotor (colectivo, productora)</option>
                </select>
              </label>
            </>
          )}
          <label className="bl-venue-label">
            Email
            <input
              className="bl-venue-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="venue@ejemplo.com"
              required
            />
          </label>
          <label className="bl-venue-label">
            Contraseña
            <input
              className="bl-venue-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
            />
          </label>

          {error && <div className="bl-venue-error">{error}</div>}

          <button className="bl-venue-btn" type="submit" disabled={loading}>
            {loading ? "Cargando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <button
          className="bl-venue-toggle-mode"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
        >
          {mode === "login" ? "¿No tenés cuenta? Registrate" : "¿Ya tenés cuenta? Iniciá sesión"}
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { supabase } from "../utils/supabase";

const CRYPTO_TYPES = [
  { value: "exchange", label: "Exchange" },
  { value: "dao", label: "DAO" },
  { value: "protocol", label: "Protocolo / DeFi" },
  { value: "academy", label: "Academia / Educación" },
  { value: "community", label: "Comunidad / Meetup" },
  { value: "media", label: "Media / Newsletter" },
  { value: "other", label: "Otro" },
];

export function ProjectAuth({ onAuth, onBack }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [cryptoType, setCryptoType] = useState("exchange");
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

        if (data.user) {
          const { error: profileErr } = await supabase.from("profiles").insert({
            id: data.user.id,
            email,
            display_name: displayName.trim(),
            role: "crypto_project",
            crypto_type: cryptoType,
          });
          if (profileErr) throw profileErr;

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
          {mode === "login" ? "Iniciar sesión" : "Registrar exchange / proyecto"}
        </div>
        <p className="bl-venue-auth-desc">
          {mode === "login"
            ? "Accedé a tu panel para publicar novedades en Layer."
            : "Registrá tu exchange, DAO, protocolo o proyecto crypto para publicar anuncios en BassLayer."}
        </p>

        <form onSubmit={handleSubmit} className="bl-venue-form">
          {mode === "register" && (
            <>
              <label className="bl-venue-label">
                Nombre del exchange / proyecto
                <input
                  className="bl-venue-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej: Ripio, Lemon, SeedDAO..."
                  required
                />
              </label>
              <label className="bl-venue-label">
                Tipo
                <select className="bl-venue-input" value={cryptoType} onChange={(e) => setCryptoType(e.target.value)}>
                  {CRYPTO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="bl-venue-label">
            Email
            <input className="bl-venue-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="proyecto@ejemplo.com" required />
          </label>
          <label className="bl-venue-label">
            Contraseña
            <input className="bl-venue-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} required />
          </label>

          {error && <div className="bl-venue-error">{error}</div>}

          <button className="bl-venue-btn bl-venue-btn-layer" type="submit" disabled={loading}>
            {loading ? "Cargando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <button className="bl-venue-toggle-mode bl-venue-toggle-layer" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
          {mode === "login" ? "¿No tenés cuenta? Registrate" : "¿Ya tenés cuenta? Iniciá sesión"}
        </button>
      </div>
    </div>
  );
}

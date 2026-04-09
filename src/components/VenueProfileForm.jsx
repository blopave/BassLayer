import { useState } from "react";
import { venueApi } from "../utils/api";
import { supabase } from "../utils/supabase";

const VENUE_TYPES = [
  { value: "club", label: "Club / Disco" },
  { value: "bar", label: "Bar" },
  { value: "open_air", label: "Open Air" },
  { value: "cultural_center", label: "Centro Cultural" },
  { value: "warehouse", label: "Warehouse / Galpón" },
  { value: "other", label: "Otro" },
];

const BARRIOS = [
  "Palermo", "San Telmo", "Recoleta", "Villa Crespo", "Almagro",
  "Barracas", "La Boca", "Belgrano", "Colegiales", "Núñez",
  "Caballito", "Flores", "Puerto Madero", "Costanera", "Otro",
];

export function VenueProfileForm({ profile, user, onSave, onBack }) {
  const [form, setForm] = useState({
    display_name: profile?.display_name || "",
    slug: profile?.slug || "",
    description: profile?.description || "",
    venue_type: profile?.venue_type || "club",
    address: profile?.address || "",
    barrio: profile?.barrio || "",
    city: profile?.city || "CABA",
    capacity: profile?.capacity || "",
    instagram: profile?.instagram || "",
    website: profile?.website || "",
    ra_url: profile?.ra_url || "",
    whatsapp: profile?.whatsapp || "",
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(profile?.logo_url || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("La imagen no puede superar 2MB"); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      let logoUrl = profile?.logo_url;

      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `venues/${user.id}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("media")
          .upload(path, logoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      }

      const updates = { ...form };
      if (updates.capacity) updates.capacity = parseInt(updates.capacity) || null;
      else updates.capacity = null;
      if (logoUrl) updates.logo_url = logoUrl;

      // Auto-generate slug if empty
      if (!updates.slug) {
        updates.slug = updates.display_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }

      await venueApi.updateProfile(updates);
      onSave();
    } catch (err) {
      setError(err.message || err || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bl-venue-auth">
      <div className="bl-venue-auth-card bl-venue-profile-card">
        <button className="bl-venue-back" onClick={onBack}>&larr; Volver al panel</button>
        <div className="bl-venue-auth-title">Perfil del venue</div>

        <form onSubmit={handleSubmit} className="bl-venue-form">
          <div className="bl-venue-logo-section">
            {logoPreview && <img className="bl-venue-logo-preview" src={logoPreview} alt="Logo" />}
            <label className="bl-venue-btn-sm bl-venue-btn-upload">
              {logoPreview ? "Cambiar logo" : "Subir logo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoChange} hidden />
            </label>
          </div>

          <label className="bl-venue-label">
            Nombre *
            <input className="bl-venue-input" type="text" value={form.display_name} onChange={(e) => update("display_name", e.target.value)} required />
          </label>

          <label className="bl-venue-label">
            Slug (URL)
            <input className="bl-venue-input" type="text" value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="se-genera-automatico" />
          </label>

          <label className="bl-venue-label">
            Descripción
            <textarea className="bl-venue-input bl-venue-textarea" value={form.description} onChange={(e) => update("description", e.target.value)} maxLength={500} rows={3} placeholder="Contá de qué va tu venue o promotora..." />
          </label>

          <div className="bl-venue-row">
            <label className="bl-venue-label">
              Tipo
              <select className="bl-venue-input" value={form.venue_type} onChange={(e) => update("venue_type", e.target.value)}>
                {VENUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="bl-venue-label">
              Capacidad
              <input className="bl-venue-input" type="number" value={form.capacity} onChange={(e) => update("capacity", e.target.value)} placeholder="Ej: 500" />
            </label>
          </div>

          <label className="bl-venue-label">
            Dirección
            <input className="bl-venue-input" type="text" value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Av. Libertador 1234" />
          </label>

          <div className="bl-venue-row">
            <label className="bl-venue-label">
              Barrio
              <select className="bl-venue-input" value={form.barrio} onChange={(e) => update("barrio", e.target.value)}>
                <option value="">Seleccionar...</option>
                {BARRIOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="bl-venue-label">
              Ciudad
              <input className="bl-venue-input" type="text" value={form.city} onChange={(e) => update("city", e.target.value)} />
            </label>
          </div>

          <div className="bl-venue-section-title">Redes y links</div>

          <label className="bl-venue-label">
            Instagram
            <input className="bl-venue-input" type="text" value={form.instagram} onChange={(e) => update("instagram", e.target.value)} placeholder="@tucuenta" />
          </label>

          <label className="bl-venue-label">
            Website
            <input className="bl-venue-input" type="url" value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://..." />
          </label>

          <label className="bl-venue-label">
            Resident Advisor
            <input className="bl-venue-input" type="url" value={form.ra_url} onChange={(e) => update("ra_url", e.target.value)} placeholder="https://ra.co/clubs/..." />
          </label>

          <label className="bl-venue-label">
            WhatsApp
            <input className="bl-venue-input" type="text" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} placeholder="+54 9 11..." />
          </label>

          {error && <div className="bl-venue-error">{error}</div>}

          <button className="bl-venue-btn" type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar perfil"}
          </button>
        </form>
      </div>
    </div>
  );
}

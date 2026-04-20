import { useState } from "react";
import { projectApi } from "../utils/api";
import { supabase } from "../utils/supabase";

const CATEGORIES = [
  { value: "listing", label: "Nuevo listing de token" },
  { value: "promo", label: "Promoción / Beneficio" },
  { value: "update", label: "Actualización de producto" },
  { value: "launch", label: "Lanzamiento" },
  { value: "education", label: "Contenido educativo" },
  { value: "event", label: "Evento / Meetup / AMA" },
  { value: "other", label: "Otro" },
];

export function AnnouncementForm({ announcement, onSave, onBack }) {
  const isEdit = !!announcement;
  const [form, setForm] = useState({
    title: announcement?.title || "",
    body: announcement?.body || "",
    category: announcement?.category || "update",
    url: announcement?.url || "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(announcement?.image_url || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("La imagen no puede superar 2MB"); return; }
    if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e, asDraft = false) {
    e.preventDefault();
    setError(null);

    if (!form.title || !form.category) {
      setError("Título y categoría son requeridos");
      return;
    }

    setSaving(true);

    try {
      let imageUrl = announcement?.image_url || null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const userId = (await supabase.auth.getUser()).data.user.id;
        const path = `venues/${userId}/ann-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("media")
          .upload(path, imageFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const payload = {
        ...form,
        image_url: imageUrl,
        status: asDraft ? "draft" : "pending",
      };

      if (isEdit) {
        await projectApi.updateAnnouncement(announcement.id, payload);
      } else {
        await projectApi.createAnnouncement(payload);
      }

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
        <div className="bl-venue-auth-title">{isEdit ? "Editar anuncio" : "Nuevo anuncio"}</div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="bl-venue-form">
          <label className="bl-venue-label">
            Título *
            <input className="bl-venue-input" type="text" value={form.title} onChange={(e) => update("title", e.target.value)} maxLength={120} placeholder="Ej: Nuevo listing de $TOKEN" required />
          </label>

          <label className="bl-venue-label">
            Categoría *
            <select className="bl-venue-input" value={form.category} onChange={(e) => update("category", e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>

          <label className="bl-venue-label">
            Descripción
            <textarea className="bl-venue-input bl-venue-textarea" value={form.body} onChange={(e) => update("body", e.target.value)} maxLength={1000} rows={4} placeholder="Detalle del anuncio..." />
          </label>

          <label className="bl-venue-label">
            Link (opcional)
            <input className="bl-venue-input" type="url" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://..." />
          </label>

          <div className="bl-venue-logo-section">
            {imagePreview && <img className="bl-venue-flyer-preview" src={imagePreview} alt="Imagen" />}
            <label className="bl-venue-btn-sm bl-venue-btn-upload">
              {imagePreview ? "Cambiar imagen" : "Subir imagen"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} hidden />
            </label>
          </div>

          {error && <div className="bl-venue-error">{error}</div>}

          <div className="bl-venue-form-actions">
            <button type="button" className="bl-venue-btn bl-venue-btn-draft" onClick={(e) => handleSubmit(e, true)} disabled={saving}>
              Guardar borrador
            </button>
            <button className="bl-venue-btn bl-venue-btn-layer" type="submit" disabled={saving}>
              {saving ? "Guardando..." : isEdit ? "Reenviar a revisión" : "Enviar a revisión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

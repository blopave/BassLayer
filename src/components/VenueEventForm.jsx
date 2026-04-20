import { useState } from "react";
import { venueApi } from "../utils/api";
import { supabase } from "../utils/supabase";

const GENRES = [
  "Techno", "House", "Deep House", "Tech House", "Progressive",
  "Melodic", "Minimal", "Trance", "DnB", "Disco",
  "Ambient", "Festival", "Electronic",
];

export function VenueEventForm({ event, onSave, onBack }) {
  const isEdit = !!event;
  const [form, setForm] = useState({
    name: event?.name || "",
    description: event?.description || "",
    date: event?.date || "",
    time_start: event?.time_start?.slice(0, 5) || "",
    time_end: event?.time_end?.slice(0, 5) || "",
    genre: event?.genre || "Techno",
    ticket_url: event?.ticket_url || "",
    ticket_price: event?.ticket_price || "",
    min_age: event?.min_age || 18,
  });
  const [artists, setArtists] = useState(event?.artists || []);
  const [artistInput, setArtistInput] = useState("");
  const [flyerFile, setFlyerFile] = useState(null);
  const [flyerPreview, setFlyerPreview] = useState(event?.flyer_url || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function addArtist() {
    const name = artistInput.trim();
    if (name && !artists.includes(name)) {
      setArtists(prev => [...prev, name]);
      setArtistInput("");
    }
  }

  function removeArtist(name) {
    setArtists(prev => prev.filter(a => a !== name));
  }

  function handleFlyerChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("El flyer no puede superar 2MB"); return; }
    if (flyerPreview && flyerPreview.startsWith("blob:")) URL.revokeObjectURL(flyerPreview);
    setFlyerFile(file);
    setFlyerPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e, asDraft = false) {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.date || !form.time_start || !form.genre) {
      setError("Nombre, fecha, hora y género son requeridos");
      return;
    }
    if (artists.length === 0) {
      setError("Agregá al menos un artista (o TBA)");
      return;
    }

    setSaving(true);

    try {
      let flyerUrl = event?.flyer_url || null;

      if (flyerFile) {
        const ext = flyerFile.name.split(".").pop();
        const path = `venues/${(await supabase.auth.getUser()).data.user.id}/flyer-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("media")
          .upload(path, flyerFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
        flyerUrl = urlData.publicUrl;
      }

      const payload = {
        ...form,
        artists,
        flyer_url: flyerUrl,
        min_age: parseInt(form.min_age) || 18,
        status: asDraft ? "draft" : "pending",
      };

      if (isEdit) {
        await venueApi.updateEvent(event.id, payload);
      } else {
        await venueApi.createEvent(payload);
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
        <div className="bl-venue-auth-title">{isEdit ? "Editar evento" : "Nuevo evento"}</div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="bl-venue-form">
          <label className="bl-venue-label">
            Nombre del evento *
            <input className="bl-venue-input" type="text" value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={80} placeholder="Ej: Techno Night Vol. 12" required />
          </label>

          <label className="bl-venue-label">
            Descripción
            <textarea className="bl-venue-input bl-venue-textarea" value={form.description} onChange={(e) => update("description", e.target.value)} maxLength={1000} rows={3} placeholder="Detalles del evento..." />
          </label>

          <div className="bl-venue-row">
            <label className="bl-venue-label">
              Fecha *
              <input className="bl-venue-input" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required />
            </label>
            <label className="bl-venue-label">
              Hora inicio *
              <input className="bl-venue-input" type="time" value={form.time_start} onChange={(e) => update("time_start", e.target.value)} required />
            </label>
            <label className="bl-venue-label">
              Hora fin
              <input className="bl-venue-input" type="time" value={form.time_end} onChange={(e) => update("time_end", e.target.value)} />
            </label>
          </div>

          <label className="bl-venue-label">
            Género *
            <select className="bl-venue-input" value={form.genre} onChange={(e) => update("genre", e.target.value)}>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>

          <div className="bl-venue-label">
            Artistas *
            <div className="bl-venue-artists-input">
              <input
                className="bl-venue-input"
                type="text"
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArtist(); } }}
                placeholder="Nombre del artista + Enter"
              />
              <button type="button" className="bl-venue-btn-sm" onClick={addArtist}>+</button>
            </div>
            {artists.length > 0 && (
              <div className="bl-venue-artist-chips">
                {artists.map(a => (
                  <span className="bl-venue-artist-chip" key={a}>
                    {a}
                    <button type="button" onClick={() => removeArtist(a)}>&times;</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bl-venue-logo-section">
            {flyerPreview && <img className="bl-venue-flyer-preview" src={flyerPreview} alt="Flyer" />}
            <label className="bl-venue-btn-sm bl-venue-btn-upload">
              {flyerPreview ? "Cambiar flyer" : "Subir flyer"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFlyerChange} hidden />
            </label>
          </div>

          <div className="bl-venue-row">
            <label className="bl-venue-label">
              Link de entradas
              <input className="bl-venue-input" type="url" value={form.ticket_url} onChange={(e) => update("ticket_url", e.target.value)} placeholder="https://..." />
            </label>
            <label className="bl-venue-label">
              Precio
              <input className="bl-venue-input" type="text" value={form.ticket_price} onChange={(e) => update("ticket_price", e.target.value)} placeholder="Gratis, $5000, etc." />
            </label>
          </div>

          <label className="bl-venue-label">
            Edad mínima
            <input className="bl-venue-input" type="number" value={form.min_age} onChange={(e) => update("min_age", e.target.value)} min={0} max={99} />
          </label>

          {error && <div className="bl-venue-error">{error}</div>}

          <div className="bl-venue-form-actions">
            <button type="button" className="bl-venue-btn bl-venue-btn-draft" onClick={(e) => handleSubmit(e, true)} disabled={saving}>
              Guardar borrador
            </button>
            <button className="bl-venue-btn" type="submit" disabled={saving}>
              {saving ? "Guardando..." : isEdit ? "Reenviar a revisión" : "Enviar a revisión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

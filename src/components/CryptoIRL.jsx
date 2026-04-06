import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api";
import { CryptoEventModal } from "./CryptoEventModal";

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    const days = ["Dom","Lun","Mar","Mie","Jue","Vie","Sab"];
    const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  } catch { return dateStr; }
}

const SOURCE_LABELS = {
  luma: "Luma",
  community: "Comunidad",
};

export function CryptoIRL() {
  const [tab, setTab] = useState("events");
  const [events, setEvents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.cryptoEvents().catch(() => []),
      api.cryptoIrl().catch(() => ({ courses: [] })),
    ]).then(([evts, irl]) => {
      setEvents(evts || []);
      setCourses(irl.courses || []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const [form, setForm] = useState({
    type: "event", title: "", organizer: "", date: "", time: "", location: "", url: "", description: "", free: true,
  });

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.organizer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitCryptoIrl({ ...form, type: tab === "events" ? "event" : "course" });
      setSuccess(true);
      setForm({ type: "event", title: "", organizer: "", date: "", time: "", location: "", url: "", description: "", free: true });
      load();
      setTimeout(() => { setSuccess(false); setShowForm(false); }, 2000);
    } catch (err) {
      setError(typeof err === "string" ? err : "Error al enviar");
    } finally {
      setSubmitting(false);
    }
  };

  const items = tab === "events" ? events : courses;

  return (
    <>
    <div className="bl-cirl">
      <div className="bl-cirl-header">
        <div>
          <div className="bl-cirl-title">Crypto IRL</div>
          <div className="bl-cirl-subtitle">Eventos, meetups y cursos crypto</div>
        </div>
        <button
          className={`bl-cirl-add-btn${showForm ? " active" : ""}`}
          onClick={() => { setShowForm(!showForm); setSuccess(false); setError(null); }}
        >
          {showForm ? "Cancelar" : "+ Agregar"}
        </button>
      </div>

      {/* Tabs */}
      <div className="bl-cirl-tabs">
        <button className={`bl-cirl-tab${tab === "events" ? " active" : ""}`} onClick={() => setTab("events")}>
          Eventos / Meetups{events.length > 0 ? ` (${events.length})` : ""}
        </button>
        <button className={`bl-cirl-tab${tab === "courses" ? " active" : ""}`} onClick={() => setTab("courses")}>
          Cursos / Charlas{courses.length > 0 ? ` (${courses.length})` : ""}
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <form className="bl-cirl-form" onSubmit={handleSubmit}>
          <div className="bl-cirl-form-title">
            {tab === "events" ? "Agregar evento / meetup" : "Agregar curso / charla"}
          </div>
          <div className="bl-cirl-form-grid">
            <input
              className="bl-cirl-input"
              placeholder={tab === "events" ? "Nombre del evento *" : "Nombre del curso *"}
              value={form.title}
              onChange={e => updateField("title", e.target.value)}
              required
              maxLength={200}
            />
            <input
              className="bl-cirl-input"
              placeholder="Organizador *"
              value={form.organizer}
              onChange={e => updateField("organizer", e.target.value)}
              required
              maxLength={200}
            />
            <input
              className="bl-cirl-input"
              type="date"
              placeholder="Fecha"
              value={form.date}
              onChange={e => updateField("date", e.target.value)}
            />
            <input
              className="bl-cirl-input"
              placeholder="Horario (ej: 19:00)"
              value={form.time}
              onChange={e => updateField("time", e.target.value)}
              maxLength={20}
            />
            <input
              className="bl-cirl-input bl-cirl-input-full"
              placeholder={tab === "events" ? "Lugar (ej: Espacio Bitcoin, Palermo)" : "Modalidad (presencial / online / ambos)"}
              value={form.location}
              onChange={e => updateField("location", e.target.value)}
              maxLength={200}
            />
            <input
              className="bl-cirl-input bl-cirl-input-full"
              placeholder="Link (web, registro o entradas)"
              value={form.url}
              onChange={e => updateField("url", e.target.value)}
              maxLength={200}
            />
            <textarea
              className="bl-cirl-input bl-cirl-input-full bl-cirl-textarea"
              placeholder="Descripcion breve (opcional)"
              value={form.description}
              onChange={e => updateField("description", e.target.value)}
              rows={2}
              maxLength={500}
            />
            <label className="bl-cirl-check">
              <input
                type="checkbox"
                checked={form.free}
                onChange={e => updateField("free", e.target.checked)}
              />
              <span>Gratis</span>
            </label>
          </div>
          {error && <div className="bl-cirl-error">{error}</div>}
          {success && <div className="bl-cirl-success">Enviado correctamente</div>}
          <button className="bl-cirl-submit" type="submit" disabled={submitting}>
            {submitting ? "Enviando..." : "Enviar"}
          </button>
        </form>
      )}

      {/* Listings */}
      <div className="bl-cirl-list">
        {loading ? (
          <div className="bl-cirl-loading">Buscando eventos...</div>
        ) : items.length === 0 ? (
          <div className="bl-cirl-empty">
            {tab === "events"
              ? "No hay eventos cargados todavia. Se el primero en agregar uno."
              : "No hay cursos cargados todavia. Se el primero en agregar uno."}
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.id || idx}
              className="bl-cirl-item"
              onClick={() => setSelectedItem(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedItem(item)}
            >
              <div className="bl-cirl-item-left">
                {item.date && <div className="bl-cirl-item-date">{formatDate(item.date)}</div>}
                {item.time && <div className="bl-cirl-item-time">{item.time}</div>}
              </div>
              <div className="bl-cirl-item-body">
                <div className="bl-cirl-item-name">{item.title}</div>
                <div className="bl-cirl-item-org">{item.organizer}</div>
                {item.location && <div className="bl-cirl-item-loc">{item.location}</div>}
              </div>
              <div className="bl-cirl-item-right">
                {item.free && <span className="bl-cirl-badge-free">Gratis</span>}
                {item.source && SOURCE_LABELS[item.source] && (
                  <span className="bl-cirl-badge-source">{SOURCE_LABELS[item.source]}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
    <CryptoEventModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </>
  );
}

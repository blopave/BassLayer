import { useState, useEffect, useCallback } from "react";
import { adminApi } from "../utils/api";

export function AdminPanel({ onBack }) {
  const [tab, setTab] = useState("pending"); // pending | approved | rejected | venues | ann_pending | ann_approved | ann_rejected
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectType, setRejectType] = useState("event"); // "event" | "announcement"

  const loadEvents = useCallback(async (status) => {
    setLoading(true);
    try {
      const data = await adminApi.getEvents(status);
      setEvents(data);
    } catch { setEvents([]); }
    setLoading(false);
  }, []);

  const loadVenues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getVenues();
      setVenues(data);
    } catch { setVenues([]); }
    setLoading(false);
  }, []);

  const loadAnnouncements = useCallback(async (status) => {
    setLoading(true);
    try {
      const data = await adminApi.getAnnouncements(status);
      setAnnouncements(data);
    } catch { setAnnouncements([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "venues") loadVenues();
    else if (tab.startsWith("ann_")) loadAnnouncements(tab.replace("ann_", ""));
    else loadEvents(tab);
  }, [tab, loadEvents, loadVenues, loadAnnouncements]);

  async function handleApprove(id) {
    try { await adminApi.approve(id); } catch { /* ignore */ }
    loadEvents(tab);
  }

  async function handleReject() {
    if (!rejectId) return;
    try {
      if (rejectType === "announcement") {
        await adminApi.rejectAnn(rejectId, rejectNote);
        setRejectId(null); setRejectNote("");
        loadAnnouncements(tab.replace("ann_", ""));
      } else {
        await adminApi.reject(rejectId, rejectNote);
        setRejectId(null); setRejectNote("");
        loadEvents(tab);
      }
    } catch {
      setRejectId(null); setRejectNote("");
    }
  }

  async function handleFeature(id) {
    try { await adminApi.feature(id); } catch { /* ignore */ }
    loadEvents(tab);
  }

  async function handleVerify(id) {
    try { await adminApi.verifyVenue(id); } catch { /* ignore */ }
    loadVenues();
  }

  async function handleApproveAnn(id) {
    try { await adminApi.approveAnn(id); } catch { /* ignore */ }
    loadAnnouncements(tab.replace("ann_", ""));
  }

  async function handlePinAnn(id) {
    try { await adminApi.pinAnn(id); } catch { /* ignore */ }
    loadAnnouncements(tab.replace("ann_", ""));
  }

  const isAnnTab = tab.startsWith("ann_");

  const TAB_LABELS = {
    pending: "Eventos pendientes",
    approved: "Eventos aprobados",
    rejected: "Eventos rechazados",
    venues: "Venues",
    ann_pending: "Anuncios pendientes",
    ann_approved: "Anuncios aprobados",
    ann_rejected: "Anuncios rechazados",
  };

  return (
    <div className="bl-venue-dashboard">
      <div className="bl-venue-dash-header">
        <button className="bl-venue-back" onClick={onBack}>&larr; Volver</button>
        <div className="bl-venue-dash-title">Admin Panel</div>
      </div>

      <div className="bl-admin-section-label">Eventos</div>
      <div className="bl-admin-tabs">
        {["pending", "approved", "rejected", "venues"].map(t => (
          <button
            key={t}
            className={`bl-admin-tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "pending" ? "Pendientes" : t === "approved" ? "Aprobados" : t === "rejected" ? "Rechazados" : "Venues"}
          </button>
        ))}
      </div>

      <div className="bl-admin-section-label">Anuncios (Exchanges)</div>
      <div className="bl-admin-tabs">
        {["ann_pending", "ann_approved", "ann_rejected"].map(t => (
          <button
            key={t}
            className={`bl-admin-tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "ann_pending" ? "Pendientes" : t === "ann_approved" ? "Aprobados" : "Rechazados"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bl-venue-loading">Cargando...</div>
      ) : tab === "venues" ? (
        <div className="bl-venue-event-list">
          {venues.map(v => (
            <div className="bl-venue-event-card" key={v.id}>
              <div className="bl-venue-event-info">
                <div className="bl-venue-event-name">
                  {v.display_name}
                  {v.verified && <span className="bl-venue-verified">&#10003;</span>}
                </div>
                <div className="bl-venue-event-meta">
                  {v.role} &middot; {v.barrio || "Sin barrio"} &middot; {v.email}
                </div>
              </div>
              <div className="bl-venue-event-actions">
                <button className="bl-venue-btn-sm" onClick={() => handleVerify(v.id)}>
                  {v.verified ? "Quitar verificación" : "Verificar"}
                </button>
              </div>
            </div>
          ))}
          {venues.length === 0 && <div className="bl-venue-empty">No hay venues registrados.</div>}
        </div>
      ) : isAnnTab ? (
        <div className="bl-venue-event-list">
          {announcements.map(a => (
            <div className="bl-venue-event-card" key={a.id}>
              <div className="bl-venue-event-info">
                <div className="bl-venue-event-name">
                  {a.title}
                  {a.pinned && <span className="bl-venue-featured-star">&#9733;</span>}
                </div>
                <div className="bl-venue-event-meta">
                  {a.category} &middot; {new Date(a.created_at).toLocaleDateString("es-AR")}
                  {a.profiles && <> &middot; por {a.profiles.display_name}</>}
                </div>
                {a.body && <div className="bl-venue-event-meta" style={{ opacity: 0.7 }}>{a.body.slice(0, 100)}{a.body.length > 100 ? "..." : ""}</div>}
                {a.rejection_note && <div className="bl-venue-rejection">Motivo: {a.rejection_note}</div>}
              </div>
              <div className="bl-venue-event-actions">
                {tab === "ann_pending" && (
                  <>
                    <button className="bl-venue-btn-sm bl-venue-btn-approve" onClick={() => handleApproveAnn(a.id)}>Aprobar</button>
                    <button className="bl-venue-btn-sm bl-venue-btn-danger" onClick={() => { setRejectId(a.id); setRejectType("announcement"); }}>Rechazar</button>
                  </>
                )}
                <button className="bl-venue-btn-sm" onClick={() => handlePinAnn(a.id)}>
                  {a.pinned ? "Quitar pin" : "Destacar"}
                </button>
              </div>
            </div>
          ))}
          {announcements.length === 0 && <div className="bl-venue-empty">No hay anuncios en esta categoría.</div>}
        </div>
      ) : (
        <div className="bl-venue-event-list">
          {events.map(ev => (
            <div className="bl-venue-event-card" key={ev.id}>
              <div className="bl-venue-event-info">
                <div className="bl-venue-event-name">
                  {ev.name}
                  {ev.featured && <span className="bl-venue-featured-star">&#9733;</span>}
                </div>
                <div className="bl-venue-event-meta">
                  {ev.date} &middot; {ev.time_start?.slice(0, 5)} &middot; {ev.genre}
                  {ev.profiles && <> &middot; por {ev.profiles.display_name}</>}
                </div>
                {ev.artists?.length > 0 && (
                  <div className="bl-venue-event-meta">{ev.artists.join(", ")}</div>
                )}
              </div>
              <div className="bl-venue-event-actions">
                {tab === "pending" && (
                  <>
                    <button className="bl-venue-btn-sm bl-venue-btn-approve" onClick={() => handleApprove(ev.id)}>Aprobar</button>
                    <button className="bl-venue-btn-sm bl-venue-btn-danger" onClick={() => { setRejectId(ev.id); setRejectType("event"); }}>Rechazar</button>
                  </>
                )}
                <button className="bl-venue-btn-sm" onClick={() => handleFeature(ev.id)}>
                  {ev.featured ? "Quitar destacado" : "Destacar"}
                </button>
              </div>
            </div>
          ))}
          {events.length === 0 && <div className="bl-venue-empty">No hay eventos en esta categoría.</div>}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="bl-modal-overlay open" onClick={() => setRejectId(null)}>
          <div className="bl-venue-auth-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="bl-venue-auth-title">Rechazar {rejectType === "announcement" ? "anuncio" : "evento"}</div>
            <textarea
              className="bl-venue-input bl-venue-textarea"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Motivo del rechazo..."
              rows={3}
            />
            <div className="bl-venue-form-actions" style={{ marginTop: 12 }}>
              <button className="bl-venue-btn-sm" onClick={() => setRejectId(null)}>Cancelar</button>
              <button className="bl-venue-btn bl-venue-btn-danger" onClick={handleReject}>Rechazar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

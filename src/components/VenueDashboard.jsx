import { useState, useEffect, useCallback } from "react";
import { venueApi } from "../utils/api";
import { supabase } from "../utils/supabase";
import { VenueProfileForm } from "./VenueProfileForm";
import { VenueEventForm } from "./VenueEventForm";

const STATUS_LABELS = {
  draft: "Borrador",
  pending: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};

function StatusBadge({ status }) {
  return <span className={`bl-venue-status bl-venue-status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function VenueDashboard({ user, onLogout, onBack }) {
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [view, setView] = useState("list"); // list | profile | new-event | edit-event
  const [editingEvent, setEditingEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, ev] = await Promise.all([venueApi.getProfile(), venueApi.getEvents()]);
      setProfile(p);
      setEvents(ev);
    } catch {
      // Profile might not exist yet if just registered
      setProfile(null);
      setEvents([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("bl-token");
    onLogout();
  }

  async function handleDeleteEvent(id) {
    if (!confirm("¿Eliminar este evento?")) return;
    try { await venueApi.deleteEvent(id); loadData(); }
    catch { /* API error — silently reload */ loadData(); }
  }

  async function handleSubmitForReview(id) {
    try { await venueApi.updateEvent(id, { status: "pending" }); loadData(); }
    catch { loadData(); }
  }

  if (view === "profile") {
    return (
      <VenueProfileForm
        profile={profile}
        user={user}
        onSave={() => { loadData(); setView("list"); }}
        onBack={() => setView("list")}
      />
    );
  }

  if (view === "new-event" || view === "edit-event") {
    return (
      <VenueEventForm
        event={view === "edit-event" ? editingEvent : null}
        onSave={() => { loadData(); setView("list"); }}
        onBack={() => setView("list")}
      />
    );
  }

  const counts = {
    total: events.length,
    pending: events.filter(e => e.status === "pending").length,
    approved: events.filter(e => e.status === "approved").length,
    rejected: events.filter(e => e.status === "rejected").length,
    draft: events.filter(e => e.status === "draft").length,
  };

  return (
    <div className="bl-venue-dashboard">
      <div className="bl-venue-dash-header">
        <button className="bl-venue-back" onClick={onBack}>&larr; Volver</button>
        <div className="bl-venue-dash-title">
          {profile?.display_name || "Mi Panel"}
          {profile?.verified && <span className="bl-venue-verified" title="Verificado">&#10003;</span>}
        </div>
        <div className="bl-venue-dash-actions">
          <button className="bl-venue-btn-sm" onClick={() => setView("profile")}>Editar perfil</button>
          <button className="bl-venue-btn-sm bl-venue-btn-logout" onClick={handleLogout}>Salir</button>
        </div>
      </div>

      {loading ? (
        <div className="bl-venue-loading">Cargando...</div>
      ) : (
        <>
          <div className="bl-venue-stats">
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.total}</span><span className="bl-venue-stat-label">Total</span></div>
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.approved}</span><span className="bl-venue-stat-label">Aprobados</span></div>
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.pending}</span><span className="bl-venue-stat-label">En revisión</span></div>
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.rejected}</span><span className="bl-venue-stat-label">Rechazados</span></div>
          </div>

          <button className="bl-venue-btn bl-venue-btn-new" onClick={() => setView("new-event")}>
            + Nuevo evento
          </button>

          {events.length === 0 ? (
            <div className="bl-venue-empty">
              No tenés eventos todavía. Creá tu primer evento para aparecer en BassLayer.
            </div>
          ) : (
            <div className="bl-venue-event-list">
              {events.map((ev) => (
                <div className="bl-venue-event-card" key={ev.id}>
                  <div className="bl-venue-event-info">
                    <div className="bl-venue-event-name">{ev.name}</div>
                    <div className="bl-venue-event-meta">
                      {ev.date} &middot; {ev.time_start?.slice(0, 5)} &middot; {ev.genre}
                    </div>
                    {ev.rejection_note && (
                      <div className="bl-venue-rejection">
                        Motivo: {ev.rejection_note}
                      </div>
                    )}
                  </div>
                  <div className="bl-venue-event-actions">
                    <StatusBadge status={ev.status} />
                    {(ev.status === "draft" || ev.status === "rejected") && (
                      <>
                        <button className="bl-venue-btn-sm" onClick={() => { setEditingEvent(ev); setView("edit-event"); }}>Editar</button>
                        {ev.status === "draft" && (
                          <button className="bl-venue-btn-sm" onClick={() => handleSubmitForReview(ev.id)}>Enviar</button>
                        )}
                      </>
                    )}
                    <button className="bl-venue-btn-sm bl-venue-btn-danger" onClick={() => handleDeleteEvent(ev.id)}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

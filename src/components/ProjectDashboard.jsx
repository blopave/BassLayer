import { useState, useEffect, useCallback } from "react";
import { projectApi } from "../utils/api";
import { supabase } from "../utils/supabase";
import { AnnouncementForm } from "./AnnouncementForm";

const STATUS_LABELS = {
  draft: "Borrador",
  pending: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};

const CATEGORY_LABELS = {
  listing: "Nuevo listing",
  promo: "Promo",
  update: "Actualización",
  launch: "Lanzamiento",
  education: "Educación",
  event: "Evento",
  other: "Otro",
};

function StatusBadge({ status }) {
  return <span className={`bl-venue-status bl-venue-status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function ProjectDashboard({ user, onLogout, onBack }) {
  const [profile, setProfile] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [view, setView] = useState("list"); // list | new | edit
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([projectApi.getProfile(), projectApi.getAnnouncements()]);
      setProfile(p);
      setAnnouncements(a);
    } catch {
      setProfile(null);
      setAnnouncements([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("bl-token");
    onLogout();
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este anuncio?")) return;
    await projectApi.deleteAnnouncement(id);
    loadData();
  }

  async function handleSubmitForReview(id) {
    await projectApi.updateAnnouncement(id, { status: "pending" });
    loadData();
  }

  if (view === "new" || view === "edit") {
    return (
      <AnnouncementForm
        announcement={view === "edit" ? editing : null}
        onSave={() => { loadData(); setView("list"); }}
        onBack={() => setView("list")}
      />
    );
  }

  const counts = {
    total: announcements.length,
    pending: announcements.filter(a => a.status === "pending").length,
    approved: announcements.filter(a => a.status === "approved").length,
    rejected: announcements.filter(a => a.status === "rejected").length,
  };

  return (
    <div className="bl-venue-dashboard">
      <div className="bl-venue-dash-header">
        <button className="bl-venue-back" onClick={onBack}>&larr; Volver</button>
        <div className="bl-venue-dash-title">
          {profile?.display_name || "Mi Panel"}
          {profile?.verified && <span className="bl-venue-verified">&#10003;</span>}
          {profile?.crypto_type && <span className="bl-project-type">{profile.crypto_type}</span>}
        </div>
        <div className="bl-venue-dash-actions">
          <button className="bl-venue-btn-sm bl-venue-btn-logout" onClick={handleLogout}>Salir</button>
        </div>
      </div>

      {loading ? (
        <div className="bl-venue-loading">Cargando...</div>
      ) : (
        <>
          <div className="bl-venue-stats">
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.total}</span><span className="bl-venue-stat-label">Total</span></div>
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.approved}</span><span className="bl-venue-stat-label">Publicados</span></div>
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.pending}</span><span className="bl-venue-stat-label">En revisión</span></div>
            <div className="bl-venue-stat"><span className="bl-venue-stat-num">{counts.rejected}</span><span className="bl-venue-stat-label">Rechazados</span></div>
          </div>

          <button className="bl-venue-btn bl-venue-btn-new bl-venue-btn-layer" onClick={() => setView("new")}>
            + Nuevo anuncio
          </button>

          {announcements.length === 0 ? (
            <div className="bl-venue-empty">
              No tenés anuncios todavía. Publicá tu primera novedad para aparecer en Layer.
            </div>
          ) : (
            <div className="bl-venue-event-list">
              {announcements.map((a) => (
                <div className="bl-venue-event-card" key={a.id}>
                  <div className="bl-venue-event-info">
                    <div className="bl-venue-event-name">
                      {a.title}
                      {a.pinned && <span className="bl-venue-featured-star">&#9733;</span>}
                    </div>
                    <div className="bl-venue-event-meta">
                      {CATEGORY_LABELS[a.category] || a.category} &middot; {new Date(a.created_at).toLocaleDateString("es-AR")}
                    </div>
                    {a.rejection_note && (
                      <div className="bl-venue-rejection">Motivo: {a.rejection_note}</div>
                    )}
                  </div>
                  <div className="bl-venue-event-actions">
                    <StatusBadge status={a.status} />
                    {(a.status === "draft" || a.status === "rejected") && (
                      <>
                        <button className="bl-venue-btn-sm" onClick={() => { setEditing(a); setView("edit"); }}>Editar</button>
                        {a.status === "draft" && (
                          <button className="bl-venue-btn-sm" onClick={() => handleSubmitForReview(a.id)}>Enviar</button>
                        )}
                      </>
                    )}
                    <button className="bl-venue-btn-sm bl-venue-btn-danger" onClick={() => handleDelete(a.id)}>Eliminar</button>
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

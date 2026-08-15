import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../utils/api";
import { CryptoEventModal } from "./CryptoEventModal";
import { useLocale } from "../hooks/useLocale";
import { formatShortDateLocale, sourceLabel } from "../i18n/strings";

export function CryptoIRL() {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState("events");
  const [events, setEvents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const successTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(successTimerRef.current), []);

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
      clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => { setSuccess(false); setShowForm(false); }, 2000);
    } catch (err) {
      setError(typeof err === "string" ? err : t("cirl.error.submit"));
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
          <div className="bl-cirl-subtitle">{t("cirl.subtitle")}</div>
        </div>
        <button
          className={`bl-cirl-add-btn${showForm ? " active" : ""}`}
          onClick={() => { setShowForm(!showForm); setSuccess(false); setError(null); }}
        >
          {showForm ? t("common.cancel") : t("cirl.add")}
        </button>
      </div>

      {/* Tabs */}
      <div className="bl-cirl-tabs">
        <button className={`bl-cirl-tab${tab === "events" ? " active" : ""}`} onClick={() => setTab("events")}>
          {t("cirl.tab.events")}{events.length > 0 ? ` (${events.length})` : ""}
        </button>
        <button className={`bl-cirl-tab${tab === "courses" ? " active" : ""}`} onClick={() => setTab("courses")}>
          {t("cirl.tab.courses")}{courses.length > 0 ? ` (${courses.length})` : ""}
        </button>
      </div>

      {/* Submit form */}
      {showForm && (
        <form className="bl-cirl-form" onSubmit={handleSubmit}>
          <div className="bl-cirl-form-title">
            {tab === "events" ? t("cirl.form.titleEvent") : t("cirl.form.titleCourse")}
          </div>
          <div className="bl-cirl-form-grid">
            <input
              className="bl-cirl-input"
              placeholder={tab === "events" ? t("cirl.form.nameEvent") : t("cirl.form.nameCourse")}
              value={form.title}
              onChange={e => updateField("title", e.target.value)}
              required
              maxLength={200}
            />
            <input
              className="bl-cirl-input"
              placeholder={t("cirl.form.organizer")}
              value={form.organizer}
              onChange={e => updateField("organizer", e.target.value)}
              required
              maxLength={200}
            />
            <input
              className="bl-cirl-input"
              type="date"
              placeholder={t("cirl.form.date")}
              value={form.date}
              onChange={e => updateField("date", e.target.value)}
            />
            <input
              className="bl-cirl-input"
              placeholder={t("cirl.form.time")}
              value={form.time}
              onChange={e => updateField("time", e.target.value)}
              maxLength={20}
            />
            <input
              className="bl-cirl-input bl-cirl-input-full"
              placeholder={tab === "events" ? t("cirl.form.locationEvent") : t("cirl.form.locationCourse")}
              value={form.location}
              onChange={e => updateField("location", e.target.value)}
              maxLength={200}
            />
            <input
              className="bl-cirl-input bl-cirl-input-full"
              placeholder={t("cirl.form.link")}
              value={form.url}
              onChange={e => updateField("url", e.target.value)}
              maxLength={200}
            />
            <textarea
              className="bl-cirl-input bl-cirl-input-full bl-cirl-textarea"
              placeholder={t("cirl.form.desc")}
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
              <span>{t("cirl.free")}</span>
            </label>
          </div>
          {error && <div className="bl-cirl-error">{error}</div>}
          {success && <div className="bl-cirl-success">{t("cirl.success")}</div>}
          <button className="bl-cirl-submit" type="submit" disabled={submitting}>
            {submitting ? t("cirl.submitting") : t("cirl.submit")}
          </button>
        </form>
      )}

      {/* Listings */}
      <div className="bl-cirl-list">
        {loading ? (
          <div className="bl-cirl-loading">{t("cirl.loading")}</div>
        ) : items.length === 0 ? (
          <div className="bl-cirl-empty">
            {tab === "events" ? t("cirl.empty.events") : t("cirl.empty.courses")}
          </div>
        ) : (
          items.map((item, idx) => {
            const src = sourceLabel(item.source, t);
            return (
            <div
              key={item.id || idx}
              className="bl-cirl-item"
              onClick={() => setSelectedItem(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedItem(item)}
            >
              <div className="bl-cirl-item-left">
                {item.date && <div className="bl-cirl-item-date">{formatShortDateLocale(item.date, locale)}</div>}
                {item.time && <div className="bl-cirl-item-time">{item.time}</div>}
              </div>
              <div className="bl-cirl-item-body">
                <div className="bl-cirl-item-name">{item.title}</div>
                <div className="bl-cirl-item-org">{item.organizer}</div>
                {item.location && <div className="bl-cirl-item-loc">{item.location}</div>}
              </div>
              <div className="bl-cirl-item-right">
                {item.free && <span className="bl-cirl-badge-free">{t("cirl.free")}</span>}
                {src && <span className="bl-cirl-badge-source">{src}</span>}
              </div>
            </div>
            );
          })
        )}
      </div>

    </div>
    <CryptoEventModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </>
  );
}

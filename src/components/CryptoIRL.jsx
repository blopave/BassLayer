import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../utils/api";
import { CryptoEventModal } from "./CryptoEventModal";
import { useLocale } from "../hooks/useLocale";
import { sourceLabel } from "../i18n/strings";
import { FilterBar } from "./FilterBar";
import { SectionHead } from "./SectionHead";
import { textIsAmba } from "../../lib/places.js";

// Eventos cripto (oct 2026, "B · Filas"): el idioma de la Agenda — filtros de
// texto con conteo, apertura, rótulos (Buenos Aires primero, después las
// conferencias del mundo) y filas: cuándo a la izquierda, qué y dónde al medio.
// Sumar un evento es una invitación en el pie, no un botón arriba de todo.
const fecha = (iso, end, locale) => {
  const tag = locale === "en" ? "en-US" : "es-AR";
  const parte = (d, o) => d.toLocaleDateString(tag, o).replace(/\./g, "");
  const d = new Date(iso + "T12:00:00"), e = end && end !== iso ? new Date(end + "T12:00:00") : null;
  const wd = parte(d, { weekday: "short" }), mes = parte(d, { month: "short" });
  // "vie 30 oct" · "vie 30–31 oct" · "jue 29 oct–2 nov"
  if (!e) return `${wd} ${d.getDate()} ${mes}`;
  return e.getMonth() === d.getMonth() ? `${wd} ${d.getDate()}–${e.getDate()} ${mes}` : `${wd} ${d.getDate()} ${mes}–${e.getDate()} ${parte(e, { month: "short" })}`;
};

export function CryptoIRL() {
  const { t, locale } = useLocale();
  const [filtro, setFiltro] = useState("All");
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
      await api.submitCryptoIrl({ ...form, type: tipo });
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

  const ba = events.filter((i) => textIsAmba(i.location));
  const mundo = events.filter((i) => !textIsAmba(i.location));
  const opciones = ["All", ...(ba.length ? ["ba"] : []), ...(mundo.length ? ["world"] : []), ...(courses.length ? ["courses"] : [])];
  const grupos = (filtro === "courses" ? [["courses", t("cirl.tab.courses"), courses]]
    : [["ba", t("cirl.inBA"), ba], ["world", t("cirl.inWorld"), mundo]].filter(([k]) => filtro === "All" || filtro === k))
    .filter(([, , g]) => g.length);
  const n = grupos.reduce((s, [, , g]) => s + g.length, 0);
  const tipo = filtro === "courses" ? "course" : "event";
  const fuentes = [...new Set([...events, ...courses].map((i) => sourceLabel(i.source, t)).filter(Boolean))];

  return (
    <>
      {opciones.length > 2 && (
        <FilterBar
          items={opciones}
          active={filtro}
          onChange={setFiltro}
          className="layer-filters"
          labels={{ ba: t("cirl.inBA"), world: t("cirl.inWorld"), courses: t("cirl.tab.courses") }}
          counts={{ all: events.length, ba: ba.length, world: mundo.length, courses: courses.length }}
        />
      )}
      {loading ? (
        <div className="bl-empty">{t("cirl.loading")}</div>
      ) : !n ? (
        <div className="bl-empty">{t("cirl.empty.events")}</div>
      ) : (
        <>
          <SectionHead n={n} word={t(filtro === "courses" ? "cirl.coursesWord" : "cirl.eventsWord")} />
          <div className="bl-lnotas bl-cirl-lista">
            {grupos.map(([key, label, group]) => (
              <section key={key} className="bl-lnotas-dia" data-grupo={key}>
                <h3 className="bl-day-header">
                  <span className="bl-day-label">{label}</span>
                  <span className="bl-day-line" aria-hidden="true" />
                </h3>
                {group.map((item, idx) => (
                  <article
                    key={item.id || `${item.title}-${idx}`}
                    className="bl-lnota bl-cirl-fila"
                    onClick={() => setSelectedItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedItem(item))}
                  >
                    <div className="bl-lnota-when">
                      {item.date && <span>{fecha(item.date, item.endDate, locale)}</span>}
                      {item.time && <span className="bl-lnota-src">{item.time}</span>}
                    </div>
                    <div className="bl-lnota-body">
                      <div className="bl-lnota-t">{item.title}</div>
                      <div className="bl-cirl-where">{[item.organizer, item.location].filter(Boolean).join(" · ")}</div>
                      <div className="bl-lnota-tag">{[item.free && t("cirl.free"), sourceLabel(item.source, t)].filter(Boolean).join(" · ")}</div>
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
      <div className="bl-lpie">
        {fuentes.length > 0 && <>{t("news.sources")}: {fuentes.join(" · ")} · </>}
        <button type="button" className="bl-empty-action bl-cirl-sumar" aria-expanded={showForm} onClick={() => { setShowForm(!showForm); setSuccess(false); setError(null); }}>
          {showForm ? t("common.cancel") : t("cirl.invite")}
        </button>
      </div>
      {showForm && (
        <div className="bl-cirl-form-wrap">
        {showForm && (
          <form className="bl-cirl-form" onSubmit={handleSubmit}>
            <div className="bl-cirl-form-title">
              {tipo === "event" ? t("cirl.form.titleEvent") : t("cirl.form.titleCourse")}
            </div>
            <div className="bl-cirl-form-grid">
              <input
                className="bl-cirl-input"
                placeholder={tipo === "event" ? t("cirl.form.nameEvent") : t("cirl.form.nameCourse")}
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
                placeholder={tipo === "event" ? t("cirl.form.locationEvent") : t("cirl.form.locationCourse")}
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
  
        </div>
      )}
      <CryptoEventModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </>
  );
}

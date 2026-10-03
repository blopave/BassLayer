import { useEffect, useMemo, useState } from "react";
import { api, shared } from "../utils/api";
import { useLocale } from "../hooks/useLocale";

// Salas (oct 2026, Pablo): la cartelera completa de salas emblemáticas de
// Buenos Aires, de cualquier estilo, que se busca y se elige por sala — no se
// mezcla con la agenda electrónica. Los datos salen de /api/salas (carteleras
// oficiales; ver lib/salas.js).

export function useSalas() {
  const [d, setD] = useState(null);
  useEffect(() => {
    let on = true;
    shared("salas", api.salas, 10 * 60_000).then((v) => on && setD(v)).catch(() => on && setD({ salas: [], shows: [] }));
    return () => { on = false; };
  }, []);
  return d;
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const salaMatches = (salas, q) => { const k = norm(q).trim(); return k.length < 3 ? [] : (salas || []).filter((s) => norm(s.name).includes(k) || norm(s.slug.replace(/-/g, " ")).includes(k)); };
const barrio = (address) => String(address || "").split(",").pop().trim();

function useDayFmt() {
  const { locale } = useLocale();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    return (iso) => f.format(new Date(`${iso}T12:00:00Z`)).replace(/\./g, "");
  }, [locale]);
}

// Imagen externa con respaldo: si no carga, la inicial del show (regla del proyecto).
function Thumb({ src, title }) {
  const [bad, setBad] = useState(!src);
  return bad
    ? <span className="bl-sala-thumb is-empty" aria-hidden="true">{String(title || "?").trim().charAt(0)}</span>
    : <img className="bl-sala-thumb" src={src} alt="" loading="lazy" onError={() => setBad(true)} />;
}

// Una sala como tarjeta: nombre, barrio, cuántos shows y el próximo.
function SalaCard({ sala, next, onPick }) {
  const { t } = useLocale();
  const day = useDayFmt();
  return (
    <button type="button" className="bl-sala-card" onClick={() => onPick(sala.slug)}>
      <span className="bl-sala-card-name">{sala.name}</span>
      <span className="bl-sala-card-meta">{barrio(sala.address)} · {t("salas.shows", { n: sala.count })}</span>
      {next && <span className="bl-sala-card-next"><b>{day(next.date)}</b> {next.title}</span>}
    </button>
  );
}

const nextBySala = (shows) => { const m = new Map(); for (const s of shows || []) if (!m.has(s.sala)) m.set(s.sala, s); return m; };

// La pestaña "Salas": todas, en grilla.
export function SalaGrid({ data, onPick }) {
  const { t } = useLocale();
  if (!data) return <div className="bl-empty">{t("common.loading")}</div>;
  const next = nextBySala(data.shows);
  const list = data.salas.filter((s) => s.count > 0);
  return (
    <div className="bl-sala-grid">
      {list.map((s) => <SalaCard key={s.slug} sala={s} next={next.get(s.slug)} onPick={onPick} />)}
    </div>
  );
}

// La sala como resultado del buscador de la Agenda.
export function SalaHits({ hits, onPick }) {
  const { t } = useLocale();
  if (!hits.length) return null;
  return (
    <div className="bl-sala-hits" role="list" aria-label={t("salas.title")}>
      {hits.map((s) => (
        <button key={s.slug} type="button" role="listitem" className="bl-sala-hit" onClick={() => onPick(s.slug)}>
          <span className="bl-bass-t-label">{t("salas.one")}</span>
          <span className="bl-sala-hit-name">{s.name}</span>
          <span className="bl-sala-hit-meta">{t("salas.shows", { n: s.count })} →</span>
        </button>
      ))}
    </div>
  );
}

// La cartelera de una sala: por día, cada show con su hora, su imagen y el
// link a la venta oficial.
export function SalaCartelera({ data, slug, onBack, backLabel }) {
  const { t } = useLocale();
  const day = useDayFmt();
  const sala = data?.salas.find((s) => s.slug === slug);
  const days = useMemo(() => {
    const m = new Map();
    for (const s of (data?.shows || []).filter((x) => x.sala === slug)) { if (!m.has(s.date)) m.set(s.date, []); m.get(s.date).push(s); }
    return [...m.entries()];
  }, [data, slug]);
  if (!sala) return null;
  return (
    <section className="bl-sala" aria-label={sala.name}>
      <button type="button" className="bl-sala-back" onClick={onBack}>← {backLabel}</button>
      <header className="bl-sala-head">
        <h2 className="bl-sala-name">{sala.name}</h2>
        <p className="bl-sala-meta">{sala.address} · {t("salas.shows", { n: sala.count })}</p>
      </header>
      {days.map(([date, list]) => (
        <div className="bl-sala-day" key={date}>
          <h3 className="bl-sala-date">{day(date)}</h3>
          {list.map((s) => (
            <a key={s.id} className="bl-sala-show" href={s.url || undefined} target="_blank" rel="noopener noreferrer">
              <Thumb src={s.image} title={s.title} />
              <span className="bl-sala-show-body">
                <span className="bl-sala-show-title">{s.title}</span>
                <span className="bl-sala-show-meta">{[s.time && `${s.time} hs`, s.room].filter(Boolean).join(" · ")}</span>
              </span>
              {s.url && <span className="bl-sala-show-cta">{t("salas.tickets")} ↗</span>}
            </a>
          ))}
        </div>
      ))}
    </section>
  );
}

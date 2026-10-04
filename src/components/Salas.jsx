import { useEffect, useMemo, useState } from "react";
import { api, shared } from "../utils/api";
import { useLocale } from "../hooks/useLocale";
import { BlThumb } from "./BlThumb";

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

// La misma apertura que la Agenda (oct 2026, "interiores unificados"):
// número + palabra + filete. La usan Noticias, Festivales y Salas.
export function SectionHead({ n, word, ctx }) {
  return (
    <div className="bl-feed-head">
      <span className="bl-feed-head-n">{n}</span>
      <span className="bl-feed-head-ctx">{word}{ctx ? ` · ${ctx}` : ""}</span>
    </div>
  );
}

// La sala como afiche: la portada es el flyer de un próximo show (o el afiche
// de la casa con el nombre de la sala), la fecha del próximo show sobre la
// portada y, abajo, nombre, qué viene y barrio · shows.
function SalaPoster({ sala, shows, onPick, idx }) {
  const { t } = useLocale();
  const day = useDayFmt();
  const next = shows[0];
  const cover = next?.image ? next : shows.find((s) => s.image);
  return (
    <button type="button" className={`bl-ev-item ${idx === 0 ? "bl-ev-lead" : "bl-ev-row"} bl-sala-poster`} data-time={next ? day(next.date) : ""} onClick={() => onPick(sala.slug)}>
      <BlThumb image={cover?.image} poster={{ text: sala.name, family: "other" }} />
      <span className="bl-ev-body">
        <span className="bl-ev-name">{sala.name}</span>
        {next && <span className="bl-ev-venue-line">{next.title}</span>}
        <span className="bl-ev-meta-row"><span className="bl-sala-meta-sm">{barrio(sala.address)} · {t("salas.shows", { n: sala.count })}</span></span>
      </span>
    </button>
  );
}

// La pestaña "Salas": todas, como pared de afiches.
export function SalaGrid({ data, onPick }) {
  const { t } = useLocale();
  const bySala = useMemo(() => {
    const m = new Map();
    for (const s of data?.shows || []) { if (!m.has(s.sala)) m.set(s.sala, []); m.get(s.sala).push(s); }
    return m;
  }, [data]);
  if (!data) return <div className="bl-empty">{t("common.loading")}</div>;
  const list = data.salas.filter((s) => s.count > 0);
  const total = list.reduce((n, s) => n + s.count, 0);
  return (
    <>
      <SectionHead n={list.length} word={t("salas.word")} ctx={t("salas.shows", { n: total })} />
      <div className="bl-ev-list bl-ev-wall bl-sala-wall">
        {list.map((s, i) => <SalaPoster key={s.slug} sala={s} shows={bySala.get(s.slug) || []} onPick={onPick} idx={i} />)}
      </div>
    </>
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

// La cartelera de una sala: los mismos encabezados de día y la misma pared de
// afiches que la Agenda, cada show con su hora sobre el flyer y el link a la
// venta oficial.
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
        <p className="bl-sala-meta">{sala.address}</p>
      </header>
      <SectionHead n={sala.count} word="shows" />
      <div className="bl-ev-list bl-ev-wall">
        {days.flatMap(([date, list]) => {
          const [wd, ...rest] = day(date).split(" ");
          return [
            <h3 className="bl-day-header" key={`h-${date}`}><span className="bl-day-label">{wd.replace(",", "")}</span><span className="bl-day-date">{rest.join(" ")}</span><span className="bl-day-line" aria-hidden="true" /></h3>,
            ...list.map((s) => (
              <a key={s.id} className="bl-ev-item bl-ev-row bl-sala-show" data-time={s.time || ""} href={s.url || undefined} target="_blank" rel="noopener noreferrer">
                <BlThumb image={s.image} poster={{ text: s.title, family: "other" }} />
                <span className="bl-ev-body">
                  <span className="bl-ev-name">{s.title}</span>
                  {(s.room || s.url) && <span className="bl-ev-meta-row">{s.room && <span className="bl-sala-meta-sm">{s.room}</span>}{s.url && <span className="bl-sala-show-cta">{t("salas.tickets")} ↗</span>}</span>}
                </span>
              </a>
            )),
          ];
        })}
      </div>
    </section>
  );
}

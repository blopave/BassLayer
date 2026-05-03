import { useState } from "react";
import { TimelineEventModal } from "./TimelineEventModal";
import { useLocale } from "../hooks/useLocale";

const TIMELINE = [
  {
    year: "2025-2026",
    events: [
      { date: "Mar 2026", title: "Ley de Activos Digitales reglamentada", desc: "Argentina reglamenta el marco legal para exchanges y custodia de activos digitales.", type: "reg" },
      { date: "Feb 2026", title: "ETH Buenos Aires 2026", desc: "Tercer edicion del evento mas grande de Ethereum en Latinoamerica. +2000 asistentes en La Rural.", type: "event" },
      { date: "Dic 2025", title: "Ripio obtiene licencia VASP", desc: "Primer exchange argentino en obtener licencia de proveedor de activos virtuales bajo la nueva regulacion.", type: "project" },
      { date: "Nov 2025", title: "Hackathon Web3 BA", desc: "Mas de 500 devs participaron en el hackathon organizado por la comunidad ETH Argentina en el Centro Cultural Kirchner.", type: "event" },
      { date: "Sep 2025", title: "Lemon Cash supera 3M usuarios", desc: "La fintech crypto argentina alcanza los 3 millones de usuarios activos en Latinoamerica.", type: "project" },
      { date: "Ago 2025", title: "CNV regula stablecoins", desc: "La Comision Nacional de Valores establece marco para stablecoins operando en el pais.", type: "reg" },
    ]
  },
  {
    year: "2024",
    events: [
      { date: "Dic 2024", title: "ETH Latam Hackathon", desc: "Buenos Aires sede del hackathon regional de Ethereum con premios por $500K USD.", type: "event" },
      { date: "Oct 2024", title: "Argentina en el top 15 de adopcion cripto", desc: "Chainalysis ubica a Argentina en el puesto 15 del Global Crypto Adoption Index.", type: "project" },
      { date: "Ago 2024", title: "Decreto de desregulacion cripto", desc: "El gobierno emite decreto que facilita operaciones crypto y reduce requisitos para exchanges.", type: "reg" },
      { date: "Jun 2024", title: "Tether abre oficina en BA", desc: "Tether establece presencia oficial en Buenos Aires como hub para operaciones en Latam.", type: "project" },
      { date: "Mar 2024", title: "Crecimiento de pagos en USDT", desc: "Comercios en BA comienzan a aceptar USDT masivamente como alternativa al dolar blue.", type: "project" },
    ]
  },
  {
    year: "2023",
    events: [
      { date: "Nov 2023", title: "ETH Argentina 2023", desc: "Primera edicion de la conferencia Ethereum Argentina. Mas de 1000 asistentes.", type: "event" },
      { date: "Sep 2023", title: "Worldcoin llega a Argentina", desc: "Argentina se convierte en uno de los mercados con mayor adopcion de Worldcoin y World ID.", type: "project" },
      { date: "Jul 2023", title: "Boom de DeFi en pesos argentinos", desc: "Protocolos como Num Finance lanzan stablecoins atadas al peso argentino (nARS).", type: "project" },
      { date: "Abr 2023", title: "Buenos Aires Blockchain Week", desc: "Primera semana blockchain oficial de Buenos Aires con mas de 30 side events.", type: "event" },
    ]
  },
  {
    year: "2022",
    events: [
      { date: "Dic 2022", title: "Argentina campeon y NFTs virales", desc: "NFTs del mundial explotan en popularidad. Colecciones argentinas se vuelven trending.", type: "project" },
      { date: "Ago 2022", title: "ETH Latam 2022 en Buenos Aires", desc: "La conferencia de Ethereum para Latinoamerica se realiza en Buenos Aires por primera vez.", type: "event" },
      { date: "May 2022", title: "AFIP exige declaracion de crypto", desc: "AFIP incorpora casilleros especificos para declarar tenencia de criptomonedas.", type: "reg" },
      { date: "Feb 2022", title: "Buenbit lanza tarjeta crypto", desc: "Buenbit lanza tarjeta Visa prepaga que permite gastar crypto directamente.", type: "project" },
    ]
  },
  {
    year: "2021",
    events: [
      { date: "Nov 2021", title: "Mercado Libre acepta crypto", desc: "MercadoLibre habilita compra de BTC y ETH para usuarios argentinos.", type: "project" },
      { date: "Ago 2021", title: "Argentina top 10 en P2P trading", desc: "Volumen de trading P2P en Argentina llega a record historico por inestabilidad del peso.", type: "project" },
      { date: "May 2021", title: "Primer cajero Bitcoin en BA", desc: "Se instala el primer cajero de Bitcoin en un shopping de Buenos Aires.", type: "project" },
    ]
  },
];

export function CryptoBATimeline() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [expandedYear, setExpandedYear] = useState(TIMELINE[0].year);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const typeLabel = (type) => t(`timeline.type.${type}`);

  if (!open) {
    return (
      <button className="bl-timeline-toggle" onClick={() => setOpen(true)}>
        <div className="bl-timeline-toggle-left">
          <span className="bl-timeline-toggle-icon">
            <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1v14M4 5h8M4 9h8M6 13h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </span>
          <span className="bl-timeline-toggle-label">{t("timeline.toggle")}</span>
        </div>
        <span className="bl-timeline-toggle-sub">{t("timeline.toggleSub")}</span>
      </button>
    );
  }

  return (
    <div className="bl-timeline">
      <div className="bl-timeline-header">
        <div className="bl-timeline-header-left">
          <div className="bl-timeline-title">{t("timeline.title")}</div>
          <div className="bl-timeline-subtitle">{t("timeline.subtitle")}</div>
        </div>
        <button className="bl-timeline-close" onClick={() => setOpen(false)}>&times;</button>
      </div>

      {/* Year tabs */}
      <div className="bl-timeline-years">
        {TIMELINE.map(g => (
          <button
            key={g.year}
            className={`bl-timeline-year-btn${expandedYear === g.year ? " active" : ""}`}
            onClick={() => setExpandedYear(g.year)}
          >
            {g.year}
          </button>
        ))}
      </div>

      {/* Events */}
      {TIMELINE.filter(g => g.year === expandedYear).map(group => (
        <div key={group.year} className="bl-timeline-group">
          <div className="bl-timeline-line" aria-hidden="true" />
          {group.events.map((ev, i) => (
            <div
              className="bl-timeline-event bl-timeline-event-clickable"
              key={i}
              onClick={() => setSelectedEvent(ev)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedEvent(ev))}
              role="button"
              tabIndex={0}
              aria-label={`${t("timeline.viewDetail")} ${ev.title}`}
            >
              <div className="bl-timeline-dot-wrap">
                <div className={`bl-timeline-dot bl-timeline-dot-${ev.type}`} />
              </div>
              <div className="bl-timeline-event-body">
                <div className="bl-timeline-event-top">
                  <span className="bl-timeline-event-date">{ev.date}</span>
                  <span className={`bl-timeline-event-type bl-timeline-type-${ev.type}`}>{typeLabel(ev.type)}</span>
                </div>
                <div className="bl-timeline-event-title">{ev.title}</div>
                <div className="bl-timeline-event-desc">{ev.desc}</div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <TimelineEventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}

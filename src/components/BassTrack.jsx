import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../hooks/useLocale";
import { MONTHS_ABBR, getEventDate } from "../i18n/strings";
import { api, shared } from "../utils/api";
import { useIsMobile } from "../utils/constants";

// Portada de Bass (sept–oct 2026, Pablo): el índice como un track. Lo que la
// curva de análisis técnico es para Layer (el instrumento de su público), la
// forma de onda lo es para Bass. La portada es solo eso: una onda completa,
// que nunca se corta, y sus secciones HECHAS DE ONDA — cada nombre está
// escrito con las mismas barras, encendidas donde pasa una letra:
//   Noticias   — lo que ya sonó: las notas de las últimas 24 h, por hora (atenuado).
//   Agenda     — desde ahora: las fiestas de los próximos 30 días.
//   Festivales — el cierre: los festivales de los próximos 6 meses.
// Cada nombre va centrado en su parte, con aire: alrededor de la palabra la
// onda se aquieta (sigue sonando, más baja) para que respire. El dato y el
// rango van debajo de la onda, nunca sobre las barras.
// Desktop: la onda de punta a punta, a lo alto de la pantalla. Mobile: una
// pista por parte (el tema que sigue en la línea de abajo).
// Cada parte se dibuja con sus datos reales, comprimida como un master (ver
// envelope), sobre un piso de señal. La textura es textura.
// Suena (canvas): 124 BPM tocados por una persona — golpes con su fuerza (el
// 1 del compás acentuado), ataque suave, caída larga, viajando desde ahora
// (el comienzo de la Agenda); encima una ondulación continua. Al ponerse sobre una sección, el
// resto del tema FRENA como una bandeja sin motor y se apaga, y su parte pasa
// a PREESCUCHA: un cabezal la recorre y enciende las barras a su paso. En
// mobile (sin hover) el loop hace lo mismo por turnos.

const BEAT = 60 / 124;                        // s por golpe: 124 BPM, tempo de club
const CUE_BEATS = 8;                          // mobile: golpes por parte en el loop
const SCAN_BEATS = 8;                         // preescucha: el cabezal cruza la parte en 2 compases
const FLOW = 0.45;                            // partes/s: cómo viaja el golpe desde ahora
const NEWS_BINS = 24;                         // Noticias: 24 h en tramos de 1 h (el feed cubre ~1 día)
const AGENDA_DAYS = 30;                       // Agenda: un tramo por día
const FEST_WEEKS = 26;                        // Festivales: un tramo por semana
const WORD_SHARE = 0.6;                       // la palabra ocupa ~60 % de su parte: aire a los costados

const minsAgo = (t) => { const m = /^(\d+)\s*([mhdw])/.exec(t || ""); return m ? Number(m[1]) * { m: 1, h: 60, d: 1440, w: 10080 }[m[2]] : null; };

// Textura determinística (0..1): transientes barra a barra sobre un pulso más
// lento (cada 3 barras), como el detalle de una forma de onda real.
const hash = (k) => { const v = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const grain = (i) => 0.65 * hash(i) + 0.35 * hash(Math.floor(i / 3) + 999);
const smooth = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

// Envolvente continua de una parte: sus tramos suavizados (gaussiana de 0,9
// tramo) y normalizados como un compresor: cada tramo contra el más fuerte de
// sus ±7 vecinos (piso: 35 % del pico de la parte). Así una noche enorme no
// aplasta al resto y cada semana conserva sus altos y bajos.
function envelope(bins) {
  const n = bins.length;
  const sm = bins.map((_, i) => { let s = 0, w = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { const g = Math.exp(-(((i - j) / 0.9) ** 2)); s += bins[j] * g; w += g; } return s / w; });
  const max = Math.max(1e-6, ...sm);
  const norm = sm.map((v, i) => v / Math.max(0.35 * max, ...sm.slice(Math.max(0, i - 7), i + 8)));
  return (t) => { const p = Math.max(0, Math.min(n - 1, t * n - 0.5)), a = Math.floor(p), b = Math.min(n - 1, a + 1), f = p - a; return norm[a] * (1 - f) + norm[b] * f; };
}

// Un golpe tocado: ataque de 50 ms y caída exponencial; fuerza humana (0,72–1)
// y el 1 de cada compás acentuado.
function hit(ph) {
  const n = Math.floor(ph), f = ph - n;
  const vel = (0.72 + 0.28 * hash(n * 7.13)) * ((((n % 4) + 4) % 4) === 0 ? 1.18 : 1);
  const a = 0.05 / BEAT;
  return vel * (f < a ? f / a : Math.exp(-(f - a) * 3.6));
}

let measurer = null;
const textWidth = (s, font) => { measurer = measurer || document.createElement("canvas").getContext("2d"); measurer.font = font; return measurer.measureText(s).width; };

// `todayKey`: el día en Buenos Aires (YYYY-MM-DD). Un string, no un Date: la
// memo se estabiliza por valor y pasada la medianoche se actualiza sola.
// `onCue(section)` recibe la sección de BassFeed ("noticias" | "eventos" | "festivales").
export function BassTrack({ events, todayKey, onCue }) {
  const { t, locale } = useLocale();
  const M = MONTHS_ABBR[locale] || MONTHS_ABBR.es;
  const today = useMemo(() => { const [y, m, d] = todayKey.split("-").map(Number); return new Date(y, m - 1, d); }, [todayKey]);
  const isMobile = useIsMobile();             // sin hover (mobile o táctil): el loop hace la preescucha
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [w, setW] = useState(0);
  const [avail, setAvail] = useState(0);      // desktop: alto de pantalla disponible desde el track
  const [news, setNews] = useState([]);
  const [fests, setFests] = useState([]);
  const [hot, setHot] = useState(null);       // sección bajo el mouse o con foco
  const [live, setLive] = useState(false);    // en pantalla: suena (fuera, no gasta)
  const [fonts, setFonts] = useState(0);      // las palabras se miden con la fuente real, ya cargada
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => { const top = el.getBoundingClientRect().top; if (top >= 0 && top < window.innerHeight) setAvail(Math.round(window.innerHeight - top)); };
    const ro = new ResizeObserver(([e]) => { setW(Math.round(e.contentRect.width)); measure(); });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting));
    io.observe(el);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(() => setFonts((n) => n + 1));
    return () => { ro.disconnect(); io.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  useEffect(() => {
    let on = true;
    shared("bassNews", api.bassNews).then((d) => on && setNews(Array.isArray(d) ? d : [])).catch(() => {});
    shared("festivals", () => api.festivals()).then((d) => on && setFests(Array.isArray(d) ? d : [])).catch(() => {});
    return () => { on = false; };
  }, []);

  // Las tres partes: sus tramos (datos reales), su nombre y su dato.
  const data = useMemo(() => {
    const off = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 864e5);
    const day = (d) => `${d.getDate()} ${locale === "es" ? M[d.getMonth()].toLowerCase() : M[d.getMonth()]}`;

    const newsBins = Array(NEWS_BINS).fill(0);
    let lastDay = 0;
    for (const n of news) {
      const m = minsAgo(n.time);
      if (m == null) continue;
      const o = Math.floor(m / 60);
      if (o < NEWS_BINS) newsBins[NEWS_BINS - 1 - o]++;
      if (m < 1440) lastDay++;
    }

    const agendaBins = Array(AGENDA_DAYS).fill(0);
    let upcoming = 0, todayN = 0;
    for (const ev of events) {
      const d = getEventDate(ev);
      if (!d) continue;
      const o = off(d);
      if (o < 0) continue;
      upcoming++;
      if (o === 0) todayN++;
      if (o < AGENDA_DAYS) agendaBins[o] += 1 + Math.min(1, (ev.artists?.length || 0) / 4);
    }

    const next = fests.filter((f) => (f.dates_start || "") >= todayKey).sort((a, b) => a.dates_start.localeCompare(b.dates_start));
    const festBins = Array(FEST_WEEKS).fill(0);
    for (const f of next) {
      const wk = Math.floor(off(new Date(`${f.dates_start}T12:00:00`)) / 7);
      if (wk < FEST_WEEKS) festBins[wk] += f.country === "Argentina" ? 2 : 1;
    }
    const fest = next.find((f) => f.country === "Argentina") || next[0];
    const festSub = fest ? `${fest.name.replace(/\s+Buenos Aires$/i, " BA")} · ${day(new Date(`${fest.dates_start}T12:00:00`))}` : "";

    return [
      { k: "noticias", env: envelope(newsBins), name: t("section.news"), sub: news.length ? t("track.newsSub", { n: lastDay }) : "", span: t("track.spanNews") },
      { k: "eventos", env: envelope(agendaBins), name: t("track.agenda"), sub: t("track.agendaSub", { today: todayN, n: upcoming }), span: t("track.spanAgenda") },
      { k: "festivales", env: envelope(festBins), name: t("section.festivals"), sub: festSub, span: t("track.spanFests") },
    ];
  }, [events, news, fests, today, todayKey, t, M, locale]);

  const mobile = w > 0 && w <= 768;
  // Geometría: la onda (una línea en desktop, una pista por parte en mobile),
  // la palabra de cada parte centrada en ella y su dato debajo. Todo lo que no
  // cambia entre cuadros se calcula acá una vez; las barras quedan agrupadas
  // por parte y por brillo para dibujar cada grupo de un solo trazo.
  const geo = useMemo(() => {
    if (!w) return null;
    // Energía del tema en u ∈ [0, 3): parte = ⌊u⌋, continua, con mezcla suave
    // entre partes (como en un mix). Piso de señal (0,16) + datos.
    const energy = (u) => {
      const s = Math.min(2, Math.floor(u)), f = u - s, at = (i, x) => 0.16 + 0.84 * data[i].env(Math.max(0, Math.min(1, x)));
      let e = at(s, f);
      const X = 0.06;
      if (f < X && s > 0) e = e * (0.5 + f / X / 2) + at(s - 1, 1) * (0.5 - f / X / 2);
      if (f > 1 - X && s < 2) e = e * (0.5 + (1 - f) / X / 2) + at(s + 1, 0) * (0.5 - (1 - f) / X / 2);
      return e;
    };
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "system-ui, sans-serif";
    const H = mobile ? 600 : Math.round(Math.max(440, Math.min(700, (avail || 720) - 24)));
    const seg = mobile ? w : w / 3;
    // Un solo tamaño para las tres palabras: el que deja a la más larga en ~60 % de su parte.
    const widest = Math.max(...data.map((p) => textWidth(p.name, `800 100px ${family}`)));
    const size = Math.floor(Math.min(mobile ? 46 : 74, (100 * seg * WORD_SHARE) / widest));
    const font = `800 ${size}px ${family}`;
    const parts = data.map((p, j) => {
      const x = mobile ? 0 : j * seg, y = mobile ? (j * H) / 3 : 0;
      const mid = mobile ? y + 78 : (H - 66) / 2 + 4, amp = mobile ? 58 : mid - 34;
      const ww = textWidth(p.name, font), wx = x + (seg - ww) / 2;
      // Caja de la palabra (en px CSS): ahí se compone la máscara de letras.
      const box = { x: Math.floor(wx - 6), y: Math.floor(mid - size), w: Math.ceil(ww + 12), h: Math.ceil(2 * size) };
      return { ...p, j, x, y, seg, h: mobile ? H / 3 : H, mid, amp, wx, ww, box };
    });
    const groups = new Map(), words = [[], [], []];
    let i = 0;
    const step = mobile ? 2.6 : 3;
    // Una pista: de `from` a `to` recorre el tema de u0 a u1 (desktop: las tres partes; mobile: una).
    const lane = (from, to, u0, u1) => {
      for (let px = from; px <= to; px += step, i++) {
        const u = Math.min(2.999, u0 + ((px - from) / (to - from)) * (u1 - u0)), c = parts[Math.min(2, Math.floor(u))], e = energy(u);
        // Aire alrededor de la palabra: la onda se aquieta (nunca se corta).
        const room = Math.min(smooth((px - (c.wx - 30)) / 30), smooth((c.wx + c.ww + 30 - px) / 30));
        const dist = u - 1;       // en partes, desde ahora (comienzo de la Agenda)
        const b = { j: c.j, f: u - c.j, u, px, mid: c.mid, cap: c.amp + 6, h: 1 + e * c.amp * (0.35 + 0.65 * grain(i)), dist, gain: dist >= 0 ? (0.4 + 0.6 * e) * Math.exp(-dist / 1.2) : 0, m: 1 };
        const q = Math.round((1 - 0.58 * room) * 8) / 8, key = c.j * 10 + q;
        if (!groups.has(key)) groups.set(key, { j: c.j, q, bars: [] });
        groups.get(key).bars.push(b);
        if (room > 0.01) words[c.j].push(b);
      }
    };
    if (mobile) parts.forEach((c) => lane(2, w - 2, c.j, c.j + 0.999));
    else lane(2, w - 2, 0, 3);
    return { H, parts, groups: [...groups.values()], words, lw: mobile ? 1.5 : 1.8, size, font };
  }, [w, mobile, avail, data, fonts]);

  // Loop de partes sin hover: solo con el track en pantalla y sin "reducir movimiento".
  const [auto, setAuto] = useState(0);
  const still = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const loop = isMobile && live && !still;
  useEffect(() => {
    if (!loop) return undefined;
    const id = setInterval(() => setAuto((n) => n + 1), BEAT * CUE_BEATS * 1000);
    return () => clearInterval(id);
  }, [loop]);
  const solo = hot || (loop ? data[auto % data.length].k : null);
  const soloIdx = data.findIndex((p) => p.k === solo);
  const soloRef = useRef(-1);
  soloRef.current = soloIdx;
  const pickedRef = useRef(false);            // solo elegido por el usuario (no el loop): los otros nombres bajan más
  pickedRef.current = !!hot;
  // Estado del motor entre cuadros: tiempo propio y velocidad de cada parte
  // (la bandeja que frena), brillo de la onda y de las palabras, y cuándo
  // arrancó la preescucha.
  const motor = useRef({ time: [0, 0, 0], rate: [1, 1, 1], alpha: [0.42, 0.9, 0.9], lit: [0.8, 0.95, 0.95], scanFrom: 0, scanIdx: -1, last: 0 });

  // Recursos del dibujo: se arman una vez por geometría (no en cada entrada o
  // salida de pantalla): tamaño del canvas, la máscara de letras y el lienzo
  // de las letras encendidas, y los colores del tema.
  const gfx = useRef(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !geo) { gfx.current = null; return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mk = (c) => { c.width = Math.round(w * dpr); c.height = Math.round(geo.H * dpr); const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineCap = "round"; return x; };
    const ctx = mk(cv), mask = document.createElement("canvas"), mctx = mk(mask), litCv = document.createElement("canvas"), lctx = mk(litCv);
    mctx.font = geo.font; mctx.textBaseline = "middle"; mctx.fillStyle = "#000";
    for (const c of geo.parts) mctx.fillText(c.name, c.wx, c.mid);
    const css = getComputedStyle(cv);
    gfx.current = { dpr, ctx, mask, litCv, lctx, color: css.getPropertyValue("--bl-accent-bass").trim() || "#c8956c", ink: css.getPropertyValue("--bl-text").trim() || "#f1ece4" };
  }, [geo, w]);

  // El motor: cuadro a cuadro mientras está en pantalla; quieto con "reducir movimiento".
  useEffect(() => {
    const G = gfx.current;
    if (!G || !geo) return undefined;
    const { dpr, ctx, mask, litCv, lctx, color, ink } = G;
    const W = w, H = geo.H, S = motor.current;
    let raf = 0;
    const frame = (now) => {
      const dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 0;
      S.last = now;
      const s = soloRef.current;
      if (s !== S.scanIdx) { S.scanIdx = s; S.scanFrom = now; }
      for (let j = 0; j < 3; j++) {
        // Freno de bandeja: las partes que no están en solo desaceleran hasta 0.
        const rateT = s < 0 || j === s ? 1 : 0;
        S.rate[j] += (rateT - S.rate[j]) * (still ? 1 : rateT ? 0.08 : 0.045);
        S.time[j] += dt * S.rate[j];
        const k = still ? 1 : 0.07;
        S.alpha[j] += ((s < 0 ? (j === 0 ? 0.42 : 0.9) : j === s ? 1 : 0.22) - S.alpha[j]) * k;
        S.lit[j] += ((s < 0 ? (j === 0 ? 0.8 : 0.95) : j === s ? 1 : pickedRef.current ? 0.32 : 0.62) - S.lit[j]) * k;
      }
      const scan = s >= 0 && !still ? (((now - S.scanFrom) / 1000) / (BEAT * SCAN_BEATS)) % 1 : -1;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = geo.lw; ctx.strokeStyle = color;
      // La onda, un trazo por grupo (parte × brillo); en preescucha, lo que
      // ya cruzó el cabezal encendido y lo que falta a media luz.
      for (const g of geo.groups) {
        const j = g.j, seg = geo.parts[j].seg, tt = still ? 0 : S.time[j], scanning = j === s && scan >= 0;
        for (const lit of scanning ? [true, false] : [null]) {
          ctx.globalAlpha = S.alpha[j] * g.q * (lit === false ? 0.5 : 1);
          ctx.beginPath();
          for (const b of g.bars) {
            if ((lit === true && b.f > scan) || (lit === false && b.f <= scan)) continue;
            let m = 1 + 0.07 * Math.sin(tt * 2.1 - b.px * 0.019) + 0.045 * Math.sin(tt * 3.4 + b.px * 0.031) + 0.04 * Math.sin(tt * 0.55 + b.u * 1.7);
            b.kick = b.gain && !still ? b.gain * hit((tt - b.dist / FLOW) / BEAT) * S.rate[j] : 0;
            m += 0.3 * b.kick;
            if (scanning) m += 0.45 * Math.exp(-((((b.f - scan) * seg) / 16) ** 2));
            const h = Math.min(b.cap, b.h * m);
            ctx.moveTo(b.px, b.mid - h); ctx.lineTo(b.px, b.mid + h);
          }
          ctx.stroke();
        }
      }
      if (s >= 0 && scan >= 0) {
        const c = geo.parts[s], x = mobile ? 2 + scan * (W - 4) : c.x + scan * c.seg;
        ctx.globalAlpha = 0.9; ctx.strokeStyle = ink; ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.moveTo(x, c.mid - c.amp - 4); ctx.lineTo(x, c.mid + c.amp + 4); ctx.stroke();
      }
      // Las letras: las mismas barras, encendidas a lo alto de la palabra y
      // recortadas a sus glifos; laten con el golpe. Solo dentro de cada caja.
      lctx.lineWidth = geo.lw * 1.55; lctx.strokeStyle = ink;
      for (const c of geo.parts) {
        const { x, y, w: bw, h: bh } = c.box, ws = geo.words[c.j];
        let kick = 0;
        for (const b of ws) kick += b.kick || 0;
        lctx.globalCompositeOperation = "source-over";
        lctx.clearRect(x, y, bw, bh);
        lctx.globalAlpha = Math.min(1, S.lit[c.j] * (0.86 + 0.5 * (ws.length ? kick / ws.length : 0)));
        lctx.beginPath();
        for (const b of ws) { lctx.moveTo(b.px, b.mid - geo.size); lctx.lineTo(b.px, b.mid + geo.size); }
        lctx.stroke();
        lctx.globalAlpha = 1; lctx.globalCompositeOperation = "destination-in";
        lctx.drawImage(mask, x * dpr, y * dpr, bw * dpr, bh * dpr, x, y, bw, bh);
        ctx.globalAlpha = 1;
        ctx.drawImage(litCv, x * dpr, y * dpr, bw * dpr, bh * dpr, x, y, bw, bh);
      }
      if (!still && live) raf = requestAnimationFrame(frame);
      else S.last = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [geo, w, live, still, still ? soloIdx : 0]); // eslint-disable-line react-hooks/exhaustive-deps -- quieto: redibuja el solo

  const partProps = (c) => ({
    className: `btk-cue${solo === c.k ? " is-hot" : ""}${hot && hot !== c.k ? " is-off" : ""}`, role: "button", tabIndex: 0,
    onMouseEnter: () => setHot(c.k), onMouseLeave: () => setHot(null),
    onFocus: () => setHot(c.k), onBlur: () => setHot(null),
    "aria-label": c.sub ? `${c.name}: ${c.sub}` : c.name,
    onClick: () => onCue(c.k),
    onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onCue(c.k)),
  });

  return (
    <section className="bl-btrack" data-solo={solo || ""} aria-label={t("track.aria")} ref={wrapRef}>
      <h2 className="bl-sr-only">{t("track.title")}</h2>
      {geo && (
        <div className="btk-stage" style={{ height: geo.H }}>
          <canvas ref={canvasRef} className="btk-canvas" style={{ width: w, height: geo.H }} aria-hidden="true" />
          <svg viewBox={`0 0 ${w} ${geo.H}`} width={w} height={geo.H} role="img" aria-label={t("track.chartAria")}>
            {geo.parts.map((c) => (
              <g key={c.k} {...partProps(c)} data-axis={Math.round(c.mid)}>
                <rect className="btk-hit" x={c.x} y={c.y} width={c.seg} height={c.h} />
                {/* La palabra se ve en el canvas (hecha de barras); acá, su caja real para el foco y la lectura. */}
                <text className="btk-name" x={c.wx} y={c.mid} dominantBaseline="central" style={{ font: geo.font }} aria-hidden="true">{c.name}</text>
                <text className="btk-sub" x={c.wx} y={c.mid + c.amp + (mobile ? 24 : 30)}>{c.sub}</text>
                <text className="btk-span" x={c.wx} y={c.mid + c.amp + (mobile ? 40 : 48)}>{c.span}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </section>
  );
}

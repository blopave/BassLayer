import { useState } from "react";
import { hashStr } from "../utils/slug";
import { imgUrl } from "../utils/img";

// Miniatura de 60–120 px: pedimos 2× por el proxy; si el proxy no la tiene
// (404/caída), un segundo intento con la URL original antes del fallback.
function ProxiedImg({ src, width, className, onFail }) {
  const [direct, setDirect] = useState(false);
  const proxied = imgUrl(src, width);
  const useDirect = direct || proxied === src;
  return (
    <img
      className={className}
      src={useDirect ? src : proxied}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => { if (!useDirect) setDirect(true); else onFail?.(); }}
    />
  );
}
export { ProxiedImg };

// La onda propia de cada evento o nota (oct 2026, Pablo eligió "B · La onda
// del evento"): barras de un solo color, con una forma que sale del nombre —
// única para cada uno y siempre la misma (la carta y el modal coinciden).
// cy/alto en % del alto: las notas, apaisadas, la llevan más arriba y más
// baja para dejarle lugar al titular.
function sembrar(seed) {
  let s = hashStr(String(seed)) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909);
    return ((s >>>= 0) % 10000) / 10000;
  };
}
export function Onda({ seed, n = 46, cy = 46, alto = 46, className = "bl-onda" }) {
  const r = sembrar(seed);
  const f1 = 1 + r() * 2.5, f2 = 3 + r() * 5, ph = r() * 6.28, mix = 0.25 + r() * 0.3;
  const w = 100 / n;
  const barras = Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1);
    const env = Math.sin(Math.PI * x) ** 0.7;
    const v = Math.abs(Math.sin(x * f1 * 6.28 + ph) * (1 - mix) + Math.sin(x * f2 * 6.28 + ph * 2) * mix) * env;
    const h = 4 + v * alto + r() * 4;
    return <rect key={i} x={i * w + w * 0.18} y={cy - h / 2} width={w * 0.64} height={h} rx={w * 0.32} opacity={0.35 + v * 0.65} />;
  });
  return <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{barras}</svg>;
}

// Afiche de la casa para lo que no trae imagen: la onda del evento y el
// headliner (o el nombre) abajo, adentro de la onda como en la portada. En
// las notas (titular), el medio arriba y el titular entero abajo.
export function Poster({ text, family, seed, meta, titular }) {
  const words = String(text).trim().split(/\s+/).slice(0, 3);
  const longest = Math.max(...words.map((w) => w.length));
  const size = longest > 9 ? "s" : longest > 5 ? "m" : "l";
  return (
    <div className="bl-poster" data-family={family || "other"} data-size={size} data-titular={titular ? "" : undefined} style={{ "--len": longest }}>
      <Onda seed={seed || text} n={titular ? 60 : 46} cy={titular ? 34 : 46} alto={titular ? 24 : 46} />
      {meta && <span className="bl-poster-meta">{meta}</span>}
      {titular ? (
        <p className="bl-poster-titular">{text}</p>
      ) : (
        <div className="bl-poster-words">
          {words.map((w, i) => (
            <span className="bl-poster-word" key={i}>{w}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Foto de prensa del artista tratada como afiche: duotono tintado por familia
// + nombre abajo. Distinta a propósito del flyer real — es un fallback
// honesto, no una imagen que finge ser el arte del evento.
export function ArtistPhoto({ src, name, family, onFail }) {
  return (
    <div className="bl-artist-photo" data-family={family || "other"}>
      <img
        className="bl-artist-photo-img"
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={onFail}
      />
      <span className="bl-poster-rule" />
      {name && <span className="bl-artist-photo-name">{name}</span>}
    </div>
  );
}

// fit="contain": el flyer entero sobre su propia copia desenfocada (bandas
// apaisadas como "El finde", donde el recorte cortaba nombres y caras).
export function BlThumb({ image, artistImage, artistImageName, poster, onImgFail, fit, width = 120 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [artistImgFailed, setArtistImgFailed] = useState(false);
  const hasImage = image && !imgFailed;

  if (hasImage) {
    return (
      <div className={`bl-thumb${fit === "contain" ? " bl-thumb-contain" : ""}`} aria-hidden="true">
        {fit === "contain" && <div className="bl-thumb-blur" style={{ backgroundImage: `url("${imgUrl(image, width)}")` }} />}
        <ProxiedImg
          className="bl-thumb-img"
          src={image}
          width={width}
          onFail={() => { setImgFailed(true); onImgFail?.(); }}
        />
      </div>
    );
  }

  if (artistImage && !artistImgFailed) {
    return (
      <div className="bl-thumb bl-thumb-artist" aria-hidden="true">
        <ArtistPhoto
          src={artistImage}
          name={artistImageName || poster?.text}
          family={poster?.family}
          onFail={() => setArtistImgFailed(true)}
        />
      </div>
    );
  }

  if (poster?.text) {
    return (
      <div className="bl-thumb bl-thumb-poster" aria-hidden="true">
        <Poster text={poster.text} family={poster.family} seed={poster.seed} meta={poster.meta} titular={poster.titular} />
      </div>
    );
  }

  return (
    <div className="bl-thumb bl-thumb-empty" aria-hidden="true">
      <svg className="bl-thumb-rings" viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <circle cx="32" cy="32" r="29" />
        <circle cx="32" cy="32" r="24" />
        <circle cx="32" cy="32" r="19" />
        <circle cx="32" cy="32" r="14" />
        <circle cx="32" cy="32" r="9" />
        <circle className="bl-thumb-rings-center" cx="32" cy="32" r="4" />
      </svg>
    </div>
  );
}

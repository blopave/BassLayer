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

// Mini-afiche tipográfico para items sin flyer: el headliner (o el nombre) en
// grotesca pesada, tintado por familia. Tres variantes (sólida / primera
// palabra en outline / alineada arriba) elegidas por hash para que el feed
// tenga ritmo sin caos. El recorte lateral es intencional — crop de afiche.
export function Poster({ text, family }) {
  const words = String(text).trim().split(/\s+/).slice(0, 3);
  const longest = Math.max(...words.map((w) => w.length));
  const size = longest > 9 ? "s" : longest > 5 ? "m" : "l";
  const variant = hashStr(String(text)) % 3;
  return (
    <div className="bl-poster" data-family={family || "other"} data-variant={variant} data-size={size}>
      <span className="bl-poster-rule" />
      <div className="bl-poster-words">
        {words.map((w, i) => (
          <span className="bl-poster-word" key={i}>{w}</span>
        ))}
      </div>
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

export function BlThumb({ image, artistImage, artistImageName, poster, onImgFail }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [artistImgFailed, setArtistImgFailed] = useState(false);
  const hasImage = image && !imgFailed;

  if (hasImage) {
    return (
      <div className="bl-thumb" aria-hidden="true">
        <ProxiedImg
          className="bl-thumb-img"
          src={image}
          width={120}
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
        <Poster text={poster.text} family={poster.family} />
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

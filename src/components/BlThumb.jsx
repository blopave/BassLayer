import { useState } from "react";
import { hashStr } from "../utils/slug";

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

export function BlThumb({ image, poster, onImgFail }) {
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = image && !imgFailed;

  if (hasImage) {
    return (
      <div className="bl-thumb" aria-hidden="true">
        <img
          className="bl-thumb-img"
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => { setImgFailed(true); onImgFail?.(); }}
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

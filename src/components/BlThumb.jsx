import { useState } from "react";

export function BlThumb({ image, label, onImgFail }) {
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
          onError={() => { setImgFailed(true); onImgFail?.(); }}
        />
      </div>
    );
  }

  return (
    <div className="bl-thumb bl-thumb-empty" aria-hidden="true">
      <span className="bl-thumb-label">{label || "Bass"}</span>
      <span className="bl-thumb-eq" aria-hidden="true">
        <span className="bl-thumb-eq-bar" />
        <span className="bl-thumb-eq-bar" />
        <span className="bl-thumb-eq-bar" />
        <span className="bl-thumb-eq-bar" />
      </span>
    </div>
  );
}

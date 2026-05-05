import { useState } from "react";

export function BlThumb({ image, onImgFail }) {
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

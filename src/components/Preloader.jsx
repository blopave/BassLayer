import { useState, useEffect } from "react";

export function Preloader({ done }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setP((v) => { const n = v + Math.random() * 15 + 8; if (n >= 100) { clearInterval(iv); return 100; } return n; }), 20);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => { if (p >= 100) { const t = setTimeout(done, 200); return () => clearTimeout(t); } }, [p]);
  return (
    <div className="bl-preloader" role="progressbar" aria-valuenow={Math.floor(p)} aria-valuemin={0} aria-valuemax={100} aria-label="Cargando BassLayer" style={p >= 100 ? { opacity: 0, visibility: "hidden", pointerEvents: "none" } : {}}>
      <div className="bl-pre-count">{String(Math.floor(p)).padStart(3, "0")}</div>
      <div className="bl-pre-bar"><div className="bl-pre-bar-inner" style={{ width: p + "%" }} /></div>
    </div>
  );
}

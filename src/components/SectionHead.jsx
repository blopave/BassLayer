// La misma apertura que la Agenda (oct 2026, "interiores unificados"):
// número + palabra + filete. La usan Noticias y Festivales.
export function SectionHead({ n, word, ctx }) {
  return (
    <div className="bl-feed-head">
      <span className="bl-feed-head-n">{n}</span>
      <span className="bl-feed-head-ctx">{word}{ctx ? ` · ${ctx}` : ""}</span>
    </div>
  );
}

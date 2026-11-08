import { useEffect, useRef, useState } from "react";

type Frame = { id: number; url: string; ready: boolean };

/** Shows a PDF. When `url` changes, the NEW page loads invisibly on top and replaces the old one only when
 *  it is ready, so the preview never blanks or jumps back to page 1 while Word is working. */
export function PdfFrame({ url }: { url: string }) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const id = ++counter.current;
    // keep the page that is currently visible + only the newest pending one
    setFrames((f) => [...f.filter((x) => x.ready).slice(-1), { id, url, ready: false }]);
  }, [url]);

  const onLoad = (id: number) =>
    setFrames((f) => {
      const hit = f.find((x) => x.id === id);
      return hit ? [{ ...hit, ready: true }] : f;       // the new page is ready: drop the old one
    });

  const loading = frames.some((f) => !f.ready);
  return (
    <div className="pdfwrap">
      {frames.map((f) => (
        <iframe
          key={f.id} src={f.url} title="Aperçu du programme"
          className={`preview ${f.ready ? "" : "pending"}`} onLoad={() => onLoad(f.id)}
        />
      ))}
      {loading && <div className="updating">Mise à jour de l'aperçu…</div>}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { ProgramGateway } from "../application/ProgramGateway";
import type { Section, SongSummary } from "../domain/types";
import { SongForm } from "./SongForm";

type Props = {
  gateway: ProgramGateway; sections: Section[]; sectionId: number; sectionName: string;
  onPick: (songId: number) => void; onClose: () => void;
};

export function SongPicker({ gateway, sections, sectionId, sectionName, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [inLyrics, setInLyrics] = useState(false);
  const [results, setResults] = useState<SongSummary[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => gateway.searchSongs(q, sectionId, inLyrics).then(setResults).catch(() => setResults([])), 200);
    return () => clearTimeout(t);
  }, [gateway, q, sectionId, inLyrics]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {creating ? (
          <SongForm gateway={gateway} sections={sections} fixedSectionId={sectionId} initialTitle={q} onSaved={onPick} onBack={() => setCreating(false)} />
        ) : (
          <>
            <h3>Choisir : {sectionName}</h3>
            <input autoFocus placeholder="Rechercher un titre ou une mélodie…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="check"><input type="checkbox" checked={inLyrics} onChange={(e) => setInLyrics(e.target.checked)} /> chercher aussi dans les paroles</label>
            <ul>
              {results.map((s) => (
                <li key={s.id}>
                  <button onClick={() => onPick(s.id)}>{s.title}{s.melody ? <small> — {s.melody}</small> : null}</button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="muted">
                  Aucun résultat{q.trim() && <> pour « {q.trim()} »</>}.{" "}
                  <button className="link" onClick={() => setCreating(true)}>Ajouter ce chant</button>
                </li>
              )}
            </ul>
            <div className="actions">
              <button onClick={() => setCreating(true)}>+ Nouveau chant</button>
              <button className="ghost" onClick={onClose}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { ProgramGateway } from "../application/ProgramGateway";
import type { Section, SongDetail } from "../domain/types";
import { frenchLong } from "./dates";
import { href } from "./router";
import { SongForm } from "./SongForm";

type Props = {
  gateway: ProgramGateway; sections: Section[]; songId: number; editor: boolean;
  onClose: () => void; onChanged: () => void;    // onChanged: the list must be reloaded
};

export function SongDetailDialog({ gateway, sections, songId, editor, onClose, onChanged }: Props) {
  const [song, setSong] = useState<SongDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => gateway.getSong(songId).then(setSong).catch((e) => setError(String(e.message ?? e)));
  useEffect(() => { void load(); }, [songId]);

  const remove = async () => {
    if (!song || !window.confirm(`Supprimer « ${song.title} » ? Cette action est définitive.`)) return;
    try { await gateway.deleteSong(song.id); onChanged(); onClose(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
        {error && <p className="error">{error}</p>}
        {!song && !error && <p className="muted">Chargement…</p>}
        {song && editing && (
          <SongForm gateway={gateway} sections={sections} song={song}
            onSaved={() => { setEditing(false); void load(); onChanged(); }} onBack={() => setEditing(false)} />
        )}
        {song && !editing && (
          <>
            <h3>{song.title}</h3>
            <p className="muted">
              {sections.find((s) => s.id === song.sectionTypeId)?.name}
              {song.melody ? ` · mélodie : ${song.melody}` : ""}{song.psalmNumber ? ` · psaume ${song.psalmNumber}` : ""}
            </p>
            <div className="lyrics">
              {song.verses.length === 0 && <p className="muted">Pas de paroles enregistrées.</p>}
              {song.verses.map((v, i) => (
                <p key={i} className={v.kind === "refrain" ? "refrain" : ""}>
                  {v.kind === "verse" && song.verses.filter((x) => x.kind === "verse").length > 1 && v.verseNo ? `${v.verseNo}. ` : ""}
                  {v.kind === "coda" ? "Coda : " : ""}{v.text}
                </p>
              ))}
            </div>
            <p className="muted">
              {song.usedOn.length === 0 ? "Pas encore utilisé dans un programme." : <>Utilisé dans {song.usedOn.length} messe(s) : </>}
              {song.usedOn.slice(0, 6).map((d) => <a key={d} className="date-link" href={href("/programme", { date: d })} onClick={onClose}>{frenchLong(d)}</a>)}
              {song.usedOn.length > 6 && " …"}
            </p>
            <div className="actions">
              {editor && <button onClick={() => setEditing(true)}>Modifier</button>}
              {editor && <button className="ghost danger" onClick={remove}>Supprimer</button>}
              <button className="ghost" onClick={onClose}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

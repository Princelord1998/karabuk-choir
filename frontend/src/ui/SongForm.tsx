import { useState } from "react";
import type { ProgramGateway } from "../application/ProgramGateway";
import type { Section, SongDetail } from "../domain/types";

type Props = {
  gateway: ProgramGateway; sections: Section[];
  song?: SongDetail;                       // given = edit this song, otherwise create a new one
  fixedSectionId?: number;                 // creating from the picker: the section is already known
  initialTitle?: string;
  onSaved: (songId: number) => void;       // new, updated, or the already existing song
  onBack: () => void;
};

const split = (song?: SongDetail) => ({
  refrain: song?.verses.filter((v) => v.kind === "refrain").map((v) => v.text).join("\n") ?? "",
  verses: song?.verses.filter((v) => v.kind !== "refrain").map((v) => (v.kind === "coda" ? `Coda : ${v.text}` : v.text)).join("\n\n") ?? "",
});

/** Create a new song, or edit an existing one. */
export function SongForm({ gateway, sections, song, fixedSectionId, initialTitle = "", onSaved, onBack }: Props) {
  const init = split(song);
  const [sectionId, setSectionId] = useState<number>(song?.sectionTypeId ?? fixedSectionId ?? sections[0]?.id ?? 1);
  const [title, setTitle] = useState(song?.title ?? initialTitle);
  const [melody, setMelody] = useState(song?.melody ?? "");
  const [psalm, setPsalm] = useState(song?.psalmNumber ? String(song.psalmNumber) : "");
  const [refrain, setRefrain] = useState(init.refrain);
  const [verses, setVerses] = useState(init.verses);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<number | null>(null);
  const sectionName = sections.find((s) => s.id === sectionId)?.name ?? "";
  const isPsalm = sectionName.toLowerCase() === "psaume";

  const submit = async () => {
    setBusy(true); setError(null); setExistingId(null);
    const input = {
      sectionId, title: title.trim(),
      melody: melody.trim() || undefined,
      psalmNumber: isPsalm && psalm ? Number(psalm) : undefined,
      refrain: refrain.trim() || undefined,
      verses: verses.split(/\n\s*\n/).map((v) => v.trim()).filter(Boolean),   // a blank line separates verses
    };
    try {
      const saved = song ? await gateway.updateSong(song.id, input) : await gateway.createSong(input);
      onSaved(saved.id);
    } catch (e) {
      const err = e as Error & { existingId?: number };
      setError(err.message);
      if (err.existingId) setExistingId(err.existingId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h3>{song ? "Modifier le chant" : "Nouveau chant"}{fixedSectionId ? ` : ${sectionName}` : ""}</h3>
      {!fixedSectionId && (
        <label className="field">Section
          <select value={sectionId} onChange={(e) => setSectionId(Number(e.target.value))}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <label className="field">Titre *<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field">Mélodie (facultatif)<input value={melody} onChange={(e) => setMelody(e.target.value)} /></label>
      {isPsalm && (
        <label className="field">N° du psaume<input type="number" min={1} max={150} value={psalm} onChange={(e) => setPsalm(e.target.value)} /></label>
      )}
      <label className="field">Refrain (facultatif)
        <textarea rows={3} value={refrain} onChange={(e) => setRefrain(e.target.value)} />
      </label>
      <label className="field">Couplets
        <textarea rows={7} value={verses} onChange={(e) => setVerses(e.target.value)} />
        <span className="hint">Séparez les couplets par une ligne vide. Pas besoin de les numéroter : « 1. » est ajouté automatiquement.</span>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button disabled={busy || !title.trim()} onClick={submit}>
          {busy ? "Enregistrement…" : song ? "Enregistrer" : fixedSectionId ? "Enregistrer et utiliser" : "Enregistrer"}
        </button>
        {existingId && <button onClick={() => onSaved(existingId)}>Utiliser le chant existant</button>}
        <button className="ghost" onClick={onBack}>Retour</button>
      </div>
    </>
  );
}

import type { Program, Section } from "../domain/types";
import { nextPosition } from "../domain/types";

type Props = {
  sections: Section[]; program: Program | null; readOnly?: boolean;
  onChoose: (sectionId: number, position: number) => void;
  onClear: (sectionId: number, position: number) => void;
};

export function SectionList({ sections, program, readOnly, onChoose, onClear }: Props) {
  return (
    <div className="sections">
      {sections.map((s) => {
        const entries = (program?.entries ?? []).filter((e) => e.sectionTypeId === s.id);
        if (readOnly && entries.length === 0) return null;
        return (
          <details key={s.id} open={entries.length > 0}>
            <summary>{s.name}{entries.length ? ` – ${entries.map((e) => e.song.title).join(" / ")}` : ""}</summary>
            {entries.map((e) => (
              <div className="row" key={e.position}>
                <span>{e.song.title}</span>
                {!readOnly && <button onClick={() => onChoose(s.id, e.position)}>Changer</button>}
                {!readOnly && <button className="ghost" onClick={() => onClear(s.id, e.position)}>Vider</button>}
              </div>
            ))}
            {!readOnly && (
              <div className="row">
                <button onClick={() => onChoose(s.id, nextPosition(program, s.id))}>{entries.length ? "+ Ajouter un chant" : "Choisir un chant"}</button>
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}

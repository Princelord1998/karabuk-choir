import { useEffect, useState } from "react";
import type { ProgramGateway } from "../application/ProgramGateway";
import type { MassSummary, Section } from "../domain/types";
import { frenchLong } from "./dates";

type Props = {
  gateway: ProgramGateway; sections: Section[]; targetDate: string;
  onPick: (sourceDate: string) => void; onClose: () => void;
};

/** Choose a complete past Mass: all its songs are copied into the program being built. */
export function MassPicker({ gateway, sections, targetDate, onPick, onClose }: Props) {
  const [masses, setMasses] = useState<MassSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<MassSummary | null>(null);
  const order = new Map(sections.map((s) => [s.id, s.massOrder]));

  useEffect(() => { gateway.listMasses(60).then(setMasses).catch(() => setMasses([])); }, [gateway]);
  const f = filter.trim().toLowerCase();
  const shown = masses.filter((m) => !f || m.date.includes(f) || frenchLong(m.date).toLowerCase().includes(f) || m.entries.some((e) => e.title.toLowerCase().includes(f)));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {chosen ? (
          <>
            <h3>Charger cette messe ?</h3>
            <p>Le programme du <b>{frenchLong(targetDate)}</b> sera <b>remplacé</b> par les {chosen.entries.length} chants de la messe du <b>{frenchLong(chosen.date)}</b>.</p>
            <div className="actions">
              <button onClick={() => onPick(chosen.date)}>Oui, charger</button>
              <button className="ghost" onClick={() => setChosen(null)}>Retour</button>
            </div>
          </>
        ) : (
          <>
            <h3>Charger une messe complète</h3>
            <input autoFocus placeholder="Date ou titre d'un chant…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <ul>
              {shown.map((m) => (
                <li key={m.id}>
                  <button onClick={() => setChosen(m)}>
                    <b>{frenchLong(m.date)}</b>
                    <small> — {m.entries.length} chants</small>
                    <br /><small>{[...m.entries].sort((a, b) => (order.get(a.sectionTypeId) ?? 0) - (order.get(b.sectionTypeId) ?? 0)).slice(0, 4).map((e) => e.title).join(" · ")}…</small>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="muted">Aucune messe trouvée.</li>}
            </ul>
            <div className="actions"><button className="ghost" onClick={onClose}>Fermer</button></div>
          </>
        )}
      </div>
    </div>
  );
}

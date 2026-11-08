import { useEffect, useState } from "react";
import type { ProgramGateway } from "../../application/ProgramGateway";
import type { MassSummary, Section } from "../../domain/types";
import { frenchLong, nextSunday } from "../dates";
import { go, href } from "../router";

type Props = { gateway: ProgramGateway; sections: Section[]; editor: boolean; community: string };

const PAGE = 20;

/** Archive of every Mass: see what was sung, download the program, or reuse a whole Mass as the base of a new one. */
export function MassesPage({ gateway, sections, editor, community }: Props) {
  const [masses, setMasses] = useState<MassSummary[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [reuse, setReuse] = useState<MassSummary | null>(null);
  const [target, setTarget] = useState(nextSunday());
  const [error, setError] = useState<string | null>(null);
  const order = new Map(sections.map((s) => [s.id, s]));

  const loadMore = async (reset = false) => {
    setLoading(true);
    try {
      const before = reset || masses.length === 0 ? undefined : masses[masses.length - 1].date;
      const page = await gateway.listMasses(PAGE, before);
      setMasses((prev) => (reset ? page : [...prev, ...page]));
      setMore(page.length === PAGE);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadMore(true); }, [gateway]);

  const f = filter.trim().toLowerCase();
  const shown = masses.filter((m) => !f || m.date.includes(f) || frenchLong(m.date).toLowerCase().includes(f) || m.entries.some((e) => e.title.toLowerCase().includes(f)));

  const doReuse = async () => {
    if (!reuse) return;
    try { await gateway.copyProgram(target, reuse.date); go("/programme", { date: target }); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div className="page-head"><h2>Messes</h2></div>
      <input className="bigsearch" placeholder="Filtrer par date ou par chant…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <div className="masslist">
        {shown.map((m) => (
          <div className="card" key={m.id}>
            <h3>{frenchLong(m.date)}</h3>
            <ul className="plain small">
              {[...m.entries]
                .sort((a, b) => (order.get(a.sectionTypeId)?.massOrder ?? 0) - (order.get(b.sectionTypeId)?.massOrder ?? 0) || a.position - b.position)
                .map((e) => <li key={`${e.sectionTypeId}-${e.position}`}><b>{order.get(e.sectionTypeId)?.name}</b> — {e.title}</li>)}
            </ul>
            <div className="actions">
              <a className="btn" href={href("/programme", { date: m.date })}>Ouvrir</a>
              <a className="btn ghost" href={gateway.docxUrl(m.date, community)}>Word</a>
              <a className="btn ghost" href={gateway.pdfUrl(m.date, community)} target="_blank" rel="noreferrer">PDF</a>
              {editor && <button className="ghost" onClick={() => setReuse(m)}>Utiliser comme base</button>}
            </div>
          </div>
        ))}
      </div>
      {shown.length === 0 && !loading && <p className="muted">Aucune messe trouvée.</p>}
      {more && <div className="actions center"><button disabled={loading} onClick={() => loadMore()}>{loading ? "Chargement…" : "Voir les messes plus anciennes"}</button></div>}

      {reuse && (
        <div className="overlay" onClick={() => setReuse(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Utiliser comme base</h3>
            <p>Copier tous les chants de la messe du <b>{frenchLong(reuse.date)}</b> dans un nouveau programme.</p>
            <label className="field">Date du nouveau programme<input type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
            <p className="hint">Si un programme existe déjà à cette date, il sera remplacé.</p>
            <div className="actions">
              <button disabled={!target} onClick={doReuse}>Copier et ouvrir</button>
              <button className="ghost" onClick={() => setReuse(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

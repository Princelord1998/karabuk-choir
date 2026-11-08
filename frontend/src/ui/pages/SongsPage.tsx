import { useEffect, useState } from "react";
import type { ProgramGateway } from "../../application/ProgramGateway";
import type { Section, SongSummary } from "../../domain/types";
import { SongDetailDialog } from "../SongDetailDialog";
import { SongForm } from "../SongForm";

type Props = { gateway: ProgramGateway; sections: Section[]; editor: boolean };

/** The song library: search by title / melody / lyrics, filter by section, read lyrics, add and edit (editors). */
export function SongsPage({ gateway, sections, editor }: Props) {
  const [q, setQ] = useState("");
  const [sectionId, setSectionId] = useState<number | undefined>(undefined);
  const [inLyrics, setInLyrics] = useState(true);
  const [results, setResults] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      gateway.searchSongs(q, sectionId, inLyrics).then(setResults).catch(() => setResults([])).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [gateway, q, sectionId, inLyrics, reload]);

  const name = (id: number) => sections.find((s) => s.id === id)?.name ?? "";

  return (
    <>
      <div className="page-head">
        <h2>Chants</h2>
        {editor && <button onClick={() => setAdding(true)}>+ Nouveau chant</button>}
      </div>
      <input className="bigsearch" placeholder="Rechercher un titre, une mélodie, un mot des paroles…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <label className="check"><input type="checkbox" checked={inLyrics} onChange={(e) => setInLyrics(e.target.checked)} /> chercher aussi dans les paroles</label>
      <div className="chips">
        <button className={`chip ${sectionId === undefined ? "on" : ""}`} onClick={() => setSectionId(undefined)}>Tous</button>
        {sections.map((s) => (
          <button key={s.id} className={`chip ${sectionId === s.id ? "on" : ""}`} onClick={() => setSectionId(s.id)}>{s.name}</button>
        ))}
      </div>

      <p className="muted">{loading ? "Recherche…" : `${results.length} chant(s)${results.length >= 100 ? " (affinez la recherche pour en voir plus)" : ""}`}</p>
      <ul className="songlist">
        {results.map((s) => (
          <li key={s.id}>
            <button onClick={() => setOpenId(s.id)}>
              <span className="title">{s.title}</span>
              <span className="meta">{name(s.sectionTypeId)}{s.melody ? ` · ${s.melody}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>

      {openId !== null && (
        <SongDetailDialog gateway={gateway} sections={sections} songId={openId} editor={editor}
          onClose={() => setOpenId(null)} onChanged={() => setReload((n) => n + 1)} />
      )}
      {adding && (
        <div className="overlay" onClick={() => setAdding(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <SongForm gateway={gateway} sections={sections} fixedSectionId={sectionId} initialTitle={q}
              onSaved={(id) => { setAdding(false); setReload((n) => n + 1); setOpenId(id); }} onBack={() => setAdding(false)} />
          </div>
        </div>
      )}
    </>
  );
}

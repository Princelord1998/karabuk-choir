import { useEffect, useState } from "react";
import type { ProgramGateway } from "../../application/ProgramGateway";
import { useProgram } from "../../application/useProgram";
import type { PreviewStatus, Section } from "../../domain/types";
import { frenchLong, nextSunday } from "../dates";
import { MassPicker } from "../MassPicker";
import { PdfFrame } from "../PdfFrame";
import { go, type Route } from "../router";
import { SectionList } from "../SectionList";
import { SongPicker } from "../SongPicker";

type Props = { gateway: ProgramGateway; route: Route; sections: Section[]; editor: boolean; community: string };

function useDebounced<T>(value: T, ms = 500): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Build a Mass program (editors) or view it (visitors); live preview made from the Word template. */
export function ProgramPage({ gateway, route, sections, editor, community: defaultCommunity }: Props) {
  const date = route.params.get("date") || nextSunday();
  const [community, setCommunity] = useState(defaultCommunity);
  const [target, setTarget] = useState<{ sectionId: number; position: number } | null>(null);
  const [loadMass, setLoadMass] = useState(false);
  const { program, version, error, setSong, clear, copyFrom } = useProgram(gateway, date);
  const [status, setStatus] = useState<PreviewStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () => gateway.previewStatus().then((s) => alive && setStatus(s)).catch((e) => alive && setStatus({ ok: false, error: String(e.message ?? e) }));
    const timers = [setTimeout(read, 500), setTimeout(read, 3000), setTimeout(read, 8000)];
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [version]);

  const debounced = useDebounced(community);
  const pdf = `${gateway.pdfUrl(date, debounced)}&v=${version}`;
  const count = program?.entries.length ?? 0;

  return (
    <div className="layout">
      <aside className="panel">
        <h2>Programme de la messe</h2>
        <label className="field">Date
          <input type="date" value={date} onChange={(e) => e.target.value && go("/programme", { date: e.target.value })} />
        </label>
        <p className="muted">{frenchLong(date)} · {count} chant(s)</p>
        {editor && <button className="wide-btn" onClick={() => setLoadMass(true)}>⤓ Charger une messe complète</button>}
        <label className="field">Communauté (titre)<input value={community} onChange={(e) => setCommunity(e.target.value)} /></label>
        {!editor && <p className="hint">Mode lecture. <a href="#/connexion">Connectez-vous</a> pour modifier le programme.</p>}
        {error && <p className="error">{error}</p>}
        <SectionList sections={sections} program={program} readOnly={!editor}
          onChoose={(sectionId, position) => setTarget({ sectionId, position })} onClear={clear} />
      </aside>
      <section className="preview-col">
        <div className={`note ${status?.ok === false ? "warn" : "ok"}`}>
          {(!status || status.ok === null) && "Génération du premier aperçu…"}
          {status?.ok === true && <>Aperçu fait avec <b>{status.engine}</b> à partir de votre modèle Word.</>}
          {status?.ok === false && <><b>L'aperçu n'utilise PAS votre modèle Word.</b> Raison : {status.error}<br />{status.hint}</>}
          <br />Modèle : {status?.template?.path ?? "?"}
        </div>
        <div className="toolbar">
          <a className="btn" href={gateway.docxUrl(date, community)}>Télécharger le Word</a>{" "}
          <a className="btn" href={pdf} target="_blank" rel="noreferrer">Aperçu PDF</a>
        </div>
        <PdfFrame url={pdf} />
      </section>

      {target && (
        <SongPicker gateway={gateway} sections={sections} sectionId={target.sectionId}
          sectionName={sections.find((s) => s.id === target.sectionId)?.name ?? ""}
          onClose={() => setTarget(null)}
          onPick={(songId) => { void setSong(target.sectionId, songId, target.position); setTarget(null); }} />
      )}
      {loadMass && (
        <MassPicker gateway={gateway} sections={sections} targetDate={date} onClose={() => setLoadMass(false)}
          onPick={(source) => { void copyFrom(source); setLoadMass(false); }} />
      )}
    </div>
  );
}

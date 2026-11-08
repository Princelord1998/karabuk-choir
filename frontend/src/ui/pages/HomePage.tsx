import { useEffect, useState } from "react";
import type { ProgramGateway } from "../../application/ProgramGateway";
import type { MassSummary, Section, Stats } from "../../domain/types";
import { frenchLong, nextSunday } from "../dates";
import { href } from "../router";

type Props = { gateway: ProgramGateway; sections: Section[]; editor: boolean; community: string };

export function HomePage({ gateway, sections, editor, community }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [last, setLast] = useState<MassSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gateway.stats().then(setStats).catch((e) => setError(e.message));
    gateway.listMasses(1).then((m) => setLast(m[0] ?? null)).catch(() => undefined);
  }, [gateway]);
  const order = new Map(sections.map((s) => [s.id, s]));

  return (
    <>
      <section className="hero">
        <h1>{community}</h1>
        <p>Les chants et les programmes de nos messes, au même endroit.</p>
        <div className="actions center">
          <a className="btn" href={href("/chants")}>Parcourir les chants</a>
          <a className="btn ghost" href={href("/messes")}>Voir les messes</a>
          {editor && <a className="btn" href={href("/programme", { date: nextSunday() })}>Préparer le prochain dimanche</a>}
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      <div className="cards">
        <div className="card stat"><b>{stats?.songs ?? "…"}</b><span>chants</span></div>
        <div className="card stat"><b>{stats?.masses ?? "…"}</b><span>messes enregistrées</span></div>
        <div className="card stat"><b>{stats?.sections ?? "…"}</b><span>parties de la messe</span></div>
        <div className="card stat"><b>{stats?.lastMassDate ? frenchLong(stats.lastMassDate) : "…"}</b><span>dernière messe</span></div>
      </div>

      {last && (
        <div className="card">
          <h2>Dernier programme : {frenchLong(last.date)}</h2>
          <ul className="plain">
            {[...last.entries]
              .sort((a, b) => (order.get(a.sectionTypeId)?.massOrder ?? 0) - (order.get(b.sectionTypeId)?.massOrder ?? 0) || a.position - b.position)
              .map((e) => <li key={`${e.sectionTypeId}-${e.position}`}><b>{order.get(e.sectionTypeId)?.name}</b> — {e.title}</li>)}
          </ul>
          <div className="actions">
            <a className="btn" href={href("/programme", { date: last.date })}>Ouvrir</a>
            <a className="btn ghost" href={gateway.docxUrl(last.date, community)}>Télécharger le Word</a>
          </div>
        </div>
      )}
    </>
  );
}

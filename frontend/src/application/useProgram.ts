// Use-case hook: loads and edits the program for a date.
import { useCallback, useEffect, useState } from "react";
import type { Program, Section } from "../domain/types";
import type { ProgramGateway } from "./ProgramGateway";

export function useProgram(gateway: ProgramGateway, date: string) {
  const [sections, setSections] = useState<Section[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [version, setVersion] = useState(0); // bumps after each edit so the PDF preview reloads
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gateway.listSections().then(setSections).catch((e) => setError(String(e)));
  }, [gateway]);

  useEffect(() => {
    let alive = true;
    gateway.getProgram(date)
      .then((p) => { if (alive) { setProgram(p); setError(null); setVersion((v) => v + 1); } })
      .catch((e) => alive && setError(String(e)));
    return () => { alive = false; };
  }, [gateway, date]);

  const apply = useCallback(async (op: Promise<Program>) => {
    try { setProgram(await op); setError(null); setVersion((v) => v + 1); }
    catch (e) { setError(String(e)); }
  }, []);

  return {
    sections, program, version, error,
    copyFrom: (sourceDate: string) => apply(gateway.copyProgram(date, sourceDate)),
    setSong: (sectionId: number, songId: number, position: number) =>
      apply(gateway.setSection(date, sectionId, songId, position)),
    clear: (sectionId: number, position: number) => apply(gateway.clearSection(date, sectionId, position)),
  };
}

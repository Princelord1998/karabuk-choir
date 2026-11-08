// Adapter: the Python service that draws the PDF preview and fills the Word template.
import type { Program } from "../domain/entities.ts";
import type { ProgramRenderer, RendererStatus } from "../domain/ports.ts";

export const createPythonRenderer = (baseUrl: string): ProgramRenderer => {
  const post = async (path: string, program: Program): Promise<Uint8Array> => {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: program.date,
        community: program.community,
        entries: program.entries.map((e) => ({ section: e.sectionName, title: e.song.title, psalmNumber: e.song.psalmNumber, verses: e.song.verses })),
      }),
    });
    if (!res.ok) throw new Error(`Renderer responded ${res.status}: ${await res.text()}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const status = async (): Promise<RendererStatus> => {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/preview-status`);
      return (await res.json()) as RendererStatus;
    } catch {
      return { ok: false, error: `Cannot reach the renderer at ${baseUrl}. Is "python app.py" running?` };
    }
  };
  return { render: (p) => post("/render", p), renderWord: (p) => post("/render-docx", p), status };
};

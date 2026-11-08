// Domain layer (frontend): the shapes the UI reasons about. No React, no fetch.
export type Section = { id: number; name: string; massOrder: number };
export type SongSummary = { id: number; sectionTypeId: number; title: string; melody: string | null };
export type ProgramEntry = { sectionTypeId: number; sectionName: string; position: number; song: SongSummary };
export type Program = { date: string; community: string; entries: ProgramEntry[] };

export const nextPosition = (p: Program | null, sectionId: number): number =>
  1 + Math.max(0, ...(p?.entries ?? []).filter((e) => e.sectionTypeId === sectionId).map((e) => e.position));

export type Verse = { kind: "refrain" | "verse" | "coda"; verseNo: number | null; text: string };
export type SongDetail = SongSummary & { psalmNumber: number | null; verses: Verse[]; usedOn: string[] };
export type MassSummary = {
  id: number; date: string;
  entries: { sectionTypeId: number; position: number; songId: number; title: string }[];
};
export type Stats = { songs: number; masses: number; sections: number; lastMassDate: string | null };
// export type Me = { email: string | null; editor: boolean };
//export type Session = { token: string; email: string; editor: boolean };

export type AppRole = "admin" | "editor";

export type AppUser = {
  id: string;
  email: string;
  role: AppRole;
  active: boolean;
};

export type Me = {
  email: string | null;
  editor: boolean;
  admin: boolean;
};

export type Session = {
  token: string;
  email: string;
  editor: boolean;
  admin: boolean;
};

export type PreviewStatus = {
  ok: boolean | null; engine?: string; error?: string; hint?: string;
  template?: { path?: string; first_lines?: string[]; error?: string };
};

export type NewSongInput = {
  sectionId: number; title: string; melody?: string; psalmNumber?: number; refrain?: string; verses: string[];
};

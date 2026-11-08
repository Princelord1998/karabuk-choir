// Domain layer: pure types and rules. Imports nothing.

export type VerseKind = "refrain" | "verse" | "coda";
export type Verse = { kind: VerseKind; verseNo: number | null; text: string };

export type SectionType = { id: number; name: string; massOrder: number };
export type SongSummary = { id: number; sectionTypeId: number; title: string; melody: string | null };
export type Song = SongSummary & { psalmNumber: number | null; verses: Verse[] };

export type Mass = { id: number; date: string };
export type MassEntry = { sectionTypeId: number; position: number; songId: number };

export type ProgramEntry = { sectionTypeId: number; sectionName: string; position: number; song: Song };
export type Program = { date: string; community: string; entries: ProgramEntry[] };

export type NewSong = {
  sectionTypeId: number; title: string; melody: string | null; psalmNumber: number | null;
  refrain: string | null; verses: string[];
};

export type MassSummary = {
  id: number; date: string;
  entries: { sectionTypeId: number; position: number; songId: number; title: string }[];
};
export type SongDetail = Song & { usedOn: string[] };          // dates of the Masses that use the song
export type Stats = { songs: number; masses: number; sections: number; lastMassDate: string | null };
export type Session = {
  token: string;
  email: string;
  editor: boolean;
  admin: boolean;
};

export class ValidationError extends Error {}
export class UnauthorizedError extends Error {}   // not logged in / bad credentials
export class ForbiddenError extends Error {}      // logged in but not allowed to edit
export class ConflictError extends Error {
  existingId?: number;
}
export class NotFoundError extends Error {}

export const isIsoDate = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** refrain first, numbered verses in order, coda last */
export const sortVerses = (vs: Verse[]): Verse[] =>
  [...vs].sort(
    (a, b) =>
      Number(a.kind === "coda") - Number(b.kind === "coda") ||
      Number(a.kind !== "refrain") - Number(b.kind !== "refrain") ||
      (a.verseNo ?? 0) - (b.verseNo ?? 0),
  );

export const normalizeTitle = (t: string): string =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** "1. text" / "2- text" -> "text" (numbers are added by the program, not stored in the text) */
export const stripVerseNumber = (t: string): string => t.replace(/^\s*\d{1,2}\s*[.\-)]\s*/, "");

export type AppRole = "admin" | "editor";

export type AppUser = {
  id: string;
  email: string;
  role: AppRole;
  active: boolean;
};
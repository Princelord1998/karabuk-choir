// Ports: what the application needs from the outside world. Implemented in infrastructure/.
import type { Mass, MassEntry, MassSummary, NewSong, Program, SectionType, Song, SongSummary, AppUser } from "./entities.ts";

export interface SectionRepository {
  list(): Promise<SectionType[]>;
}

export interface SongRepository {
  findByIds(ids: number[]): Promise<Song[]>;
  search(query: string, sectionTypeId?: number, inLyrics?: boolean): Promise<SongSummary[]>;
  findExact(sectionTypeId: number, title: string): Promise<SongSummary | null>;   // same title in the same section
  create(song: NewSong): Promise<Song>;
  update(id: number, song: NewSong): Promise<Song>;
  remove(id: number): Promise<void>;
  usage(id: number): Promise<string[]>;                                            // dates of the Masses using it
  count(): Promise<number>;
}

export interface MassRepository {
  findByDate(date: string): Promise<Mass | null>;
  create(date: string): Promise<Mass>;
  listEntries(massId: number): Promise<MassEntry[]>;
  upsertEntry(massId: number, entry: MassEntry): Promise<void>;
  removeEntries(massId: number, sectionTypeId: number, position?: number): Promise<void>;
  replaceEntries(massId: number, entries: MassEntry[]): Promise<void>;
  listSummaries(limit: number, before?: string): Promise<MassSummary[]>;           // newest first; "before" = only older dates
  count(): Promise<number>;
}

export interface AuthService {
  login(email: string, password: string): Promise<{ token: string; email: string }>;   // throws UnauthorizedError
  verify(token: string): Promise<{ email: string } | null>;
}

export type RendererStatus = { ok: boolean | null; engine?: string; error?: string; hint?: string; template?: { path?: string; first_lines?: string[]; error?: string } };

export interface ProgramRenderer {
  status(): Promise<RendererStatus>;                  // which template is used and whether the Word->PDF preview works
  render(program: Program): Promise<Uint8Array>;      // PDF preview
  renderWord(program: Program): Promise<Uint8Array>;  // .docx made from the Word template
}

export interface UserRepository {
  list(): Promise<AppUser[]>;
  findByEmail(email: string): Promise<AppUser | null>;
  create(input: {
    email: string;
    password: string;
    role: "admin" | "editor";
  }): Promise<AppUser>;
  updateRole(id: string, role: "admin" | "editor"): Promise<AppUser>;
  setActive(id: string, active: boolean): Promise<AppUser>;
  remove(id: string): Promise<void>;
}
// Port: what the UI needs from a backend. The UI depends on this, not on fetch.
import type {
  AppUser, MassSummary, Me, NewSongInput, PreviewStatus, Program, Section, Session, SongDetail, SongSummary, Stats,
} from "../domain/types";

export interface ProgramGateway {
  // accounts
  me(): Promise<Me>;
  login(email: string, password: string): Promise<Session>;
  logout(): void;

  listAdminUsers(): Promise<AppUser[]>;
  createAdminUser(input: {
    email: string;
    password: string;
    role: "admin" | "editor";
  }): Promise<AppUser>;
  updateAdminUser(
    id: string,
    input: { role?: "admin" | "editor"; active?: boolean },
  ): Promise<AppUser>;
  deleteAdminUser(id: string): Promise<void>;
  
  // reading
  stats(): Promise<Stats>;
  listSections(): Promise<Section[]>;
  searchSongs(query: string, sectionId?: number, inLyrics?: boolean): Promise<SongSummary[]>;
  getSong(id: number): Promise<SongDetail>;
  listMasses(limit?: number, before?: string): Promise<MassSummary[]>;
  getProgram(date: string): Promise<Program>;
  previewStatus(): Promise<PreviewStatus>;
  pdfUrl(date: string, community: string): string;
  docxUrl(date: string, community: string): string;
  // writing (editors only). Errors may carry `existingId` (duplicate title).
  createSong(input: NewSongInput): Promise<SongSummary>;
  updateSong(id: number, input: NewSongInput): Promise<SongSummary>;
  deleteSong(id: number): Promise<void>;
  setSection(date: string, sectionId: number, songId: number, position: number): Promise<Program>;
  clearSection(date: string, sectionId: number, position: number): Promise<Program>;
  copyProgram(date: string, fromDate: string): Promise<Program>;      // load a complete Mass
}

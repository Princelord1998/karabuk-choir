// Application layer: use cases. Depends only on domain types and ports.
import {
  ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError, isIsoDate, sortVerses, stripVerseNumber,
  type NewSong, type Program, type ProgramEntry, type Session, type SongDetail, type Stats
} from "../domain/entities.ts";
import type { AuthService, MassRepository, ProgramRenderer, SectionRepository, SongRepository, UserRepository } from "../domain/ports.ts";

export type Deps = {
  sections: SectionRepository;
  songs: SongRepository;
  masses: MassRepository;
  renderer: ProgramRenderer;
  auth: AuthService;
  users: UserRepository;
  editors: string[];          // e-mails allowed to edit; empty = nobody can edit
  community: string;
};

/** Validate and clean what the form sends (never trust the browser). */
export const parseNewSong = (raw: any): NewSong => {
  const text = (v: unknown, max: number, what: string): string | null => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") throw new ValidationError(`${what} must be text`);
    const t = v.trim();
    if (t.length > max) throw new ValidationError(`${what} is too long (max ${max} characters)`);
    return t || null;
  };
  const sectionTypeId = Number(raw?.sectionId);
  if (!Number.isInteger(sectionTypeId) || sectionTypeId < 1) throw new ValidationError("sectionId is required");
  const title = text(raw?.title, 200, "title");
  if (!title) throw new ValidationError("title is required");
  let psalmNumber: number | null = null;
  if (raw?.psalmNumber !== undefined && raw?.psalmNumber !== null && raw?.psalmNumber !== "") {
    psalmNumber = Number(raw.psalmNumber);
    if (!Number.isInteger(psalmNumber) || psalmNumber < 1 || psalmNumber > 150) throw new ValidationError("psalmNumber must be 1-150");
  }
  const refrain = text(raw?.refrain, 5000, "refrain");
  if (raw?.verses !== undefined && !Array.isArray(raw.verses)) throw new ValidationError("verses must be a list");
  const verses = ((raw?.verses ?? []) as unknown[])
    .map((v) => text(v, 5000, "verse"))
    .map((v) => (v ? stripVerseNumber(v).trim() : ""))
    .filter(Boolean);
  if (verses.length > 30) throw new ValidationError("too many verses (max 30)");
  if (!refrain && verses.length === 0) throw new ValidationError("add at least a refrain or one verse");
  return { sectionTypeId, title, melody: text(raw?.melody, 200, "melody"), psalmNumber, refrain, verses };
};

export const createProgramUseCases = (d: Deps) => {
  const requireDate = (date: string) => {
    if (!isIsoDate(date)) throw new ValidationError("date must be YYYY-MM-DD");
  };

  const getProgram = async (date: string): Promise<Program> => {
    requireDate(date);
    const sections = await d.sections.list();
    const order = new Map(sections.map((s) => [s.id, s]));
    const mass = await d.masses.findByDate(date);
    const links = mass ? await d.masses.listEntries(mass.id) : [];
    const songs = await d.songs.findByIds([...new Set(links.map((l) => l.songId))]);
    const byId = new Map(songs.map((s) => [s.id, s]));
    const entries: ProgramEntry[] = [];
    for (const l of links) {
      const song = byId.get(l.songId);
      const section = order.get(l.sectionTypeId);
      if (song && section) {
        entries.push({
          sectionTypeId: section.id, sectionName: section.name, position: l.position,
          song: { ...song, verses: sortVerses(song.verses) },
        });
      }
    }
    entries.sort(
      (a, b) => order.get(a.sectionTypeId)!.massOrder - order.get(b.sectionTypeId)!.massOrder || a.position - b.position,
    );
    return { date, community: d.community, entries };
  };

  /** Put a song in a section of a Mass (creating the Mass if needed). */
  const setSection = async (date: string, sectionTypeId: number, songId: number, position = 1) => {
    requireDate(date);
    if (!Number.isInteger(position) || position < 1) throw new ValidationError("position must be >= 1");
    const sections = await d.sections.list();
    if (!sections.some((s) => s.id === sectionTypeId)) throw new NotFoundError(`section ${sectionTypeId}`);
    const [song] = await d.songs.findByIds([songId]);
    if (!song) throw new NotFoundError(`song ${songId}`);
    const mass = (await d.masses.findByDate(date)) ?? (await d.masses.create(date));
    await d.masses.upsertEntry(mass.id, { sectionTypeId, position, songId });
    return getProgram(date);
  };

  const clearSection = async (date: string, sectionTypeId: number, position?: number) => {
    requireDate(date);
    const mass = await d.masses.findByDate(date);
    if (mass) await d.masses.removeEntries(mass.id, sectionTypeId, position);
    return getProgram(date);
  };

  const withCommunity = async (date: string, community?: string): Promise<Program> => {
    const program = await getProgram(date);
    return { ...program, community: community?.trim() || program.community };
  };
  const renderPdf = async (date: string, community?: string) => d.renderer.render(await withCommunity(date, community));
  const renderWord = async (date: string, community?: string) => d.renderer.renderWord(await withCommunity(date, community));

  // ---------------------------------------------------------------- songs
  const checkSection = async (id: number) => {
    const sections = await d.sections.list();
    if (!sections.some((x) => x.id === id)) throw new NotFoundError(`section ${id}`);
  };
  const duplicate = (same: { id: number; title: string }) => {
    const err = new ConflictError(`« ${same.title} » existe déjà dans cette section`);
    err.existingId = same.id;
    return err;
  };

  /** Add a song that is not in the database yet. Refuses a title that already exists in that section. */
  const createSong = async (raw: unknown) => {
    const input = parseNewSong(raw);
    await checkSection(input.sectionTypeId);
    const same = await d.songs.findExact(input.sectionTypeId, input.title);
    if (same) throw duplicate(same);
    return d.songs.create(input);
  };

  const getSong = async (id: number): Promise<SongDetail> => {
    const [song] = await d.songs.findByIds([id]);
    if (!song) throw new NotFoundError(`song ${id}`);
    return { ...song, verses: sortVerses(song.verses), usedOn: await d.songs.usage(id) };
  };

  const updateSong = async (id: number, raw: unknown) => {
    const input = parseNewSong(raw);
    const [existing] = await d.songs.findByIds([id]);
    if (!existing) throw new NotFoundError(`song ${id}`);
    await checkSection(input.sectionTypeId);
    const same = await d.songs.findExact(input.sectionTypeId, input.title);
    if (same && same.id !== id) throw duplicate(same);
    return d.songs.update(id, input);
  };

  const deleteSong = async (id: number) => {
    const used = await d.songs.usage(id);
    if (used.length) throw new ConflictError(`Ce chant est utilisé dans ${used.length} messe(s) (dernière : ${used[0]}). Retirez-le d'abord des programmes.`);
    await d.songs.remove(id);
  };

  // ---------------------------------------------------------------- masses
  const listMasses = (limit = 40, before?: string) => {
    if (before !== undefined) requireDate(before);
    return d.masses.listSummaries(Math.min(Math.max(limit, 1), 60), before);
  };

  /** Copy every song of a whole Mass into another date (replaces what the target date had). */
  const copyProgram = async (targetDate: string, sourceDate: string) => {
    requireDate(targetDate);
    requireDate(sourceDate);
    if (targetDate === sourceDate) return getProgram(targetDate);
    const source = await d.masses.findByDate(sourceDate);
    if (!source) throw new NotFoundError(`Aucune messe le ${sourceDate}`);
    const entries = await d.masses.listEntries(source.id);
    const target = (await d.masses.findByDate(targetDate)) ?? (await d.masses.create(targetDate));
    await d.masses.replaceEntries(target.id, entries);
    return getProgram(targetDate);
  };

  const stats = async (): Promise<Stats> => {
    const [songs, masses, sections, latest] = await Promise.all([
      d.songs.count(), d.masses.count(), d.sections.list(), d.masses.listSummaries(1),
    ]);
    return { songs, masses, sections: sections.length, lastMassDate: latest[0]?.date ?? null };
  };

  // ---------------------------------------------------------------- accounts
  const isEditor = (email: string) => d.editors.includes(email.toLowerCase());

  const login = async (email: unknown, password: unknown): Promise<Session> => {
    if (typeof email !== "string" || typeof password !== "string" || !email || !password)
      throw new ValidationError("email and password are required");
    const { token, email: confirmed } = await d.auth.login(email.trim(), password);
    const profile = await d.users.findByEmail(confirmed);
    if (profile) {
      if (!profile.active) throw new UnauthorizedError("Ce compte est désactivé");
      return {
        token,
        email: confirmed,
        editor: profile.role === "editor" || profile.role === "admin",
        admin: profile.role === "admin",
      };
    }

    // Compatibilité temporaire avec les anciennes installations ADMIN_EMAILS.
    if (!isEditor(confirmed)) throw new UnauthorizedError("Ce compte n'est pas autorisé");
    return { token, email: confirmed, editor: true, admin: false };
  };

  const whoami = async (token: string | null) => {
  if (!token) return null;

  const authUser = await d.auth.verify(token);
  if (!authUser) return null;

  const profile = await d.users.findByEmail(authUser.email);
  if (!profile) {
    if (!isEditor(authUser.email)) return null;
    return {
      id: "",
      email: authUser.email,
      editor: true,
      admin: false,
    };
  }
  if (!profile.active) return null;

  return {
    id: profile.id,
    email: profile.email,
    editor: profile.role === "editor" || profile.role === "admin",
    admin: profile.role === "admin",
  };
};

const assertEditor = async (token: string | null) => {
  const me = await whoami(token);
  if (!me) throw new UnauthorizedError("Connexion requise");
  if (!me.editor) throw new ForbiddenError("Droit de modification requis");
  return me;
};

const assertAdmin = async (token: string | null) => {
  const me = await whoami(token);
  if (!me) throw new UnauthorizedError("Connexion requise");
  if (!me.admin) throw new ForbiddenError("Droit administrateur requis");
  return me;
};

const listUsers = () => d.users.list();

const createUser = async (raw: any) => {
  const email = String(raw?.email ?? "").trim().toLowerCase();
  const password = String(raw?.password ?? "");
  const role = raw?.role;

  if (!email || !email.includes("@")) {
    throw new ValidationError("E-mail invalide");
  }

  if (password.length < 6) {
    throw new ValidationError("Le mot de passe doit contenir au moins 6 caractères");
  }

  if (role !== "admin" && role !== "editor") {
    throw new ValidationError("Le rôle doit être admin ou editor");
  }

  return d.users.create({ email, password, role });
};

const updateUser = async (
  id: string,
  raw: { role?: "admin" | "editor"; active?: boolean },
) => {
  let user;

  if (raw.role) {
    user = await d.users.updateRole(id, raw.role);
  }

  if (typeof raw.active === "boolean") {
    user = await d.users.setActive(id, raw.active);
  }

  if (!user) {
    throw new ValidationError("Aucune modification demandée");
  }

  return user;
};

const deleteUser = async (
  token: string | null,
  id: string,
) => {
  const admin = await assertAdmin(token);

  if (admin.id === id) {
    throw new ValidationError(
      "Vous ne pouvez pas supprimer votre propre compte.",
    );
  }

  const users = await d.users.list();
  const target = users.find((user) => user.id === id);

  if (!target) {
    throw new NotFoundError("Utilisateur introuvable");
  }

  if (target.role === "admin") {
    const activeAdmins = users.filter(
      (user) =>
        user.active &&
        user.role === "admin" &&
        user.id !== id,
    );

    if (activeAdmins.length === 0) {
      throw new ValidationError(
        "Il doit rester au moins un administrateur actif.",
      );
    }
  }

  await d.users.remove(id);
};

  return {
  login,
  whoami,
  assertEditor,
  assertAdmin,

   // Admin methods
  listUsers,
  createUser,
  updateUser,
  deleteUser,

  createSong,
  getSong,
  updateSong,
  deleteSong,

  listMasses,
  copyProgram,
  stats,

  listSections: () => d.sections.list(),
  previewStatus: () => d.renderer.status(),

  searchSongs: (q: string, sectionTypeId?: number, inLyrics = false) =>
    d.songs.search(q.trim(), sectionTypeId, inLyrics),

  getProgram,
  setSection,
  clearSection,
  renderPdf,
  renderWord,
};

};

export type ProgramUseCases = ReturnType<typeof createProgramUseCases>;

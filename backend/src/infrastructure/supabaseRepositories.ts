// Adapter: Postgres via Supabase's REST API (PostgREST). Plain fetch, no SDK.
import {
  sortVerses,
  type AppUser, type Mass, type MassEntry, type MassSummary, type NewSong, type SectionType, type Song, type SongSummary, type Verse,
} from "../domain/entities.ts";
import type { MassRepository, SectionRepository, SongRepository, UserRepository } from "../domain/ports.ts";

type Row = Record<string, any>;
const enc = encodeURIComponent;
const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];

const client = (url: string, key: string) => {
  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const call = async (method: string, path: string, body?: unknown, prefer?: string): Promise<Row[]> => {
    const res = await fetch(`${base}/${path}`, {
      method, headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split("?")[0]} -> ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  };
  const count = async (table: string): Promise<number> => {
    const res = await fetch(`${base}/${table}?select=id`, { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } });
    if (!res.ok) throw new Error(`Supabase count ${table} -> ${res.status} ${await res.text()}`);
    return Number((res.headers.get("content-range") ?? "").split("/")[1]) || 0;     // "0-0/709"
  };
  return { call, count };
};

const summary = (r: Row): SongSummary => ({ id: r.id, sectionTypeId: r.section_type_id, title: r.title, melody: r.melody || null });
const SUMMARY = "id,section_type_id,title,melody";

export const createSupabaseRepositories = (url: string, key: string) => {
  const { call, count } = client(url, key);
  const authBase = `${url.replace(/\/$/, "")}/auth/v1`;

  const authAdmin = async (method: string, path: string, body?: unknown): Promise<Row> => {
    const res = await fetch(`${authBase}/admin${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Supabase Auth ${method} ${path} -> ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  };

  const appUser = (row: Row): AppUser => ({
    id: row.id as string,
    email: String(row.email).toLowerCase(),
    role: row.role === "admin" ? "admin" : "editor",
    active: row.active !== false,
  });

  const sections: SectionRepository = {
    list: async (): Promise<SectionType[]> =>
      (await call("GET", "section_types?select=id,name,mass_order&order=mass_order")).map((r) => ({
        id: r.id, name: r.name, massOrder: r.mass_order,
      })),
  };

  const verseRows = (songId: number, n: NewSong) => [
    ...(n.refrain ? [{ song_id: songId, kind: "refrain", verse_no: null, text: n.refrain }] : []),
    ...n.verses.map((t, i) => ({ song_id: songId, kind: "verse", verse_no: i + 1, text: t })),
  ];

  const songs: SongRepository = {
    findByIds: async (ids): Promise<Song[]> => {
      if (!ids.length) return [];
      const rows = await call("GET", `songs?id=in.(${ids.join(",")})&select=id,section_type_id,title,melody,psalm_number,verses(kind,verse_no,text)&limit=1000`);
      return rows.map((r) => ({
        ...summary(r), psalmNumber: r.psalm_number ?? null,
        verses: sortVerses((r.verses as Row[]).map((v): Verse => ({ kind: v.kind, verseNo: v.verse_no, text: v.text }))),
      }));
    },

    search: async (q, sectionTypeId, inLyrics) => {
      const safe = q.replace(/[,()*%\\]/g, " ").trim();
      const sec = sectionTypeId ? `&section_type_id=eq.${sectionTypeId}` : "";
      const head = `songs?select=${SUMMARY}&order=title&limit=100`;
      let rows = await call("GET", safe ? `${head}&or=(title.ilike.*${enc(safe)}*,melody.ilike.*${enc(safe)}*)${sec}` : `${head}${sec}`);
      if (inLyrics && safe) {                       // also look inside the lyrics
        const hits = await call("GET", `verses?text=ilike.*${enc(safe)}*&select=song_id&limit=500`);
        const known = new Set(rows.map((r) => r.id));
        const more = unique(hits.map((h) => h.song_id as number)).filter((id) => !known.has(id)).slice(0, 150);
        if (more.length) rows = rows.concat(await call("GET", `songs?id=in.(${more.join(",")})&select=${SUMMARY}&order=title${sec}`));
      }
      return rows.map(summary);
    },

    findExact: async (sectionTypeId, title) => {
      const like = title.trim().replace(/[\\%_*]/g, (c) => `\\${c}`);
      const [r] = await call("GET", `songs?section_type_id=eq.${sectionTypeId}&title=ilike.${enc(like)}&select=${SUMMARY}&limit=1`);
      return r ? summary(r) : null;
    },

    create: async (n: NewSong): Promise<Song> => {
      const [row] = await call(
        "POST", "songs",
        { section_type_id: n.sectionTypeId, title: n.title, melody: n.melody, psalm_number: n.psalmNumber },
        "return=representation",
      );
      const rows = verseRows(row.id, n);
      try {
        await call("POST", "verses", rows);
      } catch (e) {
        await call("DELETE", `songs?id=eq.${row.id}`).catch(() => undefined);   // never leave a song without its lyrics
        throw e;
      }
      const verses: Verse[] = rows.map((r) => ({ kind: r.kind as Verse["kind"], verseNo: r.verse_no, text: r.text }));
      return { ...summary(row), psalmNumber: n.psalmNumber, verses };
    },

    update: async (id, n): Promise<Song> => {
      await call("PATCH", `songs?id=eq.${id}`, { section_type_id: n.sectionTypeId, title: n.title, melody: n.melody, psalm_number: n.psalmNumber });
      const old = (await call("GET", `verses?song_id=eq.${id}&select=id&limit=1000`)).map((r) => r.id as number);
      await call("POST", "verses", verseRows(id, n));                      // new lyrics first ...
      if (old.length) await call("DELETE", `verses?id=in.(${old.join(",")})`);   // ... then drop the old ones
      return (await songs.findByIds([id]))[0];
    },

    remove: async (id) => { await call("DELETE", `songs?id=eq.${id}`); },   // verses go with it (on delete cascade)

    usage: async (id) => {
      const ids = unique((await call("GET", `mass_songs?song_id=eq.${id}&select=mass_id&limit=1000`)).map((r) => r.mass_id as number));
      if (!ids.length) return [];
      return (await call("GET", `masses?id=in.(${ids.join(",")})&select=mass_date&order=mass_date.desc&limit=1000`)).map((r) => r.mass_date as string);
    },

    count: () => count("songs"),
  };

  const links = (massId: number, es: MassEntry[]) =>
    es.map((e) => ({ mass_id: massId, section_type_id: e.sectionTypeId, position: e.position, song_id: e.songId }));
  const entryOf = (r: Row): MassEntry => ({ sectionTypeId: r.section_type_id, position: r.position, songId: r.song_id });

  const masses: MassRepository = {
    findByDate: async (date): Promise<Mass | null> => {
      const [r] = await call("GET", `masses?mass_date=eq.${date}&select=id,mass_date&order=id&limit=1`);
      return r ? { id: r.id, date: r.mass_date } : null;
    },
    create: async (date) => {
      const [r] = await call("POST", "masses", { mass_date: date }, "return=representation");
      return { id: r.id, date: r.mass_date };
    },
    listEntries: async (massId): Promise<MassEntry[]> =>
      (await call("GET", `mass_songs?mass_id=eq.${massId}&select=section_type_id,position,song_id&limit=1000`)).map(entryOf),
    upsertEntry: async (massId, e) => {
      await call("POST", "mass_songs?on_conflict=mass_id,section_type_id,position", links(massId, [e]), "resolution=merge-duplicates");
    },
    removeEntries: async (massId, sectionTypeId, position) => {
      await call("DELETE", `mass_songs?mass_id=eq.${massId}&section_type_id=eq.${sectionTypeId}${position ? `&position=eq.${position}` : ""}`);
    },
    replaceEntries: async (massId, entries) => {
      const before = await masses.listEntries(massId);
      await call("DELETE", `mass_songs?mass_id=eq.${massId}`);
      if (!entries.length) return;
      try {
        await call("POST", "mass_songs", links(massId, entries));
      } catch (e) {                                  // put the old program back rather than lose it
        if (before.length) await call("POST", "mass_songs", links(massId, before)).catch(() => undefined);
        throw e;
      }
    },
    listSummaries: async (limit, before): Promise<MassSummary[]> => {
      const ms = await call("GET", `masses?select=id,mass_date&order=mass_date.desc,id.desc&limit=${limit}${before ? `&mass_date=lt.${before}` : ""}`);
      if (!ms.length) return [];
      const ls = await call("GET", `mass_songs?mass_id=in.(${ms.map((m) => m.id).join(",")})&select=mass_id,section_type_id,position,song_id&limit=1000`);
      const ids = unique(ls.map((l) => l.song_id as number));
      const titles = new Map<number, string>(
        ids.length ? (await call("GET", `songs?id=in.(${ids.join(",")})&select=id,title&limit=1000`)).map((s) => [s.id, s.title] as [number, string]) : [],
      );
      return ms.map((m) => ({
        id: m.id, date: m.mass_date,
        entries: ls.filter((l) => l.mass_id === m.id).map((l) => ({ ...entryOf(l), title: titles.get(l.song_id) ?? "?" })),
      }));
    },
    count: () => count("masses"),
  };

  const users: UserRepository = {
    list: async () =>
      (await call("GET", "app_users?select=id,email,role,active&order=email.asc")).map(appUser),

    findByEmail: async (email) => {
      const normalized = email.trim().toLowerCase();
      const [row] = await call(
        "GET",
        `app_users?email=eq.${enc(normalized)}&select=id,email,role,active&limit=1`,
      );
      return row ? appUser(row) : null;
    },

    create: async (input) => {
      const email = input.email.trim().toLowerCase();
      const authUser = await authAdmin("POST", "/users", {
        email,
        password: input.password,
        email_confirm: true,
      });

      try {
        const [row] = await call(
          "POST",
          "app_users",
          { id: authUser.id, email, role: input.role, active: true },
          "return=representation",
        );
        return appUser(row);
      } catch (e) {
        await authAdmin("DELETE", `/users/${enc(authUser.id as string)}`).catch(() => undefined);
        throw e;
      }
    },

    updateRole: async (id, role) => {
      const [row] = await call(
        "PATCH",
        `app_users?id=eq.${enc(id)}`,
        { role },
        "return=representation",
      );
      if (!row) throw new Error(`Utilisateur introuvable: ${id}`);
      return appUser(row);
    },

    setActive: async (id, active) => {
      const [row] = await call(
        "PATCH",
        `app_users?id=eq.${enc(id)}`,
        { active },
        "return=representation",
      );
      if (!row) throw new Error(`Utilisateur introuvable: ${id}`);

      await authAdmin("PUT", `/users/${enc(id)}`, {
        ban_duration: active ? "none" : "876000h",
      });
      return appUser(row);
    },

    remove: async (id) => {
      await authAdmin("DELETE", `/users/${enc(id)}`);
    },
  };

return { sections, songs, masses, users };
};

// End-to-end test: real use cases + real Supabase adapters + real HTTP server, against a mock Supabase loaded with your data.
import { createProgramUseCases } from "../src/application/programUseCases.ts";
import { createSupabaseRepositories } from "../src/infrastructure/supabaseRepositories.ts";
import { createSupabaseAuth } from "../src/infrastructure/supabaseAuth.ts";
import { createHttpServer } from "../src/interface/http.ts";
import { startMock } from "./mockSupabase.ts";

const mock = await startMock(process.argv[2] ?? "../data", 4010, { "admin@choir.test": "secret", "other@choir.test": "pass" });
const uc = createProgramUseCases({
  ...createSupabaseRepositories("http://localhost:4010", "service"),
  auth: createSupabaseAuth("http://localhost:4010", "anon"),
  editors: ["admin@choir.test"], community: "TEST",
  renderer: { status: async () => ({ ok: true }), render: async () => new Uint8Array([1]), renderWord: async () => new Uint8Array([2]) },
});
const server = createHttpServer(uc);
await new Promise<void>((ok) => server.listen(4011, ok));

const B = "http://localhost:4011";
let failed = 0, passed = 0;
const call = async (method: string, path: string, body?: unknown, token?: string) => {
  const res = await fetch(B + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
};
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++; else { failed++; console.log("  FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 200) : ""); }
};

// ---------- reads
const sections = await call("GET", "/api/sections");
check("13 sections", sections.json.length === 13, sections.status);
const stats = await call("GET", "/api/stats");
check("stats counts", stats.json.songs > 600 && stats.json.masses > 70 && !!stats.json.lastMassDate, stats.json);

// ---------- accounts
check("bad password -> 401", (await call("POST", "/api/login", { email: "admin@choir.test", password: "nope" })).status === 401);
const admin = (await call("POST", "/api/login", { email: "admin@choir.test", password: "secret" })).json;
const other = (await call("POST", "/api/login", { email: "other@choir.test", password: "pass" })).json;
check("admin is editor", admin.editor === true && !!admin.token, admin);
check("other is not editor", other.editor === false, other);
check("/api/me", (await call("GET", "/api/me", undefined, admin.token)).json.email === "admin@choir.test");
check("/api/me anonymous", (await call("GET", "/api/me")).json.email === null);
const newSong = { sectionId: 1, title: "Chant de test", melody: "Mélodie", refrain: "Refrain un", verses: ["1. Un", "2- Deux"] };
check("write without login -> 401", (await call("POST", "/api/songs", newSong)).status === 401);
check("write as non-editor -> 403", (await call("POST", "/api/songs", newSong, other.token)).status === 403);
check("fake token -> 401", (await call("POST", "/api/songs", newSong, "bogus")).status === 401);

// ---------- songs
const byTitle = await call("GET", "/api/songs?q=sanctus&sectionId=8");
check("search by title", byTitle.json.length > 0 && byTitle.json.every((s: any) => s.sectionTypeId === 8), byTitle.json.length);
const sample = mock.db.verses.find((v) => v.kind === "verse" && /\w{8,}/.test(v.text))!;
const word = sample.text.match(/[A-Za-zÀ-ÿ]{8,}/)![0];
const songRow = mock.db.songs.find((s) => s.id === sample.song_id)!;
const inLyrics = await call("GET", `/api/songs?q=${encodeURIComponent(word)}&lyrics=1`);
check("search inside lyrics finds the song", inLyrics.json.some((s: any) => s.id === songRow.id), { word, n: inLyrics.json.length });
const created = await call("POST", "/api/songs", newSong, admin.token);
check("create -> 201", created.status === 201 && created.json.id > 0, created);
const id = created.json.id;
const dup = await call("POST", "/api/songs", { ...newSong, title: "CHANT DE TEST " }, admin.token);
check("duplicate -> 409 with existingId", dup.status === 409 && dup.json.existingId === id, dup);
check("invalid -> 400", (await call("POST", "/api/songs", { sectionId: 1, title: "x" }, admin.token)).status === 400);
const detail = await call("GET", `/api/songs/${id}`);
check("detail has numbered verses, no usage", detail.json.verses.length === 3 && detail.json.verses[0].kind === "refrain" && detail.json.verses[1].text === "Un" && detail.json.usedOn.length === 0, detail.json);
const upd = await call("PUT", `/api/songs/${id}`, { sectionId: 2, title: "Chant modifié", refrain: "Nouveau refrain", verses: ["Seul couplet"] }, admin.token);
check("update -> 200", upd.status === 200 && upd.json.title === "Chant modifié", upd);
const after = (await call("GET", `/api/songs/${id}`)).json;
check("update replaced lyrics and section", after.sectionTypeId === 2 && after.verses.length === 2 && after.verses[1].text === "Seul couplet", after);
check("no orphan verses after update", mock.db.verses.filter((v) => v.song_id === id).length === 2);
const other2 = await call("POST", "/api/songs", { sectionId: 2, title: "Autre", refrain: "x" }, admin.token);
check("rename to an existing title -> 409", (await call("PUT", `/api/songs/${other2.json.id}`, { sectionId: 2, title: "chant modifié", refrain: "x" }, admin.token)).status === 409);

// ---------- masses
const masses = await call("GET", "/api/masses?limit=5");
check("masses newest first", masses.json.length === 5 && masses.json[0].date >= masses.json[1].date && masses.json[0].entries[0].title, masses.json[0]);
const older = await call("GET", `/api/masses?limit=5&before=${masses.json[4].date}`);
check("paging with before", older.json.length === 5 && older.json.every((m: any) => m.date < masses.json[4].date));
const src = mock.db.masses.find((m) => m.mass_date === "2025-04-27")!;
const srcCount = mock.db.mass_songs.filter((l) => l.mass_id === src.id).length;
const copied = await call("POST", "/api/masses/2030-01-06/copy", { fromDate: "2025-04-27" }, admin.token);
check("copy a complete Mass", copied.status === 200 && copied.json.entries.length === srcCount && srcCount > 5, { n: copied.json.entries?.length, srcCount });
check("copy needs login", (await call("POST", "/api/masses/2030-01-06/copy", { fromDate: "2025-04-27" })).status === 401);
check("copy from unknown date -> 404", (await call("POST", "/api/masses/2030-01-06/copy", { fromDate: "1999-01-01" }, admin.token)).status === 404);
const tgt = mock.db.masses.find((m) => m.mass_date === "2030-01-06")!;
const again = await call("POST", "/api/masses/2030-01-06/copy", { fromDate: "2025-04-27" }, admin.token);
check("copy twice does not duplicate", mock.db.mass_songs.filter((l) => l.mass_id === tgt.id).length === srcCount && again.status === 200);

// ---------- program editing + usage + delete rules
const set = await call("PUT", "/api/masses/2030-01-06/sections/2", { songId: id }, admin.token);
check("set a section", set.status === 200 && set.json.entries.some((e: any) => e.song.id === id), set.status);
check("usage shows the date", (await call("GET", `/api/songs/${id}`)).json.usedOn.includes("2030-01-06"));
check("cannot delete a used song -> 409", (await call("DELETE", `/api/songs/${id}`, undefined, admin.token)).status === 409);
await call("DELETE", "/api/masses/2030-01-06/sections/2?position=1", undefined, admin.token);
const del = await call("DELETE", `/api/songs/${id}`, undefined, admin.token);
check("delete an unused song", del.status === 200 && !mock.db.songs.some((s) => s.id === id) && !mock.db.verses.some((v) => v.song_id === id), del);
check("pdf + docx", (await fetch(`${B}/api/masses/2025-04-27/program.pdf`)).status === 200 && (await fetch(`${B}/api/masses/2025-04-27/program.docx`)).status === 200);

console.log(`${passed} passed, ${failed} failed`);
server.close(); mock.close();
process.exit(failed ? 1 : 0);

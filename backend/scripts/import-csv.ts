// Load the CSV export (songs, verses, masses, program choices) into Supabase.
//   npm run import                 (reads ../data, refuses to run if the tables already contain data)
//   npm run import -- ../data --wipe   (empties songs/verses/masses/mass_songs first)
import { pathToFileURL } from "node:url";
import { readCsv } from "./csv.ts";

type Row = Record<string, any>;
const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const nul = (v: string) => (v === "" ? null : v);
const num = (v: string) => (v === "" ? null : Number(v));

export const runImport = async (opts: { url: string; key: string; folder: string; wipe?: boolean; log?: (m: string) => void }) => {
  const log = opts.log ?? console.log;
  const base = `${opts.url.replace(/\/$/, "")}/rest/v1`;
  const headers = { apikey: opts.key, Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" };
  const call = async (method: string, path: string, body?: unknown, prefer?: string): Promise<Row[]> => {
    const res = await fetch(`${base}/${path}`, { method, headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} -> ${res.status} ${await res.text()}`);
    const t = await res.text();
    return t ? JSON.parse(t) : [];
  };
  const count = async (t: string) => {
    const res = await fetch(`${base}/${t}?select=id`, { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } });
    return Number((res.headers.get("content-range") ?? "").split("/")[1]) || 0;
  };

  if (opts.wipe) {
    log("Emptying mass_songs, verses, masses, songs ...");
    await call("DELETE", "mass_songs?mass_id=gt.0");
    await call("DELETE", "verses?id=gt.0");
    await call("DELETE", "masses?id=gt.0");
    await call("DELETE", "songs?id=gt.0");
  } else if ((await count("songs")) > 0 || (await count("masses")) > 0) {
    throw new Error("The tables already contain data. Run again with --wipe to replace it (npm run import -- ../data --wipe).");
  }

  // sections: keep the ones that exist, add the missing ones, map CSV id -> database id
  const csvSections = readCsv(opts.folder, "section_types.csv");
  await call("POST", "section_types?on_conflict=name", csvSections.map((r) => ({ name: r.name, mass_order: Number(r.mass_order) })), "resolution=ignore-duplicates");
  const dbSections = new Map((await call("GET", "section_types?select=id,name&limit=1000")).map((r) => [r.name as string, r.id as number]));
  const sectionId = new Map(csvSections.map((r) => [r.id, dbSections.get(r.name)!]));
  log(`sections: ${dbSections.size}`);

  // songs (the database assigns new ids; we keep a map old id -> new id)
  const songRows = readCsv(opts.folder, "songs.csv");
  const songId = new Map<string, number>();
  for (const part of chunk(songRows, 200)) {
    const made = await call("POST", "songs", part.map((r) => ({ section_type_id: sectionId.get(r.section_type_id), title: r.title, melody: nul(r.melody), language: nul(r.language), psalm_number: num(r.psalm_number) })), "return=representation");
    part.forEach((r, i) => songId.set(r.id, made[i].id));
  }
  log(`songs: ${songId.size}`);

  const verseRows = readCsv(opts.folder, "verses.csv");
  for (const part of chunk(verseRows, 400))
    await call("POST", "verses", part.map((r) => ({ song_id: songId.get(r.song_id), kind: r.kind, verse_no: num(r.verse_no), text: r.text })));
  log(`verses: ${verseRows.length}`);

  const massRows = readCsv(opts.folder, "masses.csv");
  const massId = new Map<string, number>();
  for (const part of chunk(massRows, 200)) {
    const made = await call("POST", "masses", part.map((r) => ({ mass_date: r.mass_date, occasion: nul(r.occasion ?? ""), notes: nul(r.notes ?? "") })), "return=representation");
    part.forEach((r, i) => massId.set(r.id, made[i].id));
  }
  log(`masses: ${massId.size}`);

  const linkRows = readCsv(opts.folder, "mass_songs.csv");
  for (const part of chunk(linkRows, 400))
    await call("POST", "mass_songs", part.map((r) => ({ mass_id: massId.get(r.mass_id), section_type_id: sectionId.get(r.section_type_id), position: Number(r.position), song_id: songId.get(r.song_id) })));
  log(`mass_songs: ${linkRows.length}`);
  return { songs: songId.size, verses: verseRows.length, masses: massId.size, links: linkRows.length };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Set SUPABASE_URL and SUPABASE_KEY in backend/.env"); process.exit(1); }
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  runImport({ url: SUPABASE_URL, key: SUPABASE_KEY, folder: args[0] ?? "../data", wipe: process.argv.includes("--wipe") })
    .then((r) => console.log("Done:", r))
    .catch((e) => { console.error("Import failed:", e.message); process.exit(1); });
}

import { startMock } from "./mockSupabase.ts";
import { runImport } from "../scripts/import-csv.ts";
import { readCsv } from "../scripts/csv.ts";

const mock = await startMock(null, 4012, {});
const folder = process.argv[2] ?? "../data";
const r = await runImport({ url: "http://localhost:4012", key: "k", folder, log: () => {} });
const csv = { songs: readCsv(folder, "songs.csv"), verses: readCsv(folder, "verses.csv"), masses: readCsv(folder, "masses.csv"), links: readCsv(folder, "mass_songs.csv") };
let bad = 0; const check = (n: string, ok: boolean) => { if (!ok) { bad++; console.log("FAIL:", n); } };
check("songs count", mock.db.songs.length === csv.songs.length);
check("verses count", mock.db.verses.length === csv.verses.length);
check("masses count", mock.db.masses.length === csv.masses.length);
check("links count", mock.db.mass_songs.length === csv.links.length);
check("13 sections", mock.db.section_types.length === 13);
// a whole Mass keeps the same songs after re-numbering
const csvMass = csv.masses.find((m) => m.mass_date === "2025-04-27")!;
const want = csv.links.filter((l) => l.mass_id === csvMass.id).map((l) => csv.songs.find((s) => s.id === l.song_id)!.title).sort();
const dbMass = mock.db.masses.find((m) => m.mass_date === "2025-04-27")!;
const got = mock.db.mass_songs.filter((l) => l.mass_id === dbMass.id).map((l) => mock.db.songs.find((s) => s.id === l.song_id)!.title).sort();
check("same songs in the 27 April 2025 Mass", JSON.stringify(want) === JSON.stringify(got));
// lyrics follow their song
const aSong = csv.songs[100]; const dbSong = mock.db.songs.find((s) => s.title === aSong.title && s.section_type_id === mock.db.section_types.find((x) => x.name === readCsv(folder, "section_types.csv").find((y) => y.id === aSong.section_type_id)!.name)!.id)!;
check("verses attached to the right song", mock.db.verses.filter((v) => v.song_id === dbSong.id).length === csv.verses.filter((v) => v.song_id === aSong.id).length);
// refuses to run twice, --wipe replaces
let refused = false; try { await runImport({ url: "http://localhost:4012", key: "k", folder, log: () => {} }); } catch { refused = true; }
check("second import refused", refused);
await runImport({ url: "http://localhost:4012", key: "k", folder, wipe: true, log: () => {} });
check("wipe then import gives the same counts", mock.db.songs.length === csv.songs.length && mock.db.mass_songs.length === csv.links.length && mock.db.section_types.length === 13);
console.log(bad ? `${bad} FAILED` : "import: all checks passed", r);
mock.close(); process.exit(bad ? 1 : 0);

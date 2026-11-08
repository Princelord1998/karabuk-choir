// A small stand-in for Supabase (PostgREST + Auth) used only by the tests, loaded from the CSV export.
import { createServer } from "node:http";
import { readCsv } from "../scripts/csv.ts";

type Row = Record<string, any>;
const NUM = new Set(["id", "section_type_id", "mass_order", "psalm_number", "verse_no", "position", "mass_id", "song_id"]);
const conv = (k: string, v: string) => (v === "" ? null : NUM.has(k) ? Number(v) : v);
const load = (folder: string, f: string): Row[] => readCsv(folder, f).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, conv(k, v)])));

const PK: Record<string, string[]> = { mass_songs: ["mass_id", "section_type_id", "position"] };
const FK_CHILDREN: Record<string, { table: string; col: string; cascade: boolean }[]> = {
  songs: [{ table: "verses", col: "song_id", cascade: true }, { table: "mass_songs", col: "song_id", cascade: false }],
  masses: [{ table: "mass_songs", col: "mass_id", cascade: true }],
};

const splitTop = (s: string): string[] => {           // split on commas that are not inside parentheses
  const out: string[] = []; let depth = 0, cur = "";
  for (const c of s) {
    if (c === "(") depth++; if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
};
const likeRegex = (p: string) => {
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\" && i + 1 < p.length) re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "*" || c === "%") re += ".*";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "is");
};
const test = (row: Row, col: string, expr: string): boolean => {
  const dot = expr.indexOf("."); const op = expr.slice(0, dot); const val = expr.slice(dot + 1);
  const v = row[col];
  switch (op) {
    case "eq": return String(v) === val;
    case "in": return val.slice(1, -1).split(",").includes(String(v));
    case "ilike": return typeof v === "string" && likeRegex(val).test(v);
    case "lt": return v !== null && v < (typeof v === "number" ? Number(val) : val);
    case "gt": return v !== null && v > (typeof v === "number" ? Number(val) : val);
    default: throw new Error(`mock: unsupported operator ${op}`);
  }
};

export const startMock = async (folder: string | null, port: number, users: Record<string, string>) => {
  const db: Record<string, Row[]> = folder === null ? { section_types: [], masses: [], songs: [], verses: [], mass_songs: [] } : {
    section_types: load(folder, "section_types.csv"), masses: load(folder, "masses.csv"), songs: load(folder, "songs.csv"),
    verses: load(folder, "verses.csv"), mass_songs: load(folder, "mass_songs.csv"),
  };
  const nextId = (t: string) => Math.max(0, ...db[t].map((r) => r.id)) + 1;
  const sessions = new Map<string, string>();         // token -> email

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const body = await new Promise<string>((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
    const out = (status: number, data?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };
    try {
      // ---- auth
      if (url.pathname === "/auth/v1/token") {
        const { email, password } = JSON.parse(body);
        if (users[email] !== password) return out(400, { error: "invalid_grant" });
        const token = `tok-${email}-${sessions.size}`; sessions.set(token, email);
        return out(200, { access_token: token, user: { email } });
      }
      if (url.pathname === "/auth/v1/user") {
        const email = sessions.get((req.headers.authorization ?? "").slice(7));
        return email ? out(200, { email }) : out(401, { msg: "invalid JWT" });
      }
      // ---- rest
      const table = url.pathname.replace("/rest/v1/", "");
      if (!db[table]) return out(404, { message: `no table ${table}` });
      const reserved = new Set(["select", "order", "limit", "offset", "on_conflict", "or"]);
      const matches = (r: Row) => {
        for (const [k, v] of url.searchParams) if (!reserved.has(k) && !test(r, k, v)) return false;
        const or = url.searchParams.get("or");
        if (or) return splitTop(or.slice(1, -1)).some((c) => { const [col, ...rest] = c.split("."); return test(r, col, rest.join(".")); });
        return true;
      };
      const project = (r: Row) => {
        const sel = url.searchParams.get("select");
        if (!sel || sel === "*") return r;
        const o: Row = {};
        for (const part of splitTop(sel)) {
          const m = part.match(/^(\w+)\((.*)\)$/);
          if (m) {
            const child = FK_CHILDREN[table]?.find((c) => c.table === m[1]);
            if (!child) throw new Error(`mock: no relation ${table}->${m[1]}`);
            const cols = m[2].split(",");
            o[m[1]] = db[m[1]].filter((c) => c[child.col] === r.id).map((c) => Object.fromEntries(cols.map((k) => [k, c[k]])));
          } else o[part] = r[part];
        }
        return o;
      };
      const prefer = String(req.headers.prefer ?? "");

      if (req.method === "GET") {
        let rows = db[table].filter(matches);
        const order = url.searchParams.get("order");
        if (order) for (const spec of order.split(",").reverse()) {
          const [col, dir] = spec.split("."); const f = dir === "desc" ? -1 : 1;
          rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * f);
        }
        const total = rows.length;
        const off = Number(url.searchParams.get("offset") ?? 0); const lim = Number(url.searchParams.get("limit") ?? 1000);
        rows = rows.slice(off, off + Math.min(lim, 1000));
        if (prefer.includes("count=exact")) {
          const range = String(req.headers.range ?? "0-999"); const [a, b] = range.split("-").map(Number);
          return out(206, rows.slice(0, b - a + 1).map(project), { "Content-Range": `${a}-${a}/${total}` });
        }
        return out(200, rows.map(project));
      }

      if (req.method === "POST") {
        const input: Row[] = [].concat(JSON.parse(body));
        const inserted: Row[] = [];
        const keys = url.searchParams.get("on_conflict")?.split(",") ?? PK[table];
        for (const r of input) {
          const dup = keys && db[table].find((x) => keys.every((k) => x[k] === r[k]));
          if (dup && prefer.includes("merge-duplicates")) { Object.assign(dup, r); inserted.push(dup); continue; }
          if (dup && prefer.includes("ignore-duplicates")) continue;
          if (dup && PK[table]) return out(409, { code: "23505", message: "duplicate key value violates unique constraint" });
          const row: Row = table in PK ? { ...r } : { id: nextId(table), ...r };
          for (const col of ["melody", "language", "psalm_number", "verse_no", "occasion", "notes"]) if (!(col in row) && table !== "mass_songs") row[col] = row[col] ?? null;
          db[table].push(row); inserted.push(row);
        }
        return prefer.includes("return=representation") ? out(201, inserted.map(project)) : out(201);
      }

      if (req.method === "PATCH") {
        const rows = db[table].filter(matches); const patch = JSON.parse(body);
        rows.forEach((r) => Object.assign(r, patch));
        return out(204);
      }

      if (req.method === "DELETE") {
        const victims = db[table].filter(matches);
        for (const child of FK_CHILDREN[table] ?? []) {
          const used = db[child.table].filter((c) => victims.some((v) => v.id === c[child.col]));
          if (used.length && !child.cascade) return out(409, { code: "23503", message: `violates foreign key constraint on ${child.table}` });
          if (used.length) db[child.table] = db[child.table].filter((c) => !used.includes(c));
        }
        db[table] = db[table].filter((r) => !victims.includes(r));
        return out(204);
      }
      out(405, { message: "method" });
    } catch (e) {
      out(400, { message: String(e) });
    }
  });
  await new Promise<void>((ok) => server.listen(port, ok));
  return { close: () => server.close(), db };
};

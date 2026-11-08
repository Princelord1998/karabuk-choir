// Adapter: talks to the TypeScript backend over HTTP. Keeps the login token in the browser.
import type { ProgramGateway } from "../application/ProgramGateway";

const TOKEN_KEY = "choir-token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw Object.assign(new Error(b.error ?? `HTTP ${res.status}`), { status: res.status, existingId: b.existingId as number | undefined });
  }
  return res.json();
}

const qs = (o: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== false) p.set(k, String(v === true ? 1 : v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const httpProgramGateway: ProgramGateway = {
  me: () => request("GET", "/api/me"),
  login: async (email, password) => {
  const s = await request<{
    token: string;
    email: string;
    editor: boolean;
    admin: boolean;
  }>("POST", "/api/login", { email, password });

  setToken(s.token);
  return s;
},
  logout: () => setToken(null),

  listAdminUsers: () =>
  request("GET", "/api/admin/users"),

createAdminUser: (input) =>
  request("POST", "/api/admin/users", input),

updateAdminUser: (id, input) =>
  request("PUT", `/api/admin/users/${encodeURIComponent(id)}`, input),

deleteAdminUser: async (id) => {
  await request(
    "DELETE",
    `/api/admin/users/${encodeURIComponent(id)}`,
  );
},

  stats: () => request("GET", "/api/stats"),
  listSections: () => request("GET", "/api/sections"),
  previewStatus: () => request("GET", "/api/preview-status"),
  searchSongs: (q, sectionId, inLyrics) => request("GET", `/api/songs${qs({ q, sectionId, lyrics: inLyrics })}`),
  getSong: (id) => request("GET", `/api/songs/${id}`),
  listMasses: (limit, before) => request("GET", `/api/masses${qs({ limit, before })}`),
  getProgram: (date) => request("GET", `/api/masses/${date}/program`),
  pdfUrl: (date, community) => `/api/masses/${date}/program.pdf?community=${encodeURIComponent(community)}`,
  docxUrl: (date, community) => `/api/masses/${date}/program.docx?community=${encodeURIComponent(community)}`,

  createSong: (input) => request("POST", "/api/songs", input),
  updateSong: (id, input) => request("PUT", `/api/songs/${id}`, input),
  deleteSong: async (id) => { await request("DELETE", `/api/songs/${id}`); },
  setSection: (date, sectionId, songId, position) => request("PUT", `/api/masses/${date}/sections/${sectionId}`, { songId, position }),
  clearSection: (date, sectionId, position) => request("DELETE", `/api/masses/${date}/sections/${sectionId}?position=${position}`),
  copyProgram: (date, fromDate) => request("POST", `/api/masses/${date}/copy`, { fromDate }),
};

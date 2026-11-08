// Adapter: Supabase Auth (e-mail + password) with plain fetch.
import { UnauthorizedError } from "../domain/entities.ts";
import type { AuthService } from "../domain/ports.ts";

export const createSupabaseAuth = (url: string, anonKey: string): AuthService => {
  const base = `${url.replace(/\/$/, "")}/auth/v1`;
  const cache = new Map<string, { email: string; until: number }>();     // do not ask Supabase on every request

  return {
    login: async (email, password) => {
      const res = await fetch(`${base}/token?grant_type=password`, {
        method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new UnauthorizedError("E-mail ou mot de passe incorrect");
      const j = (await res.json()) as { access_token: string; user?: { email?: string } };
      return { token: j.access_token, email: (j.user?.email ?? email).toLowerCase() };
    },

    verify: async (token) => {
      const hit = cache.get(token);
      if (hit && hit.until > Date.now()) return { email: hit.email };
      const res = await fetch(`${base}/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
      if (!res.ok) { cache.delete(token); return null; }
      const u = (await res.json()) as { email?: string };
      if (!u.email) return null;
      const email = u.email.toLowerCase();
      cache.set(token, { email, until: Date.now() + 60_000 });
      return { email };
    },
  };
};

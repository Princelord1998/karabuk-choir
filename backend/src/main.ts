// Composition root: the only place that knows which adapters are plugged into which ports.
import { createProgramUseCases } from "./application/programUseCases.ts";
import { createSupabaseRepositories } from "./infrastructure/supabaseRepositories.ts";
import { createSupabaseAuth } from "./infrastructure/supabaseAuth.ts";
import { createPythonRenderer } from "./infrastructure/pythonRenderer.ts";
import { createHttpServer } from "./interface/http.ts";

const env = process.env;
for (const name of ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_ANON_KEY"]) {
  if (!env[name]) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill in your Supabase values.`);
    process.exit(1);
  }
}

const useCases = createProgramUseCases({
  ...createSupabaseRepositories(env.SUPABASE_URL!, env.SUPABASE_KEY!),
  auth: createSupabaseAuth(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!),
  editors: (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  renderer: createPythonRenderer(env.RENDERER_URL ?? "http://127.0.0.1:5001"),
  community: env.COMMUNITY ?? "COMMUNAUTÉ CHRÉTIENNE CATHOLIQUE DE KARABÜK",
});

const port = Number(env.PORT ?? 3001);
if (!(env.ADMIN_EMAILS ?? "").trim()) console.warn("WARNING: ADMIN_EMAILS is empty, so nobody can edit. Set it in .env to the e-mail(s) of your choir leaders.");
createHttpServer(useCases).listen(port, () => console.log(`API on http://localhost:${port} (Supabase: ${env.SUPABASE_URL})`));

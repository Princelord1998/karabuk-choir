import { useState } from "react";
import { go } from "../router";

export function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try { await onLogin(email, password); go("/programme"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="card narrow">
      <h2>Connexion</h2>
      <p className="muted">Réservée aux responsables de la chorale. Les visiteurs peuvent consulter les chants et les programmes sans se connecter.</p>
      <label className="field">E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
      <label className="field">Mot de passe
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions"><button disabled={busy || !email || !password} onClick={submit}>{busy ? "Connexion…" : "Se connecter"}</button></div>
    </div>
  );
}

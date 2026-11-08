import { useEffect, useState } from "react";
import type { ProgramGateway } from "../../application/ProgramGateway";
import type { AppRole, AppUser } from "../../domain/types";

type Props = {
  gateway: ProgramGateway;
  admin: boolean;
};

export function AdminUsersPage({ gateway, admin }: Props) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("editor");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);

    try {
      setUsers(await gateway.listAdminUsers());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (admin) void reload();
  }, [admin, gateway]);

  const createUser = async () => {
    setBusy(true);
    setError(null);

    try {
      await gateway.createAdminUser({
        email,
        password,
        role,
      });
      setEmail("");
      setPassword("");
      setRole("editor");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (
    user: AppUser,
    nextRole: AppRole,
  ) => {
    try {
      await gateway.updateAdminUser(user.id, {
        role: nextRole,
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleActive = async (user: AppUser) => {
    try {
      await gateway.updateAdminUser(user.id, {
        active: !user.active,
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteUser = async (user: AppUser) => {
    if (!window.confirm(
      `Supprimer définitivement le compte ${user.email} ?`,
    )) {
      return;
    }

    try {
      await gateway.deleteAdminUser(user.id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!admin) {
    return (
      <div className="card narrow">
        <h2>Accès refusé</h2>
        <p className="muted">
          Cette section est réservée aux administrateurs.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <h2>Gestion des utilisateurs</h2>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <h3>Ajouter un utilisateur</h3>

        <label className="field">
          E-mail
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          Mot de passe initial
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            minLength={6}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="field">
          Rôle
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as AppRole)
            }
          >
            <option value="editor">Éditeur</option>
            <option value="admin">Administrateur</option>
          </select>
        </label>

        <button
          disabled={
            busy ||
            !email.trim() ||
            password.length < 6
          }
          onClick={createUser}
        >
          {busy ? "Création…" : "Créer le compte"}
        </button>
      </div>

      <div className="card">
        <h3>Utilisateurs</h3>

        {loading ? (
          <p className="muted">Chargement…</p>
        ) : users.length === 0 ? (
          <p className="muted">Aucun utilisateur trouvé.</p>
        ) : (
          <ul className="plain">
            {users.map((user) => (
              <li key={user.id}>
                <div className="admin-user-row">
                  <span className="admin-user-email">
                    {user.email}
                  </span>

                  <select
                    value={user.role}
                    onChange={(e) =>
                      changeRole(
                        user,
                        e.target.value as AppRole,
                      )
                    }
                  >
                    <option value="editor">Éditeur</option>
                    <option value="admin">Administrateur</option>
                  </select>

                  <button
                    className="ghost"
                    onClick={() => toggleActive(user)}
                  >
                    {user.active
                      ? "Désactiver"
                      : "Activer"}
                  </button>

                  <button
                    className="ghost danger"
                    onClick={() => deleteUser(user)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
import type { Me } from "../domain/types";
import { href, type Route } from "./router";

const LINKS = [
  { path: "/", label: "Accueil" },
  { path: "/programme", label: "Programme" },
  { path: "/chants", label: "Chants" },
  { path: "/messes", label: "Messes" },
];

export function NavBar({ route, me, onLogout, community }: { route: Route; me: Me; onLogout: () => void; community: string }) {
  return (
    <header className="nav">
      <a className="brand" href={href("/")}>♫ <span>{community}</span></a>
      <nav>
        {LINKS.map((l) => (
          <a key={l.path} href={href(l.path)} className={route.path === l.path ? "active" : ""}>{l.label}</a>
        ))}

        {me.admin && (
    <a
      href={href("/admin/utilisateurs")}
      className={
        route.path === "/admin/utilisateurs"
          ? "active"
          : ""
      }
    >
      Utilisateurs
    </a>
  )}
      </nav>
      <div className="who">
        {me.email ? (
          <>
            <span title={me.email}>{me.editor ? "✎ " : ""}{me.email}</span>
            <button className="ghost small" onClick={onLogout}>Déconnexion</button>
          </>
        ) : (
          <a className="login-link" href={href("/connexion")}>Connexion</a>
        )}
      </div>
    </header>
  );
}

import { httpProgramGateway } from "../infrastructure/HttpProgramGateway";
import { useSections, useSession } from "../application/useSession";
import { NavBar } from "./NavBar";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MassesPage } from "./pages/MassesPage";
import { ProgramPage } from "./pages/ProgramPage";
import { SongsPage } from "./pages/SongsPage";
import { useRoute } from "./router";
import { AdminUsersPage } from "./pages/AdminUsersPage";

const gateway = httpProgramGateway;                 // swap for a fake gateway in tests
const COMMUNITY = "COMMUNAUTÉ CHRÉTIENNE CATHOLIQUE DE KARABÜK";

export function App() {
  const route = useRoute();
  const { me, ready, login, logout } = useSession(gateway);
  const sections = useSections(gateway);

  let page;
  switch (route.path) {
    case "/programme":
      page = <ProgramPage gateway={gateway} route={route} sections={sections} editor={me.editor} community={COMMUNITY} />; break;
    case "/chants":
      page = <SongsPage gateway={gateway} sections={sections} editor={me.editor} />; break;
    case "/messes":
      page = <MassesPage gateway={gateway} sections={sections} editor={me.editor} community={COMMUNITY} />; break;
    case "/connexion":
      page = <LoginPage onLogin={login} />; break;
      case "/admin/utilisateurs":
  page = (
    <AdminUsersPage
      gateway={gateway}
      admin={me.admin}
    />
  );
  break;
    default:
      page = <HomePage gateway={gateway} sections={sections} editor={me.editor} community={COMMUNITY} />;
  }

  return (
    <>
      <NavBar route={route} me={me} onLogout={logout} community="Chorale de Karabük" />
      <main className="page">{ready || route.path === "/connexion" ? page : <p className="muted">Chargement…</p>}</main>
    </>
  );
}

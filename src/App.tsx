import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FolderKanban,
  HardHat,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  TriangleAlert,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { api, ApiError, download } from "./api";
import Auth from "./Auth";
import { ActivityList, Avatar, Badge, Brand, Empty, Modal } from "./components";
import ProjectDetail from "./ProjectDetail";
import ProjectForm from "./ProjectForm";
import Projects, { ProjectCard } from "./Projects";
import Team from "./Team";
import type { Activity, Project, ProjectInput, User } from "./types";
import { dateLabel, daysLeft, elapsed, isLate, ROLES, today } from "./utils";

const navigation = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "projects", label: "Projets", icon: FolderKanban },
  { id: "planning", label: "Calendrier des travaux", icon: CalendarDays },
  { id: "activity", label: "Historique", icon: History },
];
function route() {
  return window.location.hash.slice(1) || "dashboard";
}
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export default function App() {
  const sessionVersion = useRef(0);
  const sessionActive = useRef(false);
  const realtimeTimer = useRef<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [bootError, setBootError] = useState("");
  const [page, setPage] = useState(route);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [dataError, setDataError] = useState("");
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [toasts, setToasts] = useState<
    { id: number; message: string; error: boolean }[]
  >([]);
  const notify = useCallback((message: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  const navigate = useCallback((next: string) => {
    window.location.hash = next;
    setPage(next);
    setMenu(false);
    window.scrollTo({ top: 0 });
  }, []);
  const refresh = useCallback(async () => {
    const version = sessionVersion.current;
    try {
      const [p, u, a] = await Promise.all([
        api<{ projects: Project[] }>("/projects"),
        api<{ users: User[] }>("/users"),
        api<{ activities: Activity[] }>("/activity"),
      ]);
      if (version !== sessionVersion.current) return;
      setProjects(p.projects);
      setUsers(u.users);
      setActivities(a.activities);
      setDataReady(true);
      setDataError("");
    } catch (e) {
      if (version === sessionVersion.current)
        setDataError((e as Error).message);
      throw e;
    }
  }, []);
  async function boot() {
    setReady(false);
    setBootError("");
    try {
      const status = await api<{ needsSetup: boolean }>("/auth/status");
      setNeedsSetup(status.needsSetup);
      if (!status.needsSetup) {
        try {
          const result = await api<{ user: User }>("/auth/me");
          sessionActive.current = true;
          setUser(result.user);
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
        }
      }
    } catch (e) {
      setBootError((e as Error).message);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void boot();
  }, []);
  useEffect(() => {
    const hash = () => {
      setPage(route());
      setMenu(false);
    };
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const expired = () => {
      if (!sessionActive.current) return;
      sessionActive.current = false;
      sessionVersion.current++;
      setUser(null);
      setProjects([]);
      setUsers([]);
      setActivities([]);
      setDataReady(false);
      setDataError("");
      setEditing(null);
      setDeleting(null);
      notify(
        "Votre session a expiré ou votre accès a changé. Connectez-vous à nouveau.",
        true,
      );
    };
    const install = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("session-expired", expired);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, [notify]);
  useEffect(() => {
    if (!user) return;
    void refresh().catch(() => {});
    const events = new EventSource("/api/events");
    const realtime = () => {
      if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = window.setTimeout(() => {
        void refresh().catch(() => {});
      }, 250);
    };
    events.addEventListener("refresh", realtime);
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 60_000);
    const focus = () => {
      void refresh().catch(() => {});
    };
    window.addEventListener("focus", focus);
    return () => {
      events.close();
      if (realtimeTimer.current) window.clearTimeout(realtimeTimer.current);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [user, refresh]);
  async function action(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      if (success) notify(success);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await action(async () => {
      await api("/auth/logout", { method: "POST" });
      sessionVersion.current++;
      sessionActive.current = false;
      setUser(null);
      setProjects([]);
      setUsers([]);
      setActivities([]);
      setDataReady(false);
      setDataError("");
      setEditing(null);
      setDeleting(null);
      navigate("dashboard");
    });
  }
  async function saveProject(data: ProjectInput) {
    const result = await api<{ project: Project }>(
      editing === "new" ? "/projects" : `/projects/${(editing as Project).id}`,
      {
        method: editing === "new" ? "POST" : "PUT",
        body: JSON.stringify(data),
      },
    );
    setEditing(null);
    await refresh();
    navigate(`project/${result.project.id}`);
    notify("Projet enregistré.");
  }
  async function install() {
    if (installEvent) {
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
    } else setInstallHelp(true);
  }
  const toastView = (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.error ? "error" : "success"}`}
          role={t.error ? "alert" : "status"}
        >
          {t.error ? <TriangleAlert size={19} /> : <CheckCircle2 size={19} />}
          <span>{t.message}</span>
          <button
            className="icon-button"
            aria-label="Fermer la notification"
            onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
  if (!ready)
    return (
      <div className="loading-screen">
        <Brand />
        <span className="spinner" />
        <p>Préparation de votre espace…</p>
      </div>
    );
  if (bootError)
    return (
      <div className="loading-screen">
        <Brand />
        <TriangleAlert size={32} />
        <h2>Le serveur est indisponible</h2>
        <p>{bootError}</p>
        <button className="button primary" onClick={boot}>
          <RefreshCw size={17} /> Réessayer
        </button>
      </div>
    );
  if (!user)
    return (
      <>
        <Auth
          needsSetup={needsSetup}
          onLogin={(u) => {
            sessionVersion.current++;
            sessionActive.current = true;
            setDataReady(false);
            setDataError("");
            setNeedsSetup(false);
            setUser(u);
            navigate("dashboard");
          }}
        />
        {toastView}
      </>
  );
  const admin = true;
  const accountAdmin = user.role === "admin";
  const pending = users.filter((u) => u.status === "pending").length;
  const active = projects.filter((p) => p.status === "in_progress");
  const completed = projects.filter((p) => p.status === "completed");
  const late = projects.filter(isLate);
  const mean = projects.length
    ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
    : 0;
  const currentProject = page.startsWith("project/")
    ? projects.find((p) => p.id === page.split("/")[1])
    : undefined;
  const currentLabel = page.startsWith("project/")
    ? "Fiche projet"
    : navigation.find((n) => n.id === page)?.label ||
      (
        { team: "Équipe & accès", settings: "Mon espace" } as Record<
          string,
          string
        >
      )[page] ||
      "Tableau de bord";
  const exportAll = () =>
    action(
      () => download("/export", "suivi-tous-les-projets.zip"),
      "Tous vos projets ont été téléchargés.",
    );
  return (
    <div className="app-shell">
      {menu && (
        <div className="mobile-overlay" onClick={() => setMenu(false)} />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Brand />
        <div className="workspace-chip">
          <span>
            <Building2 size={17} />
          </span>
          <div>
            Espace de travail<small>Gestion des travaux</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <p className="sidebar-label">ESPACE DE TRAVAIL</p>
        <nav aria-label="Navigation principale">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id || (n.id === "projects" && page.startsWith("project/")) ? "active" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon className="nav-icon" size={19} />
              <span>{n.label}</span>
              {n.id === "projects" && (
                <span className="nav-count">{projects.length}</span>
              )}
            </button>
          ))}
          {accountAdmin && (
            <>
              <p className="sidebar-label administration-label">
                ADMINISTRATION
              </p>
              <button
                className={`nav-item ${page === "team" ? "active" : ""}`}
                onClick={() => navigate("team")}
              >
                <Users size={19} />
                <span>Équipe & accès</span>
                {pending > 0 && (
                  <span className="nav-count pending-count">{pending}</span>
                )}
              </button>
            </>
          )}
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings size={19} />
            <span>Mon espace</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-install">
            <span className="install-symbol">
              <Smartphone size={23} />
            </span>
            <strong>Votre bureau, sur le terrain.</strong>
            <p>Retrouvez Suivi sur votre téléphone.</p>
            <button onClick={() => void install()}>
              Installer l’application <ArrowDownToLine size={15} />
            </button>
          </div>
          <div className="sidebar-user">
            <div className="user-chip">
              <Avatar name={user.name} />
              <div className="user-info">
                <strong>{user.name}</strong>
                <span>{ROLES[user.role]}</span>
              </div>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              disabled={busy}
              aria-label="Se déconnecter"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMenu(!menu)}
              aria-label="Ouvrir le menu"
            >
              <Menu size={21} />
            </button>
            <Building2 size={17} />
            <span>Espace de travail</span>
            <ChevronRight size={13} />
            <strong>{currentLabel}</strong>
          </div>
          <div className="topbar-actions">
            <span className="online-label">
              <span className={`connection-dot ${online ? "" : "offline"}`} />
              {online ? "Connecté" : "Hors connexion"}
            </span>
            <button
              className="icon-button"
              aria-label={
                accountAdmin ? "Voir les demandes d’accès" : "Voir l’historique"
              }
              onClick={() => navigate(accountAdmin ? "team" : "activity")}
            >
              <Bell size={20} />
              {accountAdmin && pending > 0 && <span className="notification-dot" />}
            </button>
            <span className="topbar-divider" />
            <button
              className="profile-button"
              aria-label="Mon espace"
              onClick={() => navigate("settings")}
            >
              <Avatar name={user.name} />
            </button>
          </div>
        </header>
        {!online && (
          <div className="offline-banner">
            <WifiOff size={16} /> Vous êtes hors connexion. Les modifications
            nécessitent une connexion au serveur.
          </div>
        )}
        <main className="page-content">
          {dataError && (
            <div className="form-error data-error" role="alert">
              <span>{dataError}</span>
              <button
                className="button secondary small"
                onClick={() => action(refresh)}
              >
                Réessayer
              </button>
            </div>
          )}
          {!dataReady ? (
            <div className="loading-screen inline-loading">
              <span className="spinner" />
              <p>Chargement des projets…</p>
            </div>
          ) : page === "projects" ? (
            <Projects
              projects={projects}
              admin={admin}
              onOpen={(p) => navigate(`project/${p.id}`)}
              onCreate={() => setEditing("new")}
              onExport={exportAll}
              onDelete={(p) => setDeleting(p)}
              busy={busy}
            />
          ) : page.startsWith("project/") ? (
            currentProject ? (
              <ProjectDetail
                  key={currentProject.id}
                project={currentProject}
                user={user}
                users={users}
                activities={activities.filter(
                  (a) => a.projectId === currentProject.id,
                )}
                onBack={() => navigate("projects")}
                onEdit={() => setEditing(currentProject)}
                onDelete={() => setDeleting(currentProject)}
                refresh={refresh}
                notify={notify}
              />
            ) : (
              <Empty
                title="Ce projet n’est pas accessible"
                action={
                  <button
                    className="button primary"
                    onClick={() => navigate("projects")}
                  >
                    Retour aux projets
                  </button>
                }
              >
                Il a été supprimé ou vous n’avez plus accès à ce projet.
              </Empty>
            )
          ) : page === "team" && accountAdmin ? (
            <Team
              users={users}
              currentUser={user}
              onUpdate={async (id, data) => {
                await api(`/users/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify(data),
                });
                await refresh();
                notify("Les droits d’accès ont été mis à jour.");
              }}
            />
          ) : page === "activity" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">LA MÉMOIRE DE VOS PROJETS</div>
                  <h1>Historique des modifications</h1>
                  <p>
                    Qui a changé quoi, et quand. Retrouvez chaque étape de votre
                    activité.
                  </p>
                </div>
                <span className="date-chip">
                  <History size={17} />
                  {activities.length} événements récents
                </span>
              </div>
              <section className="panel activity-panel">
                <ActivityList activities={activities} users={users} />
              </section>
            </>
          ) : page === "planning" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CHAQUE JOUR COMPTE</div>
                  <h1>Calendrier des travaux</h1>
                  <p>
                    Les échéances et l’avancement de tous vos projets, dans
                    l’ordre des dates de fin.
                  </p>
                </div>
                <span className="date-chip">
                  <CalendarDays size={17} />
                  {dateLabel(today(), true)}
                </span>
              </div>
              {projects.length ? (
                <div className="panel schedule-list">
                  {[...projects]
                    .sort((a, b) => a.endDate.localeCompare(b.endDate))
                    .map((p) => (
                      <button
                        key={p.id}
                        className="schedule-row"
                        onClick={() => navigate(`project/${p.id}`)}
                      >
                        <div className="schedule-project">
                          <strong>{p.title}</strong>
                          <span>
                            {dateLabel(p.startDate)} → {dateLabel(p.endDate)}
                          </span>
                          <Badge project={p} />
                        </div>
                        <div className="schedule-visual">
                          <div className="progress-heading">
                            <span>Travaux : {p.progress} %</span>
                            <span>Délai écoulé : {elapsed(p)} %</span>
                          </div>
                          <div className="schedule-bar">
                            <div
                              className="schedule-elapsed"
                              style={{ width: `${elapsed(p)}%` }}
                            />
                            <div
                              className="schedule-bar-fill"
                              style={{ width: `${p.progress}%` }}
                            />
                          </div>
                        </div>
                        <span
                          className={`schedule-deadline ${isLate(p) ? "text-amber" : ""}`}
                        >
                          {p.status === "completed"
                            ? "Livré"
                            : daysLeft(p) < 0
                              ? `${Math.abs(daysLeft(p))} jours de retard`
                              : `${daysLeft(p)} jours restants`}
                          <ChevronRight size={17} />
                        </span>
                      </button>
                    ))}
                </div>
              ) : (
                <Empty title="Le calendrier attend vos projets">
                  Créez un projet avec ses dates de début et de fin pour suivre
                  son délai.
                </Empty>
              )}
              <p className="schedule-legend">
                <span /> Avancement des travaux <span /> Délai écoulé — chaque
                barre représente la durée de son projet.
              </p>
            </>
          ) : page === "settings" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">UN ESPACE QUI VOUS SUIT</div>
                  <h1>Mon espace</h1>
                  <p>
                    Votre compte, vos données et l’application sur votre
                    téléphone.
                  </p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Mon compte</h2>
                    <ShieldCheck size={21} />
                  </div>
                  <div className="settings-profile">
                    <Avatar name={user.name} />
                    <h3>{user.name}</h3>
                    <p>{user.email}</p>
                    <span className="badge active">{ROLES[user.role]}</span>
                  </div>
                  <p className="field-help">
                    Compte créé le {dateLabel(user.createdAt)}. Tous les
                    comptes actifs disposent des mêmes droits dans
                    l’application.
                  </p>
                  <button
                    className="button secondary"
                    onClick={logout}
                    disabled={busy}
                  >
                    <LogOut size={17} /> Se déconnecter
                  </button>
                </section>
                <section className="panel install-panel">
                  <span className="stat-icon teal">
                    <Smartphone size={25} />
                  </span>
                  <h2>Du bureau au chantier.</h2>
                  <p>
                    Installez Suivi sur l’écran d’accueil de votre Android ou
                    iPhone pour retrouver vos projets en un geste.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => void install()}
                  >
                    <Download size={17} /> Installer l’application
                  </button>
                  <p className="field-help">
                    Une connexion est nécessaire pour consulter et modifier les
                    projets.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Exporter mes projets</h2>
                    <Download size={21} />
                  </div>
                  <p>
                    Téléchargez une archive ZIP de tous les projets, avec leurs
                    informations, leurs pièces jointes et leur historique.
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy || !projects.length}
                    onClick={exportAll}
                  >
                    <Download size={17} /> Tout télécharger ({projects.length})
                  </button>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Les droits d’accès</h2>
                    <Users size={21} />
                  </div>
                  <div className="permissions-list">
                    <p>
                      <strong>Administrateur</strong>Mêmes droits que les autres
                      comptes actifs.
                    </p>
                    <p>
                      <strong>Utilisateur</strong>Mêmes droits que les autres
                      comptes actifs.
                    </p>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading dashboard-greeting">
                <div>
                  <div className="eyebrow">
                    UNE VUE D’ENSEMBLE, UNE LONGUEUR D’AVANCE
                  </div>
                  <h1>
                    Bonjour, {user.name.split(" ")[0]}{" "}
                    <span className="greeting-dot">.</span>
                  </h1>
                  <p>Voici ce qui se passe sur vos chantiers aujourd’hui.</p>
                </div>
                <span className="date-chip">
                  <CalendarDays size={17} />
                  {dateLabel(today(), true)}
                </span>
              </div>
              <div className="stats-grid">
                {[
                  {
                    label: "Total des projets",
                    value: projects.length,
                    detail: "Votre portefeuille de chantiers",
                    icon: FolderKanban,
                    color: "teal",
                  },
                  {
                    label: "Chantiers en cours",
                    value: active.length,
                    detail: "Des projets qui prennent forme",
                    icon: HardHat,
                    color: "blue",
                  },
                  {
                    label: "Projets terminés",
                    value: completed.length,
                    detail: "Des étapes accomplies",
                    icon: CheckCircle2,
                    color: "purple",
                  },
                  {
                    label: "Avancement moyen",
                    value: `${mean} %`,
                    detail: late.length
                      ? `${late.length} projet${late.length > 1 ? "s" : ""} en retard`
                      : "Chaque étape vous rapproche",
                    icon: TrendingUp,
                    color: "amber",
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.label}>
                    <span className={`stat-icon ${s.color}`}>
                      <s.icon size={22} />
                    </span>
                    <span className="stat-label">{s.label}</span>
                    <strong className="stat-value">{s.value}</strong>
                    <span className="stat-detail">{s.detail}</span>
                  </div>
                ))}
              </div>
              {accountAdmin && pending > 0 && (
                <button
                  className="approval-banner"
                  onClick={() => navigate("team")}
                >
                  <span className="stat-icon amber">
                    <Users size={20} />
                  </span>
                  <span>
                    <strong>
                      {pending} demande{pending > 1 ? "s" : ""} d’accès en
                      attente
                    </strong>
                    <small>
                      Validez les nouveaux comptes pour accueillir votre équipe.
                    </small>
                  </span>
                  <span className="approval-link">
                    Examiner <ArrowRight size={17} />
                  </span>
                </button>
              )}
              <div className="section-heading">
                <div>
                  <h2>
                    Projets récents{" "}
                    <span className="count-pill">{projects.length}</span>
                  </h2>
                  <p>Les dernières nouvelles de vos chantiers.</p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button ghost"
                    onClick={() => navigate("projects")}
                  >
                    Voir tous les projets <ArrowRight size={16} />
                  </button>
                  {admin && (
                    <button
                      className="button primary"
                      onClick={() => setEditing("new")}
                    >
                      <Plus size={17} /> Nouveau projet
                    </button>
                  )}
                </div>
              </div>
              {projects.length ? (
                <div className="project-grid">
                  {[...projects]
                    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                    .slice(0, 3)
                    .map((p, i) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        index={i}
                        onOpen={() => navigate(`project/${p.id}`)}
                        onDelete={() => setDeleting(p)}
                      />
                    ))}
                </div>
              ) : (
                <Empty
                  title={
                    admin
                      ? "Prêt à lancer votre premier projet ?"
                      : "Bienvenue dans votre espace de travail"
                  }
                  action={
                    admin ? (
                      <button
                        className="button primary"
                        onClick={() => setEditing("new")}
                      >
                        <Plus size={17} /> Créer mon premier projet
                      </button>
                    ) : undefined
                  }
                >
                  {admin
                    ? "Ajoutez un chantier, définissez ses dates et rassemblez votre équipe."
                    : "Les projets créés par les administrateurs apparaîtront ici."}
                </Empty>
              )}
              <div className="dashboard-bottom">
                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Activité récente</h2>
                      <p className="field-help">Le fil de vos projets.</p>
                    </div>
                    <button
                      className="button ghost small"
                      onClick={() => navigate("activity")}
                    >
                      Tout voir <ArrowRight size={14} />
                    </button>
                  </div>
                  <ActivityList activities={activities.slice(0, 4)} compact />
                </section>
                <section className="panel deadlines-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Prochaines échéances</h2>
                      <p className="field-help">
                        Gardez les dates clés en vue.
                      </p>
                    </div>
                    <CalendarDays size={21} />
                  </div>
                  {projects.filter((p) => p.status !== "completed").length ? (
                    <div className="deadline-list">
                      {projects
                        .filter((p) => p.status !== "completed")
                        .sort((a, b) => a.endDate.localeCompare(b.endDate))
                        .slice(0, 4)
                        .map((p) => (
                          <button
                            className="deadline-item"
                            key={p.id}
                            onClick={() => navigate(`project/${p.id}`)}
                          >
                            <span
                              className={`deadline-date ${isLate(p) ? "late" : ""}`}
                            >
                              <strong>
                                {new Date(`${p.endDate}T12:00:00`).getDate()}
                              </strong>
                              <small>
                                {new Date(
                                  `${p.endDate}T12:00:00`,
                                ).toLocaleDateString("fr-FR", {
                                  month: "short",
                                })}
                              </small>
                            </span>
                            <span>
                              <strong>{p.title}</strong>
                              <small>
                                {p.commencementOrder || "Chantier"} · {p.progress} %
                                réalisé
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <Empty title="Aucune échéance à venir">
                      Les dates de fin de vos projets actifs apparaîtront ici.
                    </Empty>
                  )}
                </section>
              </div>
              <footer className="page-footer">
                <span>Une étape à la fois. Ensemble.</span>
                <span>
                  <ShieldCheck size={13} /> Suivi · Votre espace de confiance
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navigation mobile">
        {[
          navigation[0],
          navigation[1],
          navigation[3],
          {
            id: admin ? "team" : "settings",
            label: admin ? "Équipe" : "Mon espace",
            icon: admin ? Users : Settings,
          },
        ].map((n) => (
          <button
            key={n.id}
            className={
              page === n.id ||
              (n.id === "projects" && page.startsWith("project/"))
                ? "active"
                : ""
            }
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} />
            <span>
              {n.id === "dashboard"
                ? "Accueil"
                : n.id === "projects"
                  ? "Projets"
                  : n.label}
            </span>
          </button>
        ))}
      </nav>
      {editing && (
        <ProjectForm
          project={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={saveProject}
        />
      )}{" "}
      {deleting && (
        <Modal title="Supprimer ce projet ?" onClose={() => setDeleting(null)}>
          <div className="modal-body">
            <p>
              Le projet <strong>{deleting.title}</strong> et ses pièces jointes
              seront supprimés définitivement.
            </p>
            <p>
              Vous pouvez télécharger son archive avant de le supprimer. La
              suppression restera visible dans l’historique des administrateurs.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Annuler
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api(`/projects/${deleting.id}`, { method: "DELETE" });
                  setDeleting(null);
                  await refresh();
                  navigate("projects");
                }, "Projet supprimé.")
              }
            >
              {busy ? "Suppression…" : "Supprimer le projet"}
            </button>
          </div>
        </Modal>
      )}
      {installHelp && (
        <Modal
          title="Suivi sur votre téléphone"
          onClose={() => setInstallHelp(false)}
        >
          <div className="modal-body">
            <div className="install-instruction">
              <Smartphone size={24} />
              <h3>Sur iPhone ou iPad</h3>
              <p>
                Ouvrez cette application dans Safari, touchez{" "}
                <strong>Partager</strong>, puis{" "}
                <strong>Sur l’écran d’accueil</strong>.
              </p>
            </div>
            <div className="install-instruction">
              <Download size={24} />
              <h3>Sur Android</h3>
              <p>
                Ouvrez cette application dans Chrome, touchez le menu{" "}
                <strong>⋮</strong>, puis{" "}
                <strong>Installer l’application</strong> ou{" "}
                <strong>Ajouter à l’écran d’accueil</strong>.
              </p>
            </div>
            <p className="field-help">
              L’installation sur téléphone nécessite que l’application soit
              accessible à une adresse HTTPS. La consultation et les
              modifications nécessitent une connexion.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button primary"
              onClick={() => setInstallHelp(false)}
            >
              <Check size={17} /> Compris
            </button>
          </div>
        </Modal>
      )}
      {toastView}
    </div>
  );
}

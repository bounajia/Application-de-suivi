import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  Building2,
  X,
  Clock3,
  ArrowRight,
  Check,
  FolderOpen,
} from "lucide-react";
import type { Activity, Project, User } from "./types";
import { dateTime, elapsed, initials, isLate, STATUS } from "./utils";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Building2 size={26} strokeWidth={1.8} />
      </span>
      <div>
        <span className="brand-name">
          suivi<span>.</span>
        </span>
        <span className="brand-tagline">CHAQUE ÉTAPE COMPTE</span>
      </div>
    </div>
  );
}
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <span className={small ? "small-avatar" : "avatar"} title={name}>
      {initials(name)}
    </span>
  );
}
export function Badge({ project }: { project: Project }) {
  return (
    <span className={`badge ${isLate(project) ? "late" : project.status}`}>
      <span />
      {isLate(project) ? "En retard" : STATUS[project.status]}
    </span>
  );
}
export function Progress({
  project,
  detail = false,
}: {
  project: Project;
  detail?: boolean;
}) {
  const expected = elapsed(project);
  return (
    <div className="project-progress">
      <div className="progress-heading">
        <span>Avancement des travaux</span>
        <strong>
          {project.progress}
          <small> %</small>
        </strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Avancement des travaux"
        aria-valuenow={project.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`progress-fill ${isLate(project) ? "amber" : "teal"}`}
          style={{ width: `${project.progress}%` }}
        />
        <span
          className="expected-marker"
          style={{ left: `${Math.min(99, expected)}%` }}
          title={`${expected} % du délai écoulé`}
        />
      </div>
      {detail && (
        <p className="field-help">
          Le repère indique le délai écoulé : <strong>{expected} %</strong>.
          L’avancement réel est renseigné par l’équipe.
        </p>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FolderOpen size={30} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
const fields: Record<string, string> = {
  title: "Titre",
  description: "Description",
  startDate: "Date de début",
  endDate: "Date de fin",
  commencementOrder: "Jours restants",
  progress: "Avancement",
  status: "État",
  name: "Nom",
  role: "Rôle",
  file: "Fichier",
  attachment: "Pièce jointe",
  attachmentName: "Nom du document",
  account: "Compte",
  project: "Projet",
};
const values: Record<string, string> = {
  ...STATUS,
  pending: "En attente",
  active: "Actif",
  rejected: "Refusé",
  suspended: "Suspendu",
  admin: "Administrateur",
  user: "Utilisateur",
};
function changeValue(v: unknown, members: User[] = []) {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && "title" in v) return String(v.title);
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return values[s] || s;
}
export function ActivityList({
  activities,
  compact = false,
  users = [],
}: {
  activities: Activity[];
  compact?: boolean;
  users?: User[];
}) {
  if (!activities.length)
    return (
      <Empty title="L’historique commence ici">
        Les prochaines modifications apparaîtront avec leur auteur et leur date.
      </Empty>
    );
  return (
    <div className="activity-list">
      {activities.map((a) => (
        <article className="activity-item" key={a.id}>
          <span className="activity-icon">
            {a.action.toLowerCase().includes("cré") ? (
              <Check size={16} />
            ) : (
              <Clock3 size={16} />
            )}
          </span>
          <div className="activity-body">
            <p>
              <strong>{a.actorName}</strong> <span>{a.action}</span>
            </p>
            {a.projectTitle && (
              <p className="activity-project">{a.projectTitle}</p>
            )}
            {!compact && a.changes?.length > 0 && (
              <div className="activity-changes">
                {a.changes.map((c, i) => (
                  <div key={i}>
                    <strong>{fields[c.field] || c.field}</strong>
                    <span>{changeValue(c.before, users)}</span>
                    <ArrowRight size={12} />
                    <span>
                      {changeValue(c.after, users)}
                      {c.field === "progress" ? " %" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <time className="activity-time" dateTime={a.createdAt}>
              {dateTime(a.createdAt)}
            </time>
          </div>
        </article>
      ))}
    </div>
  );
}

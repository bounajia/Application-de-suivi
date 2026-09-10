import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Download,
  Pencil,
  Trash2,
  CalendarDays,
  FileText,
  Image,
  Paperclip,
  UploadCloud,
  Save,
  Clock3,
  Building2,
} from "lucide-react";
import { api, download } from "./api";
import { ActivityList, Badge, Modal, Progress } from "./components";
import type {
  Activity,
  Attachment,
  Project,
  ProjectStatus,
  User,
} from "./types";
import {
  dateLabel,
  dateTime,
  daysLeft,
  duration,
  fileSize,
  STATUS,
} from "./utils";

export default function ProjectDetail({
  project: p,
  user,
  users,
  activities,
  onBack,
  onEdit,
  onDelete,
  refresh,
  notify,
}: {
  project: Project;
  user: User;
  users: User[];
  activities: Activity[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
}) {
  const [tab, setTab] = useState("overview");
  const [progress, setProgress] = useState(p.progress);
  const [status, setStatus] = useState<ProjectStatus>(p.status);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const admin = true;
  useEffect(() => {
    setProgress(p.progress);
    setStatus(p.status);
  }, [p.progress, p.status]);
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await work();
      await refresh();
      notify(message);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (files.length > 10) {
      notify("Ajoutez au maximum 10 fichiers à la fois.", true);
      return;
    }
    if (Array.from(files).some((f) => f.size > 20 * 1024 * 1024)) {
      notify("Chaque fichier doit faire au maximum 20 Mo.", true);
      return;
    }
    const body = new FormData();
    Array.from(files).forEach((f) => body.append("files", f));
    await act(
      () => api(`/projects/${p.id}/attachments`, { method: "POST", body }),
      "Pièces jointes ajoutées.",
    );
    if (input.current) input.current.value = "";
  }
  async function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    await act(async () => {
      await api(`/projects/${p.id}/attachments/${renaming!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setRenaming(null);
    }, "Document renommé.");
  }
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={17} /> Tous les projets
      </button>
      <div className="detail-heading">
        <div>
          <div className="eyebrow">
            FICHE PROJET <span> / </span>{" "}
            {p.commencementOrder || "JOURS RESTANTS"}
          </div>
          <h1>{p.title}</h1>
          <div className="detail-subtitle">
            <Badge project={p} />
          </div>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  download(`/projects/${p.id}/export.pdf`, `${p.title}.pdf`),
                "Projet téléchargé.",
              )
            }
          >
            <Download size={17} /> Télécharger
          </button>
          {admin && (
            <>
              <button className="button primary" onClick={onEdit}>
                <Pencil size={16} /> Modifier
              </button>
              <button
                className="icon-button delete-button"
                onClick={onDelete}
                aria-label="Supprimer le projet"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="filter-tabs detail-tabs">
        {[
          ["overview", "Vue d’ensemble"],
          ["files", `Pièces jointes (${p.attachments.length})`],
          ["history", "Historique"],
        ].map(([value, label]) => (
          <button
            className={`filter-tab ${tab === value ? "active" : ""}`}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          {tab === "overview" ? (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Avancement du chantier</h2>
                  <span className="stat-icon teal">
                    <Building2 size={20} />
                  </span>
                </div>
                <Progress project={p} detail />
                <div className="detail-metrics">
                  <div className="metric">
                    <span>Délai prévu</span>
                    <strong>
                      {duration(p)} <small>jours</small>
                    </strong>
                  </div>
                  <div className="metric">
                    <span>
                      {daysLeft(p) < 0
                        ? "Échéance dépassée de"
                        : "Temps restant"}
                    </span>
                    <strong>
                      {Math.abs(daysLeft(p))} <small>jours</small>
                    </strong>
                  </div>
                  <div className="metric">
                    <span>État actuel</span>
                    <strong className="metric-status">
                      {STATUS[p.status]}
                    </strong>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Informations du projet</h2>
                </div>
                <p className="detail-description">
                  {p.description || "Aucune description renseignée."}
                </p>
                <div className="project-info-grid">
                  <div className="info-item">
                    <CalendarDays size={18} />
                    <div>
                      <span>Date de début</span>
                      <strong>{dateLabel(p.startDate, true)}</strong>
                    </div>
                  </div>
                  <div className="info-item">
                    <CalendarDays size={18} />
                    <div>
                      <span>Date de fin</span>
                      <strong>{dateLabel(p.endDate, true)}</strong>
                    </div>
                  </div>
                  <div className="info-item">
                    <FileText size={18} />
                    <div>
                      <span>Jours restants</span>
                      <strong>{p.commencementOrder || "Non renseigné"}</strong>
                    </div>
                  </div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Dernières modifications</h2>
                  <button
                    className="button ghost small"
                    onClick={() => setTab("history")}
                  >
                    Tout voir{" "}
                    <ArrowLeft
                      size={14}
                      style={{ transform: "rotate(180deg)" }}
                    />
                  </button>
                </div>
                <ActivityList activities={activities.slice(0, 4)} compact />
              </section>
            </>
          ) : tab === "files" ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Les documents du chantier</h2>
                  <p className="field-help">
                    Photos, plans, ordres et documents de travail.
                  </p>
                </div>
                <Paperclip size={21} />
              </div>
              <input
                ref={input}
                hidden
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv"
                onChange={(e) => upload(e.target.files)}
              />
              <button
                className="upload-zone"
                disabled={busy}
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) upload(e.dataTransfer.files);
                }}
              >
                <UploadCloud size={30} />
                <strong>
                  {busy
                    ? "Envoi en cours…"
                    : "Cliquez pour ajouter des fichiers"}
                </strong>
                <span>
                  ou glissez-les ici · 10 fichiers maximum · 20 Mo par fichier
                </span>
                <small>Photos, PDF, documents Office, texte et CSV</small>
              </button>
              <div className="attachment-grid">
                {p.attachments.map((a) => (
                  <div className="attachment-card" key={a.id}>
                    <span
                      className={`attachment-icon ${a.mimeType?.startsWith("image/") ? "photo" : ""}`}
                    >
                      {a.mimeType?.startsWith("image/") ? (
                        <Image size={25} />
                      ) : (
                        <FileText size={25} />
                      )}
                    </span>
                    <div className="attachment-info">
                      <strong className="attachment-name" title={a.name}>
                        {a.name}
                      </strong>
                      <span className="attachment-meta">
                        {fileSize(a.size)} · {dateLabel(a.createdAt)}
                      </span>
                    </div>
                    <div className="attachment-actions">
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Télécharger ${a.name}`}
                        onClick={() =>
                          act(
                            () =>
                              download(
                                `/projects/${p.id}/attachments/${a.id}/download`,
                                a.name,
                              ),
                            "Document téléchargé.",
                          )
                        }
                      >
                        <Download size={16} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Renommer ${a.name}`}
                        onClick={() => setRenaming(a)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button delete-button"
                        disabled={busy}
                        aria-label={`Supprimer ${a.name}`}
                        onClick={() => setDeleting(a)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!p.attachments.length && (
                <p
                  className="field-help"
                  style={{ textAlign: "center", marginTop: 24 }}
                >
                  Ce projet n’a pas encore de pièce jointe.
                </p>
              )}
            </section>
          ) : (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Historique du projet</h2>
                  <p className="field-help">
                    Chaque modification, son auteur et sa date.
                  </p>
                </div>
                <Clock3 size={21} />
              </div>
              <ActivityList activities={activities} users={users} />
            </section>
          )}
        </div>
        <aside className="detail-aside">
          <section className="panel">
            <div className="panel-heading">
              <h2>Mettre à jour l’avancement</h2>
            </div>
            <form
              className="progress-editor"
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  () =>
                    api(`/projects/${p.id}/progress`, {
                      method: "PATCH",
                      body: JSON.stringify({ progress, status }),
                    }),
                  "Avancement mis à jour.",
                );
              }}
            >
              <label className="field">
                Avancement réel
                <strong className="progress-number">
                  {progress}
                  <small> %</small>
                </strong>
                <input
                  aria-label="Avancement réel"
                  className="range-input"
                  name="progress"
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setProgress(n);
                    if (n === 100) setStatus("completed");
                    else if (
                      status === "completed" ||
                      (n > 0 && status === "planned")
                    )
                      setStatus("in_progress");
                  }}
                />
              </label>
              <label className="field">
                État
                <select
                  className="input"
                  aria-label="État"
                  name="status"
                  value={status}
                  onChange={(e) => {
                    const s = e.target.value as ProjectStatus;
                    setStatus(s);
                    if (s === "completed") setProgress(100);
                    else if (s === "planned") setProgress(0);
                    else if (progress === 100) setProgress(99);
                  }}
                >
                  {Object.entries(STATUS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button primary"
                disabled={
                  busy || (p.progress === progress && p.status === status)
                }
              >
                <Save size={17} />
                {busy ? "Enregistrement…" : "Enregistrer"}
              </button>
              <p className="field-help">
                La modification sera enregistrée dans l’historique avec votre
                nom et la date.
              </p>
            </form>
          </section>
          <div className="detail-updated">
            <Clock3 size={15} />
            <p>
              Dernière modification
              <br />
              <strong>{p.updatedBy}</strong> · {dateTime(p.updatedAt)}
            </p>
          </div>
        </aside>
      </div>
      {renaming && (
        <Modal title="Renommer le document" onClose={() => setRenaming(null)}>
          <form onSubmit={rename}>
            <div className="modal-body">
              <label className="field">
                Nom du document
                <input
                  className="input"
                  name="name"
                  defaultValue={renaming.name}
                  required
                  maxLength={180}
                  autoFocus
                />
              </label>
              <p className="field-help">
                L’extension d’origine du fichier est conservée.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setRenaming(null)}
              >
                Annuler
              </button>
              <button className="button primary" disabled={busy}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Supprimer cette pièce jointe ?"
          onClose={() => setDeleting(null)}
        >
          <div className="modal-body">
            <p>
              Le fichier <strong>{deleting.name}</strong> sera supprimé du
              projet. Cette action est définitive et sera inscrite dans
              l’historique.
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
                act(async () => {
                  await api(`/projects/${p.id}/attachments/${deleting.id}`, {
                    method: "DELETE",
                  });
                  setDeleting(null);
                }, "Pièce jointe supprimée.")
              }
            >
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}





import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Modal } from "./components";
import { DAY, dayValue, duration, remainingLabel, STATUS, today } from "./utils";
import type { Project, ProjectInput, ProjectStatus } from "./types";

export default function ProjectForm({
  project,
  onClose,
  onSave,
}: {
  project?: Project;
  onClose: () => void;
  onSave: (data: ProjectInput) => Promise<void>;
}) {
  const start = project?.startDate || today();
  const [data, setData] = useState<ProjectInput>({
    title: project?.title || "",
    description: project?.description || "",
    startDate: start,
    endDate:
      project?.endDate ||
      new Date(dayValue(start) + 90 * DAY).toISOString().slice(0, 10),
    progress: project?.progress || 0,
    status: project?.status || "planned",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function set<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (data.endDate < data.startDate) {
      setError(
        "La date de fin doit être postérieure ou égale à la date de début.",
      );
      return;
    }
    setBusy(true);
    try {
      await onSave(data);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        project
          ? "Modifier le projet"
          : "Un nouveau projet, une nouvelle étape."
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <p className="form-intro">
            Renseignez les informations du chantier. Vous pourrez ajouter ses
            documents après l’enregistrement.
          </p>
          <div className="form-grid">
            <label className="field span-2">
              Titre du projet <span aria-hidden="true">*</span>
              <input
                autoFocus
                className="input"
                name="title"
                value={data.title}
                onChange={(e) => set("title", e.target.value)}
                required
                maxLength={180}
                placeholder="Ex. Construction de la résidence Les Jardins"
              />
            </label>
            <label className="field span-2">
              Description
              <textarea
                className="input textarea"
                name="description"
                value={data.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={5000}
                rows={3}
                placeholder="Objectifs, nature des travaux, précisions utiles…"
              />
            </label>
            <label className="field">
              Date de début *
              <input
                className="input"
                name="startDate"
                type="date"
                value={data.startDate}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setData((d) => ({
                    ...d,
                    startDate: nextStart,
                    endDate: new Date(
                      dayValue(nextStart) + duration(d) * DAY,
                    )
                      .toISOString()
                      .slice(0, 10),
                  }));
                }}
                required
              />
            </label>
            <label className="field">
              Date de fin *
              <input
                className="input"
                name="endDate"
                type="date"
                value={data.endDate}
                min={data.startDate}
                onChange={(e) => set("endDate", e.target.value)}
                required
              />
            </label>
            <label className="field">
              Délai prévu (jours calendaires)
              <input
                className="input"
                name="duration"
                type="number"
                min={0}
                max={36500}
                value={duration(data)}
                onChange={(e) => {
                  if (data.startDate)
                    set(
                      "endDate",
                      new Date(
                        dayValue(data.startDate) + Number(e.target.value) * DAY,
                      )
                        .toISOString()
                        .slice(0, 10),
                    );
                }}
              />
              <span className="field-help">
                Modifier le délai recalcule la date de fin.
              </span>
            </label>
            <div className="field">
              Jours restants
              <strong className="readonly-value">
                {remainingLabel(data)}
              </strong>
              <span className="field-help">
                Calculé automatiquement avec la date de fin.
              </span>
            </div>
            <label className="field">
              État du projet
              <select
                className="input"
                name="status"
                value={data.status}
                onChange={(e) => {
                  const s = e.target.value as ProjectStatus;
                  setData((d) => ({
                    ...d,
                    status: s,
                    progress:
                      s === "completed"
                        ? 100
                        : s === "planned"
                          ? 0
                        : d.progress === 100
                          ? 99
                          : d.progress,
                  }));
                }}
              >
                {Object.entries(STATUS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              Avancement réel : {data.progress} %
              <input
                className="range-input"
                name="progress"
                type="range"
                min={0}
                max={100}
                value={data.progress}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setData((d) => ({
                    ...d,
                    progress: n,
                    status:
                      n === 100
                        ? "completed"
                        : d.status === "completed" ||
                            (n > 0 && d.status === "planned")
                          ? "in_progress"
                          : d.status,
                  }));
                }}
              />
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="button primary" disabled={busy}>
            <Save size={17} />
            {busy
              ? "Enregistrement…"
              : project
                ? "Enregistrer les modifications"
                : "Créer le projet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

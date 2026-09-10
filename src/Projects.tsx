import { useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronRight,
  Download,
  FolderKanban,
  LayoutGrid,
  List,
  Paperclip,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge, Empty, Progress } from "./components";
import type { Project } from "./types";
import { dateLabel, daysLeft, isLate, STATUS } from "./utils";

export function ProjectCard({
  project: p,
  index,
  onOpen,
  onDelete,
}: {
  project: Project;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const coverImage = p.attachments.find(
    (a) =>
      a.mimeType?.startsWith("image/") ||
      /\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(a.name),
  );
  return (
    <article className="project-card">
      <button
        className={`project-cover theme-${index % 5} ${coverImage ? "has-image" : ""}`}
        onClick={onOpen}
        aria-label={`Ouvrir ${p.title}`}
      >
        {coverImage && (
          <img
            className="project-cover-image"
            src={`/api/projects/${p.id}/attachments/${coverImage.id}/download`}
            alt=""
            loading="lazy"
          />
        )}
        <span className="cover-monogram">
          <Building2 size={43} strokeWidth={1.2} />
        </span>
        <span className="cover-label">
          {p.commencementOrder || "PROJET DE CONSTRUCTION"}
        </span>
        <span className="cover-arrow">
          <ArrowUpRight size={20} />
        </span>
      </button>
      <button
        className="icon-button delete-button project-delete-button"
        onClick={onDelete}
        aria-label={`Supprimer ${p.title}`}
        title="Supprimer le projet"
      >
        <Trash2 size={16} />
      </button>
      <div className="project-card-body">
        <div className="project-card-top">
          <Badge project={p} />
          <span className="project-reference">
            #{String(index + 1).padStart(3, "0")}
          </span>
        </div>
        <button className="project-title" onClick={onOpen}>
          {p.title}
        </button>
        <div className="project-dates">
          <span>
            <CalendarDays size={14} />
            {dateLabel(p.startDate)}
          </span>
          <ChevronRight size={13} />
          <span>{dateLabel(p.endDate)}</span>
        </div>
        <Progress project={p} />
        <div className="project-card-footer">
          <span className="attachment-count">
            <Paperclip size={14} />
            {p.attachments.length}
          </span>
          <span className={`remaining-label ${isLate(p) ? "text-amber" : ""}`}>
            {p.status === "completed"
              ? "Projet livré"
              : daysLeft(p) < 0
                ? `${Math.abs(daysLeft(p))} j de retard`
                : `${daysLeft(p)} j restants`}
          </span>
        </div>
      </div>
    </article>
  );
}
export default function Projects({
  projects,
  admin,
  onOpen,
  onCreate,
  onExport,
  onDelete,
  busy,
}: {
  projects: Project[];
  admin: boolean;
  onOpen: (p: Project) => void;
  onCreate: () => void;
  onExport: () => void;
  onDelete: (p: Project) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("grid");
  const visible = projects
    .filter(
      (p) =>
        `${p.title} ${p.description} ${p.commencementOrder}`
          .toLocaleLowerCase("fr")
          .includes(query.toLocaleLowerCase("fr")) &&
        (filter === "all" ||
          (filter === "late" && isLate(p)) ||
          p.status === filter),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "fr")
        : sort === "date"
          ? a.endDate.localeCompare(b.endDate)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">VOTRE PORTEFEUILLE DE CHANTIERS</div>
          <h1>
            Projets<span className="heading-count">{projects.length}</span>
          </h1>
          <p>
            Une vue claire sur vos travaux, de la première pierre à la
            livraison.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            disabled={busy || !projects.length}
            onClick={onExport}
          >
            <Download size={17} /> Tout télécharger
          </button>
          {admin && (
            <button className="button primary" onClick={onCreate}>
              <Plus size={18} /> Nouveau projet
            </button>
          )}
        </div>
      </div>
      <div className="filter-tabs">
        {[
          ["all", "Tous les projets"],
          ["in_progress", "En cours"],
          ["planned", "À démarrer"],
          ["completed", "Terminés"],
          ["late", "En retard"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`filter-tab ${filter === id ? "active" : ""}`}
            onClick={() => setFilter(id)}
          >
            {label}
            <span>
              {
                projects.filter(
                  (p) =>
                    id === "all" ||
                    (id === "late" && isLate(p)) ||
                    p.status === id,
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Rechercher un projet"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un projet, une référence, un lieu…"
          />
        </label>
        <div className="toolbar-actions">
          <select
            className="filter-select"
            aria-label="Filtrer par état"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Tous les états</option>
            {Object.entries(STATUS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            <option value="late">En retard</option>
          </select>
          <select
            className="filter-select"
            aria-label="Trier les projets"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="updated">Dernière modification</option>
            <option value="date">Date de fin</option>
            <option value="title">Nom du projet</option>
          </select>
          <div className="view-toggle">
            <button
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
              aria-label="Vue en cartes"
              aria-pressed={view === "grid"}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
              aria-label="Vue en liste"
              aria-pressed={view === "list"}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>
      {visible.length ? (
        view === "grid" ? (
          <div className="project-grid">
            {visible.map((p, i) => (
              <ProjectCard
                project={p}
                index={i}
                onOpen={() => onOpen(p)}
                onDelete={() => onDelete(p)}
                key={p.id}
              />
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Projet</th>
                  <th>État</th>
                  <th>Avancement</th>
                  <th>Date de fin</th>
                  <th>Documents</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="project-table-title"
                        onClick={() => onOpen(p)}
                      >
                        <span className="stat-icon teal">
                          <FolderKanban size={19} />
                        </span>
                        <span>
                          {p.title}
                          <small>{p.commencementOrder || p.startDate}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <Badge project={p} />
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <Progress project={p} />
                    </td>
                    <td>{dateLabel(p.endDate)}</td>
                    <td>
                      {p.attachments.length} pièce
                      {p.attachments.length > 1 ? "s" : ""}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          onClick={() => onOpen(p)}
                          aria-label={`Ouvrir ${p.title}`}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                        <button
                          className="icon-button delete-button"
                          onClick={() => onDelete(p)}
                          aria-label={`Supprimer ${p.title}`}
                          title="Supprimer le projet"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Empty
          title={
            projects.length
              ? "Aucun projet ne correspond"
              : "Votre prochain chantier commence ici"
          }
          action={
            admin && !projects.length ? (
              <button className="button primary" onClick={onCreate}>
                <Plus size={17} /> Créer un projet
              </button>
            ) : undefined
          }
        >
          {projects.length
            ? "Essayez un autre mot-clé ou modifiez les filtres."
            : "Ajoutez votre premier projet pour suivre ses délais, ses travaux et ses documents."}
        </Empty>
      )}
    </>
  );
}
